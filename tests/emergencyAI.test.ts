import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildEmergencyAIStatusResponse,
  defaultEmergencyAIConfigView,
  normalizeGeminiApiKey,
  parseEmergencyAIHistoryLimit,
  resolveProviderIntegrationState,
  resolveWhatsAppIntegrationState,
  validateEmergencyAIReason,
  type EmergencyAIConfigRow,
  type WhatsAppIntegrationRow,
} from '../src/utils/emergencyAI.js';
import {
  EmergencyAIError,
  createEmergencyAIService,
  isEmergencyAIEnabled,
} from '../src/server/emergencyAIService.js';
import type { EmergencyAIStore } from '../src/server/emergencyAIStore.js';
import { createSupabaseEmergencyAIStore } from '../src/server/emergencyAIStore.js';

const MIGRATION_PATH = new URL(
  '../supabase/migrations/20261027010000_add_emergency_ai.sql',
  import.meta.url
);
const MIGRATION = readFileSync(MIGRATION_PATH, 'utf8');

function makeConfig(overrides: Partial<EmergencyAIConfigRow> = {}): EmergencyAIConfigRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    company_id: null,
    enabled: false,
    provider: null,
    model: null,
    integration_status: 'pending',
    last_changed_by: null,
    last_changed_by_name: null,
    last_changed_at: null,
    created_at: '2026-10-27T12:00:00.000Z',
    updated_at: '2026-10-27T12:00:00.000Z',
    ...overrides,
  };
}

function makeWhatsApp(overrides: Partial<WhatsAppIntegrationRow> = {}): WhatsAppIntegrationRow {
  return {
    is_verified: true,
    phone_number_id: 'phone-number-id',
    access_token: 'SECRET_WHATSAPP_TOKEN',
    phone_number: '+55 11 99999-0000',
    last_health_check: '2026-10-27T12:30:00.000Z',
    ...overrides,
  };
}

function makeStore(overrides: Partial<EmergencyAIStore> = {}) {
  let config: EmergencyAIConfigRow | null = null;
  let whatsapp: WhatsAppIntegrationRow | null = makeWhatsApp();
  const calls: any[] = [];
  const history: any[] = [];

  const store: EmergencyAIStore = {
    async getConfig() {
      return { data: config, error: null };
    },
    async getWhatsAppConfig() {
      return { data: whatsapp, error: null };
    },
    async setEnabled(input) {
      calls.push(input);
      const changed = config?.enabled !== input.enabled;
      config = makeConfig({
        enabled: input.enabled,
        last_changed_by: input.actorId,
        last_changed_by_name: input.actorName,
        last_changed_at: '2026-10-27T13:00:00.000Z',
        integration_status: input.whatsappStatus,
      });
      return { data: config, changed, error: null };
    },
    async listAudit(limit) {
      calls.push({ limit });
      return { data: history.slice(0, limit), error: null };
    },
    ...overrides,
  };

  return {
    store,
    calls,
    setConfig(value: EmergencyAIConfigRow | null) {
      config = value;
    },
    setWhatsApp(value: WhatsAppIntegrationRow | null) {
      whatsapp = value;
    },
    setHistory(value: any[]) {
      history.splice(0, history.length, ...value);
    },
  };
}

test('configuração ausente é retornada como DESATIVADA e nunca como ATIVA', () => {
  const status = buildEmergencyAIStatusResponse({
    config: null,
    whatsapp: null,
    geminiApiKey: 'valid-key',
  });

  assert.equal(status.config.enabled, false);
  assert.equal(status.config.id, null);
  assert.equal(status.provider.status, 'pending');
  assert.equal(status.whatsapp.status, 'unavailable');
  assert.deepEqual(status.config, defaultEmergencyAIConfigView());
});

