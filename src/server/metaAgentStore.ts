// ============================================================================
// PERSISTÊNCIA DA INTEGRAÇÃO META BUSINESS AGENT (Supabase, service_role)
// ============================================================================
// Reutiliza EXCLUSIVAMENTE as estruturas já existentes no banco:
//   - public.meta_business_agent_integrations
//     (id, company_id, whatsapp_config_id, meta_agent_id, status, created_at, updated_at)
//   - public.meta_business_agent_events
//     (id, integration_id, event_type, outcome, error_code, created_at)
//
// Estados válidos de integrations.status: pending | connected | error | disabled
//
// Nenhuma migration é criada aqui. Consultas sempre com colunas explícitas
// (nunca SELECT *). Registro de eventos é best-effort: falha de log não derruba
// a operação que o gerou.

import type { SupabaseClient } from '@supabase/supabase-js';

export const META_AGENT_STATUSES = ['pending', 'connected', 'error', 'disabled'] as const;
export type MetaAgentStatus = (typeof META_AGENT_STATUSES)[number];

export interface MetaAgentIntegrationRecord {
  id: string;
  companyId: string;
  whatsappConfigId: string;
  metaAgentId: string | null;
  status: MetaAgentStatus;
  updatedAt: string | null;
}

export interface MetaAgentEventRecord {
  id: string;
  eventType: string;
  outcome: string;
  errorCode: string | null;
  createdAt: string;
}

export interface SupabaseQueryErrorLike {
  code?: string;
  message?: string;
}

export type StoreError = { code?: string; message?: string } | null;

export interface MetaAgentStore {
  getIntegrationByCompany(
    companyId: string,
  ): Promise<{ data: MetaAgentIntegrationRecord | null; error: StoreError }>;
  createIntegration(
    companyId: string,
    whatsappConfigId: string,
  ): Promise<{ data: MetaAgentIntegrationRecord | null; error: StoreError }>;
  setMetaAgentId(
    integrationId: string,
    agentId: string,
    status: MetaAgentStatus,
  ): Promise<StoreError>;
  setStatus(integrationId: string, status: MetaAgentStatus): Promise<StoreError>;
  recordEvent(input: {
    integrationId: string;
    eventType: string;
    outcome: string;
    errorCode?: string | null;
  }): Promise<StoreError>;
  listEvents(integrationId: string, limit: number): Promise<{
    data: MetaAgentEventRecord[];
    error: StoreError;
  }>;
}

export interface StoreDependencies {
  getSupabase: () => SupabaseClient | null;
}

// Normaliza para o formato interno (snake_case → camelCase) sem propagar campos
// desconhecidos do banco para o resto do código.
function normalizeIntegration(raw: Record<string, unknown> | null): MetaAgentIntegrationRecord | null {
  if (!raw) return null;
  const status = String(raw.status ?? 'pending') as MetaAgentStatus;
  return {
    id: String(raw.id ?? ''),
    companyId: String(raw.company_id ?? ''),
    whatsappConfigId: String(raw.whatsapp_config_id ?? ''),
    metaAgentId: typeof raw.meta_agent_id === 'string' && raw.meta_agent_id ? raw.meta_agent_id : null,
    status: META_AGENT_STATUSES.includes(status) ? status : 'pending',
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  };
}

function normalizeEvent(raw: Record<string, unknown>): MetaAgentEventRecord {
  return {
    id: String(raw.id ?? ''),
    eventType: String(raw.event_type ?? ''),
    outcome: String(raw.outcome ?? ''),
    errorCode: typeof raw.error_code === 'string' ? raw.error_code : null,
    createdAt: String(raw.created_at ?? ''),
  };
}

export function createMetaAgentStore(deps: StoreDependencies): MetaAgentStore {
  const tableId = () => deps.getSupabase()!.from('meta_business_agent_integrations');
  const tableEvents = () => deps.getSupabase()!.from('meta_business_agent_events');

  async function findUniqueCode(error: unknown): Promise<SupabaseQueryErrorLike | null> {
    // Supabase devolve code '23505' para duplicidade (unique constraint).
    return error && typeof error === 'object' ? (error as SupabaseQueryErrorLike) : null;
  }

  return {
    async getIntegrationByCompany(companyId) {
      if (!deps.getSupabase()) return { data: null, error: { code: 'no-supabase' } };
      const { data, error } = await tableId()
        .select('id, company_id, whatsapp_config_id, meta_agent_id, status, updated_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { data: null, error };
      return { data: normalizeIntegration(data as Record<string, unknown> | null), error: null };
    },

    async createIntegration(companyId, whatsappConfigId) {
      if (!deps.getSupabase()) return { data: null, error: { code: 'no-supabase' } };
      const { data, error } = await tableId()
        .insert({
          company_id: companyId,
          whatsapp_config_id: whatsappConfigId,
          status: 'pending',
        })
        .select('id, company_id, whatsapp_config_id, meta_agent_id, status, updated_at')
        .single();

      const duplicate = await findUniqueCode(error);
      if (duplicate?.code === '23505') {
        // Concorrência benigna: reprocessa a leitura.
        const { data: existing, error: readError } = await tableId()
          .select('id, company_id, whatsapp_config_id, meta_agent_id, status, updated_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (readError) return { data: null, error: readError };
        return { data: normalizeIntegration(existing as Record<string, unknown> | null), error: null };
      }
      if (error) return { data: null, error };
      return { data: normalizeIntegration(data as Record<string, unknown>), error: null };
    },

    async setMetaAgentId(integrationId, agentId, status) {
      if (!deps.getSupabase()) return { code: 'no-supabase' };
      const { error } = await tableId()
        .update({ meta_agent_id: agentId, status, updated_at: new Date().toISOString() })
        .eq('id', integrationId);
      return (error as SupabaseQueryErrorLike) ?? null;
    },

    async setStatus(integrationId, status) {
      if (!deps.getSupabase()) return { code: 'no-supabase' };
      const { error } = await tableId()
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', integrationId);
      return (error as SupabaseQueryErrorLike) ?? null;
    },

    async recordEvent(input) {
      if (!deps.getSupabase()) return { code: 'no-supabase' };
      const { error } = await tableEvents().insert({
        integration_id: input.integrationId,
        event_type: input.eventType.slice(0, 100),
        outcome: input.outcome === 'ok' ? 'ok' : 'failed',
        error_code: input.errorCode ? input.errorCode.slice(0, 100) : null,
      });
      if (error) {
        // Nunca derrubar a operação por falha de auditoria.
        console.warn(
          '[Meta Business Agent] Falha ao registrar evento técnico:',
          (error as { code?: string; message?: string })?.code ?? 'erro'
        );
      }
      return (error as SupabaseQueryErrorLike) ?? null;
    },

    async listEvents(integrationId, limit) {
      if (!deps.getSupabase()) return { data: [], error: { code: 'no-supabase' } };
      const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 20)));
      const { data, error } = await tableEvents()
        .select('id, event_type, outcome, error_code, created_at')
        .eq('integration_id', integrationId)
        .order('created_at', { ascending: false })
        .limit(safeLimit);
      if (error) return { data: [], error: error as SupabaseQueryErrorLike };
      return {
        data: (data || []).map((row: Record<string, unknown>) => normalizeEvent(row)),
        error: null,
      };
    },
  };
}
