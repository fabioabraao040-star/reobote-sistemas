// Regras e contratos da IA de Emergência.
// Este módulo é puro: não lê banco, não lê ambiente e não envia mensagens.
// O objetivo é manter a decisão de estado testável e impedir que a interface
// invente um estado "ATIVA" sem confirmação persistida pelo backend.

export type EmergencyAIIntegrationState = 'configured' | 'pending' | 'unavailable';
export type EmergencyAIAction = 'activate' | 'deactivate';
export type EmergencyAIAuditResult = 'success' | 'failed';

export interface EmergencyAIConfigRow {
  id: string;
  company_id: string | null;
  enabled: boolean;
  provider: string | null;
  model: string | null;
  integration_status: EmergencyAIIntegrationState | null;
  last_changed_by: string | null;
  last_changed_by_name: string | null;
  last_changed_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WhatsAppIntegrationRow {
  is_verified?: boolean | null;
  phone_number_id?: string | null;
  access_token?: string | null;
  phone_number?: string | null;
  last_health_check?: string | null;
}

export interface EmergencyAIConfigView {
  id: string | null;
  company_id: string | null;
  enabled: boolean;
  provider: string | null;
  model: string | null;
  integration_status: EmergencyAIIntegrationState | null;
  last_changed_by: string | null;
  last_changed_by_name: string | null;
  last_changed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface EmergencyAIProviderView {
  status: EmergencyAIIntegrationState;
  provider: string | null;
  model: string | null;
}

export interface EmergencyAIWhatsAppView {
  status: EmergencyAIIntegrationState;
  last_checked: string | null;
}

export interface EmergencyAIStatusResponse {
  config: EmergencyAIConfigView;
  provider: EmergencyAIProviderView;
  whatsapp: EmergencyAIWhatsAppView;
}

export interface EmergencyAIAuditRow {
  id: string;
  config_id: string | null;
  company_id: string | null;
  action: EmergencyAIAction;
  actor_id: string | null;
  actor_name: string;
  previous_enabled: boolean;
  new_enabled: boolean;
  result: EmergencyAIAuditResult;
  reason: string | null;
  integration_status: EmergencyAIIntegrationState;
  created_at: string;
}

export interface EmergencyAIHistoryResponse {
  history: EmergencyAIAuditRow[];
}

export const EMERGENCY_AI_REASON_MAX_LENGTH = 500;
export const EMERGENCY_AI_HISTORY_DEFAULT_LIMIT = 20;
export const EMERGENCY_AI_HISTORY_MAX_LIMIT = 100;

// Provedor/modelo efetivos quando a IA está ativa e a configuração persistida
// ainda não fixou um modelo. O backend usa exatamente estes valores.
export const EMERGENCY_AI_DEFAULT_PROVIDER = 'gemini';
export const EMERGENCY_AI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const GEMINI_PLACEHOLDER_KEY = 'MY_GEMINI_API_KEY';

function clean(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
}

/**
 * Normaliza o valor recebido por variável de ambiente. Alguns painéis salvam
 * o valor com aspas ou espaços ao redor; isso não faz parte da chave e faria
 * o provedor rejeitá-la. O valor nunca é exposto ao frontend nem aos logs.
 */
export function normalizeGeminiApiKey(value: string | null | undefined): string | null {
  let secret = clean(value);
  if (!secret) return null;

  if (
    (secret.startsWith('"') && secret.endsWith('"')) ||
    (secret.startsWith("'") && secret.endsWith("'"))
  ) {
    secret = secret.slice(1, -1).trim();
  }

  return secret || null;
}

function isConfiguredSecret(value: string | null | undefined): boolean {
  const secret = normalizeGeminiApiKey(value);
  return secret !== null && secret !== GEMINI_PLACEHOLDER_KEY;
}

/**
 * Indica se a chave do Gemini é utilizável no servidor. Placeholders do
 * `.env.example` não devem disparar chamadas reais ao provedor.
 */
export function isGeminiApiKeyConfigured(value: string | null | undefined): boolean {
  return isConfiguredSecret(value);
}

export function defaultEmergencyAIConfigView(): EmergencyAIConfigView {
  return {
    id: null,
    company_id: null,
    enabled: false,
    provider: null,
    model: null,
    integration_status: null,
    last_changed_by: null,
    last_changed_by_name: null,
    last_changed_at: null,
    created_at: null,
    updated_at: null,
  };
}

export function toEmergencyAIConfigView(config: EmergencyAIConfigRow): EmergencyAIConfigView {
  return {
    id: config.id,
    company_id: config.company_id,
    enabled: config.enabled === true,
    provider: clean(config.provider),
    model: clean(config.model),
    integration_status: config.integration_status,
    last_changed_by: config.last_changed_by,
    last_changed_by_name: clean(config.last_changed_by_name),
    last_changed_at: config.last_changed_at,
    created_at: config.created_at ?? null,
    updated_at: config.updated_at ?? null,
  };
}

/**
 * O estado do provedor só é "configured" quando há provedor, modelo e uma
 * credencial de servidor utilizável. Nenhuma credencial é devolvida ao frontend.
 * A ausência de configuração é "pending"; configuração incompleta/desconhecida é
 * "unavailable".
 */
export function resolveProviderIntegrationState(params: {
  provider?: string | null;
  model?: string | null;
  geminiApiKey?: string | null;
}): EmergencyAIIntegrationState {
  const provider = clean(params.provider);
  const model = clean(params.model);

  if (!provider && !model) return 'pending';
  if (!provider || !model) return 'pending';

  const normalized = provider.toLowerCase();
  if (normalized === 'gemini' || normalized === 'google' || normalized === 'google-gemini') {
    return isConfiguredSecret(params.geminiApiKey) ? 'configured' : 'unavailable';
  }

  return 'unavailable';
}

/**
 * "unavailable" = não existe configuração de WhatsApp;
 * "pending" = existe configuração, mas ela ainda não foi validada;
 * "configured" = validação concluída com os campos necessários presentes.
 */
export function resolveWhatsAppIntegrationState(
  config: WhatsAppIntegrationRow | null | undefined
): EmergencyAIIntegrationState {
  if (!config) return 'unavailable';

  const hasPhoneNumberId = Boolean(clean(config.phone_number_id));
  const hasAccessToken = Boolean(clean(config.access_token));

  if (config.is_verified === true && hasPhoneNumberId && hasAccessToken) {
    return 'configured';
  }

  if (config.is_verified === true && (!hasPhoneNumberId || !hasAccessToken)) {
    return 'unavailable';
  }

  return 'pending';
}

export function buildEmergencyAIStatusResponse(params: {
  config: EmergencyAIConfigRow | null;
  whatsapp: WhatsAppIntegrationRow | null;
  geminiApiKey?: string | null;
}): EmergencyAIStatusResponse {
  const configView = params.config
    ? toEmergencyAIConfigView(params.config)
    : defaultEmergencyAIConfigView();

  // A IA ativa sem modelo persistido usa o padrão efetivo do backend. Exibir
  // esse valor é mais honesto do que mostrar "não definido" enquanto o webhook
  // já responderia com o Gemini Flash-Lite.
  const effectiveProvider = configView.provider
    ?? (configView.enabled ? EMERGENCY_AI_DEFAULT_PROVIDER : null);
  const effectiveModel = configView.model
    ?? (configView.enabled ? EMERGENCY_AI_DEFAULT_MODEL : null);

  const providerStatus = resolveProviderIntegrationState({
    provider: effectiveProvider,
    model: effectiveModel,
    geminiApiKey: params.geminiApiKey,
  });

  return {
    config: configView,
    provider: {
      status: providerStatus,
      provider: effectiveProvider,
      model: effectiveModel,
    },
    whatsapp: {
      status: resolveWhatsAppIntegrationState(params.whatsapp),
      last_checked: params.whatsapp?.last_health_check ?? null,
    },
  };
}

export function validateEmergencyAIReason(value: unknown):
  | { ok: true; reason: string | null }
  | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, reason: null };
  }

  if (typeof value !== 'string') {
    return { ok: false, error: 'Motivo inválido.' };
  }

  const reason = value.trim();
  if (!reason) return { ok: true, reason: null };
  // Permite texto multilinha, mas rejeita NUL e controles que não são seguros
  // para persistência/log. O Postgres não aceita NUL em colunas text.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(reason)) {
    return { ok: false, error: 'Motivo inválido.' };
  }
  if (reason.length > EMERGENCY_AI_REASON_MAX_LENGTH) {
    return {
      ok: false,
      error: `O motivo deve ter no máximo ${EMERGENCY_AI_REASON_MAX_LENGTH} caracteres.`,
    };
  }

  return { ok: true, reason };
}

export function parseEmergencyAIHistoryLimit(value: unknown):
  | { ok: true; limit: number }
  | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, limit: EMERGENCY_AI_HISTORY_DEFAULT_LIMIT };
  }

  if (Array.isArray(value) || (typeof value !== 'string' && typeof value !== 'number')) {
    return { ok: false, error: 'Limite de histórico inválido.' };
  }

  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) {
    return { ok: false, error: 'Limite de histórico inválido.' };
  }

  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > EMERGENCY_AI_HISTORY_MAX_LIMIT) {
    return {
      ok: false,
      error: `O limite do histórico deve estar entre 1 e ${EMERGENCY_AI_HISTORY_MAX_LIMIT}.`,
    };
  }

  return { ok: true, limit };
}

export function actionForEnabledState(enabled: boolean): EmergencyAIAction {
  return enabled ? 'activate' : 'deactivate';
}
