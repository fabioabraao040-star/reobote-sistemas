import {
  isEmergencyAIEnabled,
  type EmergencyAIService,
} from './emergencyAIService.js';

// Orquestração da resposta automática no webhook oficial da Meta.
//
// Este módulo é intencionalmente independente do Express e do Supabase: o
// servidor injeta um adaptador real e os testes injetam um adaptador em memória.
// Nenhuma chamada real ao Gemini ou à Meta acontece aqui por si só.

export interface EmergencyAIConversationSnapshot {
  id: string;
  company_id: string;
  assigned_to: string | null;
  status: string;
}

export type EmergencyAIClaimResult = 'claimed' | 'duplicate' | 'unavailable';

export type EmergencyAIWhatsAppDispatchResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

export interface EmergencyAIWebhookAdapter {
  getConversation(conversationId: string): Promise<EmergencyAIConversationSnapshot | null>;
  hasAgentReplySince(conversationId: string, sinceIso: string): Promise<boolean>;
  claimInboundEvent(params: {
    companyId: string;
    conversationId: string;
    inboundMessageId: string;
  }): Promise<EmergencyAIClaimResult>;
  getContactPhone(contactId: string): Promise<string | null>;
  insertAiMessage(params: { conversationId: string; content: string }): Promise<string | null>;
  setAiMessageWhatsAppId(messageId: string, whatsappMessageId: string): Promise<void>;
  markAiMessageFailed(messageId: string): Promise<void>;
  touchConversation(params: {
    conversationId: string;
    content: string;
    at: string;
  }): Promise<void>;
  getDispatchConfig(): Promise<{ phoneNumberId: string; accessToken: string } | null>;
  dispatchText(params: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    body: string;
  }): Promise<EmergencyAIWhatsAppDispatchResult>;
}

export interface EmergencyAIInboundInput {
  conversationId: string;
  companyId: string;
  contactId: string;
  customerMessage: string;
  inboundMessageId: string | null;
  receivedAt: string;
  isCustomerTextMessage: boolean;
}

export type EmergencyAIInboundStatus =
  | 'sent'
  | 'duplicate'
  | 'skipped_ineligible'
  | 'skipped_disabled'
  | 'skipped_human'
  | 'discarded_disabled'
  | 'discarded_human'
  | 'discarded_no_dispatch'
  | 'generation_failed'
  | 'dispatch_failed'
  | 'error';

export interface EmergencyAIInboundResult {
  status: EmergencyAIInboundStatus;
  reason: string | null;
}

interface WebhookLogger {
  error: (...args: unknown[]) => void;
}

function result(
  status: EmergencyAIInboundStatus,
  reason: string | null = null
): EmergencyAIInboundResult {
  return { status, reason };
}

/**
 * Executa o fluxo de IA de Emergência para UMA mensagem recebida.
 *
 * Regras de segurança:
 *  - só mensagens de texto de clientes são elegíveis;
 *  - exige conversa da mesma empresa, aberta e sem atendente responsável;
 *  - reivindica uma chave idempotente antes de gerar (eventos repetidos não
 *    geram segunda resposta);
 *  - consulta o estado persistido da IA ANTES de gerar;
 *  - consulta novamente o estado persistido e a conversa ANTES de enviar;
 *  - qualquer falha é registrada de forma segura e o atendimento humano segue.
 */
