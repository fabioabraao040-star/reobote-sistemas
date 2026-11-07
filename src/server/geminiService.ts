import { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// GEMINI — IA PRINCIPAL DE ATENDIMENTO WHATSAPP
// ============================================================================
// Implementação do serviço de IA usando Google Gemini.
// Regras de segurança:
//   - NÃO fornece aconselhamento jurídico.
//   - Assuntos jurídicos são encaminhados para atendimento humano.
//   - Timeout de 10s; falhas não interrompem o atendimento humano.
//   - Limite de 2000 caracteres de entrada e 500 tokens de saída.
//   - Credencial configurada exclusivamente no backend via GEMINI_API_KEY.
// ============================================================================

export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_MAX_INPUT_CHARS = 2000;
export const GEMINI_MAX_OUTPUT_TOKENS = 500;
export const GEMINI_DEFAULT_TIMEOUT_MS = 10000;

const SYSTEM_INSTRUCTION =
  'Você é um assistente de atendimento inicial do REOBOTE SISTEMAS. ' +
  'Responda em português do Brasil, de forma objetiva e curta. ' +
  'NÃO forneça aconselhamento jurídico. Não interprete processos legais. ' +
  'Se o cliente perguntar sobre assuntos jurídicos, processos ou contratos, ' +
  'informe que um atendente humano dará continuidade ao atendimento. ' +
  'NÃO afirme que agendamentos, encaminhamentos ou análises foram realizados ' +
  'sem confirmação real. Se não puder responder com segurança, informe que ' +
  'um atendente humano dará continuidade ao atendimento.';

export interface GeminiGenerationInput {
  conversationId: string;
  customerMessage: string;
  companyId: string | null;
  timeoutMs?: number;
}

export type GeminiGenerationResult =
  | { text: string; error: null; model: string; errorCode: null }
  | { text: null; error: string; model: string | null; errorCode: string };

export type GeminiGenerateContent = (params: {
  model: string;
  systemInstruction: string;
  message: string;
  maxOutputTokens: number;
}) => Promise<string | null>;

export class GeminiError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

interface ServiceLogger {
  error: (...args: unknown[]) => void;
}

function clampTimeout(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return GEMINI_DEFAULT_TIMEOUT_MS;
  }
  return Math.max(1000, Math.min(30000, value));
}

function extractSafeProviderErrorCode(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'timeout') return 'timeout';
    if (error.message.includes('quota')) return 'quota_exceeded';
    if (error.message.includes('API key')) return 'invalid_api_key';
    return 'provider_error';
  }
  return 'unknown_error';
}

export function createGeminiService(options: {
  store: {
    getConfig(): Promise<{ data: { enabled: boolean; provider: string | null; model: string | null; integration_status: string } | null; error: { message: string } | null }>;
    recordGenerationFailure(params: {
      companyId: string;
      conversationId: string;
      inboundExternalId: string;
      errorCode: string;
      model: string | null;
    }): Promise<void>;
    recordAIResponse(params: {
      companyId: string;
      conversationId: string;
      inboundExternalId: string;
      outboundMessageUuid: string | null;
      model: string | null;
    }): Promise<void>;
  };
  generateContent?: GeminiGenerateContent;
  logger?: ServiceLogger;
}) {
  const geminiApiKey = process.env.GEMINI_API_KEY || null;
  const { store, generateContent, logger } = options;

  const generateContentImpl: GeminiGenerateContent =
    generateContent ??
    (async ({ model, systemInstruction, message, maxOutputTokens }) => {
      if (!geminiApiKey) {
        throw new GeminiError('GEMINI_API_KEY não configurada', 500);
      }

      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      const response = await ai.models.generateContent({
        model,
        config: {
          systemInstruction,
          maxOutputTokens,
          temperature: 0.7,
        },
        contents: message,
      });

      const text = response.text;
      if (!text) return null;
      return text;
    });

  async function getStatus() {
    try {
      const { data, error } = await store.getConfig();
      if (error) {
        return {
          enabled: false,
          provider: null,
          model: null,
          integration_status: 'unavailable',
          error: error.message,
        };
      }

      if (!data) {
        return {
          enabled: false,
          provider: null,
          model: null,
          integration_status: 'unavailable',
        };
      }

      const isConfigured = Boolean(geminiApiKey && data.enabled);
      return {
        enabled: isConfigured,
        provider: data.provider ?? 'gemini',
        model: data.model ?? GEMINI_DEFAULT_MODEL,
        integration_status: data.integration_status ?? 'unavailable',
      };
    } catch (err: any) {
      return {
        enabled: false,
        provider: null,
        model: null,
        integration_status: 'error',
        error: err.message,
      };
    }
  }

  async function generateResponse(input: GeminiGenerationInput): Promise<GeminiGenerationResult> {
    const timeoutMs = clampTimeout(input.timeoutMs);
    const timer = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });

    let model = GEMINI_DEFAULT_MODEL;

    try {
      const { data: config } = await store.getConfig();
      if (config?.model?.trim()) {
        model = config.model.trim();
      }
    } catch {
      // Mantém o modelo padrão
    }

    const truncatedMessage = input.customerMessage.slice(0, GEMINI_MAX_INPUT_CHARS);

    try {
      const text = await Promise.race([
        generateContentImpl({
          model,
          systemInstruction: SYSTEM_INSTRUCTION,
          message: truncatedMessage,
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        }),
        timer,
      ]);

      if (!text) {
        return {
          text: null,
          error: 'Resposta vazia da IA',
          model,
          errorCode: 'empty_response',
        };
      }

      return {
        text: text.slice(0, 4000),
        error: null,
        model,
        errorCode: null,
      };
    } catch (error: any) {
      const errorCode = extractSafeProviderErrorCode(error);
      logger?.error('Gemini generation failed:', error);
      return {
        text: null,
        error: error.message,
        model,
        errorCode,
      };
    }
  }

  return {
    getStatus,
    generateResponse,
  };
}

export type GeminiService = ReturnType<typeof createGeminiService>;

export function isGeminiApiKeyConfigured(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function normalizeGeminiApiKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
