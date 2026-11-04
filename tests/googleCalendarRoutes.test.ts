import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';

import { createAuthMiddleware } from '../src/server/authMiddleware.js';
import { createGoogleCalendarRouter } from '../src/server/googleCalendarRoutes.js';
import { createGoogleCalendarService } from '../src/server/googleCalendarService.js';
import { createGoogleCalendarStore } from '../src/server/googleCalendarStore.js';
import { verifyState } from '../src/server/googleCalendarCrypto.js';

process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.GOOGLE_CLIENT_ID = 'client-id';
process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/google-calendar/callback';

const COMPANY = '11111111-1111-1111-1111-111111111111';

const PROFILES = {
  'admin-token': { id: 'admin-id', company_id: COMPANY, name: 'Admin', email: 'a@t.invalid', role: 'admin', status: 'online' },
  'user-token': { id: 'user-id', company_id: COMPANY, name: 'User', email: 'u@t.invalid', role: 'user', status: 'online' },
} as const;

const supabaseAuth = { auth: { async getUser(token: string) { const p = (PROFILES as any)[token]; return p ? { data: { user: { id: p.id } }, error: null } : { data: { user: null }, error: new Error('invalid') }; } } };
const supabase = {
  from(table: string) {
    return { select() { return { eq(_c: string, id: string) { return { async single() { if (table !== 'users') return { data: null, error: new Error('na') }; const f = Object.values(PROFILES).find((x: any) => x.id === id); return f ? { data: f, error: null } : { data: null, error: new Error('nf') }; } }; } }; } };
  },
};

function makeApp() {
  const store = createGoogleCalendarStore(() => null as any);
  // in-memory override
  let conn: any = null;
  const memStore = {
    async getByCompany(companyId: string) { return { data: conn && conn.companyId === companyId ? conn : null, error: null }; },
    async upsert(c: any) { conn = { id: 'c1', companyId: c.companyId, userId: c.userId, encryptedAccessToken: c.encryptedAccessToken, encryptedRefreshToken: c.encryptedRefreshToken, tokenExpiry: c.tokenExpiry, calendarId: c.calendarId, scopes: c.scopes, status: c.status, updatedAt: new Date().toISOString() }; return { data: conn, error: null }; },
    async updateTokens() { return { error: null }; },
    async deleteByCompany(companyId: string) { if (conn && conn.companyId === companyId) conn = null; return { error: null }; },
  };
  const service = createGoogleCalendarService({
    store: memStore as any,
    getClientConfig: () => ({ clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost:3000/api/google-calendar/callback' }),
    getCalendarId: () => 'cal-id@group.calendar.google.com',
    getTimeZone: () => 'America/Sao_Paulo',
  });
  const app = express();
  app.use(express.json());
  const auth = createAuthMiddleware({ getSupabase: () => supabase as any, getSupabaseAuth: () => supabaseAuth as any, masterAdminAllowedPaths: new Set() });
  app.use('/api/google-calendar', auth, createGoogleCalendarRouter({ service, verifyStateFn: verifyState, getAppUrl: () => 'http://localhost:3000' }));
  return app;
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
  return fetch(`${url}${path}`, { method: opts.method || 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

test('sem auth retorna 401; atendente 403', async () => {
  await withServer(makeApp(), async (url) => {
    const unauth = await request(url, '/api/google-calendar/status');
    assert.equal(unauth.status, 401);
    const user = await request(url, '/api/google-calendar/status', { token: 'user-token' });
    assert.equal(user.status, 403);
  });
});

test('ADM consulta status desconectado', async () => {
  await withServer(makeApp(), async (url) => {
    const res = await request(url, '/api/google-calendar/status', { token: 'admin-token' });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.connected, false);
  });
});

test('disconnect pelo ADM retorna ok', async () => {
  await withServer(makeApp(), async (url) => {
    const res = await request(url, '/api/google-calendar/disconnect', { token: 'admin-token', method: 'POST', body: {} });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
  });
});
