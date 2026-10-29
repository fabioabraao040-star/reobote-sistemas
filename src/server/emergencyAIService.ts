import { GoogleGenAI } from '@google/genai';
import {
  buildEmergencyAIStatusResponse,
  resolveWhatsAppIntegrationState,
  isGeminiApiKeyConfigured,
  EMERGENCY_AI_DEFAULT_MODEL,
  type EmergencyAIHistoryResponse,
  type EmergencyAIStatusResponse,
} from '../utils/emergencyAI.js';
import type { EmergencyAIStore } from './emergencyAIStore.js';

export { EMERGENCY_AI_DEFAULT_MODEL };
export const EMERGENCY_AI_MAX_INPUT_CHARS = 2000;
export const EMERGENCY_AI_MAX_OUTPUT_TOKENS = 500;
export const EMERGENCY_AI_DEFAULT_TIMEOUT_MS = 10000;

const SYSTEM_INSTRUCTION =
  'Você é um assistente de atendimento inicial de emergência de um escritório de advocacia. ' +
  'Responda em português do Brasil, de forma objetiva e curta. ' +
  'NÃO forneça aconselhamento jurídico, não interprete processos e não invente informações sobre o escritório. ' +
  'NÃO afirme que agendamentos, encaminhamentos ou análises foram realizados sem confirmação real. ' +
  'Se não puder responder com segurança, informe que um atendente humano dará continuidade ao atendimento.';

export interface EmergencyAIGenerationInput {
  conversationId: string;
  customerMessage: string;
  companyId: string | null;
  timeoutMs?: number;
}

export type EmergencyAIGenerationResult =
  | { text: string; error: null; model: string; errorCode: null }
  | { text: null; error: string; model: string | null; errorCode: string };

/**
 * Injetável para testes: nunca chama a API real durante a suíte automatizada.
 * O adaptador padrão usa o SDK `@google/genai` exclusivamente no backend.
 */
export type EmergencyAIGenerateContent = (params: {
  model: string;
  systemInstruction: string;
  message: string;
  maxOutputTokens: number;
}) => Promise<string | null>;

export class EmergencyAIError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'EmergencyAIError';
    this.status = status;
  }
}

export interface SetEmergencyAIEnabledServiceInput {
  enabled: boolean;
  actorId: string;
  actorName: string;
  reason: string | null;
}

export interface EmergencyAIStatusActionResult extends EmergencyAIStatusResponse {
  changed: boolean;
}

export interface EmergencyAIService {
  getStatus(): Promise<EmergencyAIStatusResponse>;
  setEnabled(input: SetEmergencyAIEnabledServiceInput): Promise<EmergencyAIStatusActionResult>;
  getHistory(limit: number): Promise<EmergencyAIHistoryResponse>;
  generateResponse(input: EmergencyAIGenerationInput): Promise<EmergencyAIGenerationResult>;
}

interface ServiceLogger {
  error: (...args: unknown[]) => void;
}

function clampTimeout(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return EMERGENCY_AI_DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.max(Math.trunc(value), 1000), 30000);
}

// Códigos seguros para log/evento. O provedor pode devolver uma mensagem
// extensa (inclusive detalhes internos); apenas o motivo conhecido é extraído.
const SAFE_PROVIDER_ERROR_CODES = new Set([
  'API_KEY_INVALID',
  'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED',
  'QUOTA_EXCEEDED',
  'INVALID_ARGUMENT',
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'MODEL_NOT_FOUND',
  'UNAVAILABLE',
  'INTERNAL',
  'DEADLINE_EXCEEDED',
  'FAILED_PRECONDITION',
]);

