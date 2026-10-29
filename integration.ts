import crypto from 'node:crypto';
import { isIP } from 'node:net';

export interface IntegrationTestEvent {
  event: {
    type: 'integration.test';
    source: 'reobote-sistemas';
    id: string;
    timestamp: string;
  };
}

export interface SendIntegrationTestResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  received: boolean;
  recorded: boolean;
  telegramSent: boolean;
  telegramStatus: number | null;
  testId: string | null;
  duplicate: boolean;
}

const DEFAULT_TIMEOUT_MS = 10000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 15000;
const MIN_SECRET_LENGTH = 32;
const MAX_RESPONSE_BYTES = 4096;
const EVENT_ENDPOINT = '/api/integrations/sistemas/events';

function randomTestId(): string {
  const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  return `TEST-${raw}`;
}

export function createIntegrationTestEvent(): IntegrationTestEvent {
  return {
    event: {
      type: 'integration.test',
      source: 'reobote-sistemas',
      id: randomTestId(),
      timestamp: new Date().toISOString()
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '::'
  ) {
    return true;
  }

  if (isIP(host) === 4) return isPrivateIpv4(host);
  if (isIP(host) === 6) {
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);

    return (
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      /^fe[89ab]/.test(host)
    );
  }

  return false;
}

function resolveEndpoint(baseUrl: string): URL | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  if (base.protocol !== 'https:') return null;
  if (base.username || base.password) return null;
  if (!base.hostname || isPrivateHostname(base.hostname)) return null;

  try {
    return new URL(EVENT_ENDPOINT, base);
  } catch {
    return null;
  }
}

function clampTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_TIMEOUT_MS;
  return Math.max(MIN_TIMEOUT_MS, Math.min(Math.trunc(timeoutMs), MAX_TIMEOUT_MS));
}

async function readResponseText(response: Response): Promise<string | null> {
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) return null;
  }

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          return null;
        }

        chunks.push(value);
      }
    } catch {
      return null;
    } finally {
      reader.releaseLock();
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  }

  try {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) return null;
    return text;
  } catch {
    return null;
  }
}

async function readJsonSafely(response: Response): Promise<unknown | null> {
  const text = await readResponseText(response);
  if (text === null) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorForStatus(status: number, received: boolean, telegramSent: boolean): string {
  if (status === 401 || status === 403) {
    return 'Credencial de integração recusada pelo REOBOTE SUPORTE.';
  }
  if (status === 409) {
    return 'Evento já está em processamento ou esgotou as tentativas.';
  }
  if (status === 413) {
    return 'Evento excede o limite de 10 KB.';
  }
  if (status === 429) {
    return 'Limite de eventos de integração atingido.';
  }
  if (status === 502) {
    return received && !telegramSent
      ? 'O REOBOTE SUPORTE recebeu o evento, mas o Telegram não confirmou a notificação.'
      : 'O REOBOTE SUPORTE não confirmou a notificação pelo Telegram.';
  }
  if (status === 503) {
    return 'O REOBOTE SUPORTE está indisponível ou sem configuração de integração.';
  }
  if (status >= 500) {
    return 'O REOBOTE SUPORTE não confirmou o processamento do evento.';
  }
  return `O REOBOTE SUPORTE recusou o evento de teste (HTTP ${status}).`;
}

/**
 * Emissor servidor-a-servidor. A URL e o segredo vêm exclusivamente do
 * ambiente do backend; nunca do navegador. A função não registra nem devolve
 * o segredo, e só retorna ok quando o receptor confirma recebimento, registro
 * e aceite da mensagem pela API do Telegram.
 */
export async function sendIntegrationTestEvent(
  baseUrl: string,
  secret: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch
): Promise<SendIntegrationTestResult> {
  const failure = (error: string): SendIntegrationTestResult => ({
    ok: false,
    status: null,
    error,
    received: false,
    recorded: false,
    telegramSent: false,
    telegramStatus: null,
    testId: null,
    duplicate: false
  });

  if (!baseUrl || !secret) {
    return failure('Integração com o REOBOTE SUPORTE não configurada.');
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    return failure('Segredo de integração inválido ou curto demais.');
  }

  const endpoint = resolveEndpoint(baseUrl.trim());
  if (!endpoint) {
    return failure('URL do REOBOTE SUPORTE inválida. Use HTTPS e não use endereços privados.');
  }

  const payload = createIntegrationTestEvent();
  const timeout = clampTimeout(timeoutMs);

  try {
    const response = await fetchImpl(endpoint.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-integration-secret': secret
      },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(timeout)
    });

    const data = await readJsonSafely(response);
    const record = isRecord(data) ? data : null;
    const telegram = record && isRecord(record.telegram) ? record.telegram : null;

    const received = record?.received === true;
    const recorded = record?.recorded === true;
    const telegramSent = telegram?.sent === true;
    const telegramStatus =
      typeof telegram?.status === 'number' &&
      Number.isInteger(telegram.status) &&
      telegram.status >= 100 &&
      telegram.status <= 599
        ? telegram.status
        : null;
    const testId =
      typeof record?.testId === 'string' && record.testId.length <= 64
        ? record.testId
        : null;
    const duplicate = record?.duplicate === true;
    const eventMatches = record?.eventId === payload.event.id;

    const result = (
      ok: boolean,
      error: string | null
    ): SendIntegrationTestResult => ({
      ok,
      status: response.status,
      error,
      received,
      recorded,
      telegramSent,
      telegramStatus,
      testId,
      duplicate
    });

    // Repetição de um evento já processado: não houve novo envio, mas o
    // resultado persistido confirma que o Telegram já aceitou a mensagem.
    if (
      response.status === 409 &&
      duplicate &&
      received &&
      recorded &&
      telegramSent &&
      testId !== null &&
      eventMatches
    ) {
      return result(true, null);
    }

    if (!response.ok) {
      return result(false, errorForStatus(response.status, received, telegramSent));
    }

    if (!eventMatches) {
      return result(
        false,
        'A resposta do REOBOTE SUPORTE não corresponde ao evento enviado.'
      );
    }

    if (!received || !recorded || !telegramSent || testId === null) {
      return result(
        false,
        'O REOBOTE SUPORTE não confirmou recebimento, registro e entrega pelo Telegram.'
      );
    }

    return result(true, null);
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');

    return failure(
      timedOut
        ? 'Tempo esgotado ao enviar evento ao REOBOTE SUPORTE.'
        : 'Falha de conexão com o REOBOTE SUPORTE.'
    );
  }
}