test('estado do provedor distingue pendente, configurado e indisponível', () => {
  assert.equal(
    resolveProviderIntegrationState({ provider: null, model: null, geminiApiKey: 'valid-key' }),
    'pending'
  );
  assert.equal(
    resolveProviderIntegrationState({ provider: 'gemini', model: 'gemini-2.0-flash', geminiApiKey: '' }),
    'unavailable'
  );
  assert.equal(
    resolveProviderIntegrationState({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      geminiApiKey: 'MY_GEMINI_API_KEY',
    }),
    'unavailable'
  );
  assert.equal(
    resolveProviderIntegrationState({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      geminiApiKey: 'valid-key',
    }),
    'configured'
  );
  assert.equal(
    resolveProviderIntegrationState({
      provider: 'provedor-desconhecido',
      model: 'modelo-x',
      geminiApiKey: 'valid-key',
    }),
    'unavailable'
  );
});

test('normaliza aspas e espaços da chave Gemini sem expor o valor', () => {
  assert.equal(normalizeGeminiApiKey('  "AIza-chave-de-teste"  '), 'AIza-chave-de-teste');
  assert.equal(normalizeGeminiApiKey(" 'AIza-chave-de-teste' "), 'AIza-chave-de-teste');
  assert.equal(normalizeGeminiApiKey('  AIza-chave-de-teste  '), 'AIza-chave-de-teste');
  assert.equal(normalizeGeminiApiKey('   '), null);
  assert.equal(normalizeGeminiApiKey('""'), null);
  assert.equal(normalizeGeminiApiKey(null), null);

  assert.equal(
    resolveProviderIntegrationState({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      geminiApiKey: '  "AIza-chave-de-teste"  ',
    }),
    'configured'
  );
  assert.equal(
    resolveProviderIntegrationState({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      geminiApiKey: '  "MY_GEMINI_API_KEY"  ',
    }),
    'unavailable'
  );
});

test('estado do WhatsApp distingue configurado, pendente e indisponível', () => {
  assert.equal(resolveWhatsAppIntegrationState(null), 'unavailable');
  assert.equal(
    resolveWhatsAppIntegrationState(makeWhatsApp({ is_verified: false })),
    'pending'
  );
  assert.equal(
    resolveWhatsAppIntegrationState(makeWhatsApp({ access_token: '' })),
    'unavailable'
  );
  assert.equal(
    resolveWhatsAppIntegrationState(makeWhatsApp({ phone_number_id: null })),
    'unavailable'
  );
  assert.equal(resolveWhatsAppIntegrationState(makeWhatsApp()), 'configured');
});

test('resposta de status não expõe token de WhatsApp nem credencial de IA', () => {
  const status = buildEmergencyAIStatusResponse({
    config: makeConfig({ enabled: true, provider: 'gemini', model: 'gemini-2.0-flash' }),
    whatsapp: makeWhatsApp({ access_token: 'SECRET_WHATSAPP_TOKEN' }),
    geminiApiKey: 'SECRET_GEMINI_KEY',
  });

  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes('SECRET_WHATSAPP_TOKEN'), false);
  assert.equal(serialized.includes('SECRET_GEMINI_KEY'), false);
  assert.equal(status.config.enabled, true);
  assert.equal(status.provider.status, 'configured');
  assert.equal(status.whatsapp.status, 'configured');
});

test('valida motivo opcional com limite de 500 caracteres e rejeita tipo inválido', () => {
  assert.deepEqual(validateEmergencyAIReason(undefined), { ok: true, reason: null });
  assert.deepEqual(validateEmergencyAIReason('  '), { ok: true, reason: null });
  assert.deepEqual(validateEmergencyAIReason('  Contingência  '), {
    ok: true,
    reason: 'Contingência',
  });
  assert.equal(validateEmergencyAIReason(123).ok, false);
  assert.equal(validateEmergencyAIReason('motivo\u0000oculto').ok, false);
  assert.equal(validateEmergencyAIReason('x'.repeat(501)).ok, false);
  assert.equal(validateEmergencyAIReason('x'.repeat(500)).ok, true);
  assert.equal(validateEmergencyAIReason('linha 1\nlinha 2').ok, true);
});

