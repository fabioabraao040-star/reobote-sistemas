// ============================================================================
// SERVIÇO GOOGLE CALENDAR (somente backend)
// ============================================================================
// Orquestra OAuth 2.0 (Authorization Code), renovação de token, consulta de
// disponibilidade (freeBusy) e CRUD de eventos. Regras de negócio ficam aqui;
// o frontend apenas consome os endpoints.

import {
  createGoogleOAuthClient,
  createGoogleCalendarClient,
  GOOGLE_AUTH_URL,
  GOOGLE_CALENDAR_SCOPES,
  type GoogleCalendarEvent,
  type GoogleResult,
} from './googleCalendarClient.js';
import {
  createGoogleCalendarStore,
  type GoogleCalendarConnection,
  type GoogleCalendarStore,
} from './googleCalendarStore.js';
import {
  encryptToken,
  decryptToken,
  isCryptoConfigured,
  signState,
  verifyState,
} from './googleCalendarCrypto.js';

export interface GoogleCalendarServiceDependencies {
  store: GoogleCalendarStore;
  getClientConfig: () => { clientId: string; clientSecret: string; redirectUri: string } | null;
  getCalendarId: () => string;
  getTimeZone: () => string;
}

export interface GoogleCalendarStatus {
  connected: boolean;
  calendarId: string | null;
  scopes: string | null;
  tokenExpiry: string | null;
  lastChecked: string;
  error: string | null;
}

const REOBOTE_WORK_HOURS: Record<number, { start: number; end: number } | null> = {
  0: null, // domingo
  1: { start: 8, end: 17 },
  2: { start: 8, end: 17 },
  3: { start: 8, end: 17 },
  4: { start: 8, end: 17 },
  5: { start: 8, end: 17 },
  6: { start: 8, end: 12 },
};

