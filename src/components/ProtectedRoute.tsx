import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user } = useAuth();

  // Se não estiver autenticado
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Se a rota exige papel de administrador e o usuário atual for usuário comum
  if (requiredRole === 'admin' && user.role !== 'admin') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-[#17374A] p-8 rounded-xl border border-[#D14747]/30 shadow-md max-w-lg w-full text-center">
          <div className="w-14 h-14 rounded-full bg-[#D14747]/10 text-[#D14747] flex items-center justify-center mx-auto mb-4 border border-[#D14747]/30">
            <span className="material-symbols-outlined text-[32px]">shield_lock</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#D14747]/10 text-[#D14747]/90 inline-block mb-2">
            Acesso Restrito • 403 Proibido
          </span>
          <h2 className="text-xl font-bold text-[#F5F2EA] mb-2">
            Privilégios Administrativos Necessários
          </h2>
          <p className="text-sm text-[#A0B0BA] mb-6 leading-relaxed">
            Seu perfil atual é <strong>{user.name}</strong> ({user.companyName}). 
            Você não possui autorização para acessar áreas administrativas globais ou alterar parâmetros de outros operadores.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/dashboard"
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-[#C9AE69] text-[#F5F2EA] text-xs font-semibold hover:brightness-95 transition-all shadow-xs flex items-center justify-center gap-1.5"
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