test('valida limite do histórico sem aceitar valores arbitrários', () => {
  assert.deepEqual(parseEmergencyAIHistoryLimit(undefined), { ok: true, limit: 20 });
  assert.deepEqual(parseEmergencyAIHistoryLimit('5'), { ok: true, limit: 5 });
  assert.deepEqual(parseEmergencyAIHistoryLimit(100), { ok: true, limit: 100 });
  assert.equal(parseEmergencyAIHistoryLimit(0).ok, false);
  assert.equal(parseEmergencyAIHistoryLimit(101).ok, false);
  assert.equal(parseEmergencyAIHistoryLimit('abc').ok, false);
  assert.equal(parseEmergencyAIHistoryLimit(['1']).ok, false);
});

test('serviço consulta configuração ausente como desativada', async () => {
  const harness = makeStore();
  const service = createEmergencyAIService({
    store: harness.store,
    geminiApiKey: 'valid-key',
    logger: { error() {} },
  });

  const status = await service.getStatus();
  assert.equal(status.config.enabled, false);
  assert.equal(status.whatsapp.status, 'configured');
});

test('serviço normaliza a chave com aspas e não a devolve no status', async () => {
  const harness = makeStore();
  harness.setConfig(
    makeConfig({
      enabled: true,
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
    })
  );
  const service = createEmergencyAIService({
    store: harness.store,
    geminiApiKey: '  "AIza-chave-de-teste"  ',
    logger: { error() {} },
  });

  const status = await service.getStatus();
  assert.equal(status.provider.status, 'configured');
  assert.equal(JSON.stringify(status).includes('AIza-chave-de-teste'), false);
});

test('usa o novo modelo padrão quando a configuração persistida não define modelo', async () => {
  const harness = makeStore();
  harness.setConfig(makeConfig({ enabled: true, provider: 'gemini', model: null }));
  let usedModel = '';
  const service = createEmergencyAIService({
    store: harness.store,
    geminiApiKey: 'valid-key',
    logger: { error() {} },
    generateContent: async ({ model }) => {
      usedModel = model;
      return 'Resposta de teste.';
    },
  });

  const result = await service.generateResponse({
    conversationId: 'conv-1',
    customerMessage: 'Olá',
    companyId: 'company-1',
  });

  assert.equal(result.model, 'gemini-3.5-flash-lite');
  assert.equal(usedModel, 'gemini-3.5-flash-lite');
});

test('modelo persistido continua tendo precedência sobre o modelo padrão', async () => {
  const harness = makeStore();
  harness.setConfig(
    makeConfig({ enabled: true, provider: 'gemini', model: 'modelo-persistido' })
  );
  let usedModel = '';
  const service = createEmergencyAIService({
    store: harness.store,
    geminiApiKey: 'valid-key',
    logger: { error() {} },
    generateContent: async ({ model }) => {
      usedModel = model;
      return 'Resposta de teste.';
    },
  });

  const result = await service.generateResponse({
    conversationId: 'conv-1',
    customerMessage: 'Olá',
    companyId: 'company-1',
  });

  assert.equal(result.model, 'modelo-persistido');
  assert.equal(usedModel, 'modelo-persistido');
});

