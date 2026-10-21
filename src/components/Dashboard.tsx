import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  isPositive?: boolean;
  subtitle: string;
  icon: string;
  accentColor?: string;
}

function StatCard({ title, value, change, isPositive, subtitle, icon, accentColor = '#C5A15B' }: StatCardProps) {
  return (
    <div className="bg-white p-5 rounded-xl border border-[#D8E0EA] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)] flex flex-col justify-between transition-all duration-200 hover:shadow-md">
      <div className="flex items-start justify-between">
        <span className="font-label-sm text-[11px] uppercase tracking-wider font-semibold text-[#5B6E87]">
          {title}
        </span>
        <div 
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-xs"
          style={{ backgroundColor: accentColor }}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      
      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-[#34445C] tabular-nums tracking-tight">
            {value}
          </span>
          {change && (
            <span 
              className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                isPositive 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {change}
            </span>
          )}
        </div>
        <p className="text-xs text-[#5B6E87] mt-1 font-normal">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [period, setPeriod] = useState<'hoje' | '7dias' | '30dias'>('hoje');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Dados do Administrador
  const [allConversations, setAllConversations] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [whatsappInfo, setWhatsappInfo] = useState<{
    connected: boolean;
    phoneNumber?: string;
    phoneNumberId?: string;
    wabaId?: string;
    maskedToken?: string;
    verifiedName?: string;
    webhookUrl?: string;
    verifyToken?: string;
    qualityRating?: string;
    lastChecked?: string;
  }>({
    connected: false,
  });

  // Dados do Atendente (Métricas Reais)
  const [attendantStats, setAttendantStats] = useState<{
    attendantName: string;
    meusAtivos: number;
    finalizadosHoje: number;
    tempoMedioResposta: string | null;
    filaGeralEmpresa: number | null;
    conversas: any[];
    whatsappStatus: {
      connected: boolean;
      phoneNumber: string | null;
      lastChecked: string | null;
    };
  }>({
    attendantName: user?.name || 'Atendente Operacional',
    meusAtivos: 0,
    finalizadosHoje: 0,
    tempoMedioResposta: null,
    filaGeralEmpresa: null,
    conversas: [],
    whatsappStatus: {
      connected: false,
      phoneNumber: null,
      lastChecked: null,
    },
  });

  // Campos do Modal de Configuração do WhatsApp (Admin)
  const [cfgPhone, setCfgPhone] = useState('');
  const [cfgPhoneId, setCfgPhoneId] = useState('');
  const [cfgWabaId, setCfgWabaId] = useState('');
  const [cfgToken, setCfgToken] = useState('');
  const [cfgVerifyToken, setCfgVerifyToken] = useState('');
  const [modalFeedback, setModalFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadData();

    // Polling leve para o atendente: atualiza dados a cada 30 segundos
    if (!isAdmin) {
      pollIntervalRef.current = setInterval(() => {
        loadData();
      }, 30000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isAdmin, user]);

  const loadData = async () => {
    try {
      setLoading(true);

      if (isAdmin) {
        // Carrega dados globais da empresa/sistema
        const convs = await api.getConversations();
        setAllConversations(convs);

        const uList = await api.getUsers();
        setUsersList(uList);

        const wa = await api.getWhatsAppConfig();
        setWhatsappInfo({
          connected: wa.isVerified,
          phoneNumber: wa.phoneNumber,
          phoneNumberId: wa.phoneNumberId,
          wabaId: wa.wabaId,
          maskedToken: wa.maskedToken,
          verifiedName: wa.verifiedName,
          webhookUrl: wa.webhookUrl,
          verifyToken: wa.verifyToken,
          qualityRating: wa.qualityRating,
          lastChecked: wa.lastChecked,
        });

        setCfgPhone(wa.phoneNumber || '');
        setCfgPhoneId(wa.phoneNumberId || '');
        setCfgWabaId(wa.wabaId || '');
        setCfgVerifyToken(wa.verifyToken || 'reobote_webhook_secret_token');
      } else {
        // Carrega métricas e conversas exclusivas do atendente autenticado
        const stats = await api.getAttendantStats();
        setAttendantStats(stats);
      }
    } catch (e) {
      console.error('Erro ao carregar dados do dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWhatsAppConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalFeedback(null);
    setSavingConfig(true);

    try {
      const res = await api.saveWhatsAppConfig({
        phoneNumber: cfgPhone,
        phoneNumberId: cfgPhoneId,
        wabaId: cfgWabaId,
        accessToken: cfgToken.trim() ? cfgToken : undefined,
        verifyToken: cfgVerifyToken,
      });

      setModalFeedback({
        type: 'success',
        message: res.message || 'Configurações salvas no servidor.',
      });

      loadData();
    } catch (err: any) {
      setModalFeedback({
        type: 'error',
        message: err.message || 'Erro ao salvar configuração do WhatsApp.',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestMetaConnection = async () => {
    setModalFeedback(null);
    setTestingConnection(true);

    try {
      const res = await api.verifyWhatsAppConnection();
      setModalFeedback({
        type: 'success',
        message: `Conexão oficial validada com a Meta! Conta: ${res.verifiedName || 'Ativa'}. Qualidade: ${res.qualityRating || 'Verde'}.`,
      });
      loadData();
    } catch (err: any) {
      setModalFeedback({
        type: 'error',
        message: err.message || 'Falha na validação com a Meta. Verifique as credenciais no formulário.',
      });
      loadData();
    } finally {
      setTestingConnection(false);
    }
  };

  // Contagens dinâmicas do Administrador
  const openCount = allConversations.filter((c) => c.status === 'open').length;
  const inProgressCount = allConversations.filter((c) => c.status === 'in_progress').length;
  const closedCount = allConversations.filter((c) => c.status === 'closed').length;
  const unreadTotal = allConversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  // Não lidos atribuídos ao atendente
  const attendantUnreadCount = attendantStats.conversas.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Topo do Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span 
              className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                isAdmin 
                  ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                  : 'bg-blue-100 text-blue-900 border border-blue-300'
              }`}
            >
              {isAdmin ? 'Painel Administrativo' : 'Painel do Atendente'}
            </span>
            <span className="text-xs text-[#5B6E87]">
              • {user?.companyName}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#34445C] tracking-tight">
            {isAdmin 
              ? 'Monitoramento Geral e Indicadores Oficiais' 
              : `Central de Atendimento — ${user?.name}`}
          </h1>
          <p className="text-sm text-[#5B6E87]">
            {isAdmin 
              ? 'Visão consolidada de todas as filas, conexões oficiais Meta WhatsApp e operadores da empresa.'
              : 'Acompanhe seus atendimentos atribuídos e produtividade em tempo real.'}
          </p>
        </div>

        {/* Filtro de Período */}
        <div className="inline-flex bg-white p-1 rounded-lg border border-[#D8E0EA] shadow-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setPeriod('hoje')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              period === 'hoje'
                ? 'bg-[#C5A15B] text-white shadow-xs'
                : 'text-[#5B6E87] hover:text-[#34445C]'
            }`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setPeriod('7dias')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              period === '7dias'
                ? 'bg-[#C5A15B] text-white shadow-xs'
                : 'text-[#5B6E87] hover:text-[#34445C]'
            }`}
          >
            Últimos 7 dias
          </button>
          <button
            type="button"
            onClick={() => setPeriod('30dias')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              period === '30dias'
                ? 'bg-[#C5A15B] text-white shadow-xs'
                : 'text-[#5B6E87] hover:text-[#34445C]'
            }`}
          >
            Últimos 30 dias
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* VISÃO DO ADMINISTRADOR                                               */}
      {/* ==================================================================== */}
      {isAdmin ? (
        <>
          {/* Indicadores Dinâmicos Principais do Administrador */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Atendimentos Abertos"
              value={String(openCount + inProgressCount)}
              change={`${openCount} na fila`}
              subtitle="Conversas aguardando ou em curso"
              icon="pending_actions"
              accentColor="#C5A15B"
            />

            <StatCard
              title="Atendimentos Finalizados"
              value={String(closedCount)}
              subtitle="Encerrados com sucesso no banco de dados"
              icon="task_alt"
              accentColor="#34445C"
            />

            <StatCard
              title="Atendentes"
              value={String(usersList.length)}
              subtitle="Operadores cadastrados no sistema"
              icon="manage_accounts"
              accentColor="#34445C"
            />

            <StatCard
              title="Aguardando Atendimento"
              value={String(openCount)}
              subtitle="Conversas aguardando resposta"
              icon="pending_actions"
              accentColor="#E27D60"
            />



          </div>

          {/* Grid Central do Administrador */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Coluna 1 & 2: Monitoramento Geral & Equipe */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Ações Rápidas do Administrador */}
              <div className="bg-white p-5 rounded-xl border border-[#D8E0EA] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)]">
                <div className="p-5 border-b border-[#D8E0EA] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#34445C] text-[20px]">
                      settings
                    </span>
                    <h2 className="font-headline-md text-base font-semibold text-[#34445C]">
                      Configurações do WhatsApp
                    </h2>
                  </div>
                </div>
                <div className="p-6 text-center">
                  <p className="text-sm text-[#5B6E87] mb-6">
                    Configure as credenciais oficiais da Meta WhatsApp Business Cloud API para enviar e receber mensagens em tempo real.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(true)}
                    className="px-4 py-2 rounded-lg bg-[#C5A15B] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2 mx-auto"
                  >
                    <span className="material-symbols-outlined text-[16px]">settings</span>
                    <span>Configurar Conexão WhatsApp</span>
                  </button>
                </div>
              </div>

            </div>


          </div>
        </>
      ) : (
        /* ==================================================================== */
        /* VISÃO DO ATENDENTE (MÉTRICAS E ATENDIMENTOS ESTRITAMENTE REAIS)      */
        /* ==================================================================== */
        <>
          {/* Indicadores Dinâmicos Reais do Atendente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Meus Atendimentos Ativos"
              value={String(attendantStats.meusAtivos)}
              subtitle="Conversas sob sua responsabilidade direta"
              icon="headset_mic"
              accentColor="#34445C"
            />

            <StatCard
              title="Finalizados Hoje"
              value={String(attendantStats.finalizadosHoje)}
              isPositive={attendantStats.finalizadosHoje > 0}
              subtitle="Casos resolvidos e encerrados por você"
              icon="check_circle"
              accentColor="#C5A15B"
            />

            <StatCard
              title="Tempo Médio de Resposta"
              value={attendantStats.tempoMedioResposta || '—'}
              subtitle={attendantStats.tempoMedioResposta ? 'Baseado nas mensagens respondidas' : 'Sem dados suficientes hoje'}
              icon="timer"
              accentColor="#4F5F78"
            />

            {/* Fila Geral da Empresa (mostrada apenas se autorizado) ou Mensagens Pendentes */}
            {attendantStats.filaGeralEmpresa !== null ? (
              <StatCard
                title="Fila Geral da Empresa"
                value={String(attendantStats.filaGeralEmpresa)}
                subtitle="Aguardando atendimento na unidade"
                icon="hourglass_top"
                accentColor="#E27D60"
              />
            ) : (
              <StatCard
                title="Mensagens na Sua Fila"
                value={String(attendantUnreadCount)}
                subtitle="Mensagens pendentes de leitura"
                icon="mark_chat_unread"
                accentColor="#E27D60"
              />
            )}
          </div>

          {/* Grid Central do Atendente */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna 1 & 2: Minhas Conversas Atribuídas */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-[#D8E0EA] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)] overflow-hidden">
                <div className="p-5 border-b border-[#D8E0EA] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#34445C] text-[20px]">
                      support_agent
                    </span>
                    <h2 className="font-headline-md text-base font-semibold text-[#34445C]">
                      Minhas Conversas Atribuídas ({attendantStats.conversas.length})
                    </h2>
                  </div>
                  <Link
                    to="/atendimento"
                    className="text-xs font-semibold text-[#C5A15B] hover:underline flex items-center gap-1"
                  >
                    <span>Abrir Chat WhatsApp</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>

                {loading ? (
                  <div className="p-8 text-center text-xs text-[#5B6E87]">
                    Carregando atendimentos atribuídos...
                  </div>
                ) : attendantStats.conversas.length === 0 ? (
                  <div className="p-10 text-center flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-[#F6FAFF] border border-[#D8E0EA] flex items-center justify-center text-[#5B6E87] mb-3">
                      <span className="material-symbols-outlined text-[24px]">inbox</span>
                    </div>
                    <h3 className="text-sm font-semibold text-[#34445C] mb-1">
                      Nenhum atendimento atribuído no momento
                    </h3>
                    <p className="text-xs text-[#5B6E87] max-w-sm mb-4 leading-relaxed">
                      Você não possui conversas ativas em sua fila individual. Novos atendimentos atribuídos a você aparecerão aqui automaticamente.
                    </p>
                    <Link
                      to="/atendimento"
                      className="px-4 py-2 rounded-lg bg-[#C5A15B] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs inline-flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">chat</span>
                      <span>Ir para Atendimento WhatsApp</span>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-[#D8E0EA]">
                    {attendantStats.conversas.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 hover:bg-[#F6FAFF] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-[#34445C] text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                            {item.contactName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-[#34445C] truncate">
                                {item.contactName}
                              </p>
                              {item.unreadCount > 0 && (
                                <span className="w-2 h-2 rounded-full bg-[#C5A15B]" title="Nova mensagem" />
                              )}
                              <span className="text-[11px] text-[#5B6E87]">
                                {item.contactPhone}
                              </span>
                            </div>
                            <p className="text-xs text-[#5B6E87] truncate mt-0.5">
                              {item.lastMessage || 'Sem mensagens anteriores.'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 flex-shrink-0 justify-between sm:justify-end">
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                              item.status === 'open'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : item.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}
                          >
                            {item.status === 'open' ? 'Aguardando' : item.status === 'in_progress' ? 'Em atendimento' : 'Resolvido'}
                          </span>

                          <Link
                            to={`/atendimento?id=${item.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#34445C] text-white hover:bg-[#253246] transition-colors text-xs font-semibold shadow-xs cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[15px]">chat</span>
                            <span>Abrir Atendimento</span>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Coluna 3: Ações Rápidas do Atendente */}
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-xl border border-[#D8E0EA] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)]">
                <h3 className="font-headline-md text-sm font-semibold text-[#34445C] mb-3">
                  Ações Rápidas
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <Link
                    to="/atendimento"
                    className="p-3 rounded-lg border border-[#D8E0EA] hover:border-[#C5A15B] hover:bg-[#F6FAFF] transition-all text-left flex flex-col gap-1 group"
                  >
                    <span className="material-symbols-outlined text-[#C5A15B] text-[20px]">
                      chat
                    </span>
                    <span className="text-xs font-semibold text-[#34445C] group-hover:text-[#C5A15B]">
                      Atendimento
                    </span>
                  </Link>
                  <Link
                    to="/mensagens"
                    className="p-3 rounded-lg border border-[#D8E0EA] hover:border-[#C5A15B] hover:bg-[#F6FAFF] transition-all text-left flex flex-col gap-1 group"
                  >
                    <span className="material-symbols-outlined text-[#C5A15B] text-[20px]">
                      quickreply
                    </span>
                    <span className="text-xs font-semibold text-[#34445C] group-hover:text-[#C5A15B]">
                      Respostas Prontas
                    </span>
                  </Link>
                  <Link
                    to="/contatos"
                    className="p-3 rounded-lg border border-[#D8E0EA] hover:border-[#C5A15B] hover:bg-[#F6FAFF] transition-all text-left flex flex-col gap-1 group"
                  >
                    <span className="material-symbols-outlined text-[#C5A15B] text-[20px]">
                      contacts
                    </span>
                    <span className="text-xs font-semibold text-[#34445C] group-hover:text-[#C5A15B]">
                      Contatos
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={loadData}
                    className="p-3 rounded-lg border border-[#D8E0EA] hover:border-[#C5A15B] hover:bg-[#F6FAFF] transition-all text-left flex flex-col gap-1 group cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[#C5A15B] text-[20px]">
                      refresh
                    </span>
                    <span className="text-xs font-semibold text-[#34445C] group-hover:text-[#C5A15B]">
                      Atualizar Dados
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Formulário Administrativo Oficial de Conexão WhatsApp (Meta Cloud API) */}
      {showConfigModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-[#34445C]/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D8E0EA] max-w-lg w-full p-6 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E0EA] mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#C5A15B]">
                  settings
                </span>
                <h3 className="font-headline-md text-base font-bold text-[#34445C]">
                  Configuração Oficial do WhatsApp (Meta Cloud API)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-[#5B6E87] hover:text-[#34445C] p-1 cursor-pointer"
                aria-label="Fechar modal"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Alerta de Feedback */}
            {modalFeedback && (
              <div
                className={`p-3 rounded-lg mb-4 text-xs font-medium ${
                  modalFeedback.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                {modalFeedback.message}
              </div>
            )}

            <form onSubmit={handleSaveWhatsAppConfig} className="space-y-3.5 text-xs text-left">
              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Número Oficial da Empresa no WhatsApp *
                </label>
                <input
                  type="text"
                  required
                  value={cfgPhone}
                  onChange={(e) => setCfgPhone(e.target.value)}
                  placeholder="+55 (11) 98000-0199"
                  className="w-full px-3 py-2 rounded border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Phone Number ID (Meta Graph API) *
                </label>
                <input
                  type="text"
                  required
                  value={cfgPhoneId}
                  onChange={(e) => setCfgPhoneId(e.target.value)}
                  placeholder="Ex.: 102938475610293"
                  className="w-full px-3 py-2 rounded border border-[#D8E0EA] text-[#34445C] font-mono text-xs outline-none focus:border-[#C5A15B]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  WhatsApp Business Account ID (WABA ID) *
                </label>
                <input
                  type="text"
                  required
                  value={cfgWabaId}
                  onChange={(e) => setCfgWabaId(e.target.value)}
                  placeholder="Ex.: 109283912093847"
                  className="w-full px-3 py-2 rounded border border-[#D8E0EA] text-[#34445C] font-mono text-xs outline-none focus:border-[#C5A15B]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Token de Acesso do Desenvolvedor Meta (System User Token)
                </label>
                <input
                  type="password"
                  value={cfgToken}
                  onChange={(e) => setCfgToken(e.target.value)}
                  placeholder={whatsappInfo.maskedToken || 'Cole aqui o token de acesso da Meta...'}
                  className="w-full px-3 py-2 rounded border border-[#D8E0EA] text-[#34445C] font-mono text-xs outline-none focus:border-[#C5A15B]"
                />
                <span className="text-[10px] text-[#5B6E87] mt-0.5 block">
                  Segredo armazenado exclusivamente no servidor backend. Nunca exposto ao navegador.
                </span>
              </div>

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Token de Verificação do Webhook (Verify Token)
                </label>
                <input
                  type="text"
                  value={cfgVerifyToken}
                  onChange={(e) => setCfgVerifyToken(e.target.value)}
                  placeholder="reobote_webhook_secret_token"
                  className="w-full px-3 py-2 rounded border border-[#D8E0EA] text-[#34445C] font-mono text-xs outline-none focus:border-[#C5A15B]"
                />
              </div>

              {whatsappInfo.webhookUrl && (
                <div className="p-3 bg-[#F6FAFF] border border-[#D8E0EA] rounded-lg">
                  <span className="text-[10px] font-bold uppercase text-[#5B6E87] block mb-1">
                    URL Oficial do Webhook (Cole no Painel Meta Developer):
                  </span>
                  <code className="text-[11px] font-mono text-[#34445C] break-all select-all block">
                    {whatsappInfo.webhookUrl}
                  </code>
                </div>
              )}

              <div className="pt-3 border-t border-[#D8E0EA] flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestMetaConnection}
                  disabled={testingConnection}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  <span>{testingConnection ? 'Validando na Meta...' : 'Testar Conexão Oficial'}</span>
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="px-4 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] font-semibold hover:bg-[#F6FAFF] cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="px-4 py-2 rounded-lg bg-[#C5A15B] text-white font-semibold hover:brightness-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {savingConfig ? 'Salvando...' : 'Salvar Configurações'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
