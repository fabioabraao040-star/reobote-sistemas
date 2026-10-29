import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntegrationTestEvent, sendIntegrationTestEvent } from '../integration.js';

const SECRET = 's'.repeat(64);
const BASE_URL = 'https://reobote-suporte.vercel.app';

function response(
  status: number,
  body: unknown,
  ok = status >= 200 && status < 300
): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    text: async () => text
  } as unknown as Response;
}

test('evento de integração tem estrutura obrigatória', () => {
  const evt = createIntegrationTestEvent();
  assert.equal(evt.event.type, 'integration.test');
  assert.equal(evt.event.source, 'reobote-sistemas');
  assert.match(evt.event.id, /^TEST-[A-Z0-9]{12}$/);
  assert.equal(typeof evt.event.timestamp, 'string');
  assert.ok(Number.isFinite(Date.parse(evt.event.timestamp)));
});

test('emissor falha sem configuração', async () => {
  const res = await sendIntegrationTestEvent('', '');
  assert.equal(res.ok, false);
  assert.equal(res.status, null);
  assert.equal(res.received, false);
  assert.equal(res.telegramSent, false);
});

test('emissor recusa segredo curto', async () => {
  const res = await sendIntegrationTestEvent(BASE_URL, 'curto');
  assert.equal(res.ok, false);
  assert.equal(res.status, null);
  assert.match(res.error || '', /segredo/i);
});

test('emissor rejeita HTTP não seguro', async () => {
  const res = await sendIntegrationTestEvent('http://exemplo.com', SECRET);
  assert.equal(res.ok, false);
  assert.equal(res.status, null);
  assert.match(res.error || '', /HTTPS/i);
});

test('emissor rejeita credenciais na URL', async () => {
  const res = await sendIntegrationTestEvent('https://user:pass@exemplo.com', SECRET);
  assert.equal(res.ok, false);
  assert.equal(res.status, null);
});

test('emissor rejeita host privado', async () => {
  const res = await sendIntegrationTestEvent('https://127.0.0.1', SECRET);
  assert.equal(res.ok, false);
  assert.equal(res.status, null);
});

test('emissor usa redirect error e não expõe o segredo no erro', async () => {
  let captured: RequestInit | undefined;

  const res = await sendIntegrationTestEvent(BASE_URL, SECRET, 1000, (async (
    _input: string | URL | Request,
    init?: RequestInit
  ) => {
    captured = init;
    return response(401, { error: `segredo ${SECRET} recusado` }, false);
  }) as typeof fetch);

  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  assert.equal(captured?.redirect, 'error');
  assert.ok(captured?.signal);
  assert.ok(!(res.error || '').includes(SECRET));
});

test('emissor confirma sucesso somente com recebimento, registro e Telegram', async () => {
  const res = await sendIntegrationTestEvent(BASE_URL, SECRET, 1000, (async (
    _input: string | URL | Request,
    init?: RequestInit
  ) => {
    const payload = JSON.parse(String(init?.body)) as { event: { id: string } };
    return response(202, {
      received: true,
      recorded: true,
      eventId: payload.event.id,
      testId: 'INTEG-TEST-12345678',
      telegram: { configured: true, requested: true, sent: true, status: 200 }
    });
  }) as typeof fetch);

  assert.equal(res.ok, true);
  assert.equal(res.status, 202);
  assert.equal(res.received, true);
  assert.equal(res.recorded, true);
  assert.equal(res.telegramSent, true);
  assert.equal(res.telegramStatus, 200);
  assert.equal(res.testId, 'INTEG-TEST-12345678');
});

test('emissor não aceita resposta de outro evento', async () => {
  const res = await sendIntegrationTestEvent(BASE_URL, SECRET, 1000, (async () =>
    response(202, {
      received: true,
      recorded: true,
      eventId: 'TEST-OUTRO0001',
      testId: 'INTEG-TEST-12345678',
      telegram: { sent: true, status: 200 }
    })) as typeof fetch);

  assert.equal(res.ok, false);
  assert.match(res.error || '', /não corresponde/i);
});

test('emissor não aceita 202 sem confirmação completa', async () => {
  const res = await sendIntegrationTestEvent(BASE_URL, SECRET, 1000, (async () =>
    response(202, {
      received: true,
      recorded: false,
      telegram: { sent: false, status: null }
    })) as typeof fetch);

  assert.equal(res.ok, false);
  assert.equal(res.status, 202);
  assert.equal(res.received, true);
  assert.equal(res.recorded, false);
  assert.equal(res.telegramSent, false);
});

test('emissor trata falha do Telegram sem falso positivo', async () => {
  const res = await sendIntegrationTestEvent(BASE_URL, SECRET, 1000, (async () =>
    response(502, {
      received: true,
      recorded: true,
      telegram: { sent: false, status: 500 }
    }, false)) as typeof fetch);

  assert.equal(res.ok, false);
  assert.equal(res.status, 502);
  assert.equal(res.received, true);
  assert.equal(res.telegramSent, false);
  assert.match(res.error || '', /Telegram/i);
});

test('emissor aceita repetição idempotente já processada', async () => {
  const res = await sendIntegrationTestEvent(BASE_URL, SECRET, 1000, (async (
    _input: string | URL | Request,
    init?: RequestInit
  ) => {
    const payload = JSON.parse(String(init?.body)) as { event: { id: string } };
    return response(409, {
      received: true,
      duplicate: true,
      recorded: true,
      eventId: payload.event.id,
      testId: 'INTEG-TEST-12345678',
      telegram: { sent: true, status: 200 }
    }, false);
  }) as typeof fetch);

  assert.equal(res.ok, true);
  assert.equal(res.duplicate, true);
  assert.equal(res.telegramSent, true);
});

test('emissor não aceita duplicidade em processamento como sucesso', async () => {
  const res = await sendIntegrationTestEvent(BASE_URL, SECRET, 1000, (async () =>
    response(409, {
      received: true,
      duplicate: true,
      inProgress: true,
      recorded: false,
      telegram: { sent: false, status: null }
    }, false)) as typeof fetch);

  assert.equal(res.ok, false);
  assert.equal(res.duplicate, true);
  assert.equal(res.telegramSent, false);
});

test('emissor trata timeout', async () => {
  const res = await sendIntegrationTestEvent(BASE_URL, SECRET, 1000, (async () => {
    const error = new Error('timeout');
    error.name = 'TimeoutError';
    throw error;
  }) as typeof fetch);

  assert.equal(res.ok, false);
  assert.equal(res.status, null);
  assert.match(res.error || '', /Tempo esgotado/i);
});

test('emissor rejeita resposta grande ou inválida', async () => {
  const huge = await sendIntegrationTestEvent(BASE_URL, SECRET, 1000, (async () =>
    response(202, 'x'.repeat(5000))) as typeof fetch);
  assert.equal(huge.ok, false);

  const invalid = await sendIntegrationTestEvent(BASE_URL, SECRET, 1000, (async () =>
    response(202, 'não é json')) as typeof fetch);
  assert.equal(invalid.ok, false);
});
