import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';

import { createAuthMiddleware } from '../src/server/authMiddleware.js';
import { createGoogleCalendarRouter } from '../src/server/googleCalendarRoutes.js';
import { createGoogleCalendarService } from '../src/server/googleCalendarService.js';
import { verifyState } from '../src/server/googleCalendarCrypto.js';

process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.GOOGLE_CLIENT_ID = 'client-id';
process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/google-calendar/callback';

const COMPANY = '11111111-1111-1111-1111-111111111111';

const PROFILES = {
  'admin-token': { id: 'admin-id', company_id: COMPANY, name: 'Admin', email: 'a@t.invalid', role: 'admin', status: 'online' },
  'admin-nocompany-token': { id: 'admin-nc-id', company_id: null, name: 'Admin NC', email: 'anc@t.invalid', role: 'admin', status: 'online' },
  'user-token': { id: 'user-id', company_id: COMPANY, name: 'User', email: 'u@t.invalid', role: 'user', status: 'online' },
} as const;

const supabaseAuth = { auth: { async getUser(token: string) { const p = (PROFILES as any)[token]; return p ? { data: { user: { id: p.id } }, error: null } : { data: { user: null }, error: new Error('invalid') }; } } };
const supabase = {
  from(table: string) {
    return { select() { return { eq(_c: string, id: string) { return { async single() { if (table !== 'users') return { data: null, error: new Error('na') }; const f = Object.values(PROFILES).find((x: any) => x.id === id); return f ? { data: f, error: null } : { data: null, error: new Error('nf') }; } }; } }; } };
  },
};

function makeApp(options: { configured?: boolean } = {}) {
  const configured = options.configured !== false;

  // Store in-memory para isolar a rota do Supabase real.
  let conn: any = null;
  const memStore = {
    async getByCompany(companyId: string) { return { data: conn && conn.companyId === companyId ? conn : null, error: null }; },
    async upsert(c: any) { conn = { id: 'c1', companyId: c.companyId, userId: c.userId, encryptedAccessToken: c.encryptedAccessToken, encryptedRefreshToken: c.encryptedRefreshToken, tokenExpiry: c.tokenExpiry, calendarId: c.calendarId, scopes: c.scopes, status: c.status, updatedAt: new Date().toISOString() }; return { data: conn, error: null }; },
    async updateTokens() { return { error: null }; },
    async deleteByCompany(companyId: string) { if (conn && conn.companyId === companyId) conn = null; return { error: null }; },
  };

  const service = createGoogleCalendarService({
    store: memStore as any,
    getClientConfig: () => (configured
      ? { clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost:3000/api/google-calendar/callback' }
      : null),
    getCalendarId: () => 'cal-id@group.calendar.google.com',
    getTimeZone: () => 'America/Sao_Paulo',
  });

  const app = express();
  app.use(express.json());
  const auth = createAuthMiddleware({ getSupabase: () => supabase as any, getSupabaseAuth: () => supabaseAuth as any, masterAdminAllowedPaths: new Set() });
  app.use('/api/google-calendar', auth, createGoogleCalendarRouter({ service, verifyStateFn: verifyState, getAppUrl: () => 'http://localhost:3000' }));

  return { app, service };
}

async function withServer(app: express.Express, cb: (url: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address() as AddressInfo;
  try { await cb(`http://127.0.0.1:${addr.port}`); }
  finally { await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))); }
}

async function request(url: string, path: string, opts: any = {}) {
  const headers: any = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${url}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: opts.redirect || 'follow',
  });
}

test('sem auth retorna 401; atendente 403', async () => {
  await withServer(makeApp().app, async (url) => {
    const unauth = await request(url, '/api/google-calendar/status');
    assert.equal(unauth.status, 401);
    const user = await request(url, '/api/google-calendar/status', { token: 'user-token' });
    assert.equal(user.status, 403);
  });
});

test('POST /connect sem autenticação retorna 401', async () => {
  await withServer(makeApp().app, async (url) => {
    const res = await request(url, '/api/google-calendar/connect', { method: 'POST', body: {} });
    assert.equal(res.status, 401);
  });
});

test('POST /connect com atendente (não ADM) retorna 403', async () => {
  await withServer(makeApp().app, async (url) => {
    const res = await request(url, '/api/google-calendar/connect', { token: 'user-token', method: 'POST', body: {} });
    assert.equal(res.status, 403);
  });
});

test('POST /connect com ADM retorna 200 e URL OAuth gerada pelo serviço', async () => {
  await withServer(makeApp().app, async (url) => {
    const res = await request(url, '/api/google-calendar/connect', { token: 'admin-token', method: 'POST', body: {} });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(typeof data.url, 'string');

    const authUrl = new URL(data.url);
    assert.equal(authUrl.protocol, 'https:');
    assert.equal(authUrl.hostname, 'accounts.google.com');
    assert.equal(authUrl.searchParams.get('client_id'), 'client-id');
    assert.equal(authUrl.searchParams.get('redirect_uri'), 'http://localhost:3000/api/google-calendar/callback');
    assert.equal(authUrl.searchParams.get('response_type'), 'code');
    assert.equal(authUrl.searchParams.get('access_type'), 'offline');
    assert.ok(authUrl.searchParams.get('scope')?.includes('calendar.events'));
    assert.ok(authUrl.searchParams.get('scope')?.includes('calendar.readonly'));

    // O state foi assinado pelo serviço existente e vinculado à empresa/usuário.
    const state = authUrl.searchParams.get('state') || '';
    const verified = verifyState(state, COMPANY);
    assert.ok(verified);
    assert.equal(verified?.userId, 'admin-id');
  });
});

test('POST /connect sem empresa vinculada retorna 400', async () => {
  await withServer(makeApp().app, async (url) => {
    const res = await request(url, '/api/google-calendar/connect', { token: 'admin-nocompany-token', method: 'POST', body: {} });
    assert.equal(res.status, 400);
  });
});

test('POST /connect sem configuração do Google retorna 503', async () => {
  await withServer(makeApp({ configured: false }).app, async (url) => {
    const res = await request(url, '/api/google-calendar/connect', { token: 'admin-token', method: 'POST', body: {} });
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.error, 'Google Calendar não configurado no servidor.');
  });
});

test('GET /connect antiga não existe mais (sem rota desprotegida)', async () => {
  await withServer(makeApp().app, async (url) => {
    const res = await request(url, '/api/google-calendar/connect', { token: 'admin-token', redirect: 'manual' });
    assert.equal(res.status, 404);
  });
});

test('ADM consulta status desconectado', async () => {
  await withServer(makeApp().app, async (url) => {
    const res = await request(url, '/api/google-calendar/status', { token: 'admin-token' });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.connected, false);
  });
});

test('disconnect pelo ADM retorna ok', async () => {
  await withServer(makeApp().app, async (url) => {
    const res = await request(url, '/api/google-calendar/disconnect', { token: 'admin-token', method: 'POST', body: {} });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
  });
});

test('callback OAuth continua validando state inválido sem chamar o Google', async () => {
  await withServer(makeApp().app, async (url) => {
    const res = await request(url, '/api/google-calendar/callback?code=fake&state=invalid.state', {
      token: 'admin-token',
      redirect: 'manual',
    });
    assert.equal(res.status, 302);
    const location = res.headers.get('location') || '';
    assert.ok(location.includes('/integracao-google-calendar'));
    assert.ok(location.includes('status=error'));
    assert.ok(location.includes('reason=invalid_state'));
  });
});
