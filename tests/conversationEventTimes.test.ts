import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationEventTimes } from '../src/components/ConversationEventTimes.js';

test('exibe os três horários reais do ciclo de atendimento', () => {
  const receivedAt = new Date(2026, 9, 27, 13, 0).toISOString();
  const openedAt = new Date(2026, 9, 27, 13, 2).toISOString();
  const repliedAt = new Date(2026, 9, 27, 13, 5).toISOString();

  const html = renderToStaticMarkup(
    createElement(ConversationEventTimes, { receivedAt, openedAt, repliedAt })
  );

  assert.match(html, /Recebida:/);
  assert.match(html, /Aberta:/);
  assert.match(html, /Respondida:/);
  assert.ok(html.includes('27/10, 13:00'));
  assert.ok(html.includes('27/10, 13:02'));
  assert.ok(html.includes('27/10, 13:05'));
});

test('não inventa horário quando o evento ainda não ocorreu', () => {
  const html = renderToStaticMarkup(
    createElement(ConversationEventTimes, { receivedAt: null, openedAt: null, repliedAt: null })
  );

  assert.equal((html.match(/—/g) || []).length, 3);
});