export function createGoogleCalendarService(deps: GoogleCalendarServiceDependencies) {
  const store = deps.store;

  function oauthClient() {
    const cfg = deps.getClientConfig();
    if (!cfg) return null;
    return createGoogleOAuthClient(cfg);
  }

  async function getConnection(companyId: string): Promise<GoogleCalendarConnection | null> {
    const { data } = await store.getByCompany(companyId);
    return data ?? null;
  }

  // Garante access_token válido, renovando se necessário.
  async function ensureAccessToken(companyId: string): Promise<{ accessToken: string; connection: GoogleCalendarConnection } | { error: string }> {
    const connection = await getConnection(companyId);
    if (!connection) return { error: 'Google Calendar não conectado.' };

    let accessToken: string;
    try {
      accessToken = decryptToken(connection.encryptedAccessToken);
    } catch {
      return { error: 'Não foi possível ler o token armazenado.' };
    }

    const expired = connection.tokenExpiry ? new Date(connection.tokenExpiry).getTime() <= Date.now() + 60_000 : false;
    if (!expired) return { accessToken, connection };

    if (!connection.encryptedRefreshToken) {
      return { error: 'Token expirado e sem refresh_token. Reconecte o Google Calendar.' };
    }

    const client = oauthClient();
    if (!client) return { error: 'Configuração OAuth do Google ausente.' };

    let refreshTokenValue: string;
    try {
      refreshTokenValue = decryptToken(connection.encryptedRefreshToken);
    } catch {
      return { error: 'Não foi possível ler o refresh_token.' };
    }

    const result = await client.refreshToken(refreshTokenValue);
    if (!result.ok) {
      await store.updateTokens(connection.id, { encryptedAccessToken: connection.encryptedAccessToken, tokenExpiry: connection.tokenExpiry });
      return { error: `Falha ao renovar token: ${result.error}` };
    }

    let newEncrypted: string;
    try {
      newEncrypted = encryptToken(result.data.access_token);
    } catch {
      return { error: 'Falha ao armazenar token renovado.' };
    }

    const newExpiry = new Date(Date.now() + (result.data.expires_in || 3600) * 1000).toISOString();
    const updateError = await store.updateTokens(connection.id, { encryptedAccessToken: newEncrypted, tokenExpiry: newExpiry });
    if (updateError.error) {
      return { error: 'Falha ao persistir token renovado.' };
    }

    return { accessToken: result.data.access_token, connection };
  }

  function getCalendarId(connection: GoogleCalendarConnection | null): string {
    const fromConn = connection?.calendarId?.trim();
    if (fromConn) return fromConn;
    return deps.getCalendarId();
  }

  function buildAuthUrl(companyId: string, userId: string): string | null {
    const cfg = deps.getClientConfig();
    if (!cfg) return null;
    const state = signState({ companyId, userId });
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: GOOGLE_CALENDAR_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart < bEnd && bStart < aEnd;
  }

  function generateFreeSlots(busy: Array<{ start: string; end: string }>, timeMin: Date, timeMax: Date, durationMinutes: number, timeZone: string): Array<{ start: string; end: string }> {
    const slots: Array<{ start: string; end: string }> = [];
    const durationMs = durationMinutes * 60 * 1000;
    // Itera por dia
    const cursor = new Date(timeMin);
    while (cursor < timeMax) {
      const dayOfWeek = cursor.getDay();
      const hours = REOBOTE_WORK_HOURS[dayOfWeek];
      if (hours) {
        const dayStart = new Date(cursor);
        dayStart.setHours(hours.start, 0, 0, 0);
        const dayEnd = new Date(cursor);
        dayEnd.setHours(hours.end, 0, 0, 0);
        const effectiveStart = new Date(Math.max(dayStart.getTime(), timeMin.getTime()));
        const effectiveEnd = new Date(Math.min(dayEnd.getTime(), timeMax.getTime()));
        let slotStart = effectiveStart.getTime();
        while (slotStart + durationMs <= effectiveEnd.getTime()) {
          const slotEnd = slotStart + durationMs;
          const s = new Date(slotStart);
          const e = new Date(slotEnd);
          const conflict = busy.some((b) => overlaps(s, e, new Date(b.start), new Date(b.end)));
          if (!conflict) {
            slots.push({ start: s.toISOString(), end: e.toISOString() });
          }
          slotStart += 30 * 60 * 1000; // passo de 30 min
        }
      }
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
    }
    return slots;
  }

  return {
    isConfigured(): boolean {
      const cfg = deps.getClientConfig();
      return Boolean(cfg?.clientId && cfg?.clientSecret && cfg?.redirectUri) && isCryptoConfigured();
    },

    getAuthUrl(companyId: string, userId: string): string | null {
      return buildAuthUrl(companyId, userId);
    },

    async handleCallback(params: { code: string; state: string; expectedCompanyId: string }): Promise<{ ok: boolean; message: string }> {
      const verified = verifyState(params.state, params.expectedCompanyId);
      if (!verified) {
        return { ok: false, message: 'State OAuth inválido ou expirado (CSRF).' };
      }

      const client = oauthClient();
      if (!client) return { ok: false, message: 'Configuração OAuth do Google ausente.' };

      const result = await client.exchangeCode(params.code);
      if (!result.ok) {
        return { ok: false, message: `Falha ao trocar código: ${result.error}` };
      }

      if (!isCryptoConfigured()) {
        return { ok: false, message: 'GOOGLE_TOKEN_ENCRYPTION_KEY não configurada.' };
      }

      let encryptedAccess: string;
      let encryptedRefresh: string | null = null;
      try {
        encryptedAccess = encryptToken(result.data.access_token);
        if (result.data.refresh_token) {
          encryptedRefresh = encryptToken(result.data.refresh_token);
        }
      } catch {
        return { ok: false, message: 'Falha ao criptografar tokens.' };
      }

      const calendarId = deps.getCalendarId();
      const tokenExpiry = new Date(Date.now() + (result.data.expires_in || 3600) * 1000).toISOString();

      const { error } = await store.upsert({
        companyId: verified.companyId,
        userId: verified.userId,
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiry,
        calendarId,
        scopes: result.data.scope || GOOGLE_CALENDAR_SCOPES,
        status: 'connected',
      });

      if (error) {
        return { ok: false, message: 'Falha ao persistir conexão.' };
      }

      return { ok: true, message: 'Google Calendar conectado com sucesso.' };
    },

    async getStatus(companyId: string): Promise<GoogleCalendarStatus> {
      const connection = await getConnection(companyId);
      const now = new Date().toISOString();
      if (!connection) {
        return { connected: false, calendarId: null, scopes: null, tokenExpiry: null, lastChecked: now, error: null };
      }
      return {
        connected: connection.status === 'connected',
        calendarId: connection.calendarId,
        scopes: connection.scopes,
        tokenExpiry: connection.tokenExpiry,
        lastChecked: now,
        error: connection.status === 'error' ? 'Conexão com erro.' : null,
      };
    },

    async disconnect(companyId: string): Promise<{ ok: boolean; message: string }> {
      const { error } = await store.deleteByCompany(companyId);
      if (error) return { ok: false, message: 'Falha ao desconectar.' };
      return { ok: true, message: 'Google Calendar desconectado.' };
    },

    async getAvailability(companyId: string, params: { timeMin: string; timeMax: string; durationMinutes: number }): Promise<{ ok: boolean; message: string; slots?: Array<{ start: string; end: string }> }> {
      const tokenResult = await ensureAccessToken(companyId);
      if ('error' in tokenResult) return { ok: false, message: tokenResult.error };
      const { accessToken, connection } = tokenResult;
      const calendarId = getCalendarId(connection);
      const timeZone = deps.getTimeZone();

      const client = createGoogleCalendarClient({ accessToken });
      const freeBusy = await client.freeBusy(calendarId, params.timeMin, params.timeMax, timeZone);
      if (!freeBusy.ok) {
        return { ok: false, message: `Falha ao consultar disponibilidade: ${freeBusy.error}` };
      }
      const busy = freeBusy.data.calendars?.[calendarId]?.busy ?? [];
      const slots = generateFreeSlots(busy, new Date(params.timeMin), new Date(params.timeMax), params.durationMinutes, timeZone);
      return { ok: true, message: 'Disponibilidade consultada.', slots };
    },

    async createEvent(companyId: string, params: {
      summary: string;
      description?: string;
      start: string;
      end: string;
      attendeeEmail?: string;
    }): Promise<{ ok: boolean; message: string; event?: GoogleCalendarEvent }> {
      const tokenResult = await ensureAccessToken(companyId);
      if ('error' in tokenResult) return { ok: false, message: tokenResult.error };
      const { accessToken, connection } = tokenResult;
      const calendarId = getCalendarId(connection);
      const timeZone = deps.getTimeZone();

      // Verificação novamente (concorrência): consulta freeBusy para o slot exato.
      const client = createGoogleCalendarClient({ accessToken });
      const freeBusy = await client.freeBusy(calendarId, params.start, params.end, timeZone);
      if (!freeBusy.ok) {
        return { ok: false, message: `Falha ao verificar conflito: ${freeBusy.error}` };
      }
      const busy = freeBusy.data.calendars?.[calendarId]?.busy ?? [];
      const hasConflict = busy.some((b) => {
        const bs = new Date(b.start).getTime();
        const be = new Date(b.end).getTime();
        const ss = new Date(params.start).getTime();
        const se = new Date(params.end).getTime();
        return ss < be && bs < se;
      });
      if (hasConflict) {
        return { ok: false, message: 'Horário não está mais disponível.' };
      }

      const eventResult = await client.createEvent(calendarId, {
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.start, timeZone },
        end: { dateTime: params.end, timeZone },
        attendees: params.attendeeEmail ? [{ email: params.attendeeEmail }] : undefined,
      });

      if (!eventResult.ok) {
        return { ok: false, message: `Falha ao criar evento: ${eventResult.error}` };
      }
      return { ok: true, message: 'Evento criado com sucesso.', event: eventResult.data };
    },

    async cancelEvent(companyId: string, eventId: string): Promise<{ ok: boolean; message: string }> {
      const tokenResult = await ensureAccessToken(companyId);
      if ('error' in tokenResult) return { ok: false, message: tokenResult.error };
      const { accessToken, connection } = tokenResult;
      const calendarId = getCalendarId(connection);

      const client = createGoogleCalendarClient({ accessToken });
      const result = await client.deleteEvent(calendarId, eventId);
      if (!result.ok) {
        return { ok: false, message: `Falha ao cancelar evento: ${result.error}` };
      }
      return { ok: true, message: 'Evento cancelado com sucesso.' };
    },

    async getEvent(companyId: string, eventId: string): Promise<{ ok: boolean; message: string; event?: GoogleCalendarEvent }> {
      const tokenResult = await ensureAccessToken(companyId);
      if ('error' in tokenResult) return { ok: false, message: tokenResult.error };
      const { accessToken, connection } = tokenResult;
      const calendarId = getCalendarId(connection);

      const client = createGoogleCalendarClient({ accessToken });
      const result = await client.getEvent(calendarId, eventId);
      if (!result.ok) {
        return { ok: false, message: `Falha ao consultar evento: ${result.error}` };
      }
      return { ok: true, message: 'Evento consultado.', event: result.data };
    },
  };
}

export type GoogleCalendarService = ReturnType<typeof createGoogleCalendarService>;
