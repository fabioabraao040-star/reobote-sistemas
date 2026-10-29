import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONVERSATION_VISUAL_STATUS_META,
  resolveConversationVisualStatus,
  resolveEffectiveConversationOpenedAt,
  resolveEffectiveConversationRepliedAt,
} from '../src/utils/conversationStatus.js';

const CUSTOMER_AT = '2026-10-27T13:00:00.000Z';
const OPENED_AFTER_CUSTOMER = '2026-10-27T13:02:00.000Z';
const OPENED_BEFORE_CUSTOMER = '2026-10-27T12:58:00.000Z';
const AGENT_AFTER_CUSTOMER = '2026-10-27T13:05:00.000Z';

test('vermelho: mensagem do cliente ainda não aberta', () => {
  assert.equal(
    resolveConversationVisualStatus({
      unreadCount: 1,
      lastCustomerAt: CUSTOMER_AT,
      openedAt: OPENED_BEFORE_CUSTOMER,
    }),
    'unread'
  );
});

test('vermelho: abertura anterior à mensagem mais recente do cliente', () => {
  assert.equal(
    resolveConversationVisualStatus({
      unreadCount: 0,
      lastCustomerAt: CUSTOMER_AT,
      openedAt: OPENED_BEFORE_CUSTOMER,
    }),
    'unread'
  );
});

test('amarelo: atendente abriu depois da mensagem e ainda não respondeu', () => {
  assert.equal(
    resolveConversationVisualStatus({
      unreadCount: 0,
      lastCustomerAt: CUSTOMER_AT,
      openedAt: OPENED_AFTER_CUSTOMER,
      lastAgentAt: null,
    }),
    'awaiting_reply'
  );
});

test('verde: atendente abriu e respondeu depois da mensagem do cliente', () => {
  assert.equal(
    resolveConversationVisualStatus({
      unreadCount: 0,
      lastCustomerAt: CUSTOMER_AT,
      openedAt: OPENED_AFTER_CUSTOMER,
      lastAgentAt: AGENT_AFTER_CUSTOMER,
    }),
    'replied'
  );
});

test('verde: conversa histórica respondida antes da coluna opened_at', () => {
  assert.equal(
    resolveConversationVisualStatus({
      unreadCount: 0,
      lastCustomerAt: CUSTOMER_AT,
      openedAt: null,
      lastAgentAt: AGENT_AFTER_CUSTOMER,
    }),
    'replied'
  );
});

test('abertura exibida somente quando pertence ao ciclo atual', () => {
  assert.equal(resolveEffectiveConversationOpenedAt(OPENED_BEFORE_CUSTOMER, CUSTOMER_AT), null);
  assert.equal(resolveEffectiveConversationOpenedAt(OPENED_AFTER_CUSTOMER, CUSTOMER_AT), OPENED_AFTER_CUSTOMER);
  assert.equal(resolveEffectiveConversationOpenedAt(null, CUSTOMER_AT), null);
});

test('resposta exibida somente quando responde à mensagem atual', () => {
  assert.equal(resolveEffectiveConversationRepliedAt(OPENED_BEFORE_CUSTOMER, CUSTOMER_AT), null);
  assert.equal(resolveEffectiveConversationRepliedAt(CUSTOMER_AT, CUSTOMER_AT), null);
  assert.equal(resolveEffectiveConversationRepliedAt(AGENT_AFTER_CUSTOMER, CUSTOMER_AT), AGENT_AFTER_CUSTOMER);
  assert.equal(resolveEffectiveConversationRepliedAt(null, CUSTOMER_AT), null);
});

test('as três cores estão definidas para os três estados', () => {
  assert.deepEqual(Object.keys(CONVERSATION_VISUAL_STATUS_META).sort(), [
    'awaiting_reply',
    'replied',
    'unread',
  ]);
  assert.equal(CONVERSATION_VISUAL_STATUS_META.unread.color, '#FFA8A8');
  assert.equal(CONVERSATION_VISUAL_STATUS_META.awaiting_reply.color, '#F5C26B');
  assert.equal(CONVERSATION_VISUAL_STATUS_META.replied.color, '#8FE3AC');
});
