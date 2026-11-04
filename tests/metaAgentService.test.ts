import test from 'node:test';
import assert from 'node:assert/strict';

import { createMetaAgentService, type MetaAgentService, type MetaAgentWhatsAppConfig } from '../src/server/metaAgentService.js';
import { createMetaAgentClient } from '../src/server/metaAgentClient.js';
import type { MetaAgentStore, MetaAgentIntegrationRecord } from '../src/server/metaAgentStore.js';

// ============================================================================
// Testes de unidade do serviço. As chamadas externas são SEMPRE stubs locais:
// aqui não se comprovam respostas reais da Meta — validam-se as regras do
// REOBOTE frente aos formatos oficiais documentados.
// ============================================================================

const COMPANY = '11111111-1111-1111-1111-111111111111';
const CONVERSATION = '22222222-2222-2222-2222-222222222222';
const SECRET_TOKEN = 'SECRET_WHATSAPP_TOKEN';

function makeInMemoryStore() {
  let integration: MetaAgentIntegrationRecord | null = null;
  const events: Array<{ integrationId: string; eventType: string; outcome: string; errorCode: string | null }> = [];

  const store: MetaAgentStore = {
    async getIntegrationByCompany(companyId) {
      return {
        data: integration && integration.companyId === companyId ? integration : null,
        error: null,
      };
    },
    async createIntegration(companyId, whatsappConfigId) {
      if (integration && integration.companyId === companyId) {
        return { data: integration, error: null };
      }
      integration = {
        id: 'integ-1',
        companyId,
        whatsappConfigId,
        metaAgentId: null,
        status: 'pending',
        updatedAt: null,
      };
      return { data: integration, error: null };
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

  return {
    store,
    events,
    getIntegration: () => integration,
  };
}

interface MetaCall {
  url: string;
  method: string;
  body?: unknown;
}

function makeMetaStub(respond: (call: MetaCall) => { status: number; body: unknown }) {
  const calls: MetaCall[] = [];
  const fetchStub = (async (url: any, init?: RequestInit) => {
    const call: MetaCall = {
      url: String(url),
      method: String((init?.method as string) ?? 'GET'),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const response = respond(call);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchStub };
}

function configureStubForSuccess(): { calls: MetaCall[]; fetchStub: typeof fetch } {
  return makeMetaStub((call) => {
    if (call.url.includes('agent_eligibility')) return { status: 200, body: { is_eligible: true } };
    if (call.url.includes('agent_onboarding')) return { status: 201, body: { agent_id: 'AGENT-999' } };
    if (call.url.includes('agent_config/skills')) return { status: 201, body: { id: 'skill-1' } };
    return {
      status: 200,
      body: [
        {
          agent_id: 'AGENT-999',
          channel: 'whatsapp',
          rollout: { enabled: false },
          handoff: null,
          ai_audience: 'EVERYONE',
        },
      ],
    };
  });
}

interface Harness {
  service: MetaAgentService;
  store: ReturnType<typeof makeInMemoryStore>['store'];
  events: ReturnType<typeof makeInMemoryStore>['events'];
  getIntegrationRow(): MetaAgentIntegrationRecord | null;
  calls: MetaCall[];
}

function makeService(
  respond: (call: MetaCall) => { status: number; body: unknown },
  options?: { owner?: { companyId: string; contactPhone: string | null } | null; config?: Partial<MetaAgentWhatsAppConfig> },
): Harness {
  const harness = makeInMemoryStore();
  const meta = makeMetaStub(respond);
  const service = createMetaAgentService({
    store: harness.store,
    getWhatsAppConfig: async (_companyId: string) =>
      ({
        id: 'config-1',
        phoneNumberId: 'PHONE-ID-1',
        accessToken: SECRET_TOKEN,
        isVerified: true,
        phoneNumber: '+5531999990000',
        ...options?.config,
      } as MetaAgentWhatsAppConfig),
    createClient: (accessToken) => createMetaAgentClient({ accessToken, fetchImpl: meta.fetchStub, timeoutMs: 500 }),
    getConversationOwner: async () => options?.owner ?? null,
  });

  return {
    service,
    store: harness.store,
    events: harness.events,
    getIntegrationRow: harness.getIntegration,
    calls: meta.calls,
  };
}

test('connect: número não elegível impede onboarding e mantém pending', async () => {
  const harness = makeService(() => ({ status: 200, body: { is_eligible: false } }));

  const result = await harness.service.connect(COMPANY);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'pending');
  assert.ok(result.message.includes('não é elegível'));
  assert.ok(harness.calls.every((call) => !call.url.includes('agent_onboarding')));
  assert.ok(harness.calls.some((call) => call.url.includes('agent_eligibility')));
  assert.equal(harness.getIntegrationRow()?.status, 'pending');
});

test('connect: 403 de termos não aceitos vira error com mensagem específica', async () => {
  const harness = makeService((call) => {
    if (call.url.includes('agent_eligibility')) return { status: 200, body: { is_eligible: true } };
    return {
      status: 403,
      body: { error: { title: 'Forbidden', detail: 'Meta Business Agent ToS', code: 403 } },
    };
  });

  const result = await harness.service.connect(COMPANY);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'error');
  assert.ok(result.message.includes('Termos de Serviço'));
  const onboardingFailures = harness.events.filter((event) => event.eventType === 'onboarding' && event.outcome === 'failed');
  assert.equal(onboardingFailures.length, 1);
});

test('connect: cria agent_id, persiste, conecta e é idempotente na repetição', async () => {
  const harness = makeService(configureStubSingletonRespond());

  const result = await harness.service.connect(COMPANY);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'connected');
  assert.equal(result.agentId, 'AGENT-999');
  assert.equal(harness.getIntegrationRow()?.metaAgentId, 'AGENT-999');
  assert.ok(harness.events.some((event) => event.eventType === 'onboarding' && event.outcome === 'ok'));

  const onboardingCallsBefore = harness.calls.filter((call) => call.url.includes('agent_onboarding')).length;
  const second = await harness.service.connect(COMPANY);
  const onboardingCallsAfter = harness.calls.filter((call) => call.url.includes('agent_onboarding')).length;
  assert.equal(onboardingCallsAfter, onboardingCallsBefore);
  assert.ok(second.ok);
  assert.ok(second.message.includes('já está conectada'));

  function configureStubSingletonRespond() {
    return (call: MetaCall) => {
      if (call.url.includes('agent_eligibility')) return { status: 200, body: { is_eligible: true } };
      if (call.url.includes('agent_onboarding')) return { status: 201, body: { agent_id: 'AGENT-999' } };
    if (call.url.includes('agent_config/skills')) return { status: 201, body: { id: 'skill-1' } };
      return {
        status: 200,
        body: [
          {
            agent_id: 'AGENT-999',
            channel: 'whatsapp',
            rollout: { enabled: false },
            handoff: null,
            ai_audience: 'EVERYONE',
          },
        ],
      };
    };
  }
});

test('verify sem integração é recusado; evento handoff liberado não chama Meta', async () => {
  const harness = makeService(() => ({ status: 200, body: { is_eligible: true } }));

  const verify = await harness.service.verify(COMPANY);
  assert.equal(verify.ok, false);
  assert.ok(verify.message.includes('Nenhuma integração'));

  const release = await harness.service.releaseHandoff(COMPANY, CONVERSATION);
  assert.equal(release.ok, false);
  assert.ok(release.message.includes('não está conectada'));
  assert.ok(harness.calls.every((call) => !call.url.includes('thread_control')));
});

test('releaseHandoff: conversa de outra empresa é rejeitada sem tocar a Meta', async () => {
  const harness = makeService(
    (call) => {
      if (call.url.includes('agent_eligibility')) return { status: 200, body: { is_eligible: true } };
      if (call.url.includes('agent_onboarding')) return { status: 201, body: { agent_id: 'AGENT-999' } };
    if (call.url.includes('agent_config/skills')) return { status: 201, body: { id: 'skill-1' } };
      return {
        status: 200,
        body: [
          {
            agent_id: 'AGENT-999',
            channel: 'whatsapp',
            rollout: { enabled: false },
            handoff: null,
            ai_audience: 'EVERYONE',
          },
        ],
      };
    },
    { owner: { companyId: '99999999-9999-9999-9999-999999999999', contactPhone: '5531999990000' } },
  );

  const connected = await harness.service.connect(COMPANY);
  assert.equal(connected.ok, true);

  const release = await harness.service.releaseHandoff(COMPANY, CONVERSATION);
  assert.equal(release.ok, false);
  assert.ok(release.message.includes('não encontrada na sua empresa'));
  assert.ok(harness.calls.every((call) => !call.url.includes('thread_control')));
});

test('releaseHandoff: sucesso devolve request_id e envia metadata com a conversa', async () => {
  const harness = makeService(
    (call) => {
      if (call.url.includes('agent_eligibility')) return { status: 200, body: { is_eligible: true } };
      if (call.url.includes('agent_onboarding')) return { status: 201, body: { agent_id: 'AGENT-999' } };
    if (call.url.includes('agent_config/skills')) return { status: 201, body: { id: 'skill-1' } };
      if (call.url.includes('thread_control')) {
        return { status: 200, body: { messaging_product: 'whatsapp', request_id: 'REQ-77' } };
      }
      return {
        status: 200,
        body: [
          {
            agent_id: 'AGENT-999',
            channel: 'whatsapp',
            rollout: { enabled: false },
            handoff: null,
            ai_audience: 'EVERYONE',
          },
        ],
      };
    },
    { owner: { companyId: COMPANY, contactPhone: '+55 (31) 99999-0000' } },
  );

  const connected = await harness.service.connect(COMPANY);
  assert.equal(connected.ok, true);

  const release = await harness.service.releaseHandoff(COMPANY, CONVERSATION);
  assert.equal(release.ok, true);
  assert.equal(release.requestId, 'REQ-77');

  const threadCalls = harness.calls.filter((call) => call.url.includes('thread_control'));
  assert.equal(threadCalls.length, 1);
  assert.deepEqual(threadCalls[0].body, {
    action: 'release',
    to: '5531999990000',
    metadata: `reobote-v1:conv:${CONVERSATION}`,
  });
  const serialized = JSON.stringify(harness.calls);
  assert.ok(!serialized.includes(SECRET_TOKEN));
  assert.ok(harness.events.some((event) => event.eventType === 'handoff_release' && event.outcome === 'ok'));
});

test('setRollout: 400 por falta de método de pagamento aparece no aviso ao ADM', async () => {
  const harness = makeService((call) => {
    if (call.url.includes('agent_eligibility')) return { status: 200, body: { is_eligible: true } };
    if (call.url.includes('agent_onboarding')) return { status: 201, body: { agent_id: 'AGENT-999' } };
    if (call.url.includes('agent_config/skills')) return { status: 201, body: { id: 'skill-1' } };
    if (call.url.includes('agent_config/settings') && call.method === 'PUT') {
      return { status: 400, body: { error: { title: 'Bad Request', detail: 'payment method required', code: 400 } } };
    }
    return {
      status: 200,
      body: [
        {
          agent_id: 'AGENT-999',
          channel: 'whatsapp',
          rollout: { enabled: false },
          handoff: null,
          ai_audience: 'EVERYONE',
        },
      ],
    };
  });
  await harness.service.connect(COMPANY);

  const result = await harness.service.setRollout(COMPANY, true);
  assert.equal(result.ok, false);
  assert.ok(result.message.includes('método de pagamento'));

  const putCalls = harness.calls.filter(
    (call) => call.url.includes('agent_config/settings') && call.method === 'PUT'
  );
  assert.equal(putCalls.length, 1);
  assert.deepEqual(putCalls[0].body, { rollout: { enabled: true } });
  assert.ok(harness.events.some((event) => event.eventType === 'enable' && event.outcome === 'failed'));
  assert.equal(harness.getIntegrationRow()?.status, 'error');
});

test('setRollout: desativar registra disabled e evento ok', async () => {
  const harness = makeService((call) => {
    if (call.url.includes('agent_eligibility')) return { status: 200, body: { is_eligible: true } };
    if (call.url.includes('agent_onboarding')) return { status: 201, body: { agent_id: 'AGENT-999' } };
    if (call.url.includes('agent_config/skills')) return { status: 201, body: { id: 'skill-1' } };
    if (call.url.includes('agent_config/settings') && call.method === 'PUT') {
      return {
        status: 200,
        body: [
          {
            agent_id: 'AGENT-999',
            channel: 'whatsapp',
            rollout: { enabled: false },
            handoff: { enabled: true, message: 'Transferindo para atendente' },
            ai_audience: 'EVERYONE',
          },
        ],
      };
    }
    return {
      status: 200,
      body: [
        {
          agent_id: 'AGENT-999',
          channel: 'whatsapp',
          rollout: { enabled: false },
          handoff: null,
          ai_audience: 'EVERYONE',
        },
      ],
    };
  });
  await harness.service.connect(COMPANY);

  const result = await harness.service.setRollout(COMPANY, false);
  assert.equal(result.ok, true);
  assert.equal(harness.getIntegrationRow()?.status, 'disabled');
  assert.ok(harness.events.some((event) => event.eventType === 'disable' && event.outcome === 'ok'));
});
