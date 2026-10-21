import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface PlaceholderProps {
  title: string;
  adminOnly?: boolean;
}

export default function Placeholder({ title, adminOnly = false }: PlaceholderProps) {
  const { user, isAdmin } = useAuth();

  const isRestricted = adminOnly && !isAdmin;

  if (isRestricted) {
    return (
      <div className="bg-white p-6 sm:p-10 rounded-xl border border-amber-200 shadow-sm max-w-2xl mx-auto text-center mt-6">
        <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-[28px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-[#34445C] mb-2">
          Acesso Restrito ao Administrador
        </h2>
        <p className="text-sm text-[#5B6E87] mb-6 leading-relaxed">
          Você está navegando como <strong>{user?.name}</strong> ({user?.companyName}).
          A tela <strong>{title}</strong> contém parâmetros globais e requer perfil de Administrador.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-[#D8E0EA] text-[#34445C] text-xs font-semibold hover:bg-[#F6FAFF] transition-all"
          >
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-xl border border-[#D8E0EA] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)]">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#D8E0EA]">
        <div className="flex items-center gap-3">
          <div 
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-white ${
              isAdmin ? 'bg-[#C5A15B]' : 'bg-[#34445C]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isAdmin ? 'admin_panel_settings' : 'view_quilt'}
            </span>
          </div>
          <div>
            <h2 className="font-headline-md text-lg font-bold text-[#34445C]">{title}</h2>
            <span className="text-xs text-[#5B6E87]">
              {isAdmin 
                ? 'Módulo Administrativo Global • Visão Consolidada' 
                : `Módulo da Empresa • ${user?.companyName}`}
            </span>
          </div>
        </div>

        <span 
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isAdmin 
              ? 'bg-amber-100 text-amber-900 border border-amber-300' 
              : 'bg-blue-100 text-blue-900 border border-blue-300'
          }`}
        >
          {isAdmin ? 'Acesso Master' : 'Permissão Local'}
        </span>
      </div>

      <div className="mb-6 space-y-2 text-sm text-[#5B6E87] leading-relaxed">
        <p>
          Esta tela é uma das <strong>8 telas oficiais</strong> do sistema <strong>REOBOTE</strong>. 
          {isAdmin 
            ? ' Como Administrador, você possui controle sobre as configurações globais, credenciais da Meta WhatsApp Cloud API e supervisão de todas as unidades.' 
            : ' Como Usuário/Atendente, sua operação é estritamente isolada aos atendimentos, contatos e mensagens da sua unidade comercial.'}
        </p>
        <p className="text-xs text-[#5B6E87]/80">
          * Em ambiente de produção com Supabase conectado, o isolamento dos dados da empresa será assegurado por políticas de segurança <em>Row Level Security (RLS)</em> no banco de dados.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#D8E0EA]">
        <div className="p-3.5 rounded-lg bg-[#F6FAFF] border border-[#D8E0EA]">
          <span className="text-xs font-semibold text-[#34445C] block mb-1">
            Escopo de Dados
          </span>
          <span className="text-xs font-medium text-[#34445C]">
            {isAdmin ? 'Todas as Empresas (Global)' : user?.companyName}
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-[#F6FAFF] border border-[#D8E0EA]">
          <span className="text-xs font-semibold text-[#34445C] block mb-1">
            Nível de Permissão
          </span>
          <span className="text-xs font-medium text-emerald-700">
            {isAdmin ? 'Gerenciamento & Configuração' : 'Operação de Atendimento'}
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-[#F6FAFF] border border-[#D8E0EA]">
          <span className="text-xs font-semibold text-[#34445C] block mb-1">
            Status da Conexão
          </span>
          <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]" />
            Meta WhatsApp Cloud API
          </span>
        </div>
      </div>
    </div>
  );
}
