import { withTimeout } from '../../monitoring.js';

// ============================================================================
// CLIENTE META BUSINESS AGENT PLATFORM (somente backend)
// ============================================================================
// Endpoints EXCLUSIVAMENTE oficiais, documentados em
// https://developers.facebook.com/documentation/meta-business-agent/
//
// Base: https://api.facebook.com
// Autenticação: HTTP Bearer com token de usuário do sistema que tenha a
// permission whatsapp_business_messaging. O REOBOTE reutiliza o mesmo token
// salvo em whatsapp_configs — nenhuma credencial nova é criada.
//
// Header X-API-Version:
//   - Endpoints da plataforma do agente: "2.0.0"
//   - Thread Control (Cloud API):        "1.0.0"
//
// Erros são normalizados e SEMPRE truncados: title/detail podem conter texto da
// Meta, mas nunca o token (que não é ecoado pela Meta nos payloads de erro).

export const DEFAULT_META_AGENT_API_BASE = 'https://api.facebook.com';

export type MetaAgentApiError = {
  status: number;
  title: string;
  detail: string;
  code: string | null;
};

export type MetaAgentResult<T> =
  | { ok: true; httpStatus: number; data: T }
  | { ok: false; httpStatus: number | null; error: MetaAgentApiError | null; networkError?: string };

export type MetaAgentEligibility = { isEligible: boolean };

export type MetaAgentSettingsRollout = { enabled: boolean };

export type MetaAgentSettingsHandoff = {
  enabled: boolean;
  message?: string | null;
  messageSelection?: 'DEFAULT' | 'AGENT' | 'CUSTOM' | null;
};

export type MetaAgentSettings = {
  agentId: string;
  channel: string;
  rollout: MetaAgentSettingsRollout;
  handoff: MetaAgentSettingsHandoff | null;
  aiAudience: 'EVERYONE' | 'ALLOWLISTED_ONLY' | null;
};

export type MetaAgentOnboarding = { agentId: string };

export type MetaAgentThreadControl = { requestId: string | null };

export type MetaAgentSkill = { skillId: string };

// ... interface update
export interface MetaAgentClient {
  getEligibility(entityId: string): Promise<MetaAgentResult<MetaAgentEligibility>>;
  getSettings(entityId: string, agentId?: string | null): Promise<MetaAgentResult<MetaAgentSettings[]>>;
  updateSettings(
    entityId: string,
    patch: {
      rollout?: MetaAgentSettingsRollout;
      handoff?: MetaAgentSettingsHandoff;
      aiAudience?: 'EVERYONE' | 'ALLOWLISTED_ONLY';
      neverSayPhrases?: string[];
    },
    agentId?: string | null,
  ): Promise<MetaAgentResult<MetaAgentSettings[]>>;
  onboard(entityId: string): Promise<MetaAgentResult<MetaAgentOnboarding>>;
  createSkill(
    entityId: string,
    body: { title: string; description: string; skill: string },
    agentId?: string | null,
  ): Promise<MetaAgentResult<MetaAgentSkill>>;
  updateThreadControl(
    phoneNumberId: string,
    body: { action: 'release' | 'take' | 'pass'; to?: string; metadata?: string },
  ): Promise<MetaAgentResult<MetaAgentThreadControl>>;
}

