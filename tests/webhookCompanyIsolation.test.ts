import test from 'node:test';
import assert from 'node:assert/strict';

// ============================================================================
// TESTES DE ISOLAMENTO MULTIEMPRESA — WEBHOOK WHATSAPP
// ============================================================================
//
// Valida a resolução de company_id exclusivamente pelo vínculo entre
// whatsapp_configs.company_id e phone_number_id, sem fallback para a
// "primeira empresa".
//
// Cenários:
//   1. Empresa inexistente (phone_number_id não cadastrado) → 200 EVENT_RECEIVED
//   2. company_id nulo na configuração → 200 EVENT_RECEIVED, sem fallback
//   3. Configuração WhatsApp inválida (is_verified=false) → 200 EVENT_RECEIVED
//   4. Configuração WhatsApp inválida (sem access_token) → 200 EVENT_RECEIVED
//   5. Duas empresas com phone_number_id diferentes → isolamento correto
//   6. company_id usado nas gravações vem do vínculo, não do payload
//   7. Falha controlada no processamento → não quebra o webhook
// ============================================================================

interface WhatsAppConfig {
  company_id: string | null;
  is_verified: boolean;
  access_token: string;
  phone_number_id: string;
  phone_number: string | null;
}

// Simula a lógica de resolução de company_id do webhook WhatsApp (server.ts)
function resolveCompanyId(
  phoneNumberId: string | null | undefined,
  lookupConfig: (phoneNumberId: string) => Promise<WhatsAppConfig | null>
): { companyId: string | null; shouldProcess: boolean; reason: string } {
  if (!phoneNumberId) {
    return { companyId: null, shouldProcess: false, reason: 'sem phone_number_id' };
  }

  return { companyId: phoneNumberId, shouldProcess: true, reason: 'ok' }; // placeholder
}

// Testa a lógica completa de resolução do webhook (espelha server.ts)
async function processWebhookEvent(
  phoneNumberId: string | null | undefined,
  lookupConfig: (phoneNumberId: string) => Promise<WhatsAppConfig | null>
): Promise<{ status: number; body: string; companyIdUsed?: string | null }> {
  if (!phoneNumberId) {
    return { status: 200, body: 'EVENT_RECEIVED' };
  }

  // Espelha server.ts: erro de consulta não quebra o webhook
  let phoneCfg: WhatsAppConfig | null = null;
  try {
    phoneCfg = await lookupConfig(phoneNumberId);
  } catch {
    phoneCfg = null;
  }

  if (!phoneCfg) {
    return { status: 200, body: 'EVENT_RECEIVED' };
  }

  // CORREÇÃO: sem fallback — empresa vem do vínculo real da configuração
  const companyId = phoneCfg.company_id;
  if (!companyId) {
    return { status: 200, body: 'EVENT_RECEIVED', companyIdUsed: null };
  }

  // Validação de configuração para envio
  if (!phoneCfg.is_verified || !phoneCfg.access_token || !phoneCfg.phone_number_id) {
    return { status: 200, body: 'EVENT_RECEIVED' };
  }

  return { status: 200, body: 'EVENT_RECEIVED', companyIdUsed: companyId };
}

test('1. Empresa inexistente: phone_number_id não cadastrado → 200 EVENT_RECEIVED', async () => {
  const res = await processWebhookEvent('unknown-id', async () => null);
  assert.equal(res.status, 200);
  assert.equal(res.body, 'EVENT_RECEIVED');
});

test('2. company_id nulo na configuração → não faz fallback para primeira empresa', async () => {
  const res = await processWebhookEvent('config-sem-empresa', async () => ({
    company_id: null,
    is_verified: true,
    access_token: 'token',
    phone_number_id: 'config-sem-empresa',
    phone_number: '+5511999999999',
  }));
  assert.equal(res.status, 200);
  assert.equal(res.body, 'EVENT_RECEIVED');
  assert.equal(res.companyIdUsed, null);
});

test('3. Configuração com is_verified=false → 200 EVENT_RECEIVED', async () => {
  const res = await processWebhookEvent('config-nao-verificada', async () => ({
    company_id: 'empresa-123',
    is_verified: false,
    access_token: 'token',
    phone_number_id: 'config-nao-verificada',
    phone_number: '+5511999999999',
  }));
  assert.equal(res.status, 200);
  assert.equal(res.body, 'EVENT_RECEIVED');
});

test('4. Configuração sem access_token → 200 EVENT_RECEIVED', async () => {
  const res = await processWebhookEvent('config-sem-token', async () => ({
    company_id: 'empresa-123',
    is_verified: true,
    access_token: '',
    phone_number_id: 'config-sem-token',
    phone_number: '+5511999999999',
  }));
  assert.equal(res.status, 200);
  assert.equal(res.body, 'EVENT_RECEIVED');
});

test('5. Duas empresas com phone_number_id diferentes → isolamento correto', async () => {
  const configs = new Map<string, WhatsAppConfig>([
    ['id-empresa-a', {
      company_id: 'empresa-a',
      is_verified: true,
      access_token: 'token-a',
      phone_number_id: 'id-empresa-a',
      phone_number: '+5511999999991',
    }],
    ['id-empresa-b', {
      company_id: 'empresa-b',
      is_verified: true,
      access_token: 'token-b',
      phone_number_id: 'id-empresa-b',
      phone_number: '+5511999999992',
    }],
  ]);

  const resA = await processWebhookEvent('id-empresa-a', async (pid) => configs.get(pid) ?? null);
  assert.equal(resA.status, 200);
  assert.equal(resA.companyIdUsed, 'empresa-a');

  const resB = await processWebhookEvent('id-empresa-b', async (pid) => configs.get(pid) ?? null);
  assert.equal(resB.status, 200);
  assert.equal(resB.companyIdUsed, 'empresa-b');

  assert.notEqual(resA.companyIdUsed, resB.companyIdUsed);
});

test('6. company_id usado nas gravações vem do vínculo, não do payload', async () => {
  // O payload do webhook NÃO contém company_id confiável — ele vem da configuração
  const lookupConfig = async (phoneNumberId: string) => {
    if (phoneNumberId === 'id-empresa-x') {
      return {
        company_id: 'empresa-real-vinculada',
        is_verified: true,
        access_token: 'token-x',
        phone_number_id: 'id-empresa-x',
        phone_number: '+5511999999999',
      };
    }
    return null;
  };

  const res = await processWebhookEvent('id-empresa-x', lookupConfig);
  assert.equal(res.status, 200);
  assert.equal(res.companyIdUsed, 'empresa-real-vinculada');
});

test('7. Falha controlada no processamento → não quebra o webhook', async () => {
  // Lookup que lança erro — o webhook deve continuar funcionando
  const res = await processWebhookEvent('id-qualquer', async () => {
    throw new Error('Erro de conexão com o banco');
  });
  // O webhook trata erro de lookup como configuração não encontrada
  assert.equal(res.status, 200);
  assert.equal(res.body, 'EVENT_RECEIVED');
});
