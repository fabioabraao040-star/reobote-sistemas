import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptToken,
  decryptToken,
  signState,
  verifyState,
  isCryptoConfigured,
} from '../src/server/googleCalendarCrypto.js';

process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

test('encrypt/decrypt roundtrip preserva o token', () => {
  const plain = 'secret-access-token-123';
  const enc = encryptToken(plain);
  assert.notEqual(enc, plain);
  assert.equal(decryptToken(enc), plain);
});

test('decrypt com payload adulterado falha', () => {
  const enc = encryptToken('abc');
  const tampered = enc.slice(0, -2) + 'xx';
  assert.throws(() => decryptToken(tampered));
});

test('state válido é verificado e vinculado à empresa', () => {
  const state = signState({ companyId: 'comp-1', userId: 'user-1' });
  const verified = verifyState(state, 'comp-1');
  assert.ok(verified);
  assert.equal(verified?.companyId, 'comp-1');
  assert.equal(verified?.userId, 'user-1');
});

test('state de outra empresa é rejeitado', () => {
  const state = signState({ companyId: 'comp-1', userId: 'user-1' });
  assert.equal(verifyState(state, 'comp-2'), null);
});

test('state adulterado é rejeitado', () => {
  const state = signState({ companyId: 'comp-1', userId: 'user-1' });
  const tampered = state.slice(0, -4) + 'abcd';
  assert.equal(verifyState(tampered, 'comp-1'), null);
});

test('isCryptoConfigured true quando chave presente', () => {
  assert.equal(isCryptoConfigured(), true);
});
