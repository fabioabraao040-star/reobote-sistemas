import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EmergencyAIAuditRow,
  EmergencyAIConfigRow,
  EmergencyAIIntegrationState,
  WhatsAppIntegrationRow,
} from '../utils/emergencyAI.js';

export interface EmergencyAIStoreResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface SetEmergencyAIEnabledInput {
  enabled: boolean;
  actorId: string;
  actorName: string;
  reason: string | null;
  whatsappStatus: EmergencyAIIntegrationState;
}

export interface SetEmergencyAIEnabledStoreResult {
  data: EmergencyAIConfigRow | null;
  changed: boolean;
  error: { message: string } | null;
}

export interface EmergencyAIStore {
  getConfig(): Promise<EmergencyAIStoreResult<EmergencyAIConfigRow>>;
  getWhatsAppConfig(): Promise<EmergencyAIStoreResult<WhatsAppIntegrationRow>>;
  setEnabled(input: SetEmergencyAIEnabledInput): Promise<SetEmergencyAIEnabledStoreResult>;
  listAudit(limit: number): Promise<EmergencyAIStoreResult<EmergencyAIAuditRow[]>>;
}

const CONFIG_COLUMNS = [
  'id',
  'company_id',
  'enabled',
  'provider',
  'model',
  'integration_status',
  'last_changed_by',
  'last_changed_by_name',
  'last_changed_at',
  'created_at',
  'updated_at',
].join(', ');

const AUDIT_COLUMNS = [
  'id',
  'config_id',
  'company_id',
  'action',
  'actor_id',
  'actor_name',
  'previous_enabled',
  'new_enabled',
  'result',
  'reason',
  'integration_status',
  'created_at',
].join(', ');

/**
 * A escrita é feita por uma função SQL atômica. Ela serializa as operações com
 * advisory lock, atualiza a configuração e grava a auditoria na mesma transação.
 * Assim duas chamadas concorrentes não produzem estados divergentes e uma falha
 * de persistência não pode ser apresentada como sucesso.
 */
export function createSupabaseEmergencyAIStore(
  getClient: () => SupabaseClient | null
): EmergencyAIStore {
  return {
    async getConfig() {
      const client = getClient();
      if (!client) return { data: null, error: { message: 'Supabase não configurado.' } };

      const { data, error } = await client
        .from('emergency_ai_configs')
        .select(CONFIG_COLUMNS)
        .is('company_id', null)
        .maybeSingle();

      return {
        data: (data as EmergencyAIConfigRow | null) ?? null,
        error: error ? { message: error.message } : null,
      };
    },

    async getWhatsAppConfig() {
      const client = getClient();
      if (!client) return { data: null, error: { message: 'Supabase não configurado.' } };

      // A credencial é lida apenas para verificar se a integração está completa.
      // Ela nunca é repassada para a resposta HTTP.
      const { data, error } = await client
        .from('whatsapp_configs')
        .select('is_verified, phone_number_id, access_token, last_health_check')
        .limit(1)
        .maybeSingle();

      return {
        data: (data as WhatsAppIntegrationRow | null) ?? null,
        error: error ? { message: error.message } : null,
      };
    },

    async setEnabled(input) {
      const client = getClient();
      if (!client) return { data: null, changed: false, error: { message: 'Supabase não configurado.' } };

      const { data, error } = await client.rpc('set_emergency_ai_enabled', {
        p_enabled: input.enabled,
        p_actor_id: input.actorId,
        p_actor_name: input.actorName,
        p_reason: input.reason,
        p_whatsapp_status: input.whatsappStatus,
      });

      if (error) return { data: null, changed: false, error: { message: error.message } };

      const payload = data && typeof data === 'object' ? data as Record<string, unknown> : null;
      const config = payload?.config;

      if (!config || typeof config !== 'object') {
        return { data: null, changed: false, error: { message: 'Resposta inválida da persistência.' } };
      }

      return {
        data: config as EmergencyAIConfigRow,
        changed: payload?.changed === true,
        error: null,
      };
    },

    async listAudit(limit) {
      const client = getClient();
      if (!client) return { data: null, error: { message: 'Supabase não configurado.' } };

      const { data, error } = await client
        .from('emergency_ai_audit_logs')
        .select(AUDIT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(limit);

      return {
        data: (data as EmergencyAIAuditRow[] | null) ?? null,
        error: error ? { message: error.message } : null,
      };
    },
  };
}
