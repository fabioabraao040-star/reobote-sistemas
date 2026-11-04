// ============================================================================
// CLIENTE GOOGLE CALENDAR API v3 + OAUTH 2.0 (somente backend)
// ============================================================================
// Endpoints oficiais:
//   OAuth token: https://oauth2.googleapis.com/token
//   Auth URL:    https://accounts.google.com/o/oauth2/v2/auth
//   Calendar:    https://www.googleapis.com/calendar/v3
// Escopos mínimos: calendar.events (CRUD de eventos) + calendar.readonly (freeBusy).

import { withTimeout } from '../../monitoring.js';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  htmlLink?: string;
}

export interface GoogleFreeBusyResponse {
  calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
}

export type GoogleResult<T> =
  | { ok: true; httpStatus: number; data: T }
  | { ok: false; httpStatus: number | null; error: string; networkError?: string };

function withTimeoutFetch(promise: Promise<Response>, timeoutMs: number): Promise<Response> {
  return withTimeout(promise, timeoutMs, 'google-calendar');
}

function sanitizeError(value: unknown): string {
  if (value instanceof Error) {
    if (value.message === 'google-calendar') return 'Tempo esgotado ao contatar o Google.';
    return 'Falha de rede ao contatar o Google.';
  }
  return 'Falha ao contatar o Google.';
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

function errorFromPayload(status: number, payload: unknown): string {
  const raw = payload as { error?: { message?: string } | string; error_description?: string };
  if (raw && typeof raw === 'object') {
    if (typeof raw.error_description === 'string' && raw.error_description) return raw.error_description.slice(0, 300);
    if (typeof raw.error === 'string' && raw.error) return raw.error.slice(0, 300);
    if (raw.error && typeof raw.error === 'object' && typeof (raw.error as { message?: string }).message === 'string') {
      return (raw.error as { message: string }).message.slice(0, 300);
    }
  }
  return `HTTP ${status}`;
}

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createGoogleOAuthClient(config: GoogleOAuthClientConfig) {
  const timeoutMs = config.timeoutMs ?? 10_000;
  const doFetch = config.fetchImpl ?? fetch;

  async function postForm(url: string, params: Record<string, string>): Promise<GoogleResult<GoogleTokenResponse>> {
    try {
      const body = new URLSearchParams(params).toString();
      const res = await withTimeoutFetch(
        doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }),
        timeoutMs,
      );
      const payload = await readJson(res);
      if (!res.ok) {
        return { ok: false, httpStatus: res.status, error: errorFromPayload(res.status, payload) };
      }
      const data = payload as Partial<GoogleTokenResponse>;
      if (!data.access_token) {
        return { ok: false, httpStatus: res.status, error: 'Resposta do Google sem access_token.' };
      }
      return {
        ok: true,
        httpStatus: res.status,
        data: {
          access_token: String(data.access_token),
          refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
          expires_in: typeof data.expires_in === 'number' ? data.expires_in : 3600,
          scope: typeof data.scope === 'string' ? data.scope : undefined,
          token_type: typeof data.token_type === 'string' ? data.token_type : undefined,
        },
      };
    } catch (error) {
      return { ok: false, httpStatus: null, error: sanitizeError(error), networkError: sanitizeError(error) };
    }
  }

  return {
    async exchangeCode(code: string): Promise<GoogleResult<GoogleTokenResponse>> {
      return postForm(GOOGLE_TOKEN_URL, {
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      });
    },

    async refreshToken(refreshTokenValue: string): Promise<GoogleResult<GoogleTokenResponse>> {
      return postForm(GOOGLE_TOKEN_URL, {
        refresh_token: refreshTokenValue,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
      });
    },
  };
}

export interface GoogleCalendarClientConfig {
  accessToken: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createGoogleCalendarClient(config: GoogleCalendarClientConfig) {
  const timeoutMs = config.timeoutMs ?? 10_000;
  const doFetch = config.fetchImpl ?? fetch;
  const authHeaders = { Authorization: `Bearer ${config.accessToken}` };

  async function request<T>(path: string, init: { method: string; body?: unknown }): Promise<GoogleResult<T>> {
    try {
      const res = await withTimeoutFetch(
        doFetch(`${GOOGLE_CALENDAR_API_BASE}${path}`, {
          method: init.method,
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }),
        timeoutMs,
      );
      if (res.status === 204) {
        return { ok: true, httpStatus: res.status, data: undefined as T };
      }
      const payload = await readJson(res);
      if (!res.ok) {
        return { ok: false, httpStatus: res.status, error: errorFromPayload(res.status, payload) };
      }
      return { ok: true, httpStatus: res.status, data: payload as T };
    } catch (error) {
      return { ok: false, httpStatus: null, error: sanitizeError(error), networkError: sanitizeError(error) };
    }
  }

  return {
    async freeBusy(calendarId: string, timeMin: string, timeMax: string, timeZone: string): Promise<GoogleResult<GoogleFreeBusyResponse>> {
      return request<GoogleFreeBusyResponse>('/freeBusy', {
        method: 'POST',
        body: {
          timeMin,
          timeMax,
          timeZone,
          items: [{ id: calendarId }],
        },
      });
    },

    async listEvents(calendarId: string, timeMin: string, timeMax: string): Promise<GoogleResult<{ items?: GoogleCalendarEvent[] }>> {
      const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime' });
      return request<{ items?: GoogleCalendarEvent[] }>(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, {
        method: 'GET',
      });
    },

    async getEvent(calendarId: string, eventId: string): Promise<GoogleResult<GoogleCalendarEvent>> {
      return request<GoogleCalendarEvent>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: 'GET',
      });
    },

    async createEvent(calendarId: string, event: {
      summary: string;
      description?: string;
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
      attendees?: Array<{ email: string }>;
    }): Promise<GoogleResult<GoogleCalendarEvent>> {
      return request<GoogleCalendarEvent>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: event,
      });
    },

    async deleteEvent(calendarId: string, eventId: string): Promise<GoogleResult<void>> {
      return request<void>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
      });
    },
  };
}
