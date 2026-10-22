// Servidor local de desenvolvimento/produção.
// Não é usado na Vercel: lá o backend é a função serverless em api/index.ts.
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import app from './server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[REOBOTE SERVER] Servidor full-stack rodando em http://localhost:${PORT}`);
  });
}

startServer();
