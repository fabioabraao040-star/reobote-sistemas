// ============================================================================
// ROTAS /api/google-calendar (somente ADM operacional)
// ============================================================================

import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from './authMiddleware.js';
import { adminOnlyMiddleware } from './authMiddleware.js';
import type { GoogleCalendarService } from './googleCalendarService.js';

export interface GoogleCalendarRouterDependencies {
  service: GoogleCalendarService;
  verifyStateFn: (state: string, companyId: string) => { companyId: string; userId: string } | null;
  getAppUrl: () => string;
}

export function createGoogleCalendarRouter(deps: GoogleCalendarRouterDependencies): Router {
  const router = Router();

  router.get('/connect', adminOnlyMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.authCompanyId || !req.authUserId) {
      return res.status(400).json({ error: 'Usuário sem empresa vinculada.' });
    }
    const url = deps.service.getAuthUrl(req.authCompanyId, req.authUserId);
    if (!url) {
      return res.status(503).json({ error: 'Google Calendar não configurado no servidor.' });
    }
    return res.redirect(url);
  });

  router.get('/callback', async (req: AuthenticatedRequest, res: Response) => {
    // Callback OAuth: pode chegar sem sessão ADM; validamos via state.
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const error = typeof req.query.error === 'string' ? req.query.error : '';

    const appUrl = deps.getAppUrl();

    if (error) {
      return res.redirect(`${appUrl}/integracao-google-calendar?status=error&reason=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${appUrl}/integracao-google-calendar?status=error&reason=missing_params`);
    }

    // state contém companyId; precisamos validar antes de saber a empresa.
    // Verificamos a assinatura e extraímos companyId; depois comparamos com a
    // sessão se houver. Para callback sem sessão, confiamos apenas no state
    // assinado (HMAC) + TTL.
    const parts = state.split('.');
    let companyId = '';
    try {
      const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      companyId = typeof payload?.companyId === 'string' ? payload.companyId : '';
    } catch {
      companyId = '';
    }

    if (!companyId) {
      return res.redirect(`${appUrl}/integracao-google-calendar?status=error&reason=invalid_state`);
    }

    const verified = deps.verifyStateFn(state, companyId);
    if (!verified) {
      return res.redirect(`${appUrl}/integracao-google-calendar?status=error&reason=invalid_state`);
    }

    const result = await deps.service.handleCallback({ code, state, expectedCompanyId: companyId });
    if (!result.ok) {
      return res.redirect(`${appUrl}/integracao-google-calendar?status=error&reason=${encodeURIComponent(result.message)}`);
    }
    return res.redirect(`${appUrl}/integracao-google-calendar?status=connected`);
  });

  router.get('/status', adminOnlyMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.authCompanyId) {
      return res.status(400).json({ error: 'Usuário sem empresa vinculada.' });
    }
    const status = await deps.service.getStatus(req.authCompanyId);
    return res.json(status);
  });

  router.post('/disconnect', adminOnlyMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.authCompanyId) {
      return res.status(400).json({ error: 'Usuário sem empresa vinculada.' });
    }
    const result = await deps.service.disconnect(req.authCompanyId);
    return res.status(result.ok ? 200 : 409).json(result);
  });

  router.get('/availability', adminOnlyMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.authCompanyId) {
      return res.status(400).json({ error: 'Usuário sem empresa vinculada.' });
    }
    const timeMin = typeof req.query.timeMin === 'string' ? req.query.timeMin : '';
    const timeMax = typeof req.query.timeMax === 'string' ? req.query.timeMax : '';
    const duration = Number(req.query.duration ?? 60);
    if (!timeMin || !timeMax) {
      return res.status(400).json({ error: 'timeMin e timeMax são obrigatórios.' });
    }
    const result = await deps.service.getAvailability(req.authCompanyId, {
      timeMin,
      timeMax,
      durationMinutes: Number.isFinite(duration) ? duration : 60,
    });
    return res.status(result.ok ? 200 : 409).json(result);
  });

  router.post('/events', adminOnlyMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.authCompanyId) {
      return res.status(400).json({ error: 'Usuário sem empresa vinculada.' });
    }
    const { summary, description, start, end, attendeeEmail } = req.body || {};
    if (typeof summary !== 'string' || !summary.trim() || typeof start !== 'string' || typeof end !== 'string') {
      return res.status(400).json({ error: 'summary, start e end são obrigatórios.' });
    }
    const result = await deps.service.createEvent(req.authCompanyId, {
      summary: summary.trim(),
      description: typeof description === 'string' ? description : undefined,
      start,
      end,
      attendeeEmail: typeof attendeeEmail === 'string' ? attendeeEmail : undefined,
    });
    return res.status(result.ok ? 200 : 409).json(result);
  });

  router.delete('/events/:id', adminOnlyMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.authCompanyId) {
      return res.status(400).json({ error: 'Usuário sem empresa vinculada.' });
    }
    const result = await deps.service.cancelEvent(req.authCompanyId, req.params.id);
    return res.status(result.ok ? 200 : 409).json(result);
  });

  return router;
}
