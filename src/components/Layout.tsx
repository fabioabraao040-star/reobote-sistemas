import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAdmin, logout } = useAuth();

  const currentUser = user;

  // Menus distintos e separados para Administrador e Usuário
  const adminNavItems = [
    { name: 'Dashboard Administrativo', path: '/dashboard', icon: 'dashboard', badge: 'Admin' },
    { name: 'Contatos de Clientes', path: '/contatos', icon: 'contacts' },
    { name: 'Usuários e Atendentes', path: '/atendentes', icon: 'manage_accounts', badge: 'Gestão' },
    { name: 'Mensagens Prontas', path: '/mensagens', icon: 'quickreply' },
  ];

  const userNavItems = [
    { name: 'Dashboard da Empresa', path: '/dashboard', icon: 'dashboard' },
    { name: 'Atendimento WhatsApp', path: '/atendimento', icon: 'forum', badge: 'Ao vivo' },
    { name: 'Contatos de Clientes', path: '/contatos', icon: 'contacts' },
    { name: 'Mensagens Prontas', path: '/mensagens', icon: 'quickreply' },
  ];

  const navItems = isAdmin ? adminNavItems : userNavItems;

  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/dashboard':
        return isAdmin ? 'Dashboard Administrativo' : 'Dashboard da Empresa';
      case '/atendimento':
        return isAdmin ? 'Monitoramento Geral de Atendimentos' : 'Atendimento WhatsApp';
      case '/contatos':
        return isAdmin ? 'Gestão Geral de Contatos' : 'Contatos da Unidade';
      case '/atendentes':
        return isAdmin ? 'Gerenciamento de Usuários e Atendentes' : 'Equipe de Atendimento';
      case '/automacoes':
        return isAdmin ? 'Configuração de Automações Globais' : 'Automações da Empresa';
      case '/mensagens':
        return isAdmin ? 'Modelos de Mensagens do Sistema' : 'Mensagens Prontas';
      default:
        return 'Painel de Controle';
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="flex h-screen bg-[#F6FAFF] overflow-hidden">
      {/* Backdrop móvel */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-[#34445C]/40 z-40 lg:hidden backdrop-blur-xs"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Lateral Personalizada por Perfil */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 sm:w-72 bg-white border-r border-[#D8E0EA] flex flex-col justify-between transition-transform duration-300 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Cabeçalho da Sidebar */}
          <div className="h-16 px-5 border-b border-[#D8E0EA] flex items-center justify-between">
            <Link to="/dashboard" className="flex items-center gap-2.5">
              <div 
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${
                  isAdmin ? 'bg-[#C5A15B]' : 'bg-[#34445C]'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isAdmin ? 'admin_panel_settings' : 'headset_mic'}
                </span>
              </div>
              <div className="flex flex-col text-left">
                <span className="font-display-md text-sm font-bold text-[#34445C] tracking-wider uppercase leading-none">
                  REOBOTE
                </span>
                <span className="text-[9px] uppercase tracking-widest font-semibold text-[#5B6E87] mt-0.5">
                  {isAdmin ? 'Painel Administrativo' : 'Central do Usuário'}
                </span>
              </div>
            </Link>

            <button 
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden text-[#5B6E87] hover:text-[#34445C] p-1 cursor-pointer"
              aria-label="Fechar menu"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Tag de Unidade / Empresa */}
          <div className="px-5 py-2.5 bg-[#F6FAFF] border-b border-[#D8E0EA] flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[15px] text-[#C5A15B] flex-shrink-0">
                domain
              </span>
              <span className="text-[11px] font-semibold text-[#34445C] truncate">
                {currentUser?.companyName || '—'}
              </span>
            </div>
            <span 
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase ${
                isAdmin 
                  ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                  : 'bg-blue-100 text-blue-900 border border-blue-300'
              }`}
            >
              {isAdmin ? 'Admin' : 'Usuário'}
            </span>
          </div>

          {/* Navegação Específica do Perfil */}
          <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-210px)]">
            <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-[#5B6E87]/75">
              {isAdmin ? 'Módulos Administrativos' : 'Menu Operacional'}
            </div>
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#C5A15B]/15 text-[#775a1b] border-l-4 border-[#C5A15B]'
                      : 'text-[#5B6E87] hover:bg-[#F6FAFF] hover:text-[#34445C]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span 
                      className={`material-symbols-outlined text-[18px] ${
                        isActive ? 'text-[#C5A15B]' : 'text-[#5B6E87]'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </div>

                  {item.badge && (
                    <span 
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        isActive 
                          ? 'bg-[#C5A15B] text-white' 
                          : 'bg-[#E8EDF3] text-[#5B6E87]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Rodapé da Sidebar: Perfil e Logout */}
        <div className="p-4 border-t border-[#D8E0EA] bg-[#F6FAFF]/90">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 text-white ${
                  isAdmin ? 'bg-[#C5A15B]' : 'bg-[#34445C]'
                }`}
              >
                {currentUser?.avatarText || '—'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#34445C] truncate leading-tight">
                  {currentUser?.name || '—'}
                </p>
                <p className="text-[10px] text-[#5B6E87] truncate">
                  {currentUser?.email || '—'}
                </p>
              </div>
            </div>

            <button 
              type="button"
              onClick={handleLogout}
              className="text-[#5B6E87] hover:text-red-700 p-1.5 rounded transition-colors cursor-pointer"
              title="Encerrar sessão"
              aria-label="Sair"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Área Central de Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        


        {/* Header Principal */}
        <header className="h-14 bg-white border-b border-[#D8E0EA] px-4 sm:px-8 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden text-[#34445C] p-1.5 rounded hover:bg-[#F6FAFF] cursor-pointer"
              aria-label="Abrir menu lateral"
            >
              <span className="material-symbols-outlined text-[24px]">menu</span>
            </button>
            <h1 className="font-headline-md text-base sm:text-lg font-bold text-[#34445C]">
              {getPageTitle(location.pathname)}
            </h1>
          </div>

          {/* Indicadores de Conexão WhatsApp */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
              <span>
                {isAdmin ? 'WhatsApp Master API: Ativo' : 'WhatsApp Unidade: Conectado'}
              </span>
            </div>

            <Link
              to="/atendimento"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C5A15B] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">headset_mic</span>
              <span className="hidden sm:inline">Central</span>
            </Link>
          </div>
        </header>

        {/* Viewport Principal */}
        <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
