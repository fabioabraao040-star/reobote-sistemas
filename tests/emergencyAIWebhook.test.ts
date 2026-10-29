import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createEmergencyAIService,
  EMERGENCY_AI_DEFAULT_MODEL,
} from '../src/server/emergencyAIService.js';
import type { EmergencyAIStore } from '../src/server/emergencyAIStore.js';
import {
  processEmergencyAIInbound,
  type EmergencyAIConversationSnapshot,
  type EmergencyAIWebhookAdapter,
} from '../src/server/emergencyAIWebhook.js';
import type {
  EmergencyAIConfigRow,
  WhatsAppIntegrationRow,
} from '../src/utils/emergencyAI.js';

const SERVER_SOURCE = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

function makeConfig(enabled: boolean): EmergencyAIConfigRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    company_id: null,
    enabled,
    provider: 'gemini',
    model: EMERGENCY_AI_DEFAULT_MODEL,
    integration_status: 'configured',
    last_changed_by: null,
    last_changed_by_name: null,
    last_changed_at: null,
    created_at: '2026-10-28T12:00:00.000Z',
    updated_at: '2026-10-28T12:00:00.000Z',
  };
}

function makeWhatsApp(): WhatsAppIntegrationRow {
  return {
    is_verified: true,
    phone_number_id: 'phone-number-id',
    access_token: 'SECRET_WHATSAPP_TOKEN',
    last_health_check: '2026-10-28T12:00:00.000Z',
  };
}

function makeConversation(
  overrides: Partial<EmergencyAIConversationSnapshot> = {}
): EmergencyAIConversationSnapshot {
  return {
    id: 'conv-1',
    company_id: 'company-1',
    assigned_to: null,
    status: 'open',
    ...overrides,
  };
}

interface HarnessOptions {
  enabled?: boolean;
  geminiApiKey?: string | null;
  useDefaultGenerator?: boolean;
  conversation?: EmergencyAIConversationSnapshot | null;
  agentReply?: boolean;
  claim?: 'auto' | 'claimed' | 'duplicate' | 'unavailable';
  dispatchOk?: boolean;
  dispatchConfigNull?: boolean;
  phone?: string | null;
  generateContent?: (params: {
    model: string;
    systemInstruction: string;
    message: string;
    maxOutputTokens: number;
  }) => Promise<string | null>;
  onGetConversation?: (call: number) => EmergencyAIConversationSnapshot | null;
}

