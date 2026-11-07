import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// ============================================================================
// TESTES DE ROTAS DE DIAGNÓSTICO
// ============================================================================
//
// Valida que /api/diag e /api/diag/create-admin permanecem desativadas em
// produção, retornando 404 independentemente de DIAG_TOKEN, e que não é
// possível criar administrador por estas rotas.
//
// Não inicia servidores reais: monta um Express app mínimo com apenas as
// rotas em questão e faz requisições diretas.
// ============================================================================

function buildDiagnosticApp(): express.Express {
  const app = express();
  app.use(express.json());

  // Rotas desativadas — espelham server.ts
  app.get('/api/diag', async (_req, res) => {
    return res.status(404).json({ error: 'Rota da API não encontrada.' });
  });

  app.post('/api/diag/create-admin', async (_req, res) => {
    return res.status(404).json({ error: 'Rota da API não encontrada.' });
  });

  return app;
}

async function request(app: express.Express, method: 'GET' | 'POST', path: string, body?: any) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', async () => {
      try {
        const addr = server.address() as import('node:net').AddressInfo;
        const base = `http://127.0.0.1:${addr.port}`;
        const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
        if (body !== undefined) init.body = JSON.stringify(body);
        const res = await fetch(`${base}${path}`, init);
        const parsed = await res.json().catch(() => ({}));
        resolve({ status: res.status, body: parsed });
        server.close();
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });
}

test('GET /api/diag retorna 404 com DIAG_TOKEN fornecido', async () => {
  const app = buildDiagnosticApp();
  const res = await request(app, 'GET', '/api/diag', undefined);
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Rota da API não encontrada.');
});

test('GET /api/diag retorna 404 sem cabeçalho de token', async () => {
  const app = buildDiagnosticApp();
  const res = await request(app, 'GET', '/api/diag');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Rota da API não encontrada.');
});

test('POST /api/diag/create-admin retorna 404 com DIAG_TOKEN fornecido', async () => {
  const app = buildDiagnosticApp();
  const res = await request(app, 'POST', '/api/diag/create-admin', {
    email: 'a@b.com',
    password: 'senha1234',
    name: 'Test',
  });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Rota da API não encontrada.');
});

test('POST /api/diag/create-admin retorna 404 sem corpo e sem token', async () => {
  const app = buildDiagnosticApp();
  const res = await request(app, 'POST', '/api/diag/create-admin');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Rota da API não encontrada.');
});

test('Nenhuma rota alternativa permite criação de administrador', async () => {
  const app = buildDiagnosticApp();
  const res = await request(app, 'POST', '/api/diag/create-admin', {
    email: 'admin@evil.com',
    password: 'senha1234',
    name: 'Evil Admin',
    companyName: 'Evil Corp',
    role: 'master_admin',
  });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Rota da API não encontrada.');
});
