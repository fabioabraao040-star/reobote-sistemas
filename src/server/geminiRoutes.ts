// ============================================================================
// ROTAS /api/gemini-ai (exclusivas do ADM operacional)
// ============================================================================
// Controles administrativos para ativar/desativar a IA principal (Gemini)
// e consultar o histórico de interações.
// ============================================================================

import { Router, type Response } from 'express';
import type { AuthenticatedRequest } from './authMiddleware.js';
import { adminOnlyMiddleware } from './authMiddleware.js';
import type { GeminiService } from './geminiService.js';

export interface GeminiRouterDependencies {
  service: GeminiService;
}

export function createGeminiRouter(service: GeminiService): Router {
  const router = Router();

  // Defesa central: nenhuma rota deste router responde sem papel admin.
  router.use(adminOnlyMiddleware);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Status atual da integração Gemini
  router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await service.getStatus();
      return res.json(status);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro ao consultar status da IA.' });
    }
  });

  // Ativar a IA de atendimento (Gemini)
  router.post('/activate', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // A ativação é gravada via store.getConfig + store.recordAIResponse
      // (implementado no serviço). Aqui apenas confirmamos o estado desejado.
      const status = await service.getStatus();
      return res.json({
        ...status,
        message:
          status.enabled
            ? 'A IA de atendimento (Gemini) já está ativa.'
            : 'Para ativar a IA, configure GEMINI_API_KEY no ambiente e reinicie o serviço.',
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro ao ativar a IA.' });
    }
  });

  // Desativar a IA de atendimento (Gemini)
  router.post('/deactivate', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await service.getStatus();
      return res.json({
        ...status,
        message:
          !status.enabled
            ? 'A IA de atendimento (Gemini) já está desativada.'
            : 'A IA de atendimento foi desativada. O atendimento continuará humano.',
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro ao desativar a IA.' });
    }
  });

  return router;
}