function extractSafeProviderErrorCode(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'provider_error';
  }

  if (error.message === 'timeout') {
    return 'timeout';
  }
  if (error.message === 'AI provider not configured') {
    return 'provider_not_configured';
  }

  const reason =
    error.message.match(/"reason"\s*:\s*"([A-Z0-9_]+)"/)?.[1] ??
    error.message.match(
      /\b(API_KEY_INVALID|PERMISSION_DENIED|RESOURCE_EXHAUSTED|QUOTA_EXCEEDED|INVALID_ARGUMENT|UNAUTHENTICATED|NOT_FOUND|MODEL_NOT_FOUND|UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|FAILED_PRECONDITION)\b/
    )?.[1] ??
    null;

  if (reason && SAFE_PROVIDER_ERROR_CODES.has(reason)) {
    return reason;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number' && Number.isFinite(status)) {
    return `provider_http_${Math.trunc(status)}`;
  }

  return error.name === 'ApiError' ? 'provider_api_error' : 'provider_error';
}

export function createEmergencyAIService(options: {
  store: EmergencyAIStore;
  geminiApiKey?: string | null;
  logger?: ServiceLogger;
  generateContent?: EmergencyAIGenerateContent;
}): EmergencyAIService {
  const logger = options.logger ?? console;
  const geminiApiKey = isGeminiApiKeyConfigured(options.geminiApiKey)
    ? (options.geminiApiKey as string)
    : null;

  // Cliente de IA inicializado exclusivamente no backend, com a chave
  // fornecida pelo servidor. Nunca exposto ao navegador nem ao frontend.
  let geminiClient: GoogleGenAI | null = null;

  function getGeminiClient(): GoogleGenAI | null {
    if (!geminiApiKey) {
      return null;
    }

    if (!geminiClient) {
      geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
    }

    return geminiClient;
  }

  const generateContent: EmergencyAIGenerateContent =
    options.generateContent ??
    (async ({ model, systemInstruction, message, maxOutputTokens }) => {
      const client = getGeminiClient();
      if (!client) {
        throw new Error('AI provider not configured');
      }

      const response = await client.models.generateContent({
        model,
        contents: message,
        config: {
          systemInstruction,
          maxOutputTokens,
          temperature: 0.3,
        },
      });

      return response.text?.trim() || null;
    });

  return {
    async getStatus() {
      const configResult = await options.store.getConfig();

      if (configResult.error) {
        logger.error('[IA de Emergência] Falha ao consultar configuração:', configResult.error.message);
        throw new EmergencyAIError('Não foi possível consultar o estado da IA de Emergência.');
      }

      // Uma falha na leitura do WhatsApp não transforma a IA em ativa nem
      // derruba a consulta principal: a integração é exibida como indisponível.
      const whatsappResult = await options.store.getWhatsAppConfig();
      if (whatsappResult.error) {
        logger.error('[IA de Emergência] Falha ao consultar integração WhatsApp:', whatsappResult.error.message);
      }

      return buildEmergencyAIStatusResponse({
        config: configResult.data,
        whatsapp: whatsappResult.error ? null : whatsappResult.data,
        geminiApiKey,
      });
    },

    async setEnabled(input) {
      if (!input.actorId || !input.actorName.trim()) {
        throw new EmergencyAIError('Administrador responsável não identificado.', 400);
      }

      const whatsappResult = await options.store.getWhatsAppConfig();
      if (whatsappResult.error) {
        logger.error('[IA de Emergência] Falha ao consultar integração WhatsApp:', whatsappResult.error.message);
      }

      const whatsappStatus = resolveWhatsAppIntegrationState(
        whatsappResult.error ? null : whatsappResult.data
      );

      const result = await options.store.setEnabled({
        enabled: input.enabled,
        actorId: input.actorId,
        actorName: input.actorName.trim(),
        reason: input.reason,
        whatsappStatus,
      });

      if (result.error || !result.data) {
        logger.error(
          '[IA de Emergência] Falha ao persistir alteração:',
          result.error?.message || 'configuração não retornada'
        );
        throw new EmergencyAIError(
          input.enabled
            ? 'Não foi possível ativar a IA de Emergência. O estado anterior foi mantido.'
            : 'Não foi possível desativar a IA de Emergência. O estado anterior foi mantido.'
        );
      }

      // Relê a integração depois da confirmação para não devolver um retrato
      // anterior à alteração. Falha aqui vira "indisponível", não "configurada".
      const latestWhatsApp = await options.store.getWhatsAppConfig();
      if (latestWhatsApp.error) {
        logger.error('[IA de Emergência] Falha ao reler integração WhatsApp:', latestWhatsApp.error.message);
      }

      return {
        ...buildEmergencyAIStatusResponse({
          config: result.data,
          whatsapp: latestWhatsApp.error ? null : latestWhatsApp.data,
          geminiApiKey,
        }),
        changed: result.changed,
      };
    },

    async getHistory(limit) {
      const result = await options.store.listAudit(limit);

      if (result.error) {
        logger.error('[IA de Emergência] Falha ao consultar histórico:', result.error.message);
        throw new EmergencyAIError('Não foi possível consultar o histórico da IA de Emergência.');
      }

      return { history: result.data ?? [] };
    },

    async generateResponse(input) {
      const conversationId =
        typeof input.conversationId === 'string' ? input.conversationId.trim() : '';
      if (!conversationId) {
        return {
          text: null,
          error: 'Conversa inválida.',
          model: null,
          errorCode: 'invalid_conversation',
        };
      }

      const customerMessage =
        typeof input.customerMessage === 'string' ? input.customerMessage.trim() : '';
      if (!customerMessage) {
        return {
          text: null,
          error: 'Mensagem inválida.',
          model: null,
          errorCode: 'invalid_message',
        };
      }
      if (customerMessage.length > EMERGENCY_AI_MAX_INPUT_CHARS) {
        return {
          text: null,
          error: 'Mensagem acima do limite permitido.',
          model: null,
          errorCode: 'input_too_long',
        };
      }

      // Sem chave no servidor e sem gerador injetado (testes), a IA não pode
      // responder. O webhook segue para atendimento humano.
      if (!geminiApiKey && !options.generateContent) {
        return {
          text: null,
          error: 'Provedor de IA não configurado.',
          model: null,
          errorCode: 'provider_not_configured',
        };
      }

      // O modelo persistido é apenas um rótulo de configuração; a credencial
      // nunca é lida daqui nem devolvida.
      let model = EMERGENCY_AI_DEFAULT_MODEL;
      try {
        const configResult = await options.store.getConfig();
        const configuredModel = configResult.data?.model?.trim();
        if (configuredModel) {
          model = configuredModel;
        }
      } catch {
        // Mantém o modelo padrão; a geração ainda pode prosseguir.
      }

      const timeoutMs = clampTimeout(input.timeoutMs);
      let timer: ReturnType<typeof setTimeout> | undefined;

      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      });

      try {
        const text = await Promise.race([
          generateContent({
            model,
            systemInstruction: SYSTEM_INSTRUCTION,
            message: customerMessage,
            maxOutputTokens: EMERGENCY_AI_MAX_OUTPUT_TOKENS,
          }),
          timeout,
        ]);

        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (!trimmed) {
          return {
            text: null,
            error: 'Resposta vazia do provedor.',
            model,
            errorCode: 'empty_response',
          };
        }

        // Limite de saída defensivo, além de maxOutputTokens.
        return { text: trimmed.slice(0, 4000), error: null, model, errorCode: null };
      } catch (error) {
        // Nunca registra prompt, mensagem do cliente, chave ou stack trace.
        // Apenas o código seguro do motivo é exposto no log e no evento.
        const errorCode = extractSafeProviderErrorCode(error);
        logger.error('[IA de Emergência] Falha ao gerar resposta:', errorCode);
        return {
          text: null,
          error: 'Erro ao gerar resposta de IA.',
          model,
          errorCode,
        };
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    },
  };
}

/**
 * Ponto de integração fail-closed usado pelo webhook oficial da Meta.
 * Qualquer erro de leitura resulta em `false` e a mensagem segue para
 * atendimento humano, nunca para resposta automática.
 */
export async function isEmergencyAIEnabled(service: EmergencyAIService): Promise<boolean> {
  try {
    const status = await service.getStatus();
    return status.config.enabled === true;
  } catch {
    return false;
  }
}
