import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleCalendarService } from '../src/server/googleCalendarService.js';
import { createGoogleCalendarStore } from '../src/server/googleCalendarStore.js';
import { encryptToken } from '../src/server/googleCalendarCrypto.js';

process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.GOOGLE_CLIENT_ID = 'client-id';
process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/google-calendar/callback';

const COMPANY = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CAL_ID = 'cal-id@group.calendar.google.com';

function makeStore() {
  let conn: any = null;
  const store = createGoogleCalendarStore(() => null as any);
  // Override with in-memory implementations
  const memStore = {
    async getByCompany(companyId: string) {
      return { data: conn && conn.companyId === companyId ? conn : null, error: null };
    },
    async upsert(c: any) {
      conn = {
        id: 'conn-1',
        companyId: c.companyId,
        userId: c.userId,
        encryptedAccessToken: c.encryptedAccessToken,
        encryptedRefreshToken: c.encryptedRefreshToken,
        tokenExpiry: c.tokenExpiry,
        calendarId: c.calendarId,
        scopes: c.scopes,
        status: c.status,
        updatedAt: new Date().toISOString(),
      };
      return { data: conn, error: null };
    },
    async updateTokens(id: string, patch: any) {
      if (conn && conn.id === id) {
        conn.encryptedAccessToken = patch.encryptedAccessToken;
        conn.tokenExpiry = patch.tokenExpiry;
      }
      return { error: null };
    },
    async deleteByCompany(companyId: string) {
      if (conn && conn.companyId === companyId) conn = null;
      return { error: null };
    },
  };
  return { store: memStore as any, getConn: () => conn };
}

function makeFetchStub(respond: (url: string, init: any) => { status: number; body: any }) {
  const calls: Array<{ url: string; method: string; body?: any }> = [];
  const fetchImpl = (async (url: any, init?: any) => {
    const call = { url: String(url), method: String(init?.method ?? 'GET'), body: init?.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : undefined };
    calls.push(call);
    const r = respond(call.url, init);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as any;
  }) as any;
  return { calls, fetchImpl };
}

test('handleCallback: state inválido retorna erro', async () => {
  const { store } = makeStore();
  const service = createGoogleCalendarService({
    store,
    getClientConfig: () => ({ clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost:3000/api/google-calendar/callback' }),
    getCalendarId: () => CAL_ID,
    getTimeZone: () => 'America/Sao_Paulo',
  });
  const result = await service.handleCallback({ code: 'code', state: 'bad.state', expectedCompanyId: COMPANY });
  assert.equal(result.ok, false);
});

test('getAuthUrl retorna URL do Google com escopos', () => {
  const { store } = makeStore();
  const service = createGoogleCalendarService({
    store,
    getClientConfig: () => ({ clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost:3000/api/google-calendar/callback' }),
    getCalendarId: () => CAL_ID,
    getTimeZone: () => 'America/Sao_Paulo',
  });
  const url = service.getAuthUrl(COMPANY, USER);
  assert.ok(url);
  assert.ok(url!.includes('accounts.google.com'));
  assert.ok(url!.includes('calendar.events'));
  assert.ok(url!.includes('calendar.readonly'));
});

test('getStatus desconectado quando não há conexão', async () => {
  const { store } = makeStore();
  const service = createGoogleCalendarService({
    store,
    getClientConfig: () => ({ clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost:3000/api/google-calendar/callback' }),
    getCalendarId: () => CAL_ID,
    getTimeZone: () => 'America/Sao_Paulo',
  });
  const status = await service.getStatus(COMPANY);
  assert.equal(status.connected, false);
  assert.equal(status.calendarId, null);
});

test('createEvent: conflito de horário é rejeitado', async () => {
  const { store, getConn } = makeStore();
  // seed connection
  await store.upsert({
    companyId: COMPANY,
    userId: USER,
    encryptedAccessToken: encryptToken('access'),
    encryptedRefreshToken: encryptToken('refresh'),
    tokenExpiry: new Date(Date.now() + 3600_000).toISOString(),
    calendarId: CAL_ID,
    scopes: 'calendar.events',
    status: 'connected',
  });

  const { calls, fetchImpl } = makeFetchStub((url) => {
    if (url.includes('/freeBusy')) {
      return { status: 200, body: { calendars: { [CAL_ID]: { busy: [{ start: '2026-11-10T10:00:00.000Z', end: '2026-11-10T11:00:00.000Z' }] } } } };
    }
    return { status: 200, body: {} };
  });

  // monkeypatch fetch globally
  const origFetch = global.fetch;
  global.fetch = fetchImpl as any;

  const service = createGoogleCalendarService({
    store,
    getClientConfig: () => ({ clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost:3000/api/google-calendar/callback' }),
    getCalendarId: () => CAL_ID,
    getTimeZone: () => 'America/Sao_Paulo',
  });

  const result = await service.createEvent(COMPANY, {
    summary: 'Reunião',
    start: '2026-11-10T10:00:00.000Z',
    end: '2026-11-10T11:00:00.000Z',
  });
  global.fetch = origFetch;

  assert.equal(result.ok, false);
  assert.ok(result.message.includes('disponível'));
});

test('createEvent: sucesso cria evento', async () => {
  const { store } = makeStore();
  await store.upsert({
    companyId: COMPANY,
    userId: USER,
    encryptedAccessToken: encryptToken('access'),
    encryptedRefreshToken: encryptToken('refresh'),
    tokenExpiry: new Date(Date.now() + 3600_000).toISOString(),
    calendarId: CAL_ID,
    scopes: 'calendar.events',
    status: 'connected',
  });

  const { fetchImpl } = makeFetchStub((url) => {
    if (url.includes('/freeBusy')) {
      return { status: 200, body: { calendars: { [CAL_ID]: { busy: [] } } } };
    }
    if (url.includes('/events')) {
      return { status: 200, body: { id: 'evt-1', summary: 'Reunião', htmlLink: 'https://cal/evt-1' } };
    }
    return { status: 200, body: {} };
  });

  const origFetch = global.fetch;
  global.fetch = fetchImpl as any;

  const service = createGoogleCalendarService({
    store,
    getClientConfig: () => ({ clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost:3000/api/google-calendar/callback' }),
    getCalendarId: () => CAL_ID,
    getTimeZone: () => 'America/Sao_Paulo',
  });

  const result = await service.createEvent(COMPANY, {
    summary: 'Reunião',
    start: '2026-11-10T14:00:00.000Z',
    end: '2026-11-10T15:00:00.000Z',
  });
  global.fetch = origFetch;

  assert.equal(result.ok, true);
  assert.equal((result as any).event?.id, 'evt-1');
});

test('cancelEvent: sucesso', async () => {
  const { store } = makeStore();
  await store.upsert({
    companyId: COMPANY,
    userId: USER,
    encryptedAccessToken: encryptToken('access'),
    encryptedRefreshToken: encryptToken('refresh'),
    tokenExpiry: new Date(Date.now() + 3600_000).toISOString(),
    calendarId: CAL_ID,
    scopes: 'calendar.events',
    status: 'connected',
  });

  const { fetchImpl } = makeFetchStub((url) => {
    return { status: 204, body: {} };
  });

  const origFetch = global.fetch;
  global.fetch = fetchImpl as any;

  const service = createGoogleCalendarService({
    store,
    getClientConfig: () => ({ clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost:3000/api/google-calendar/callback' }),
    getCalendarId: () => CAL_ID,
    getTimeZone: () => 'America/Sao_Paulo',
  });

  const result = await service.cancelEvent(COMPANY, 'evt-1');
  global.fetch = origFetch;

  assert.equal(result.ok, true);
});
