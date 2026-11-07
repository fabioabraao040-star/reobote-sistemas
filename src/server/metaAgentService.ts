// Useful reference: this file is intentionally structured without `this`.
// ============================================================================
// ORQUESTRAÇÃO META BUSINESS AGENT (somente backend)
// ============================================================================
// Regras implementadas:
//   - Só chama APIs oficiais confirmadas na documentação
//     (agent_eligibility, agent_onboarding, agent_config/settings e o endpoint
//     Cloud API de thread_control).
//   - Nunca presume sucesso: status connected só após resposta 2xx da Meta.
//   - Idempotência: connect repetido não re-onboard quando meta_agent_id já
//     existe e está confirmado.
//   - Handoff humano: quando o REOBOTE envia mensagem, o controle da conversa
//     passa implicitamente ao REOBOTE (comportamento oficial). A retomada pelo
//     agente é feita chamando thread_control com action release.
//   - Sem secrets em logs: erros são sanitizados pelo cliente; o token de
//     whatsapp_configs fica em memória e nunca é retornado.

import { type MetaAgentClient, type MetaAgentSettings } from './metaAgentClient.js';
import type { MetaAgentIntegrationRecord, MetaAgentStore, MetaAgentStatus } from './metaAgentStore.js';

export type { MetaAgentStatus };

export interface MetaAgentWhatsAppConfig {
  id: string;
  phoneNumberId: string;
  accessToken: string;
  isVerified: boolean;
  phoneNumber: string | null;
}

export interface MetaAgentConversationOwner {
  companyId: string;
  contactPhone: string | null;
}

export interface MetaAgentView {
  integration: {
    id: string;
    status: MetaAgentStatus;
    metaAgentId: string | null;
    updatedAt: string | null;
  } | null;
  live: {
    checked: boolean;
    agentIdFound: boolean;
    rolloutEnabled: boolean | null;
    aiAudience: string | null;
    handoff: { enabled: boolean; messageSelection: string | null } | null;
    isEligible: boolean | null;
    errorKind: 'meta' | 'not-configured' | 'persist' | 'none';
    errorDetail: string | null;
  };
  lastEvents: Array<{ eventType: string; outcome: string; errorCode: string | null; createdAt: string }>;
}

export interface MetaAgentServiceDependencies {
  store: MetaAgentStore;
  getWhatsAppConfig(companyId: string): Promise<MetaAgentWhatsAppConfig | null>;
  createClient(accessToken: string): MetaAgentClient;
  getConversationOwner(conversationId: string): Promise<MetaAgentConversationOwner | null>;
}

export type MetaAgentActionResult =
  | { ok: true; message: string; view: MetaAgentView | null; agentId?: string }
  | { ok: false; message: string; view: MetaAgentView | null; agentId?: null };

export type MetaAgentConnectResult =
  | { ok: true; message: string; view: MetaAgentView | null; agentId: string; status: MetaAgentStatus }
  | { ok: false; message: string; view: MetaAgentView | null; agentId: null; status: MetaAgentStatus };

export interface MetaAgentService {
  getView(companyId: string, opts?: { refresh?: boolean }): Promise<MetaAgentView>;
  verify(companyId: string): Promise<MetaAgentActionResult>;
  connect(companyId: string): Promise<MetaAgentConnectResult>;
  setRollout(companyId: string, enabled: boolean): Promise<MetaAgentActionResult>;
  releaseHandoff(companyId: string, conversationId: string): Promise<{ ok: boolean; message: string; requestId: string | null }>;
  listRecentEvents(companyId: string, limit?: number): Promise<{ events: MetaAgentView['lastEvents']; error: string | null }>;
}

const META_TOS_ERROR_CODE = '403';
const NO_AGENT_FOUND = 'A Meta não retornou configuração deste agente.';