test('serviço ativa e desativa com motivo e responsável auditáveis', async () => {
  const harness = makeStore();
  const service = createEmergencyAIService({
    store: harness.store,
    geminiApiKey: 'valid-key',
    logger: { error() {} },
  });

  const activated = await service.setEnabled({
    enabled: true,
    actorId: 'admin-id',
    actorName: 'Administrador Teste',
    reason: 'Contingência aprovada',
  });

  assert.equal(activated.config.enabled, true);
  assert.equal(activated.changed, true);
  assert.equal(harness.calls[0].enabled, true);
  assert.equal(harness.calls[0].actorId, 'admin-id');
  assert.equal(harness.calls[0].actorName, 'Administrador Teste');
  assert.equal(harness.calls[0].reason, 'Contingência aprovada');
  assert.equal(harness.calls[0].whatsappStatus, 'configured');

  const deactivated = await service.setEnabled({
    enabled: false,
    actorId: 'admin-id',
    actorName: 'Administrador Teste',
    reason: null,
  });

  assert.equal(deactivated.config.enabled, false);
  assert.equal(deactivated.changed, true);
  assert.equal(harness.calls[1].enabled, false);
});

test('falha de persistência não retorna sucesso nem expõe erro interno', async () => {
  const harness = makeStore({
    async setEnabled() {
      return { data: null, changed: false, error: { message: 'detalhe interno do banco' } };
    },
  });
  const service = createEmergencyAIService({
    store: harness.store,
    geminiApiKey: 'valid-key',
    logger: { error() {} },
  });

  await assert.rejects(
    () => service.setEnabled({
      enabled: true,
      actorId: 'admin-id',
      actorName: 'Administrador Teste',
      reason: null,
    }),
    (error: unknown) => {
      assert.ok(error instanceof EmergencyAIError);
      assert.equal(error.status, 500);
      assert.equal(error.message.includes('detalhe interno do banco'), false);
      assert.equal(error.message.includes('estado anterior foi mantido'), true);
      return true;
    }
  );
});

test('erro de leitura da configuração falha fechado e não autoriza ativação', async () => {
  const harness = makeStore({
    async getConfig() {
      return { data: null, error: { message: 'db offline' } };
    },
  });
  const service = createEmergencyAIService({
    store: harness.store,
    geminiApiKey: 'valid-key',
    logger: { error() {} },
  });

  await assert.rejects(
    () => service.getStatus(),
    (error: unknown) => error instanceof EmergencyAIError && error.status === 500
  );
  assert.equal(await isEmergencyAIEnabled(service), false);
});

test('isEmergencyAIEnabled confirma somente estado persistido true', async () => {
  const disabledHarness = makeStore();
  const disabledService = createEmergencyAIService({
    store: disabledHarness.store,
    logger: { error() {} },
  });
  assert.equal(await isEmergencyAIEnabled(disabledService), false);

  const enabledHarness = makeStore();
  enabledHarness.setConfig(makeConfig({ enabled: true }));
  const enabledService = createEmergencyAIService({
    store: enabledHarness.store,
    logger: { error() {} },
  });
  assert.equal(await isEmergencyAIEnabled(enabledService), true);
});

test('histórico é lido apenas pelo serviço administrativo com limite validado', async () => {
  const harness = makeStore();
  harness.setHistory([
    {
      id: 'audit-1',
      config_id: 'config-1',
      company_id: null,
      action: 'activate',
      actor_id: 'admin-id',
      actor_name: 'Administrador Teste',
      previous_enabled: false,
      new_enabled: true,
      result: 'success',
      reason: 'Contingência',
      integration_status: 'configured',
      created_at: '2026-10-27T13:00:00.000Z',
    },
  ]);
  const service = createEmergencyAIService({
    store: harness.store,
    logger: { error() {} },
  });

  const result = await service.getHistory(10);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].action, 'activate');
  assert.equal(result.history[0].previous_enabled, false);
  assert.equal(result.history[0].new_enabled, true);
  assert.deepEqual(harness.calls.at(-1), { limit: 10 });
});

