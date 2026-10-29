import { Router, type Response } from 'express';
import { adminOnlyMiddleware, type AuthenticatedRequest } from './authMiddleware.js';
import { EmergencyAIError, type EmergencyAIService } from './emergencyAIService.js';
import {
  parseEmergencyAIHistoryLimit,
  validateEmergencyAIReason,
} from '../utils/emergencyAI.js';

function sendError(res: Response, error: unknown) {
  if (error instanceof EmergencyAIError) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error(
    '[IA de Emergência] Erro inesperado:',
    error instanceof Error ? error.message : 'erro desconhecido'
  );
  return res.status(500).json({ error: 'Erro interno ao processar a IA de Emergência.' });
}

export function createEmergencyAIRouter(service: EmergencyAIService): Router {
  const router = Router();

  // Defesa central: nenhuma rota deste router responde sem papel admin,
  // mesmo que alguém monte o router fora do local previsto em server.ts.
  router.use(adminOnlyMiddleware);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await service.getStatus();
      return res.json(status);
    } catch (error) {
      return sendError(res, error);
    }
  });

  const setEnabled = (enabled: boolean) => async (req: AuthenticatedRequest, res: Response) => {
    const reasonResult = validateEmergencyAIReason(req.body?.reason);
    if (!reasonResult.ok) {
      return res.status(400).json({ error: reasonResult.error });
    }

    if (!req.authUserId) {
      return res.status(401).json({ error: 'Administrador responsável não identificado.' });
    }

    try {
      const status = await service.setEnabled({
        enabled,
        actorId: req.authUserId,
        actorName: req.authUserName || '',
        reason: reasonResult.reason,
      });

      return res.json({
        ...status,
        message: status.changed
          ? (enabled
            ? 'IA de Emergência ativada e registrada no banco de dados.'
            : 'IA de Emergência desativada e registrada no banco de dados.')
          : (enabled
            ? 'A IA de Emergência já estava ativa; nenhuma nova alteração foi registrada.'
            : 'A IA de Emergência já estava desativada; nenhuma nova alteração foi registrada.'),
      });
    } catch (error) {
      return sendError(res, error);
    }
  };

  router.post('/activate', setEnabled(true));
  router.post('/deactivate', setEnabled(false));

  router.get('/history', async (req: AuthenticatedRequest, res: Response) => {
    const limitResult = parseEmergencyAIHistoryLimit(req.query.limit);
    if (!limitResult.ok) {
      return res.status(400).json({ error: limitResult.error });
    }

    try {
      const history = await service.getHistory(limitResult.limit);
      return res.json(history);
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
}
