import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createAuthMiddleware } from '../src/server/authMiddleware.js';
import { EmergencyAIError } from '../src/server/emergencyAIService.js';
import { createEmergencyAIRouter } from '../src/server/emergencyAIRoutes.js';
import {
  buildEmergencyAIStatusResponse,
  type EmergencyAIStatusResponse,
} from '../src/utils/emergencyAI.js';

const PROFILES = {
  'admin-token': {
    id: 'admin-id',
    company_id: 'company-id',
    name: 'Administrador Teste',
    email: 'admin@test.invalid',
    role: 'admin',
    status: 'online',
  },
  'user-token': {
    id: 'user-id',
    company_id: 'company-id',
    name: 'Atendente Teste',
    email: 'atendente@test.invalid',
    role: 'user',
    status: 'online',
  },
  'master-token': {
    id: 'master-id',
    company_id: 'company-id',
    name: 'Master Teste',
    email: 'master@test.invalid',
    role: 'master_admin',
    status: 'online',
  },
} as const;

const supabaseAuth = {
  auth: {
    async getUser(token: string) {
      const profile = PROFILES[token as keyof typeof PROFILES];
      return profile
        ? { data: { user: { id: profile.id } }, error: null }
        : { data: { user: null }, error: new Error('token inválido') };
    },
  },
};

const supabase = {
  from(_table: string) {
    return {
      select(_columns: string) {
        return {
          eq(_column: string, id: string) {
            return {
              async single() {
                const profile = Object.values(PROFILES).find((item) => item.id === id);
                return profile
                  ? { data: profile, error: null }
                  : { data: null, error: new Error('usuário não encontrado') };
              },
            };
          },
        };
      },
    };
  },
};

interface Scenario {
  enabled: boolean;
  failPersistence: boolean;
  calls: any[];
  history: any[];
}

function makeStatus(enabled: boolean): EmergencyAIStatusResponse {
  return buildEmergencyAIStatusResponse({
    config: {
      id: 'config-id',
      company_id: null,
      enabled,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      integration_status: 'configured',
      last_changed_by: 'admin-id',
      last_changed_by_name: 'Administrador Teste',
      last_changed_at: '2026-10-27T13:00:00.000Z',
      created_at: '2026-10-27T12:00:00.000Z',
      updated_at: '2026-10-27T13:00:00.000Z',
    },
    whatsapp: {
      is_verified: true,
      phone_number_id: 'phone-number-id',
      access_token: 'SECRET_WHATSAPP_TOKEN',
      last_health_check: '2026-10-27T12:30:00.000Z',
    },
    geminiApiKey: 'SECRET_GEMINI_KEY',
  });
}

function makeScenario(): Scenario {
  return {
    enabled: false,
    failPersistence: false,
    calls: [],
    history: [
      {
        id: 'audit-1',
        action: 'activate',
        actorName: 'Administrador Teste',
        previousEnabled: false,
        newEnabled: true,
        result: 'success',
        reason: 'Contingência',
        integrationStatus: 'configured',
        createdAt: '2026-10-27T13:00:00.000Z',
      },
    ],
  };
}

function makeService(scenario: Scenario) {
  return {
    async getStatus() {
      return makeStatus(scenario.enabled);
    },
    async setEnabled(input: {
      enabled: boolean;
      actorId: string;
      actorName: string;
      reason: string | null;
    }) {
      scenario.calls.push(input);
      if (scenario.failPersistence) {
        throw new EmergencyAIError('Não foi possível ativar a IA de Emergência. O estado anterior foi mantido.');
      }
      const changed = scenario.enabled !== input.enabled;
      scenario.enabled = input.enabled;
      return { ...makeStatus(scenario.enabled), changed };
    },
    async getHistory(limit: number) {
      scenario.calls.push({ limit });
      return { history: scenario.history.slice(0, limit) };
    },
  };
}

function makeApp(scenario: Scenario) {
  const app = express();
  app.use(express.json());

  const authMiddleware = createAuthMiddleware({
    getSupabase: () => supabase as any,
    getSupabaseAuth: () => supabaseAuth as any,
    masterAdminAllowedPaths: new Set<string>(),
  });

  app.use('/api/emergency-ai', authMiddleware, createEmergencyAIRouter(makeService(scenario) as any));
  return app;
}

