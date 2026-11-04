import test from 'node:test';
import assert from 'node:assert/strict';

import { createMetaAgentClient } from '../src/server/metaAgentClient.js';

function makeFetchStub(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: any, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const result = handler(String(url), init || { headers: {} });
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const TOKEN = 'TEST_SYSTEM_USER_TOKEN';

test('agent_eligibility devolve isEligible real e usa X-API-Version 2.0.0', async () => {
  const { calls, fetchImpl } = makeFetchStub(() => ({ status: 200, body: { is_eligible: true } }));
  const client = createMetaAgentClient({ accessToken: TOKEN, fetchImpl });

  const result = await client.getEligibility('PHONE-ID-123');

  assert.equal(result.ok, true);
  assert.deepEqual((result as { data?: unknown }).data, { isEligible: true });
  const call = calls[0];
  assert.ok(call.url.endsWith('/PHONE-ID-123/agent_eligibility'));
  assert.equal((call.init.headers as Record<string, string>)['X-API-Version'], '2.0.0');
  assert.equal((call.init.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
  assert.equal((call.init as { method: string }).method, 'GET');
});

test('agent_onboarding POST corpo vazio e normaliza agent_id', async () => {
  const { calls, fetchImpl } = makeFetchStub(() => ({ status: 201, body: { agent_id: 'AGENT-9' } }));
  const client = createMetaAgentClient({ accessToken: TOKEN, fetchImpl });

  const result = await client.onboard('PHONE-ID-123');
  assert.equal(result.ok, true);
  assert.deepEqual((result as { data?: unknown }).data, { agentId: 'AGENT-9' });
  assert.ok(calls[0].url.endsWith('/PHONE-ID-123/agent_onboarding'));
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {});
  assert.equal((calls[0].init as { method: string }).method, 'POST');
});

test('falha 403 é normalizada em title/detail sem ecoar token', async () => {
  const { fetchImpl } = makeFetchStub(() => ({
    status: 403,
    body: { error: { title: 'Forbidden', detail: 'ToS não aceito', code: 403 } },
  }));
  const client = createMetaAgentClient({ accessToken: TOKEN, fetchImpl });

  const result = await client.getEligibility('PHONE-ID-123');
  assert.equal(result.ok, false);
  const error = (result as { error?: { title: string; detail: string; code: string | null } }).error;
  assert.equal(error?.title, 'Forbidden');
  assert.equal(error?.detail, 'ToS não aceito');
  assert.equal(error?.code, '403');
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(TOKEN));
});

test('agent_config/settings PUT com agent_id e rollout parcial', async () => {
  const { calls, fetchImpl } = makeFetchStub(() => ({
    status: 200,
    body: [
      {
        agent_id: 'AGENT-9',
        channel: 'whatsapp',
        rollout: { enabled: true },
        handoff: null,
        ai_audience: 'EVERYONE',
      },
    ],
  }));
  const client = createMetaAgentClient({ accessToken: TOKEN, fetchImpl });

  const result = await client.updateSettings('PHONE-ID-123', { rollout: { enabled: true } }, 'AGENT-9');
  assert.equal(result.ok, true);
  const normalized = (result as { data?: unknown }).data as Array<{ agentId: string; rollout: { enabled: boolean } }>;
  assert.equal(normalized[0].agentId, 'AGENT-9');
  assert.equal(normalized[0].rollout.enabled, true);

  const url = calls[0].url;
  assert.ok(url.includes('/agent_config/settings'));
  assert.ok(url.includes('agent_id=AGENT-9'));
  assert.equal((calls[0].init as { method: string }).method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { rollout: { enabled: true } });
});

test('thread control usa path e versão oficiais (1.0.0) e body com action/to', async () => {
  const { calls, fetchImpl } = makeFetchStub(() => ({
    status: 200,
    body: { messaging_product: 'whatsapp', request_id: 'REQ-1' },
  }));
  const client = createMetaAgentClient({ accessToken: TOKEN, fetchImpl });

  const result = await client.updateThreadControl('PHONE-ID-123', {
    action: 'release',
    to: '5531999990000',
    metadata: 'reobote-v1:conv:conv-1',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    (result as { data?: unknown }).data,
    { requestId: 'REQ-1' },
  );
  const url = calls[0].url;
  assert.ok(url.includes('/business/whatsapp/phone_numbers/PHONE-ID-123/thread_control'));
  assert.equal((calls[0].init.headers as Record<string, string>)['X-API-Version'], '1.0.0');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {
    action: 'release',
    to: '5531999990000',
    metadata: 'reobote-v1:conv:conv-1',
  });
});

test('erro de rede e timeout viram classes controladas, sem stack', async () => {
  const failing = (async () => {
    throw new Error('ECONNREFUSED不应该到达日志');
    // eslint-disable-next-line no-unreachable
  }) as unknown as typeof fetch;
  const clientNetwork = createMetaAgentClient({ accessToken: TOKEN, fetchImpl: failing, timeoutMs: 50 });
  const networkResult = await clientNetwork.getEligibility('PHONE-ID-123');
  assert.equal(networkResult.ok, false);
  assert.equal((networkResult as { networkError?: string }).networkError, 'network');
  assert.ok(!JSON.stringify(networkResult).includes('ECONNREFUSED'));

  const hanging = ((_url: unknown, _init: unknown) =>
    new Promise<Response>(() => undefined)) as unknown as typeof fetch;
  const clientTimeout = createMetaAgentClient({ accessToken: TOKEN, fetchImpl: hanging, timeoutMs: 20 });
  const timeoutResult = await clientTimeout.getSettings('PHONE-ID-123');
  assert.equal(timeoutResult.ok, false);
  assert.equal((timeoutResult as { networkError?: string }).networkError, 'timeout');
  assert.ok(!JSON.stringify(timeoutResult).includes(TOKEN));
});
