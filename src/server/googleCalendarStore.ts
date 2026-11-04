// ============================================================================
// PERSISTÊNCIA GOOGLE CALENDAR (Supabase, service_role)
// ============================================================================
// Tabela reutilizada/criada: public.google_calendar_integrations
// (id, company_id, user_id, encrypted_access_token, encrypted_refresh_token,
//  token_expiry, calendar_id, scopes, status, created_at, updated_at)
// Consultas sempre com colunas explícitas. RLS preservada (sem acesso anon/auth).

import type { SupabaseClient } from '@supabase/supabase-js';

export interface GoogleCalendarConnection {
  id: string;
  companyId: string;
  userId: string | null;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiry: string | null;
  calendarId: string;
  scopes: string | null;
  status: 'connected' | 'error' | 'disconnected';
  updatedAt: string | null;
}

export interface GoogleCalendarStore {
  getByCompany(companyId: string): Promise<{ data: GoogleCalendarConnection | null; error: { code?: string; message?: string } | null }>;
  upsert(connection: {
    companyId: string;
    userId: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
    tokenExpiry: string | null;
    calendarId: string;
    scopes: string;
    status: 'connected' | 'error';
  }): Promise<{ data: GoogleCalendarConnection | null; error: { code?: string; message?: string } | null }>;
  updateTokens(id: string, patch: {
    encryptedAccessToken: string;
    tokenExpiry: string | null;
  }): Promise<{ error: { code?: string; message?: string } | null }>;
  deleteByCompany(companyId: string): Promise<{ error: { code?: string; message?: string } | null }>;
}

export function createGoogleCalendarStore(getSupabase: () => SupabaseClient | null): GoogleCalendarStore {
  const table = () => getSupabase()!.from('google_calendar_integrations');

  function normalize(raw: Record<string, unknown> | null): GoogleCalendarConnection | null {
    if (!raw) return null;
    const status = String(raw.status ?? 'connected');
    return {
      id: String(raw.id ?? ''),
      companyId: String(raw.company_id ?? ''),
      userId: typeof raw.user_id === 'string' ? raw.user_id : null,
      encryptedAccessToken: String(raw.encrypted_access_token ?? ''),
      encryptedRefreshToken: typeof raw.encrypted_refresh_token === 'string' ? raw.encrypted_refresh_token : null,
      tokenExpiry: typeof raw.token_expiry === 'string' ? raw.token_expiry : null,
      calendarId: String(raw.calendar_id ?? ''),
      scopes: typeof raw.scopes === 'string' ? raw.scopes : null,
      status: status === 'error' ? 'error' : status === 'disconnected' ? 'disconnected' : 'connected',
      updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
    };
  }

  return {
    async getByCompany(companyId) {
      if (!getSupabase()) return { data: null, error: { code: 'no-supabase' } };
      const { data, error } = await table()
        .select('id, company_id, user_id, encrypted_access_token, encrypted_refresh_token, token_expiry, calendar_id, scopes, status, updated_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { data: null, error: error as { code?: string; message?: string } };
      return { data: normalize(data as Record<string, unknown> | null), error: null };
    },

    async upsert(connection) {
      if (!getSupabase()) return { data: null, error: { code: 'no-supabase' } };
      // Tenta update por company_id; se não existir, insert.
      const { data: existing } = await table()
        .select('id')
        .eq('company_id', connection.companyId)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { data, error } = await table()
          .update({
            user_id: connection.userId,
            encrypted_access_token: connection.encryptedAccessToken,
            encrypted_refresh_token: connection.encryptedRefreshToken,
            token_expiry: connection.tokenExpiry,
            calendar_id: connection.calendarId,
            scopes: connection.scopes,
            status: connection.status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select('id, company_id, user_id, encrypted_access_token, encrypted_refresh_token, token_expiry, calendar_id, scopes, status, updated_at')
          .single();
        if (error) return { data: null, error: error as { code?: string; message?: string } };
        return { data: normalize(data as Record<string, unknown>), error: null };
      }

      const { data, error } = await table()
        .insert({
          company_id: connection.companyId,
          user_id: connection.userId,
          encrypted_access_token: connection.encryptedAccessToken,
          encrypted_refresh_token: connection.encryptedRefreshToken,
          token_expiry: connection.tokenExpiry,
          calendar_id: connection.calendarId,
          scopes: connection.scopes,
          status: connection.status,
        })
        .select('id, company_id, user_id, encrypted_access_token, encrypted_refresh_token, token_expiry, calendar_id, scopes, status, updated_at')
        .single();
      if (error) return { data: null, error: error as { code?: string; message?: string } };
      return { data: normalize(data as Record<string, unknown>), error: null };
    },

    async updateTokens(id, patch) {
      if (!getSupabase()) return { error: { code: 'no-supabase' } };
      const { error } = await table()
        .update({
          encrypted_access_token: patch.encryptedAccessToken,
          token_expiry: patch.tokenExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      return { error: (error as { code?: string; message?: string }) ?? null };
    },

    async deleteByCompany(companyId) {
      if (!getSupabase()) return { error: { code: 'no-supabase' } };
      const { error } = await table().delete().eq('company_id', companyId);
      return { error: (error as { code?: string; message?: string }) ?? null };
    },
  };
}
