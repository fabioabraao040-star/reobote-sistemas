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
      <div className="bg-[#344956] p-6 sm:p-10 rounded-xl border border-[#EFA339]/30 shadow-sm max-w-2xl mx-auto text-center mt-6">
        <div className="w-12 h-12 rounded-full bg-[#EFA339]/10 text-[#F5C26B]/90 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-[28px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-[#E1E8EC] mb-2">
          Acesso Restrito ao Administrador
        </h2>
        <p className="text-sm text-[#B4C5CE] mb-6 leading-relaxed">
          Você está navegando como <strong>{user?.name}</strong> ({user?.companyName}).
          A tela <strong>{title}</strong> contém parâmetros globais e requer perfil de Administrador.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-[#526673] text-[#E1E8EC] text-xs font-semibold hover:bg-[#263744] transition-all"
          >
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#344956] p-6 sm:p-8 rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#526673]">
        <div className="flex items-center gap-3">
          <div 
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-[#E1E8EC] ${
              isAdmin ? 'bg-[#527D91]' : 'bg-[#344956]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isAdmin ? 'admin_panel_settings' : 'view_quilt'}
            </span>
          </div>
          <div>
            <h2 className="font-headline-md text-lg font-bold text-[#E1E8EC]">{title}</h2>
            <span className="text-xs text-[#B4C5CE]">
              {isAdmin 
                ? 'Módulo Administrativo Global • Visão Consolidada' 
                : `Módulo da Empresa • ${user?.companyName}`}
            </span>
          </div>
        </div>

        <span 
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isAdmin 
              ? 'bg-[#EFA339]/10 text-[#F5C26B] border border-[#EFA339]/30'
              : 'bg-[#263744] text-[#D0B783] border border-[#D0B783]/30'
          }`}
        >
          {isAdmin ? 'Acesso Master' : 'Permissão Local'}
        </span>
      </div>

      <div className="mb-6 space-y-2 text-sm text-[#B4C5CE] leading-relaxed">
        <p>
          Esta tela é uma das <strong>8 telas oficiais</strong> do sistema <strong>REOBOTE</strong>. 
          {isAdmin 
            ? ' Como Administrador, você possui controle sobre as configurações globais, credenciais da Meta WhatsApp Cloud API e supervisão de todas as unidades.' 
            : ' Como Usuário/Atendente, sua operação é estritamente isolada aos atendimentos, contatos e mensagens da sua unidade comercial.'}
        </p>
        <p className="text-xs text-[#B4C5CE]/80">
          * Em ambiente de produção com Supabase conectado, o isolamento dos dados da empresa será assegurado por políticas de segurança <em>Row Level Security (RLS)</em> no banco de dados.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#526673]">
        <div className="p-3.5 rounded-lg bg-[#263744] border border-[#526673]">
          <span className="text-xs font-semibold text-[#E1E8EC] block mb-1">
            Escopo de Dados
          </span>
          <span className="text-xs font-medium text-[#E1E8EC]">
            {isAdmin ? 'Todas as Empresas (Global)' : user?.companyName}
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-[#263744] border border-[#526673]">
          <span className="text-xs font-semibold text-[#E1E8EC] block mb-1">
            Nível de Permissão
          </span>
          <span className="text-xs font-medium text-[#8FE3AC]">
            {isAdmin ? 'Gerenciamento & Configuração' : 'Operação de Atendimento'}
          </span>
        </div>

        <div className="p-3.5 rounded-lg bg-[#263744] border border-[#526673]">
          <span className="text-xs font-semibold text-[#E1E8EC] block mb-1">
            Status da Conexão
          </span>
          <span className="text-xs text-[#8FE3AC] font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#39AC6B]" />
            Meta WhatsApp Cloud API
          </span>
        </div>
      </div>
    </div>
  );
}
