import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';

import { createAuthMiddleware } from '../src/server/authMiddleware.js';
import { createMetaAgentRouter } from '../src/server/metaAgentRoutes.js';
import { createMetaAgentService } from '../src/server/metaAgentService.js';
import { createMetaAgentClient } from '../src/server/metaAgentClient.js';
import type { MetaAgentStore } from '../src/server/metaAgentStore.js';

const SECRET_TOKEN = 'SECRET_WHATSAPP_TOKEN';
const COMPANY = '11111111-1111-1111-1111-111111111111';

const PROFILES = {
  'admin-token': {
    id: 'admin-id',
    company_id: COMPANY,
    name: 'Administrador Teste',
    email: 'admin@test.invalid',
    role: 'admin',
  },
  'user-token': {
    id: 'user-id',
    company_id: COMPANY,
    name: 'Atendente Teste',
    email: 'atendente@test.invalid',
    role: 'user',
  },
  'master-token': {
    id: 'master-id',
    company_id: COMPANY,
    name: 'Master Teste',
    email: 'master@test.invalid',
    role: 'master_admin',
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
  from(table: string) {
    return {
      select() {
        return {
          eq(_column: string, id: string) {
            return {
              async single() {
                if (table !== 'users') {
                  return { data: null, error: new Error('tabela não usada no teste') };
                }
                const found = Object.values(PROFILES).find((item) => item.id === id);
                return found ? { data: found, error: null } : { data: null, error: new Error('não encontrado') };
              },
            };
          },
        };
      },
    };
  },
};

function makeInMemoryStore(): { store: MetaAgentStore; status: () => string } {
  let integration: {
    id: string;
    companyId: string;
    whatsappConfigId: string;
    metaAgentId: string | null;
    status: string;
    updatedAt: string | null;
  } | null = null;
  const events: Array<{ integrationId: string; eventType: string; outcome: string; errorCode: string | null }> = [];

  const store: MetaAgentStore = {
    async getIntegrationByCompany(companyId) {
      return {
        data: integration && integration.companyId === companyId ? (integration as any) : null,
        error: null,
      };
    },
    async createIntegration(companyId, whatsappConfigId) {
      if (integration && integration.companyId === companyId) return { data: integration as any, error: null };
      integration = {
        id: 'integ-1',
        companyId,
        whatsappConfigId,
        metaAgentId: null,
        status: 'pending',
        updatedAt: null,
      };
      return { data: integration as any, error: null };
    },
    async setMetaAgentId(id, agentId, status) {
      if (!integration || integration.id !== id) return { code: 'missing' };
      integration = { ...integration, metaAgentId: agentId, status, updatedAt: 'now' };
      return null;
    },
    async setStatus(id, status) {
      if (!integration || integration.id !== id) return { code: 'missing' };
      integration = { ...integration, status, updatedAt: 'now' };
      return null;
    },
    async recordEvent({ integrationId, eventType, outcome, errorCode }) {
      events.push({ integrationId, eventType, outcome, errorCode: errorCode ?? null });
      return null;
    },
    async listEvents(integrationId) {
      return {
        data: events
          .filter((event) => event.integrationId === integrationId)
          .reverse()
          .map((event, index) => ({
            id: `ev-${index}`,
            eventType: event.eventType,
            outcome: event.outcome,
            errorCode: event.errorCode,
            createdAt: '2026-11-03T12:00:00.000Z',
          })),
        error: null,
      };
    },
  };

  return { store, status: () => integration?.status ?? 'none' };
}

function makeApp(options: {
  fetchStub: typeof fetch;
  ownerResponse?: { companyId: string; contactPhone: string | null } | null;
}) {
  const harness = makeInMemoryStore();
  const service = createMetaAgentService({
    store: harness.store,
    getWhatsAppConfig: async (_companyId: string) => ({
      id: 'config-1',
      phoneNumberId: 'PHONE-ID-1',
      accessToken: SECRET_TOKEN,
      isVerified: true,
      phoneNumber: '+5531999990000',
    }),
    createClient: (accessToken) => createMetaAgentClientStub(accessToken, options.fetchStub),
    getConversationOwner: async () => options.ownerResponse ?? null,
  });

  const app = express();
  app.use(express.json());
  const authMiddleware = createAuthMiddleware({
    getSupabase: () => supabase as any,
    getSupabaseAuth: () => supabaseAuth as any,
    masterAdminAllowedPaths: new Set<string>(),
  });
  app.use('/api/meta-agent', authMiddleware, createMetaAgentRouter({ service }));
  return app;
}

// cliente da Meta com transporte injetável (stub)
function createMetaAgentClientStub(accessToken: string, fetchStub: typeof fetch) {
  return createMetaAgentClient({ accessToken, fetchImpl: fetchStub, timeoutMs: 500 });
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

test('sem autenticação responde 401 e atendente/master recebem 403', async () => {
  const stub = (async () => {
    throw new TypeError('não deve chamar a Meta');
  }) as unknown as typeof fetch;

  await withServer(makeApp({ fetchStub: stub }), async (baseUrl) => {
    const unauthenticated = await request(baseUrl, '/api/meta-agent');
    assert.equal(unauthenticated.status, 401);

    for (const token of ['user-token', 'master-token']) {
      const response = await request(baseUrl, '/api/meta-agent', { token });
      assert.equal(response.status, 403);
      const data = await response.json();
      assert.equal(typeof data.error, 'string');
      assert.ok(!JSON.stringify(data).includes(SECRET_TOKEN));
    }
  });
});

test('ADM lista integração vazia e eventos; nenhuma digitação secreta na resposta', async () => {
  const stub = (async () => {
    throw new TypeError('não deve chamar a Meta sem integração');
  }) as unknown as typeof fetch;

  await withServer(makeApp({ fetchStub: stub }), async (baseUrl) => {
    const response = await request(baseUrl, '/api/meta-agent', { token: 'admin-token' });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.integration, null);
    assert.deepEqual(data.last_events || [], []);
    assert.ok(!JSON.stringify(data).includes(SECRET_TOKEN));
  });
});

test('bloqueio de escalonamento: atendente não consegue editar nada no painel', async () => {
  const stub = (async () => {
    throw new TypeError('não deve chamar a Meta');
  }) as unknown as typeof fetch;

  await withServer(makeApp({ fetchStub: stub }), async (baseUrl) => {
    for (const [path, method] of [
      ['/api/meta-agent/connect', 'POST'],
      ['/api/meta-agent/enable', 'POST'],
      ['/api/meta-agent/disable', 'POST'],
      ['/api/meta-agent/verify', 'POST'],
      ['/api/meta-agent/handoff/release', 'POST'],
    ] as const) {
      const response = await request(baseUrl, path, {
        token: 'user-token',
        method,
        body: { conversationId: '22222222-2222-2222-2222-222222222222' },
      });
      assert.equal(response.status, 403, `${path} deveria bloquear atendente`);
    }
  });
});

test('connect pelo ADM com Meta aceitando: ok, agent_id persistido, sem secrets na rota', async () => {
  const stub = (async (url: any, init?: RequestInit) => {
    const target = String(url);
    if (target.includes('agent_eligibility')) {
      return makeHttpResponse(200, { is_eligible: true });
    }
    if (target.includes('agent_onboarding')) {
      return makeHttpResponse(201, { agent_id: 'AGENT-ROUTE-1' });
    }
    return makeHttpResponse(200, [
      { agent_id: 'AGENT-ROUTE-1', channel: 'whatsapp', rollout: { enabled: false }, handoff: null, ai_audience: 'EVERYONE' },
    ]);
  }) as unknown as typeof fetch;

  await withServer(makeApp({ fetchStub: stub }), async (baseUrl) => {
    const response = await request(baseUrl, '/api/meta-agent/connect', {
      token: 'admin-token',
      method: 'POST',
      body: {},
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.equal(data.agent_id, 'AGENT-ROUTE-1');
    assert.ok(!JSON.stringify(data).includes(SECRET_TOKEN));

    const status = await request(baseUrl, '/api/meta-agent', { token: 'admin-token' });
    const statusData = await status.json();
    assert.equal(statusData.integration.status, 'connected');
    assert.equal(statusData.integration.meta_agent_id ?? statusData.integration.metaAgentId, 'AGENT-ROUTE-1');
    assert.ok(statusData.last_events.some((event: { eventType: string }) => event.eventType === 'onboarding'));
  });
});

test('verify: elegibilidade false informa Ao ADM sem inventar conectado', async () => {
  const stub = (async (url: any) => {
    if (String(url).includes('agent_eligibility')) {
      return makeHttpResponse(200, { is_eligible: false });
    }
    return makeHttpResponse(404, {});
  }) as unknown as typeof fetch;

  await withServer(makeApp({ fetchStub: stub }), async (baseUrl) => {
    await request(baseUrl, '/api/meta-agent/connect', { token: 'admin-token', method: 'POST', body: {} });
    const response = await request(baseUrl, '/api/meta-agent/verify', {
      token: 'admin-token',
      method: 'POST',
      body: {},
    });
    assert.equal(response.status, 409);
    const data = await response.json();
    assert.ok(String(data.message).includes('não é elegível'));
    assert.ok(!JSON.stringify(data).includes(SECRET_TOKEN));
  });
});

function makeHttpResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}