const REOBOTE_SKILL_BODY = [
  'Você é o agente oficial do escritório de advocacia REOBOTE no WhatsApp.',
  'Horário de atendimento humano: segunda a sexta das 08h às 17h; sábado das 08h às 12h.',
  'Você pode: identificar o cliente, coletar informações administrativas, identificar o assunto geral, informar horários de funcionamento e encaminhar solicitações para atendentes.',
  'Você NÃO pode: dar parecer jurídico, interpretar processos, elaborar petições, prometer resultados judiciais ou substituir um advogado.',
  'Quando o cliente pedir atendimento humano, informe que um atendente assumirá a conversa e pare de responder.',
  'Nunca solicite nem repita dados sensíveis (CPF, documentos, senhas, dados bancários) em texto livre.',
  'Mantenha respostas curtas, cordiais e em português do Brasil.',
].join(' ');

function detailOf(
  result: { error?: { title: string; detail: string } | null; networkError?: string },
): string {
  if (result.error) {
    const title = result.error.title || 'Erro na Meta';
    if (!result.error.detail) return title;
    return `${title}: ${result.error.detail}`;
  }
  if (result.networkError === 'timeout') return 'Tempo esgotado ao contatar a Meta.';
  return 'Falha de rede ao contatar a Meta.';
}

type MetaCallErrorLike = {
  error?: { status: number; title: string; detail: string; code: string | null } | null;
  networkError?: string;
};

