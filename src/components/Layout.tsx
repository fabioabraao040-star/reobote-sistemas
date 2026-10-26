import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAdmin, isMasterAdmin, logout } = useAuth();

  const currentUser = user;

  // Menu do ADM MASTER: apenas configuração global. Nenhum módulo operacional.
  const masterNavItems = [
    { name: 'Painel ADM MASTER', path: '/master-admin', icon: 'security', badge: 'Master' },
  ];

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

  const navItems = isMasterAdmin ? masterNavItems : isAdmin ? adminNavItems : userNavItems;

  const panelHome = isMasterAdmin ? '/master-admin' : '/dashboard';

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
      case '/master-admin':
        return 'Painel ADM MASTER';
      default:
        return 'Painel de Controle';
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Determinar se está em uma tela interna (não é o painel inicial do perfil)
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/master-admin';
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const showBackButton = isMobile && !isDashboard;

  // Reagir a redimensionamento/rotação de tela
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lógica do botão voltar
  const handleBack = () => {
    // Se estiver em uma sub-página, volta para o painel inicial do perfil
    if (location.pathname !== panelHome) {
      navigate(panelHome);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="flex h-screen bg-[#263744] overflow-hidden">
      {/* Backdrop móvel */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-[#263744]/70 z-40 lg:hidden backdrop-blur-xs"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Lateral Personalizada por Perfil */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 sm:w-72 bg-[#344956] border-r border-[#526673] flex flex-col justify-between transition-transform duration-300 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Cabeçalho da Sidebar */}
          <div className="h-16 px-5 border-b border-[#526673] flex items-center justify-between">
            <Link to={panelHome} className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#263744] flex-shrink-0 bg-[#D0B783]"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isMasterAdmin ? 'security' : isAdmin ? 'admin_panel_settings' : 'headset_mic'}
                </span>
              </div>
              <div className="flex flex-col text-left">
                <span className="font-display-md text-sm font-bold text-[#E1E8EC] tracking-wider uppercase leading-none">
                  REOBOTE
                </span>
                <span className="text-[9px] uppercase tracking-widest font-semibold text-[#B4C5CE] mt-0.5">
                  {isMasterAdmin ? 'Configuração Global' : isAdmin ? 'Painel Administrativo' : 'Central do Usuário'}
                </span>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden text-[#B4C5CE] hover:text-[#E1E8EC] p-1 cursor-pointer"
              aria-label="Fechar menu"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Tag de Unidade / Empresa */}
          <div className="px-5 py-2.5 bg-[#263744] border-b border-[#526673] flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[15px] text-[#D0B783] flex-shrink-0">
                domain
              </span>
              <span className="text-[11px] font-semibold text-[#E1E8EC] truncate">
                {currentUser?.companyName || '—'}
              </span>
            </div>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase ${
                isMasterAdmin
                  ? 'bg-[#D0B783]/15 text-[#D0B783] border border-[#D0B783]/40'
                  : isAdmin
                    ? 'bg-[#EFA339]/10 text-[#F5C26B] border border-[#EFA339]/30'
                    : 'bg-[#263744] text-[#D0B783] border border-[#D0B783]/30'
              }`}
            >
              {isMasterAdmin ? 'Master' : isAdmin ? 'Admin' : 'Usuário'}
            </span>
          </div>

          {/* Navegação Específica do Perfil */}
          <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-210px)]">
            <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-[#B4C5CE]/75">
              {isMasterAdmin ? 'Painel Master' : isAdmin ? 'Módulos Administrativos' : 'Menu Operacional'}
            </div>
            {navItems.map((item) => {
              // Itens com query string (ex.: /dashboard?config=1) são comparados
              // separadamente para não conflitar com o item principal /dashboard.
              const [itemPath, itemQuery] = item.path.split('?');
              const isConfigLink = Boolean(itemQuery);
              const isActive = isConfigLink
                ? location.pathname === itemPath && location.search.includes(itemQuery)
                : location.pathname === item.path &&
                  !(item.path === '/dashboard' && new URLSearchParams(location.search).get('config') === '1');

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#527D91]/20 text-[#E1E8EC] border-l-4 border-[#527D91]'
                      : 'text-[#B4C5CE] hover:bg-[#263744] hover:text-[#E1E8EC]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        isActive ? 'text-[#D0B783]' : 'text-[#B4C5CE]'
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
                          ? 'bg-[#527D91] text-white'
                          : 'bg-[#263744] text-[#B4C5CE]'
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
        <div className="p-4 border-t border-[#526673] bg-[#263744]/90">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                  isMasterAdmin
                    ? 'bg-[#D0B783] text-[#263744]'
                    : isAdmin
                      ? 'bg-[#527D91] text-white'
                      : 'bg-[#2D404D] text-white'
                }`}
              >
                {currentUser?.avatarText || '—'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#E1E8EC] truncate leading-tight">
                  {currentUser?.name || '—'}
                </p>
                <p className="text-[10px] text-[#B4C5CE] truncate">
                  {currentUser?.email || '—'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="text-[#B4C5CE] hover:text-[#FFA8A8] p-1.5 rounded transition-colors cursor-pointer"
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
        <header className="h-14 bg-[#344956] border-b border-[#526673] px-4 sm:px-8 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Botão Voltar em telas internas (mobile) */}
            {isMobile && !isDashboard && (
              <button
                type="button"
                onClick={handleBack}
                className="lg:hidden text-[#E1E8EC] p-1.5 rounded hover:bg-[#263744] cursor-pointer"
                aria-label="Voltar"
              >
                <span className="material-symbols-outlined text-[24px]">arrow_back</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden text-[#E1E8EC] p-1.5 rounded hover:bg-[#263744] cursor-pointer"
              aria-label="Abrir menu lateral"
            >
              <span className="material-symbols-outlined text-[24px]">menu</span>
            </button>
            <h1 className="font-headline-md text-base sm:text-lg font-bold text-[#E1E8EC]">
              {getPageTitle(location.pathname)}
            </h1>
          </div>

          {/* Indicadores de Conexão WhatsApp */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#39AC6B]/10 border border-[#39AC6B]/30 text-[#8FE3AC] text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-[#39AC6B] animate-pulse" />
              <span>
                {isMasterAdmin
                  ? 'Meta Cloud API: Monitorada'
                  : isAdmin
                    ? 'WhatsApp Master API: Ativo'
                    : 'WhatsApp Unidade: Conectado'}
              </span>
            </div>

            {!isMasterAdmin && (
              <Link
                to="/atendimento"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#527D91] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs"
              >
                <span className="material-symbols-outlined text-[16px]">headset_mic</span>
                <span className="hidden sm:inline">Central</span>
              </Link>
            )}
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