function makeHarness(options: HarnessOptions = {}) {
  let enabled = options.enabled ?? true;
  let conversation =
    options.conversation === undefined ? makeConversation() : options.conversation;
  let agentReply = options.agentReply ?? false;

  const claimed = new Set<string>();
  const calls = {
    generate: 0,
    insertAi: [] as Array<{ conversationId: string; content: string }>,
    dispatch: [] as Array<{ to: string; body: string }>,
    failed: [] as string[],
    touch: [] as Array<{ conversationId: string; content: string; at: string }>,
    claim: [] as string[],
    conversations: 0,
    logs: [] as unknown[][],
  };

  const store: EmergencyAIStore = {
    async getConfig() {
      return { data: makeConfig(enabled), error: null };
    },
    async getWhatsAppConfig() {
      return { data: makeWhatsApp(), error: null };
    },
    async setEnabled() {
      throw new Error('setEnabled não deve ser chamado no fluxo do webhook');
    },
    async listAudit() {
      return { data: [], error: null };
    },
  };

  const injectedGenerator = async (params: {
    model: string;
    systemInstruction: string;
    message: string;
    maxOutputTokens: number;
  }) => {
    calls.generate++;
    if (options.generateContent) {
      return options.generateContent(params);
    }
    return 'Resposta automática de teste.';
  };

  const service = createEmergencyAIService({
    store,
    geminiApiKey:
      options.geminiApiKey === undefined ? 'test-gemini-key' : options.geminiApiKey,
    logger: {
      error: (...args: unknown[]) => {
        calls.logs.push(args);
      },
    },
    ...(options.useDefaultGenerator === false
      ? {}
      : { generateContent: injectedGenerator }),
  });

  const adapter: EmergencyAIWebhookAdapter = {
    async getConversation() {
      calls.conversations++;
      if (options.onGetConversation) {
        return options.onGetConversation(calls.conversations);
      }
      return conversation;
    },
    async hasAgentReplySince() {
      return agentReply;
    },
    async claimInboundEvent({ inboundMessageId }) {
      calls.claim.push(inboundMessageId);
      if (options.claim && options.claim !== 'auto') {
        return options.claim;
      }
      if (claimed.has(inboundMessageId)) {
        return 'duplicate';
      }
      claimed.add(inboundMessageId);
      return 'claimed';
    },
    async getContactPhone() {
      return options.phone === undefined ? '5511999990000' : options.phone;
    },
    async insertAiMessage(input) {
      calls.insertAi.push(input);
      return 'ai-message-1';
    },
    async setAiMessageWhatsAppId() {
      // Registrado implicitamente; o ID real é validado no adaptador do servidor.
    },
    async markAiMessageFailed(messageId) {
      calls.failed.push(messageId);
    },
    async touchConversation(input) {
      calls.touch.push(input);
    },
    async getDispatchConfig() {
      if (options.dispatchConfigNull) return null;
      return { phoneNumberId: 'pn', accessToken: 'SECRET_WHATSAPP_TOKEN' };
    },
    async dispatchText(input) {
      calls.dispatch.push({ to: input.to, body: input.body });
      if (options.dispatchOk === false) {
        return { ok: false, error: 'meta refused' };
      }
      return { ok: true, messageId: 'wamid-ai-1' };
    },
  };

  return {
    service,
    adapter,
    calls,
    setEnabled(value: boolean) {
      enabled = value;
    },
    setConversation(value: EmergencyAIConversationSnapshot | null) {
      conversation = value;
    },
    setAgentReply(value: boolean) {
      agentReply = value;
    },
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: 'conv-1',
    companyId: 'company-1',
    contactId: 'contact-1',
    customerMessage: 'Olá, preciso de ajuda.',
    inboundMessageId: 'wamid-in-1',
    receivedAt: '2026-10-28T12:00:00.000Z',
    isCustomerTextMessage: true,
    ...overrides,
  };
}

const quietLogger = { error() {} };

test('IA desativada não gera nem envia resposta', async () => {
  const harness = makeHarness({ enabled: false });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'skipped_disabled');
  assert.equal(harness.calls.generate, 0);
  assert.equal(harness.calls.dispatch.length, 0);
  assert.equal(harness.calls.insertAi.length, 0);
});

test('IA ativada processa mensagem elegível, registra histórico e envia', async () => {
  const harness = makeHarness({ enabled: true });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
    now: () => new Date('2026-10-28T12:00:05.000Z'),
  });

  assert.equal(result.status, 'sent');
  assert.equal(harness.calls.generate, 1);
  assert.equal(harness.calls.insertAi.length, 1);
  assert.equal(harness.calls.insertAi[0].conversationId, 'conv-1');
  assert.equal(harness.calls.insertAi[0].content, 'Resposta automática de teste.');
  assert.equal(harness.calls.dispatch.length, 1);
  assert.equal(harness.calls.dispatch[0].to, '5511999990000');
  assert.equal(harness.calls.dispatch[0].body, 'Resposta automática de teste.');
  assert.equal(harness.calls.touch.length, 1);
  assert.equal(harness.calls.touch[0].at, '2026-10-28T12:00:05.000Z');
  assert.equal(harness.calls.failed.length, 0);
});

test('erro do Gemini não derruba o webhook e não vaza segredo nos logs', async () => {
  const harness = makeHarness({
    enabled: true,
    generateContent: async () => {
      throw new Error('provider down with test-gemini-key and customer content');
    },
  });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: {
      error: (...args: unknown[]) => {
        harness.calls.logs.push(args);
      },
    },
  });

  assert.equal(result.status, 'generation_failed');
  assert.equal(harness.calls.dispatch.length, 0);
  assert.equal(harness.calls.insertAi.length, 0);

  const serializedLogs = JSON.stringify(harness.calls.logs);
  assert.equal(serializedLogs.includes('test-gemini-key'), false);
  assert.equal(serializedLogs.includes('provider down'), false);
  assert.equal(serializedLogs.includes('preciso de ajuda'), false);
});

test('resposta pendente é descartada se a IA for desativada durante a geração', async () => {
  const harness = makeHarness({
    enabled: true,
    generateContent: async () => {
      harness.setEnabled(false);
      return 'Resposta que não deve ser enviada.';
    },
  });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'discarded_disabled');
  assert.equal(harness.calls.generate, 1);
  assert.equal(harness.calls.insertAi.length, 0);
  assert.equal(harness.calls.dispatch.length, 0);
});

