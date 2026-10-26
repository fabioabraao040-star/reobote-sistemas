import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import {
  buildMonitoringPayload,
  monitoringSecretIsConfigured,
  safeSecretMatch,
} from '../monitoring.js';

const TEST_SECRET = 'a'.repeat(64);

const baseInput = {
  uptimeSeconds: 123.7,
  supabase: { ok: true, latencyMs: 12.4 },
  whatsapp: { status: 'connected' as const, lastCheck: '2026-10-26T12:00:00.000Z' },
  now: new Date('2026-10-26T13:00:00.000Z'),
};

test('payload operacional contém apenas indicadores permitidos', () => {
  const payload = buildMonitoringPayload(baseInput);
  const serialized = JSON.stringify(payload);

  assert.equal(payload.service, 'REOBOTE SISTEMAS');
  assert.equal(payload.status, 'operational');
  assert.equal(payload.checkedAt, '2026-10-26T13:00:00.000Z');
  assert.deepEqual(Object.keys(payload.checks).sort(), [
    'api',
    'application',
    'monitoringEndpoint',
    'supabase',
    'whatsapp',
  ]);

  for (const forbidden of [
    'phone',
    'token',
    'access_token',
    'message',
    'contact',
    'conversation',
    'password',
    'service_role',
  ]) {
    assert.equal(serialized.toLowerCase().includes(forbidden), false, forbidden);
  }

  assert.equal(serialized.includes(TEST_SECRET), false);
});

test('WhatsApp não conectado/indisponível deixa o sistema degradado', () => {
  const configured = buildMonitoringPayload({
    ...baseInput,
    whatsapp: { status: 'configured', lastCheck: null },
  });
  assert.equal(configured.status, 'degraded');
  assert.equal(configured.checks.whatsapp.status, 'configured');

  const unavailable = buildMonitoringPayload({
    ...baseInput,
    whatsapp: { status: 'unavailable', lastCheck: null },
  });
  assert.equal(unavailable.status, 'degraded');
  assert.equal(unavailable.checks.whatsapp.status, 'unavailable');
});

test('WhatsApp não configurado não derruba o status geral', () => {
  const payload = buildMonitoringPayload({
    ...baseInput,
    whatsapp: { status: 'not_configured', lastCheck: null },
  });
  assert.equal(payload.status, 'operational');
  assert.equal(payload.checks.whatsapp.status, 'not_configured');
});

test('Supabase indisponível deixa o sistema degradado sem expor erro', () => {
  const payload = buildMonitoringPayload({
    ...baseInput,
    supabase: { ok: false, latencyMs: null },
  });
  assert.equal(payload.status, 'degraded');
  assert.equal(payload.checks.supabase.status, 'unavailable');
  assert.equal(payload.checks.supabase.latencyMs, null);
});

test('validação do segredo exige tamanho mínimo e comparação correta', () => {
  assert.equal(monitoringSecretIsConfigured(undefined), false);
  assert.equal(monitoringSecretIsConfigured('curto'), false);
  assert.equal(monitoringSecretIsConfigured(TEST_SECRET), true);
  assert.equal(safeSecretMatch(TEST_SECRET, TEST_SECRET), true);
  assert.equal(safeSecretMatch('b'.repeat(64), TEST_SECRET), false);
  assert.equal(safeSecretMatch('', TEST_SECRET), false);
});

test('endpoint rejeita requisição sem credencial e com credencial inválida', async () => {
  process.env.REOBOTE_MONITORING_SECRET = TEST_SECRET;

  // Import dinâmico depois de definir o segredo para o teste.
  const { default: app } = await import('../server.js');
  const server = app.listen(0);
  await once(server, 'listening');

  try {
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/api/monitoring/status`;

    const withoutSecret = await fetch(url);
    assert.equal(withoutSecret.status, 401);
    const withoutSecretBody = await withoutSecret.text();
    assert.equal(withoutSecretBody.includes(TEST_SECRET), false);

    const wrongSecret = await fetch(url, {
      headers: { 'x-monitoring-secret': 'b'.repeat(64) },
    });
    assert.equal(wrongSecret.status, 401);
    const wrongSecretBody = await wrongSecret.text();
    assert.equal(wrongSecretBody.includes(TEST_SECRET), false);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
