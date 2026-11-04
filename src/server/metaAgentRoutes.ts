// ============================================================================
// ROTAS /api/meta-agent (exclusivas do ADM operacional)
// ============================================================================
// Camadas de segurança (nesta ordem):
//   1. authMiddleware (server.ts): valida JWT Supabase + papel da tabela users.
//   2. adminOnlyMiddleware aplicado AQUI de novo: master_admin e user são
//      rejeitados mesmo em chamada direta.
//   3. Escopo por empresa: todas as operações usam req.authCompanyId. Um admin
//      jamais lê ou altera a integração de outra empresa.
//
// Frontend não recebe secrets, tokens, telefone de consumidor nem URL da Meta.

import { Router, type Response } from 'express';
import type { AuthenticatedRequest } from './authMiddleware.js';
import { adminOnlyMiddleware } from './authMiddleware.js';
import type { MetaAgentService } from './metaAgentService.js';

export interface MetaAgentRouterDependencies {
  service: MetaAgentService;
}

export function createMetaAgentRouter(deps: MetaAgentRouterDependencies): Router {
  const router = Router();
  router.use(adminOnlyMiddleware);

  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    if (!req.authCompanyId) {
      return res.status(400).json({ error: 'Seu usuário não está vinculado a uma empresa.' });
    }
    const view = await deps.service.getView(req.authCompanyId, { refresh: true });
    const events = await deps.service.listRecentEvents(req.authCompanyId, 20);
    return res.json({
      integration: view.integration,
      live: view.live,
      last_events: events.events,
      events_error: events.error,
    });
  });

  router.post('/verify', async (req: AuthenticatedRequest, res: Response) => {
    const result = await deps.service.verify(req.authCompanyId!);
    return res.status(result.ok ? 200 : 409).json({
      ok: result.ok,
      message: result.message,
      integration: result.view?.integration ?? null,
      live: result.view?.live ?? null,
    });
  });

  router.post('/connect', async (req: AuthenticatedRequest, res: Response) => {
    const result = await deps.service.connect(req.authCompanyId!);
    return res.status(result.ok ? 200 : 409).json({
      ok: result.ok,
      status: result.status,
      message: result.message,
      agent_id: result.agentId ?? null,
      integration: result.view?.integration ?? null,
      live: result.view?.live ?? null,
    });
  });

  router.post('/enable', async (req: AuthenticatedRequest, res: Response) => {
    const result = await deps.service.setRollout(req.authCompanyId!, true);
    return res.status(result.ok ? 200 : 409).json({
      ok: result.ok,
      message: result.message,
      integration: result.view?.integration ?? null,
      live: result.view?.live ?? null,
    });
  });

  router.post('/disable', async (req: AuthenticatedRequest, res: Response) => {
    const result = await deps.service.setRollout(req.authCompanyId!, false);
    return res.status(result.ok ? 200 : 409).json({
      ok: result.ok,
      message: result.message,
      integration: result.view?.integration ?? null,
      live: result.view?.live ?? null,
    });
  });

  router.get('/events', async (req: AuthenticatedRequest, res: Response) => {
    const limitRaw = Number(req.query.limit ?? 30);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 30;
    const events = await deps.service.listRecentEvents(req.authCompanyId!, limit);
    return res.json({
      events: events.events,
      error: events.error,
    });
  });

  router.post('/handoff/release', async (req: AuthenticatedRequest, res: Response) => {
    const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) {
      return res.status(400).json({ error: 'Conversa inválida.' });
    }
    const result = await deps.service.releaseHandoff(req.authCompanyId!, conversationId);
    return res.status(result.ok ? 200 : 409).json({
      ok: result.ok,
      message: result.message,
      request_id: result.requestId,
    });
  });

  return router;
}
