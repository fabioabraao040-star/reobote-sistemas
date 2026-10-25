import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type UserRole = 'master_admin' | 'admin' | 'user';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

function hasRequiredRole(userRole: UserRole, requiredRole?: UserRole): boolean {
  if (!requiredRole) return true;
  const roleHierarchy: Record<UserRole, number> = {
    master_admin: 3,
    admin: 2,
    user: 1,
  };
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'master_admin': return 'ADM MASTER';
    case 'admin': return 'Administrador';
    case 'user': return 'Usuário / Atendente';
  }
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  // Aguarda a restauração da sessão do sessionStorage antes de decidir.
  // Sem isso, um recarregamento em rota protegida redireciona para "/".
  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-[#B4C5CE]">
          <span className="material-symbols-outlined animate-spin text-[22px]">progress_activity</span>
          <span className="text-sm font-medium">Carregando sessão...</span>
        </div>
      </div>
    );
  }

  // Se não estiver autenticado
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Verifica se o usuário tem o papel necessário
  if (requiredRole && !hasRequiredRole(user.role, requiredRole)) {
    const requiredLabel = getRoleLabel(requiredRole);
    const currentLabel = getRoleLabel(user.role);

    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-[#344956] p-8 rounded-xl border border-[#D14747]/30 shadow-md max-w-lg w-full text-center">
          <div className="w-14 h-14 rounded-full bg-[#D14747]/10 text-[#FFA8A8] flex items-center justify-center mx-auto mb-4 border border-[#D14747]/30">
            <span className="material-symbols-outlined text-[32px]">shield_lock</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#D14747]/10 text-[#FFA8A8] inline-block mb-2">
            Acesso Restrito • 403 Proibido
          </span>
          <h2 className="text-xl font-bold text-[#E1E8EC] mb-2">
            Privilégios de {requiredLabel} Necessários
          </h2>
          <p className="text-sm text-[#B4C5CE] mb-6 leading-relaxed">
            Seu perfil atual é <strong>{user.name}</strong> ({currentLabel}). 
            Você não possui autorização para acessar esta área.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/dashboard"
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-[#527D91] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Retornar ao Meu Painel</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