test('conversa assumida pelo atendente não recebe resposta da IA', async () => {
  const harness = makeHarness({
    enabled: true,
    conversation: makeConversation({ assigned_to: 'user-1' }),
  });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'skipped_human');
  assert.equal(harness.calls.generate, 0);
  assert.equal(harness.calls.dispatch.length, 0);
});

test('atendente que respondeu após a mensagem do cliente bloqueia a IA', async () => {
  const harness = makeHarness({ enabled: true, agentReply: true });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'skipped_human');
  assert.equal(harness.calls.generate, 0);
});

test('atendente assume a conversa durante a geração e o envio é descartado', async () => {
  let call = 0;
  const harness = makeHarness({
    enabled: true,
    onGetConversation: () => {
      call += 1;
      return call === 1
        ? makeConversation()
        : makeConversation({ assigned_to: 'user-1' });
    },
  });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'discarded_human');
  assert.equal(harness.calls.generate, 1);
  assert.equal(harness.calls.insertAi.length, 0);
  assert.equal(harness.calls.dispatch.length, 0);
});

test('evento duplicado sequencial não gera segunda resposta', async () => {
  const harness = makeHarness({ enabled: true });

  const first = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });
  const second = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(first.status, 'sent');
  assert.equal(second.status, 'duplicate');
  assert.equal(harness.calls.generate, 1);
  assert.equal(harness.calls.dispatch.length, 1);
});

test('eventos simultâneos do webhook geram apenas uma resposta', async () => {
  const harness = makeHarness({ enabled: true });

  const results = await Promise.all([
    processEmergencyAIInbound({
      service: harness.service,
      adapter: harness.adapter,
      input: makeInput(),
      logger: quietLogger,
    }),
    processEmergencyAIInbound({
      service: harness.service,
      adapter: harness.adapter,
      input: makeInput(),
      logger: quietLogger,
    }),
  ]);

  const statuses = results.map((item) => item.status).sort();
  assert.deepEqual(statuses, ['duplicate', 'sent']);
  assert.equal(harness.calls.generate, 1);
  assert.equal(harness.calls.dispatch.length, 1);
});

test('claim idempotente indisponível não bloqueia o fluxo principal', async () => {
  const harness = makeHarness({ enabled: true, claim: 'unavailable' });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'sent');
  assert.equal(harness.calls.dispatch.length, 1);
});

test('chave Gemini ausente mantém a IA sem resposta e não envia nada', async () => {
  const harness = makeHarness({
    enabled: true,
    geminiApiKey: null,
    useDefaultGenerator: false,
  });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'generation_failed');
  assert.equal(harness.calls.generate, 0);
  assert.equal(harness.calls.dispatch.length, 0);
  assert.equal(harness.calls.insertAi.length, 0);
});

test('falha no envio marca a mensagem como failed e não atualiza a conversa', async () => {
  const harness = makeHarness({ enabled: true, dispatchOk: false });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'dispatch_failed');
  assert.deepEqual(harness.calls.failed, ['ai-message-1']);
  assert.equal(harness.calls.touch.length, 0);
});

test('mensagem que não é texto de cliente é ignorada', async () => {
  const harness = makeHarness({ enabled: true });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput({ isCustomerTextMessage: false }),
    logger: quietLogger,
  });

  assert.equal(result.status, 'skipped_ineligible');
  assert.equal(harness.calls.generate, 0);
});

test('evento sem identificador da mensagem é ignorado', async () => {
  const harness = makeHarness({ enabled: true });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput({ inboundMessageId: null }),
    logger: quietLogger,
  });

  assert.equal(result.status, 'skipped_ineligible');
  assert.equal(harness.calls.generate, 0);
});

test('conversa de outra empresa é ignorada (isolamento)', async () => {
  const harness = makeHarness({
    enabled: true,
    conversation: makeConversation({ company_id: 'other-company' }),
  });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'skipped_ineligible');
  assert.equal(harness.calls.generate, 0);
});

test('conversa encerrada não recebe resposta automática', async () => {
  const harness = makeHarness({
    enabled: true,
    conversation: makeConversation({ status: 'closed' }),
  });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'skipped_ineligible');
  assert.equal(harness.calls.generate, 0);
});

