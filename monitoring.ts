import crypto from 'node:crypto';

export type MonitoringWhatsAppStatus =
  | 'connected'
  | 'configured'
  | 'not_configured'
  | 'unavailable';

export type MonitoringOperationalStatus = 'operational' | 'degraded' | 'unavailable';

export interface MonitoringPayloadInput {
  uptimeSeconds: number;
  supabase: {
    ok: boolean;
    latencyMs: number | null;
  };
  whatsapp: {
    status: MonitoringWhatsAppStatus;
    lastCheck: string | null;
  };
  now?: Date;
}

export interface MonitoringPayload {
  service: 'REOBOTE SISTEMAS';
  status: 'operational' | 'degraded';
  checkedAt: string;
  checks: {
    application: {
      status: MonitoringOperationalStatus;
      uptimeSeconds: number;
    };
    api: {
      status: MonitoringOperationalStatus;
    };
    monitoringEndpoint: {
      status: MonitoringOperationalStatus;
    };
    supabase: {
      status: MonitoringOperationalStatus;
      latencyMs: number | null;
    };
    whatsapp: {
      status: MonitoringWhatsAppStatus;
      lastCheck: string | null;
    };
  };
}

/**
 * O segredo da integração precisa ter entropia mínima. 32 caracteres já é o
 * tamanho de um hex de 16 bytes; a recomendação operacional é `openssl rand -hex 32`.
 */
export function monitoringSecretIsConfigured(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.length >= 32;
}

/**
 * Comparação de segredo em tempo constante (via hash de tamanho fixo).
 * Nunca registra nem devolve os valores comparados.
 */
export function safeSecretMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;

  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

/**
 * Corrida com timeout para consultas que não aceitam AbortSignal (Supabase JS).
 */
export async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  timeoutMessage = 'Tempo esgotado.'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Constrói um payload estritamente de indicadores. Nenhum nome, contato,
 * conversa, token, telefone ou conteúdo de tabela é incluído.
 */
export function buildMonitoringPayload(input: MonitoringPayloadInput): MonitoringPayload {
  const checkedAt = (input.now ?? new Date()).toISOString();
  const whatsappDegraded =
    input.whatsapp.status === 'configured' || input.whatsapp.status === 'unavailable';
  const status = input.supabase.ok && !whatsappDegraded ? 'operational' : 'degraded';

  return {
    service: 'REOBOTE SISTEMAS',
    status,
    checkedAt,
    checks: {
      application: {
        status: 'operational',
        uptimeSeconds: Math.max(0, Math.round(input.uptimeSeconds)),
      },
      api: {
        status: 'operational',
      },
      monitoringEndpoint: {
        status: 'operational',
      },
      supabase: {
        status: input.supabase.ok ? 'operational' : 'unavailable',
        latencyMs:
          typeof input.supabase.latencyMs === 'number' && Number.isFinite(input.supabase.latencyMs)
            ? Math.max(0, Math.round(input.supabase.latencyMs))
            : null,
      },
      whatsapp: {
        status: input.whatsapp.status,
        lastCheck:
          typeof input.whatsapp.lastCheck === 'string' ? input.whatsapp.lastCheck : null,
      },
    },
  };
}