// Código de evento observável e sanitizado: preserva HTTP status, código e
// título da Meta sem gravar detalhes potencialmente sensíveis ou o token.
function sanitizeEventCode(value: unknown, max = 30): string {
  return String(value ?? '')
    .replace(/[^0-9A-Za-z_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max);
}

function metaErrorCode(result: MetaCallErrorLike): string | null {
  if (result.networkError) {
    return `network:${sanitizeEventCode(result.networkError) || 'unknown'}`;
  }
  if (!result.error) return null;
  const status = Number.isFinite(result.error.status) ? result.error.status : 'na';
  const code = result.error.code ? sanitizeEventCode(result.error.code) : 'none';
  const title = result.error.title ? sanitizeEventCode(result.error.title) : '';
  return `http:${status};code:${code}${title ? `;title:${title}` : ''}`;
}

export function createMetaAgentService(deps: MetaAgentServiceDependencies): MetaAgentService {
  const store = deps.store;

  async function requireConfig(companyId: string): Promise<{ config: MetaAgentWhatsAppConfig; client: MetaAgentClient } | null> {
    const config = await deps.getWhatsAppConfig(companyId);
    if (!config?.isVerified || !config.accessToken || !config.phoneNumberId) return null;
    return { config, client: deps.createClient(config.accessToken) };
  }

  async function loadIntegration(companyId: string): Promise<MetaAgentIntegrationRecord | null> {
    const { data } = await store.getIntegrationByCompany(companyId);
    return data ?? null;
  }

  async function ensureIntegration(
    companyId: string,
  ): Promise<{ integration: MetaAgentIntegrationRecord | null; error: string | null }> {
    const existing = await loadIntegration(companyId);
    if (existing) return { integration: existing, error: null };

    const config = await deps.getWhatsAppConfig(companyId);
    if (!config) {
      return { integration: null, error: 'Configure o WhatsApp oficial antes de criar a integração.' };
    }
    const { data: created, error } = await store.createIntegration(companyId, config.id);
    if (error || !created) {
      return { integration: null, error: 'Erro ao registrar a integração no banco.' };
    }
    return { integration: created, error: null };
  }

  type SettingsSync =
    | { kind: 'ok'; settings: MetaAgentSettings | null }
    | { kind: 'meta-error'; detail: string }
    | { kind: 'persist-error'; detail: string };

  async function readSettings(
    integration: MetaAgentIntegrationRecord,
    client: MetaAgentClient,
    config: MetaAgentWhatsAppConfig,
  ): Promise<SettingsSync> {
    const response = await client.getSettings(config.phoneNumberId, integration.metaAgentId);
    if (!response.ok) {
      await store.recordEvent({
        integrationId: integration.id,
        eventType: 'settings_read',
        outcome: 'failed',
        errorCode: metaErrorCode(response),
      });
      return { kind: 'meta-error', detail: detailOf(response) };
    }

    const match =
      (integration.metaAgentId
        ? response.data.find((item) => item.agentId === integration.metaAgentId)
        : null) ??
      response.data[0] ??
      null;

    await store.recordEvent({
      integrationId: integration.id,
      eventType: 'settings_read',
      outcome: 'ok',
      errorCode: null,
    });

    if (!match || !match.agentId) {
      return { kind: 'ok', settings: null };
    }

    if (match.agentId !== integration.metaAgentId) {
      const persistError = await store.setMetaAgentId(integration.id, match.agentId, integration.status);
      if (persistError) {
        return { kind: 'persist-error', detail: 'Erro ao persistir o agente no banco.' };
      }
    }

    return { kind: 'ok', settings: match };
  }

  function mapStatusAfterSettings(current: MetaAgentStatus): MetaAgentStatus {
    // connected = agente existe e foi confirmado por leitura real.
    // disabled   = REOBOTE desativou explicitamente (persistido).
    // pending    = ainda sem agente confirmado (não passa por settings read).
    // error      = última ação falhou, mas uma leitura confirmada recupera o estado.
    // Qualquer settings read confirmado prova que o agente existe; somente uma
    // desativação explícita do REOBOTE é preservada.
    return current === 'disabled' ? 'disabled' : 'connected';
  }

  async function getView(companyId: string, opts?: { refresh?: boolean }): Promise<MetaAgentView> {
    const integration = await loadIntegration(companyId);
    const view: MetaAgentView = {
      integration: integration
        ? {
            id: integration.id,
            status: integration.status,
            metaAgentId: integration.metaAgentId,
            updatedAt: integration.updatedAt,
          }
        : null,
      live: {
        checked: false,
        agentIdFound: false,
        rolloutEnabled: null,
        aiAudience: null,
        handoff: null,
        isEligible: null,
        errorKind: 'none',
        errorDetail: null,
      },
      lastEvents: [],
    };

    if (integration) {
      const { data: events } = await store.listEvents(integration.id, 10);
      view.lastEvents = events.map((event) => ({
        eventType: event.eventType,
        outcome: event.outcome,
        errorCode: event.errorCode,
        createdAt: event.createdAt,
      }));
    }

    if (!opts?.refresh || !integration) return view;

    const env = await requireConfig(companyId);
    if (!env) {
      view.live.checked = true;
      view.live.errorKind = 'not-configured';
      view.live.errorDetail = 'A integração exige a configuração oficial do WhatsApp ativa.';
      return view;
    }
    const { config, client } = env;

    // A elegibilidade é consultável mesmo antes dos termos serem aceitos.
    const eligibility = await client.getEligibility(config.phoneNumberId);
    const eligibilityErrorCode = eligibility.ok ? null : metaErrorCode(eligibility);
    view.live.isEligible = eligibility.ok ? eligibility.data.isEligible : null;
    if (!eligibility.ok) {
      await store.recordEvent({
        integrationId: integration.id,
        eventType: 'eligibility',
        outcome: 'failed',
        errorCode: eligibilityErrorCode,
      });
    }

    const sync =
      integration.metaAgentId || integration.status !== 'pending'
        ? await readSettings(integration, client, config)
        : null;

    if (sync?.kind === 'meta-error') {
      view.live.checked = true;
      view.live.errorKind = 'meta';
      view.live.errorDetail = sync.detail;
      await store.setStatus(integration.id, 'error');
      return view;
    }
    if (sync?.kind === 'persist-error') {
      view.live.checked = true;
      view.live.errorKind = 'persist';
      view.live.errorDetail = sync.detail;
      return view;
    }

    const settings = sync?.kind === 'ok' ? sync.settings : null;
    if (settings) {
      const effectiveAgentId = settings.agentId || integration.metaAgentId;
      const nextStatus = mapStatusAfterSettings(integration.status);
      const refresh = {
        id: integration.id,
        status: nextStatus,
        metaAgentId: effectiveAgentId,
        updatedAt: integration.updatedAt,
      } as const;
      if (nextStatus !== integration.status) {
        const statusError = await store.setStatus(integration.id, nextStatus);
        if (!statusError) view.integration = refresh;
      } else {
        view.integration = refresh;
      }
      view.live.agentIdFound = Boolean(settings.agentId);
      view.live.rolloutEnabled = settings.rollout.enabled;
      view.live.aiAudience = settings.aiAudience;
      view.live.handoff = settings.handoff
        ? { enabled: settings.handoff.enabled, messageSelection: settings.handoff.messageSelection ?? null }
        : null;
    }

    view.live.checked = true;
    return view;
  }

  async function currentView(companyId: string): Promise<MetaAgentView> {
    const refreshed = await getView(companyId, { refresh: true });
    return refreshed;
  }

  const service: MetaAgentService = {
    async getView(companyId, opts) {
      return getView(companyId, { refresh: opts?.refresh ?? false });
    },

    async verify(companyId) {
      const integration = await loadIntegration(companyId);
      if (!integration) {
        return {
          ok: false,
          message: 'Nenhuma integração registrada. Conecte o agente primeiro.',
          view: await this.getView(companyId),
        };
      }

      const view = await currentView(companyId);
      const live = view.live;
      if (live.errorKind === 'persist') {
        return { ok: false, message: live.errorDetail ?? 'Erro de persistência.', view };
      }
      if (live.errorKind === 'not-configured') {
        return { ok: false, message: live.errorDetail ?? 'Configuração do WhatsApp indisponível.', view };
      }
      if (live.errorKind === 'meta') {
        return { ok: false, message: live.errorDetail ?? NO_AGENT_FOUND, view };
      }
      if (live.isEligible === false) {
        return {
          ok: false,
          message:
            'A Meta informa que este número ainda não é elegível ao Meta Business Agent.',
          view,
        };
      }
      if (live.agentIdFound) {
        return { ok: true, message: 'Agente confirmado na Meta durante a verificação.', view };
      }
      return { ok: true, message: 'Verificação concluída. Agente ainda não criado.', view };
    },

    async connect(companyId) {
      const env = await requireConfig(companyId);
      if (!env) {
        return {
          ok: false,
          agentId: null,
          status: 'pending',
          message: 'Configure e valide o WhatsApp oficial antes de conectar o agente.',
          view: null,
        };
      }
      const { config, client } = env;

      const ensured = await ensureIntegration(companyId);
      if (!ensured.integration) {
        return { ok: false, agentId: null, status: 'pending', message: ensured.error ?? 'Erro.', view: null };
      }
      const integration = ensured.integration;

      if (integration.metaAgentId && integration.status === 'connected') {
        return {
          ok: true,
          status: 'connected',
          agentId: integration.metaAgentId,
          message: 'A integração já está conectada e confirmada na Meta.',
          view: await currentView(companyId),
        };
      }

      const eligibility = await client.getEligibility(config.phoneNumberId);
      if (!eligibility.ok) {
        await store.setStatus(integration.id, 'error');
        await store.recordEvent({
          integrationId: integration.id,
          eventType: 'eligibility',
          outcome: 'failed',
          errorCode: metaErrorCode(eligibility),
        });
        return { ok: false, agentId: null, status: 'error', message: detailOf(eligibility), view: await getView(companyId) };
      }
      await store.recordEvent({
        integrationId: integration.id,
        eventType: 'eligibility',
        outcome: 'ok',
        errorCode: null,
      });

      if (!eligibility.data.isEligible) {
        return {
          ok: false,
          agentId: null,
          status: 'pending',
          message:
            'A Meta informa que este número não é elegível (verifique vertical, país, termo do Meta Business Agent e banimento).',
          view: await getView(companyId),
        };
      }

      const onboarding = await client.onboard(config.phoneNumberId);
      if (!onboarding.ok) {
        const errorCode = onboarding.error?.code ?? onboarding.networkError ?? null;
        const eventCode = metaErrorCode(onboarding);
        await store.setStatus(integration.id, 'error');
        await store.recordEvent({
          integrationId: integration.id,
          eventType: 'onboarding',
          outcome: 'failed',
          errorCode: eventCode,
        });
        const message =
          errorCode === META_TOS_ERROR_CODE
            ? 'Os Termos de Serviço do Meta Business Agent ainda não foram aceitos no WhatsApp Manager.'
            : detailOf(onboarding);
        return { ok: false, agentId: null, status: 'error', message, view: await getView(companyId) };
      }

      const agentId = onboarding.data.agentId;
      if (!agentId) {
        await store.setStatus(integration.id, 'error');
        await store.recordEvent({
          integrationId: integration.id,
          eventType: 'onboarding',
          outcome: 'failed',
          errorCode: 'no-agent-id',
        });
        return {
          ok: false,
          agentId: null,
          status: 'error',
          message: 'A Meta aceitou o onboarding mas não devolveu o identificador do agente.',
          view: await getView(companyId),
        };
      }

      const persistError = await store.setMetaAgentId(integration.id, agentId, 'connected');
      if (persistError) {
        await store.setStatus(integration.id, 'error');
        await store.recordEvent({
          integrationId: integration.id,
          eventType: 'onboarding',
          outcome: 'failed',
          errorCode: 'persist',
        });
        return {
          ok: false,
          agentId: null,
          status: 'error',
          message: 'A Meta criou o agente, mas houve erro ao gravar no banco.',
          view: null,
        };
      }
      await store.recordEvent({
        integrationId: integration.id,
        eventType: 'onboarding',
        outcome: 'ok',
        errorCode: null,
      });

      // Confirmação real: leitura das settings logo após o onboarding.
      const confirm = await readSettings(
        { ...integration, metaAgentId: agentId },
        client,
        config,
      );
      const confirmedSettings = confirm.kind === 'ok' ? confirm.settings : null;
      if (!confirmedSettings) {
        if (confirm.kind === 'meta-error' || confirm.kind === 'ok') {
          await store.setStatus(integration.id, 'pending');
        }
        return {
          ok: true,
          status: 'pending',
          agentId,
          message:
            'Onboarding aceito pela Meta. A confirmação por leitura ainda não retornou; use "Verificar conexão" no painel em alguns instantes.',
          view: null,
        };
      }

      const status = mapStatusAfterSettings('connected');
      await store.setStatus(integration.id, status);

      // Regras de atendimento (§7): skill padrão REOBOTE, best-effort. Falha na
      // criação da skill não derruba o connect (o agente já existe na Meta).
      const skillResult = await client.createSkill(
        config.phoneNumberId,
        {
          title: 'reobote-regras-atendimento',
          description:
            'Aplicar em todas as conversas do WhatsApp para definir o escopo administrativo do atendimento REOBOTE.',
          skill: REOBOTE_SKILL_BODY,
        },
        integration.metaAgentId,
      );
      const skillErrorCode = skillResult.ok ? null : metaErrorCode(skillResult);
      await store.recordEvent({
        integrationId: integration.id,
        eventType: 'skill_create',
        outcome: skillResult.ok ? 'ok' : 'failed',
        errorCode: skillErrorCode,
      });

      return {
        ok: true,
        status,
        agentId,
        message: 'Agente criado e confirmado na Meta.',
        view: await currentView(companyId),
      };
    },

    async setRollout(companyId, enabled) {
      const integration = await loadIntegration(companyId);
      if (!integration) {
        return { ok: false, message: 'Nenhuma integração registrada. Conecte o agente primeiro.', view: null };
      }
      const env = await requireConfig(companyId);
      if (!env) {
        return { ok: false, message: 'Configuração do WhatsApp indisponível no servidor.', view: null };
      }
      const { config, client } = env;
      if (!integration.metaAgentId) {
        return { ok: false, message: 'O agente ainda não foi criado na Meta.', view: null };
      }

      const update = await client.updateSettings(
        config.phoneNumberId,
        { rollout: { enabled } },
        integration.metaAgentId,
      );
      if (!update.ok) {
        await store.setStatus(integration.id, 'error');
        await store.recordEvent({
          integrationId: integration.id,
          eventType: enabled ? 'enable' : 'disable',
          outcome: 'failed',
          errorCode: metaErrorCode(update),
        });
        const billingHint = enabled && update.error?.code === '400'
          ? ' A Meta exige método de pagamento anexado para ativar para todos os públicos (ai_audience = EVERYONE).'
          : '';
        return { ok: false, message: detailOf(update) + billingHint, view: await getView(companyId) };
      }

      const confirmed = update.data.find((item) => item.agentId === integration.metaAgentId) ?? update.data[0] ?? null;
      const nextStatus: MetaAgentStatus = enabled ? 'connected' : 'disabled';
      const persistError = await store.setStatus(integration.id, nextStatus);
      await store.recordEvent({
        integrationId: integration.id,
        eventType: enabled ? 'enable' : 'disable',
        outcome: 'ok',
        errorCode: null,
      });
      if (persistError) {
        return {
          ok: false,
          message: 'A Meta aplicou a mudança, mas houve erro ao gravar o status local.',
          view: null,
        };
      }

      return {
        ok: true,
        message: enabled
          ? 'Agente ativado: responde a novas conversas conforme a Meta confirmou.'
          : 'Agente desativado: ele para de responder a novas conversas (controle do REOBOTE permanece humano).',
        view: await currentView(companyId),
      };
    },

    async releaseHandoff(companyId, conversationId) {
      const integration = await loadIntegration(companyId);
      if (!integration?.metaAgentId) {
        return {
          ok: false,
          message: 'Integração Meta Business Agent não está conectada.',
          requestId: null,
        };
      }
      const env = await requireConfig(companyId);
      if (!env) {
        return { ok: false, message: 'Configuração do WhatsApp indisponível no servidor.', requestId: null };
      }
      const { config, client } = env;

      const conversation = await deps.getConversationOwner(conversationId);
      if (!conversation || conversation.companyId !== companyId) {
        return { ok: false, message: 'Conversa não encontrada na sua empresa.', requestId: null };
      }
      const consumerPhone = (conversation.contactPhone ?? '').replace(/\D/g, '');
      if (!consumerPhone) {
        return { ok: false, message: 'A conversa não tem telefone de consumidor válido.', requestId: null };
      }

      const result = await client.updateThreadControl(config.phoneNumberId, {
        action: 'release',
        to: consumerPhone,
        metadata: `reobote-v1:conv:${conversationId}`.slice(0, 2000),
      });
      if (!result.ok) {
        await store.recordEvent({
          integrationId: integration.id,
          eventType: 'handoff_release',
          outcome: 'failed',
          errorCode: metaErrorCode(result),
        });
        return { ok: false, message: detailOf(result), requestId: null };
      }

      await store.recordEvent({
        integrationId: integration.id,
        eventType: 'handoff_release',
        outcome: 'ok',
        errorCode: null,
      });
      return {
        ok: true,
        message: 'Controle devolvido à Meta Business Agent conforme a Meta confirmou.',
        requestId: result.data.requestId,
      };
    },

    async listRecentEvents(companyId, limit = 30) {
      const integration = await loadIntegration(companyId);
      if (!integration) return { events: [], error: null };
      const { data, error } = await store.listEvents(integration.id, limit);
      return {
        events: data.map((event) => ({
          eventType: event.eventType,
          outcome: event.outcome,
          errorCode: event.errorCode,
          createdAt: event.createdAt,
        })),
        error: error ? 'Erro ao carregar o histórico de eventos.' : null,
      };
    },
  };

  return service;
}