test('store de produção chama a RPC atômica com o ator e o motivo validados', async () => {
  const calls: any[] = [];
  const client = {
    async rpc(name: string, params: Record<string, unknown>) {
      calls.push({ name, params });
      return {
        data: {
          config: makeConfig({
            enabled: true,
            last_changed_by: 'admin-id',
            last_changed_by_name: 'Administrador Teste',
            integration_status: 'configured',
          }),
          changed: true,
        },
        error: null,
      };
    },
  };
  const store = createSupabaseEmergencyAIStore(() => client as any);

  const result = await store.setEnabled({
    enabled: true,
    actorId: 'admin-id',
    actorName: 'Administrador Teste',
    reason: 'Contingência',
    whatsappStatus: 'configured',
  });

  assert.equal(calls[0].name, 'set_emergency_ai_enabled');
  assert.deepEqual(calls[0].params, {
    p_enabled: true,
    p_actor_id: 'admin-id',
    p_actor_name: 'Administrador Teste',
    p_reason: 'Contingência',
    p_whatsapp_status: 'configured',
  });
  assert.equal(result.error, null);
  assert.equal(result.changed, true);
  assert.equal(result.data?.enabled, true);
  assert.equal(JSON.stringify(result.data).includes('SECRET'), false);
});

test('migration ativa RLS, auditoria atômica, concorrência e idempotência', () => {
  assert.match(MIGRATION, /alter table public\.emergency_ai_configs enable row level security/);
  assert.match(MIGRATION, /alter table public\.emergency_ai_audit_logs enable row level security/);
  assert.match(MIGRATION, /alter table public\.emergency_ai_events enable row level security/);
  assert.match(MIGRATION, /pg_advisory_xact_lock/);
  assert.match(MIGRATION, /where id = p_actor_id[\s\S]*role = 'admin'/);
  assert.match(MIGRATION, /insert into public\.emergency_ai_audit_logs/);
  assert.match(MIGRATION, /previous_enabled/);
  assert.match(MIGRATION, /new_enabled/);
  assert.match(MIGRATION, /result/);
  assert.match(MIGRATION, /idempotency_key/);
  assert.match(MIGRATION, /input_tokens/);
  assert.match(MIGRATION, /output_tokens/);
  assert.match(MIGRATION, /total_tokens/);
  assert.match(MIGRATION, /outcome varchar\(20\) not null default 'recorded'[\s\S]*check \(outcome in \('recorded'/);
  assert.match(MIGRATION, /using \(public\.is_admin\(\)\)/);
});

test('migration não cria configuração ativa por padrão nem credenciais nas novas tabelas', () => {
  assert.match(MIGRATION, /enabled boolean not null default false/);
  assert.doesNotMatch(MIGRATION, /enabled boolean not null default true/i);

  const configBlock = MIGRATION.match(
    /create table if not exists public\.emergency_ai_configs \(([\s\S]*?)\n\);/
  )?.[1] ?? '';
  const eventsBlock = MIGRATION.match(
    /create table if not exists public\.emergency_ai_events \(([\s\S]*?)\n\);/
  )?.[1] ?? '';

  assert.notEqual(configBlock, '');
  assert.notEqual(eventsBlock, '');
  assert.doesNotMatch(configBlock, /access_token|password|secret|access_key/i);
  // `input_tokens`/`output_tokens` são contadores permitidos; conteúdo integral
  // e credenciais não podem existir na tabela de eventos.
  assert.doesNotMatch(eventsBlock, /\bcontent\b|access_token|password|secret/i);
});

test('migration restringe grants e execução da função atômica', () => {
  assert.match(
    MIGRATION,
    /revoke all on table[\s\S]*public\.emergency_ai_configs,[\s\S]*public\.emergency_ai_audit_logs,[\s\S]*public\.emergency_ai_events[\s\S]*from anon, authenticated/
  );
  assert.match(
    MIGRATION,
    /grant select on table public\.emergency_ai_audit_logs to authenticated/
  );
  assert.match(
    MIGRATION,
    /grant all on table[\s\S]*public\.emergency_ai_configs,[\s\S]*to service_role/
  );
  assert.match(
    MIGRATION,
    /grant execute on function public\.set_emergency_ai_enabled\(boolean, uuid, text, text, text\)[\s\S]*to service_role/
  );
});
