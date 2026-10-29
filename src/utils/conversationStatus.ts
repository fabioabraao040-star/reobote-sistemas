// Regras visuais do atendimento:
// - unread (vermelho): existe mensagem do cliente ainda não aberta no REOBOTE
// - awaiting_reply (amarelo): a conversa foi aberta, mas ainda não houve resposta
//   do atendente depois da última mensagem do cliente
// - replied (verde): o atendente abriu a conversa e enviou ao menos uma mensagem
//   depois da última mensagem do cliente
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
    label: 'Não aberta',
    shortLabel: 'Não aberta',
  },
  awaiting_reply: {
    color: '#F5C26B',
    label: 'Aberta, sem resposta',
    shortLabel: 'Sem resposta',
  },
  replied: {
    color: '#8FE3AC',
    label: 'Aberta e respondida',
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
 * Quando a coluna opened_at já existe, uma abertura anterior à última mensagem
 * do cliente também caracteriza o estado vermelho, mesmo que unread_count tenha
 * sido zerado por outro fluxo.
 */
export function resolveConversationVisualStatus(params: {
  unreadCount?: number | null;
  lastCustomerAt?: string | Date | number | null;
  lastAgentAt?: string | Date | number | null;
  openedAt?: string | Date | number | null;
}): ConversationVisualStatus {
  if ((params.unreadCount ?? 0) > 0) {
    return 'unread';
  }

  const lastCustomerAt = toTime(params.lastCustomerAt);
  const lastAgentAt = toTime(params.lastAgentAt);
  const openedAt = toTime(params.openedAt);

  if (lastCustomerAt !== null && openedAt !== null && openedAt < lastCustomerAt) {
    return 'unread';
  }

  // Só é "respondida" se uma resposta do atendente vier depois de uma
  // mensagem do cliente (conversa iniciada pelo atendente fica amarela).
  if (lastCustomerAt !== null && lastAgentAt !== null && lastAgentAt > lastCustomerAt) {
    return 'replied';
  }

  return 'awaiting_reply';
}

/**
 * Devolve a abertura válida para o ciclo atual da conversa.
 * Se a última abertura foi antes da mensagem mais recente do cliente, o
 * atendente ainda não abriu essa mensagem e o horário não deve ser exibido.
 */
export function resolveEffectiveConversationOpenedAt(
  openedAt?: string | Date | number | null,
  lastCustomerAt?: string | Date | number | null
): string | null {
  const openedTime = toTime(openedAt);
  if (openedTime === null) return null;

  const customerTime = toTime(lastCustomerAt);
  if (customerTime !== null && openedTime < customerTime) return null;

  return new Date(openedTime).toISOString();
}

/**
 * Devolve a resposta válida para o ciclo atual. Uma resposta anterior à última
 * mensagem do cliente não responde a essa mensagem e não deve ser exibida como
 * "Respondida" no estado vermelho/amarelo.
 */
export function resolveEffectiveConversationRepliedAt(
  repliedAt?: string | Date | number | null,
  lastCustomerAt?: string | Date | number | null
): string | null {
  const repliedTime = toTime(repliedAt);
  if (repliedTime === null) return null;

  const customerTime = toTime(lastCustomerAt);
  if (customerTime !== null && repliedTime <= customerTime) return null;

  return new Date(repliedTime).toISOString();
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
