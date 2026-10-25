// Regras visuais do atendimento:
// - unread: existe mensagem do cliente ainda não aberta (unread_count > 0)
// - awaiting_reply: a conversa foi aberta, mas ainda não houve resposta do atendente
//   depois da última mensagem do cliente
// - replied: o atendente enviou ao menos uma mensagem depois da última mensagem do cliente
//
// Somente mensagens de clientes e de atendentes entram no cálculo. Notas internas
// e mensagens automáticas do sistema não contam como resposta.

export type ConversationVisualStatus = 'unread' | 'awaiting_reply' | 'replied';

export interface ConversationStatusMessage {
  conversationId: string;
  senderType: 'customer' | 'agent' | 'system' | 'internal_note';
  createdAt: string | Date;
  // Mensagens do atendente com status 'failed' não chegaram ao cliente
  // e por isso não contam como resposta.
  status?: string | null;
}

export interface ConversationStatusMeta {
  color: string;
  label: string;
  shortLabel: string;
}

export const CONVERSATION_VISUAL_STATUS_META: Record<ConversationVisualStatus, ConversationStatusMeta> = {
  unread: {
    color: '#FFA8A8',
    label: 'Não lida',
    shortLabel: 'Não lida',
  },
  awaiting_reply: {
    color: '#F5C26B',
    label: 'Aberta, sem resposta',
    shortLabel: 'Sem resposta',
  },
  replied: {
    color: '#8FE3AC',
    label: 'Respondida',
    shortLabel: 'Respondida',
  },
};

function toTime(value?: string | Date | number | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Resolve o estado visual de uma conversa a partir dos dados persistidos.
 * O unread_count tem prioridade porque representa mensagens ainda não abertas.
 */
export function resolveConversationVisualStatus(params: {
  unreadCount?: number | null;
  lastCustomerAt?: string | Date | number | null;
  lastAgentAt?: string | Date | number | null;
}): ConversationVisualStatus {
  if ((params.unreadCount ?? 0) > 0) {
    return 'unread';
  }

  const lastCustomerAt = toTime(params.lastCustomerAt);
  const lastAgentAt = toTime(params.lastAgentAt);

  // Só é "respondida" se uma resposta do atendente vier depois de uma
  // mensagem do cliente (conversa iniciada pelo atendente fica amarela).
  if (lastCustomerAt !== null && lastAgentAt !== null && lastAgentAt > lastCustomerAt) {
    return 'replied';
  }

  return 'awaiting_reply';
}

/**
 * Calcula o estado visual de várias conversas de uma só vez.
 * Recebe apenas mensagens persistidas do banco, sem depender de estado local da tela.
 */
export function computeConversationVisualStatusMap(
  conversationIds: string[],
  messages: ConversationStatusMessage[],
  unreadCounts: Record<string, number> = {}
): Record<string, ConversationVisualStatus> {
  const lastCustomer = new Map<string, number>();
  const lastAgent = new Map<string, number>();

  for (const message of messages) {
    if (message.senderType !== 'customer' && message.senderType !== 'agent') {
      continue;
    }

    // Envio que falhou na Meta não é resposta válida ao cliente.
    if (message.senderType === 'agent' && message.status === 'failed') {
      continue;
    }

    const timestamp = toTime(message.createdAt);
    if (timestamp === null) {
      continue;
    }

    const target = message.senderType === 'customer' ? lastCustomer : lastAgent;
    const previous = target.get(message.conversationId);
    if (previous === undefined || timestamp > previous) {
      target.set(message.conversationId, timestamp);
    }
  }

  const result: Record<string, ConversationVisualStatus> = {};

  for (const conversationId of conversationIds) {
    result[conversationId] = resolveConversationVisualStatus({
      unreadCount: unreadCounts[conversationId] ?? 0,
      lastCustomerAt: lastCustomer.get(conversationId) ?? null,
      lastAgentAt: lastAgent.get(conversationId) ?? null,
    });
  }

  return result;
}

export function normalizeConversationVisualStatus(
  status?: string | null,
  unreadCount = 0
): ConversationVisualStatus {
  if (status === 'unread' || status === 'awaiting_reply' || status === 'replied') {
    return status;
  }

  return unreadCount > 0 ? 'unread' : 'awaiting_reply';
}