export async function processEmergencyAIInbound(params: {
  service: EmergencyAIService;
  adapter: EmergencyAIWebhookAdapter;
  input: EmergencyAIInboundInput;
  logger?: WebhookLogger;
  now?: () => Date;
  generationTimeoutMs?: number;
}): Promise<EmergencyAIInboundResult> {
  const { service, adapter, input } = params;
  const logger = params.logger ?? console;

  if (!input.isCustomerTextMessage) {
    return result('skipped_ineligible', 'not_customer_text');
  }

  if (!input.inboundMessageId) {
    return result('skipped_ineligible', 'missing_message_id');
  }

  const customerMessage = input.customerMessage?.trim() || '';
  if (!customerMessage) {
    return result('skipped_ineligible', 'empty_message');
  }

  try {
    const conversation = await adapter.getConversation(input.conversationId);
    if (!conversation || conversation.company_id !== input.companyId) {
      return result('skipped_ineligible', 'conversation_mismatch');
    }
    if (conversation.status === 'closed') {
      return result('skipped_ineligible', 'conversation_closed');
    }
    if (conversation.assigned_to) {
      return result('skipped_human', 'human_assigned');
    }

    // Reivindicação atômica: o índice único em idempotency_key impede que dois
    // webhooks simultâneos/entregas repetidas gerem duas respostas.
    const claim = await adapter.claimInboundEvent({
      companyId: input.companyId,
      conversationId: input.conversationId,
      inboundMessageId: input.inboundMessageId,
    });
    if (claim === 'duplicate') {
      return result('duplicate', 'duplicate_event');
    }

    // Estado persistido da IA antes de qualquer geração.
    if (!(await isEmergencyAIEnabled(service))) {
      return result('skipped_disabled', 'ai_disabled');
    }

    // O atendente pode ter assumido a conversa durante as consultas acima.
    if (await adapter.hasAgentReplySince(input.conversationId, input.receivedAt)) {
      return result('skipped_human', 'human_replied');
    }

    const generation = await service.generateResponse({
      conversationId: input.conversationId,
      customerMessage,
      companyId: input.companyId,
      timeoutMs: params.generationTimeoutMs,
    });

    if (!generation.text) {
      // Falha do provedor não derruba o webhook: o atendimento humano segue.
      logger.error(
        '[IA de Emergência] Geração não produziu resposta; seguindo para atendimento humano.'
      );
      return result('generation_failed', generation.error ?? 'empty_response');
    }

    // Revalidação obrigatória antes do envio:
    //  - o ADM pode ter desativado a IA durante a geração;
    //  - um atendente pode ter assumido ou respondido nesse intervalo.
    if (!(await isEmergencyAIEnabled(service))) {
      return result('discarded_disabled', 'ai_disabled_before_send');
    }

    const beforeSend = await adapter.getConversation(input.conversationId);
    if (
      !beforeSend ||
      beforeSend.company_id !== input.companyId ||
      beforeSend.status === 'closed'
    ) {
      return result('discarded_human', 'conversation_unavailable');
    }
    if (beforeSend.assigned_to) {
      return result('discarded_human', 'human_assigned_before_send');
    }
    if (await adapter.hasAgentReplySince(input.conversationId, input.receivedAt)) {
      return result('discarded_human', 'human_replied_before_send');
    }

    const dispatchConfig = await adapter.getDispatchConfig();
    if (!dispatchConfig) {
      return result('discarded_no_dispatch', 'whatsapp_not_configured');
    }

    const contactPhone = await adapter.getContactPhone(input.contactId);
    const cleanTo = (contactPhone || '').replace(/\D/g, '');
    if (!cleanTo) {
      return result('discarded_no_dispatch', 'contact_without_phone');
    }

    // Persiste primeiro no histórico existente (sender_type = system), depois
    // envia pelo mecanismo oficial já utilizado pelo projeto.
    const messageId = await adapter.insertAiMessage({
      conversationId: input.conversationId,
      content: generation.text,
    });
    if (!messageId) {
      return result('error', 'history_write_failed');
    }

    const dispatch = await adapter.dispatchText({
      phoneNumberId: dispatchConfig.phoneNumberId,
      accessToken: dispatchConfig.accessToken,
      to: cleanTo,
      body: generation.text,
    });

    if (!dispatch.ok) {
      await adapter.markAiMessageFailed(messageId);
      logger.error('[IA de Emergência] A Meta recusou a resposta automática.');
      return result('dispatch_failed', 'dispatch_failed');
    }

    if (dispatch.messageId) {
      await adapter.setAiMessageWhatsAppId(messageId, dispatch.messageId);
    }

    const at = (params.now ? params.now() : new Date()).toISOString();
    await adapter.touchConversation({
      conversationId: input.conversationId,
      content: generation.text,
      at,
    });

    return result('sent');
  } catch (error) {
    // Nunca registra conteúdo, prompt, chave ou stack trace.
    logger.error(
      '[IA de Emergência] Falha inesperada no fluxo do webhook:',
      error instanceof Error ? error.name : 'erro desconhecido'
    );
    return result('error', 'unexpected_error');
  }
}
