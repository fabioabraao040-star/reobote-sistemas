// ============================================================================
// CRIPTOGRAFIA DE TOKENS E STATE (Google Calendar OAuth) — somente backend
// ============================================================================
// Tokens do Google são sensíveis e nunca podem ser armazenados em texto claro
// nem enviados ao frontend. Usamos AES-256-GCM com chave derivada de
// GOOGLE_TOKEN_ENCRYPTION_KEY. O `state` do OAuth é assinado com HMAC-SHA256
// para proteção contra CSRF e vinculação à empresa/usuário autenticado.

import crypto from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

function encryptionKey(): Buffer | null {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  // base64 (32 bytes)
  try {
    const b = Buffer.from(trimmed, 'base64');
    if (b.length === 32) return b;
  } catch {
    // ignore
  }
  // hex (64 chars)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  // fallback: SHA-256 do valor (sempre 32 bytes)
  return crypto.createHash('sha256').update(trimmed).digest();
}

function stateSecret(): Buffer {
  const key = encryptionKey();
  if (key) return key;
  const fallback = process.env.GOOGLE_CLIENT_SECRET || 'reobote-google-state-fallback';
  return crypto.createHash('sha256').update(fallback).digest();
}

export function isCryptoConfigured(): boolean {
  return encryptionKey() !== null;
}

export function encryptToken(plain: string): string {
  const key = encryptionKey();
  if (!key) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY não configurada.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptToken(payload: string): string {
  const key = encryptionKey();
  if (!key) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY não configurada.');
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Token criptografado inválido.');
  const iv = Buffer.from(parts[0], 'base64url');
  const tag = Buffer.from(parts[1], 'base64url');
  const ciphertext = Buffer.from(parts[2], 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

export interface OAuthStatePayload {
  companyId: string;
  userId: string;
  nonce: string;
  ts: number;
}

export function signState(payload: Omit<OAuthStatePayload, 'nonce' | 'ts'> & Partial<Pick<OAuthStatePayload, 'nonce' | 'ts'>>): string {
  const full: OAuthStatePayload = {
    companyId: payload.companyId,
    userId: payload.userId,
    nonce: payload.nonce || crypto.randomBytes(16).toString('hex'),
    ts: payload.ts || Date.now(),
  };
  const json = JSON.stringify(full);
  const b64 = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', stateSecret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifyState(state: string, expectedCompanyId: string): OAuthStatePayload | null {
  if (typeof state !== 'string' || !state.includes('.')) return null;
  const [b64, sig] = state.split('.');
  if (!b64 || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', stateSecret()).update(b64).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  } catch {
    return null;
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (payload.companyId !== expectedCompanyId) return null;
  if (typeof payload.ts !== 'number' || Date.now() - payload.ts > STATE_TTL_MS) return null;
  if (typeof payload.userId !== 'string' || !payload.userId) return null;
  return payload;
}