async function withServer(app: express.Express, callback: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function request(
  baseUrl: string,
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  return fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

test('sem autenticação a API da IA de Emergência responde 401', async () => {
  await withServer(makeApp(makeScenario()), async (baseUrl) => {
    const response = await request(baseUrl, '/api/emergency-ai');
    assert.equal(response.status, 401);
    const body = await response.json() as any;
    assert.equal(body.error, 'Token de autenticação não fornecido.');
  });
});

test('atendente autenticado recebe 403 no estado, ativação, desativação e histórico', async () => {
  await withServer(makeApp(makeScenario()), async (baseUrl) => {
    for (const [path, method, body] of [
      ['/api/emergency-ai', 'GET', undefined],
      ['/api/emergency-ai/activate', 'POST', {}],
      ['/api/emergency-ai/deactivate', 'POST', {}],
      ['/api/emergency-ai/history', 'GET', undefined],
    ] as const) {
      const response = await request(baseUrl, path, {
        token: 'user-token',
        method,
        body,
      });
      assert.equal(response.status, 403, `${method} ${path} deveria negar o atendente`);
    }
  });
});

test('master_admin não herda acesso operacional à IA de Emergência', async () => {
  await withServer(makeApp(makeScenario()), async (baseUrl) => {
    const response = await request(baseUrl, '/api/emergency-ai', { token: 'master-token' });
    assert.equal(response.status, 403);
  });
});

test('ADM autenticado consulta o estado real e sem credenciais', async () => {
  await withServer(makeApp(makeScenario()), async (baseUrl) => {
    const response = await request(baseUrl, '/api/emergency-ai', { token: 'admin-token' });
    assert.equal(response.status, 200);

    const text = await response.text();
    const body = JSON.parse(text);
    assert.equal(body.config.enabled, false);
    assert.equal(body.provider.status, 'configured');
    assert.equal(body.whatsapp.status, 'configured');
    assert.equal(text.includes('SECRET_WHATSAPP_TOKEN'), false);
    assert.equal(text.includes('SECRET_GEMINI_KEY'), false);
  });
});

test('ADM ativa e depois desativa com motivo, responsável e confirmação persistida', async () => {
  const scenario = makeScenario();

  await withServer(makeApp(scenario), async (baseUrl) => {
    const activateResponse = await request(baseUrl, '/api/emergency-ai/activate', {
      token: 'admin-token',
      method: 'POST',
      body: { reason: 'Contingência aprovada' },
    });
    assert.equal(activateResponse.status, 200);
    const activated = await activateResponse.json() as any;
    assert.equal(activated.config.enabled, true);
    assert.equal(activated.message.includes('ativada'), true);
    assert.equal(scenario.calls[0].actorId, 'admin-id');
    assert.equal(scenario.calls[0].actorName, 'Administrador Teste');
    assert.equal(scenario.calls[0].reason, 'Contingência aprovada');

    const getActive = await request(baseUrl, '/api/emergency-ai', { token: 'admin-token' });
    assert.equal((await getActive.json() as any).config.enabled, true);

    const deactivateResponse = await request(baseUrl, '/api/emergency-ai/deactivate', {
      token: 'admin-token',
      method: 'POST',
      body: { reason: 'Fim da contingência' },
    });
    assert.equal(deactivateResponse.status, 200);
    assert.equal((await deactivateResponse.json() as any).config.enabled, false);

    const getDisabled = await request(baseUrl, '/api/emergency-ai', { token: 'admin-token' });
    assert.equal((await getDisabled.json() as any).config.enabled, false);
  });
});

test('operação concorrente sem mudança real não alega nova gravação', async () => {
  const scenario = makeScenario();
  scenario.enabled = true;

  await withServer(makeApp(scenario), async (baseUrl) => {
    const response = await request(baseUrl, '/api/emergency-ai/activate', {
      token: 'admin-token',
      method: 'POST',
      body: {},
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.config.enabled, true);
    assert.equal(body.changed, false);
    assert.equal(body.message.includes('já estava ativa'), true);
  });
});

test('motivo com tipo inválido é rejeitado com 400 sem alterar estado', async () => {
  const scenario = makeScenario();

  await withServer(makeApp(scenario), async (baseUrl) => {
    const response = await request(baseUrl, '/api/emergency-ai/activate', {
      token: 'admin-token',
      method: 'POST',
      body: { reason: 123 },
    });
    assert.equal(response.status, 400);
    assert.equal(scenario.calls.length, 0);
    assert.equal(scenario.enabled, false);
  });
});

test('falha de persistência responde 500 e não declara ativação', async () => {
  const scenario = makeScenario();
  scenario.failPersistence = true;

  await withServer(makeApp(scenario), async (baseUrl) => {
    const response = await request(baseUrl, '/api/emergency-ai/activate', {
      token: 'admin-token',
      method: 'POST',
      body: {},
    });
    assert.equal(response.status, 500);
    const body = await response.json() as any;
    assert.equal(body.error.includes('estado anterior foi mantido'), true);
    assert.equal(body.error.includes('detalhe interno'), false);
    assert.equal(scenario.enabled, false);
  });
});

test('ADM consulta o histórico; atendente é negado e limite inválido retorna 400', async () => {
  const scenario = makeScenario();

  await withServer(makeApp(scenario), async (baseUrl) => {
    const denied = await request(baseUrl, '/api/emergency-ai/history', { token: 'user-token' });
    assert.equal(denied.status, 403);

    const invalidLimit = await request(baseUrl, '/api/emergency-ai/history?limit=999', {
      token: 'admin-token',
    });
    assert.equal(invalidLimit.status, 400);

    const response = await request(baseUrl, '/api/emergency-ai/history?limit=10', {
      token: 'admin-token',
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.history.length, 1);
    assert.equal(body.history[0].action, 'activate');
    assert.deepEqual(scenario.calls.at(-1), { limit: 10 });
  });
});
