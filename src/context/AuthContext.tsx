import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

export type UserRole = 'master_admin' | 'admin' | 'user';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
  avatarText: string;
  companyName: string;
  status?: string;
  token: string;
  permissions: {
    canManageAllUsers: boolean;
    canConfigureGlobalWhatsApp: boolean;
    canViewAllCompanies: boolean;
    canManageAutomations: boolean;
    canSendMessages: boolean;
    canManageCompanyContacts: boolean;
  };
}

interface AuthContextType {
  user: UserProfile | null;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  isUser: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; companyId?: string }) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Restaura sessão do sessionStorage ao montar
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('reobote_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.token) {
          setUser(parsed);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api.login({ email, password });

    const profile: UserProfile = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      companyId: data.user.companyId,
      avatarText: (data.user.name || '')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w: string) => w[0].toUpperCase())
        .join('') || 'U',
      companyName: data.user.role === 'master_admin'
        ? 'ADM MASTER — Configuração Global'
        : data.user.role === 'admin'
          ? 'Administrador — Gestão Global'
          : 'Unidade Local',
      status: data.user.status,
      token: data.token,
      permissions: {
        canManageAllUsers: data.user.role === 'admin' || data.user.role === 'master_admin',
        canConfigureGlobalWhatsApp: data.user.role === 'master_admin',
        canViewAllCompanies: data.user.role === 'admin' || data.user.role === 'master_admin',
        canManageAutomations: data.user.role === 'admin' || data.user.role === 'master_admin',
        canSendMessages: true,
        canManageCompanyContacts: true,
      },
    };

    setUser(profile);
    try {
      sessionStorage.setItem('reobote_user', JSON.stringify(profile));
    } catch {
      // ignore
    }
  };

  const register = async (data: { name: string; email: string; password: string; companyId?: string }) => {
    await api.register(data);
  };

  const resetPassword = async (email: string) => {
    await api.resetPassword(email);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore errors from backend on logout
    }
    setUser(null);
    try {
      sessionStorage.removeItem('reobote_user');
    } catch {
      // ignore
    }
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';
  const isMasterAdmin = user?.role === 'master_admin';
  const isUser = user?.role === 'user';

  return (
    <AuthContext.Provider value={{ user, isAdmin, isMasterAdmin, isUser, login, register, resetPassword, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
