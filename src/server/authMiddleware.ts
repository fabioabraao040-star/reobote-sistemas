import type { NextFunction, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthRole = 'master_admin' | 'admin' | 'user';

export interface AuthenticatedRequest extends Request {
  authRole?: AuthRole;
  authCompanyId?: string;
  authUserId?: string;
  authUserName?: string;
}

export interface AuthMiddlewareDependencies {
  getSupabase: () => SupabaseClient | null;
  getSupabaseAuth: () => SupabaseClient | null;
  masterAdminAllowedPaths: ReadonlySet<string>;
}

/**
 * Extrai somente tokens Bearer não vazios. A validação do JWT continua sendo
 * feita pelo Supabase Auth; esta função evita que cabeçalhos malformados cheguem
 * à consulta externa.
 */
export function extractBearerToken(header: unknown): string | null {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

export function createAuthMiddleware(deps: AuthMiddlewareDependencies) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    }

    const supabase = deps.getSupabase();
    const supabaseAuth = deps.getSupabaseAuth();

    if (!supabase || !supabaseAuth) {
      return res.status(500).json({ error: 'Serviço de autenticação não configurado no servidor.' });
    }

    try {
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
      }

      const { data: dbUser, error: userError } = await supabase
        .from('users')
        .select('id, company_id, name, email, role, status')
        .eq('id', user.id)
        .single();

      if (userError || !dbUser) {
        return res.status(401).json({ error: 'Usuário não encontrado no sistema.' });
      }

      req.authRole = dbUser.role as AuthRole;
      req.authCompanyId = dbUser.company_id;
      req.authUserId = dbUser.id;
      req.authUserName = dbUser.name;

      // O ADM MASTER é um perfil exclusivo de configuração global: NÃO possui
      // permissões operacionais. O bloqueio é feito aqui, no servidor, para que
      // chamadas diretas à API também sejam negadas (esconder menu não basta).
      if (req.authRole === 'master_admin') {
        const requestPath = `${req.baseUrl}${req.path}`.replace(/\/+$/, '');
        if (!deps.masterAdminAllowedPaths.has(requestPath)) {
          return res.status(403).json({
            error: 'Acesso Proibido: o perfil ADM MASTER é exclusivo do painel de configuração global.',
          });
        }
      }

      next();
    } catch (error) {
      // Não devolver mensagem interna (pode conter URL, detalhe de rede etc.).
      console.error('[Auth] Falha ao validar sessão:', error instanceof Error ? error.message : 'erro desconhecido');
      return res.status(401).json({ error: 'Falha na autenticação.' });
    }
  };
}

export function adminOnlyMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Apenas o admin operacional. master_admin NÃO herda poderes de admin.
  if (req.authRole !== 'admin') {
    return res.status(403).json({
      error: 'Acesso Proibido: Esta operação exige privilégios de Administrador.',
    });
  }
  next();
}

export function masterAdminOnlyMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.authRole !== 'master_admin') {
    return res.status(403).json({
      error: 'Acesso Proibido: Esta operação é exclusiva do ADM MASTER.',
    });
  }
  next();
}