test('sem integração de WhatsApp a resposta não é enviada', async () => {
  const harness = makeHarness({ enabled: true, dispatchConfigNull: true });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'discarded_no_dispatch');
  assert.equal(harness.calls.dispatch.length, 0);
});

test('contato sem telefone válido não recebe resposta', async () => {
  const harness = makeHarness({ enabled: true, phone: null });

  const result = await processEmergencyAIInbound({
    service: harness.service,
    adapter: harness.adapter,
    input: makeInput(),
    logger: quietLogger,
  });

  assert.equal(result.status, 'discarded_no_dispatch');
  assert.equal(harness.calls.dispatch.length, 0);
});

test('serviço de geração trata resposta vazia, entrada longa e timeout', async () => {
  const empty = makeHarness({ generateContent: async () => '   ' });
  const emptyResult = await empty.service.generateResponse({
    conversationId: 'conv-1',
    customerMessage: 'Olá',
    companyId: 'company-1',
  });
  assert.equal(emptyResult.text, null);
  assert.equal(emptyResult.error, 'Resposta vazia do provedor.');

  const long = makeHarness();
  const longResult = await long.service.generateResponse({
    conversationId: 'conv-1',
    customerMessage: 'x'.repeat(2001),
    companyId: 'company-1',
  });
  assert.equal(longResult.text, null);
  assert.equal(longResult.error, 'Mensagem acima do limite permitido.');

  const timeout = makeHarness({
    generateContent: () => new Promise<string | null>(() => {}),
  });
  const timeoutResult = await timeout.service.generateResponse({
    conversationId: 'conv-1',
    customerMessage: 'Olá',
    companyId: 'company-1',
    timeoutMs: 1000,
  });
  assert.equal(timeoutResult.text, null);
  assert.equal(timeoutResult.error, 'Erro ao gerar resposta de IA.');
});

test('serviço usa o modelo persistido e não expõe a chave na resposta', async () => {
  const harness = makeHarness({
    generateContent: async () => 'Resposta segura.',
  });

  const result = await harness.service.generateResponse({
    conversationId: 'conv-1',
    customerMessage: 'Olá',
    companyId: 'company-1',
  });

  assert.equal(result.text, 'Resposta segura.');
  assert.equal(result.model, EMERGENCY_AI_DEFAULT_MODEL);
  assert.equal(JSON.stringify(result).includes('test-gemini-key'), false);
});

test('webhook oficial da Meta chama o orquestrador da IA e usa o envio existente', () => {
  assert.match(SERVER_SOURCE, /processEmergencyAIInbound/);
  assert.match(SERVER_SOURCE, /isCustomerTextMessage/);
  assert.match(SERVER_SOURCE, /businessPhone/);
  assert.match(SERVER_SOURCE, /emergency_ai_events/);
  assert.match(SERVER_SOURCE, /sender_type: 'system'/);
  assert.match(SERVER_SOURCE, /dispatchWhatsAppText\(dispatchParams\)/);

  const webhookBlock = SERVER_SOURCE.slice(
    SERVER_SOURCE.indexOf("app.post('/api/webhook/whatsapp'"),
    SERVER_SOURCE.indexOf("app.get('/api/contacts'")
  );
  assert.ok(webhookBlock.includes('processEmergencyAIInbound'));
  assert.ok(webhookBlock.includes('isCustomerTextMessage'));
  assert.ok(webhookBlock.includes('businessPhone'));
});

test('card da IA está montado no dashboard administrativo e usa o estado do backend', () => {
  const dashboard = readFileSync(
    new URL('../src/components/Dashboard.tsx', import.meta.url),
    'utf8'
  );
  const card = readFileSync(
    new URL('../src/components/EmergencyAICard.tsx', import.meta.url),
    'utf8'
  );

  assert.match(dashboard, /import \{ EmergencyAICard \} from '\.\/EmergencyAICard'/);
  assert.match(dashboard, /<EmergencyAICard \/>/);
  assert.match(card, /isAdmin/);
  assert.match(card, /api\.getEmergencyAIStatus\(\)/);
  assert.match(card, /api\.activateEmergencyAI/);
  assert.match(card, /api\.deactivateEmergencyAI/);
  assert.match(card, /ATIVAR IA/);
  assert.match(card, /DESATIVAR IA/);
});