// Guarda de segurança: o erro da Meta é convertido em texto curto e controlado,
// sem stack, sem headers e sem repetir o corpo completo da requisição.
function truncate(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value : '';
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeApiError(status: number, payload: unknown): MetaAgentApiError | null {
  const raw = payload as { error?: { title?: string; detail?: string; code?: number | string } };
  if (!raw || typeof raw !== 'object') return null;
  const source = raw && raw.error ? raw.error : (payload as { title?: string; detail?: string; code?: number | string });
  if (!source || typeof source !== 'object') return null;
  const title = truncate((source as { title?: string }).title, 120) || 'Erro na Meta';
  const detail = truncate((source as { detail?: string }).detail, 400) || `HTTP ${status}`;
  const codeRaw = (source as { code?: number | string }).code;
  const code =
    codeRaw === undefined || codeRaw === null
      ? null
      : String(codeRaw).replace(/[^0-9A-Za-z_.-]/g, '').slice(0, 40) || null;
  return { status, title, detail, code };
}

function sanitizeErrorName(error: unknown): string {
  if (error instanceof Error) {
    // withTimeout rejeita com a mensagem de marcador passada na chamada.
    if (error.message === 'meta-agent') return 'timeout';
    return 'network';
  }
  return 'network';
}

export interface MetaAgentClientDependencies {
  accessToken: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createMetaAgentClient(deps: MetaAgentClientDependencies): MetaAgentClient {
  const baseUrl = (deps.baseUrl || DEFAULT_META_AGENT_API_BASE).replace(/\/+$/, '');
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const doFetch = deps.fetchImpl ?? fetch;

  if (!deps.accessToken || typeof deps.accessToken !== 'string') {
    throw new Error('Token de acesso à Meta ausente para a integração do Meta Business Agent.');
  }

  async function call(
    path: string,
    init: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      apiVersion: '2.0.0' | '1.0.0';
    },
  ): Promise<
    | { ok: true; httpStatus: number; data: unknown }
    | { ok: false; httpStatus: number | null; error: MetaAgentApiError | null; networkError?: string }
  > {
    try {
      const response = await withTimeout(
        doFetch(`${baseUrl}${path}`, {
          method: init.method,
          headers: {
            Authorization: `Bearer ${deps.accessToken}`,
            'Content-Type': 'application/json',
            'X-API-Version': init.apiVersion,
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }),
        timeoutMs,
        'meta-agent',
      );

      const payload: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = normalizeApiError(response.status, payload);
        return {
          ok: false,
          httpStatus: response.status,
          error:
            error ??
            {
              status: response.status,
              title: 'Erro na Meta',
              detail: truncate(String(payload), 400) || `HTTP ${response.status}`,
              code: null,
            },
        };
      }

      return { ok: true, httpStatus: response.status, data: payload };
    } catch (error) {
      // Nunca expor mensagem interna (pode conter URL/params). Só a classe.
      return { ok: false, httpStatus: null, error: null, networkError: sanitizeErrorName(error) };
    }
  }

  // ---- Schemas de normalização (respostas oficiais) -------------------------

  function normalizeEligibility(data: unknown): MetaAgentEligibility {
    const raw = data as { is_eligible?: unknown };
    return { isEligible: raw?.is_eligible === true };
  }

  function normalizeSettings(data: unknown): MetaAgentSettings[] {
    const list = Array.isArray(data) ? data : [];
    return list
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => {
        const rollout = item.rollout as { enabled?: unknown } | undefined;
        const handoff = item.handoff as
          | { enabled?: unknown; message?: unknown; message_selection?: unknown }
          | null
          | undefined;
        return {
          agentId: String(item.agent_id ?? ''),
          channel: String(item.channel ?? 'unknown'),
          rollout: { enabled: rollout?.enabled === true },
          handoff:
            handoff && typeof handoff === 'object'
              ? {
                  enabled: handoff.enabled === true,
                  message: typeof handoff.message === 'string' ? handoff.message : null,
                  messageSelection:
                    handoff.message_selection === 'CUSTOM' || handoff.message_selection === 'AGENT'
                      ? handoff.message_selection
                      : null,
                }
              : null,
          aiAudience: item.ai_audience === 'ALLOWLISTED_ONLY' ? 'ALLOWLISTED_ONLY' : item.ai_audience === 'EVERYONE' ? 'EVERYONE' : null,
        };
      });
  }

  function normalizeOnboarding(data: unknown): MetaAgentOnboarding {
    const raw = data as { agent_id?: unknown };
    return { agentId: typeof raw?.agent_id === 'string' ? raw.agent_id : '' };
  }

  function normalizeSkill(data: unknown): MetaAgentSkill {
    const raw = data as { id?: unknown };
    return { skillId: typeof raw?.id === 'string' ? raw.id : '' };
  }

  function normalizeThreadControl(data: unknown): MetaAgentThreadControl {
    const raw = data as { request_id?: unknown };
    return { requestId: typeof raw?.request_id === 'string' ? raw.request_id : null };
  }

  // ---- Endpoints oficiais -----------------------------------------------------

  return {
    async getEligibility(entityId) {
      const result = await call(
        `/${encodeURIComponent(entityId)}/agent_eligibility`,
        { method: 'GET', apiVersion: '2.0.0' },
      );
      return result.ok ? { ok: true, httpStatus: result.httpStatus, data: normalizeEligibility(result.data) } : result;
    },

    async getSettings(entityId, agentId) {
      const suffix = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
      const result = await call(
        `/${encodeURIComponent(entityId)}/agent_config/settings${suffix}`,
        { method: 'GET', apiVersion: '2.0.0' },
      );
      return result.ok ? { ok: true, httpStatus: result.httpStatus, data: normalizeSettings(result.data) } : result;
    },

    async updateSettings(entityId, patch, agentId) {
      const suffix = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
      const result = await call(
        `/${encodeURIComponent(entityId)}/agent_config/settings${suffix}`,
        { method: 'PUT', apiVersion: '2.0.0', body: patch },
      );
      return result.ok ? { ok: true, httpStatus: result.httpStatus, data: normalizeSettings(result.data) } : result;
    },

    async onboard(entityId) {
      const result = await call(
        `/${encodeURIComponent(entityId)}/agent_onboarding`,
        { method: 'POST', apiVersion: '2.0.0', body: {} },
      );
      return result.ok ? { ok: true, httpStatus: result.httpStatus, data: normalizeOnboarding(result.data) } : result;
    },

    async createSkill(entityId, body, agentId) {
      const suffix = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
      const result = await call(
        `/${encodeURIComponent(entityId)}/agent_config/skills${suffix}`,
        { method: 'POST', apiVersion: '2.0.0', body },
      );
      return result.ok ? { ok: true, httpStatus: result.httpStatus, data: normalizeSkill(result.data) } : result;
    },

    async updateThreadControl(phoneNumberId, body) {
      const result = await call(
        `/business/whatsapp/phone_numbers/${encodeURIComponent(phoneNumberId)}/thread_control`,
        { method: 'POST', apiVersion: '1.0.0', body },
      );
      return result.ok ? { ok: true, httpStatus: result.httpStatus, data: normalizeThreadControl(result.data) } : result;
    },
  };
}
