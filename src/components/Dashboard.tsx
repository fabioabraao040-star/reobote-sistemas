import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ConversationStatusIndicator } from './ConversationStatusIndicator';

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  subtitle: string;
  icon: string;
  accentColor?: string;
}

function StatCard({ title, value, change, subtitle, icon, accentColor = '#C9AE69' }: StatCardProps) {
  return (
    <div className="bg-[#17374A] p-4 rounded-xl border border-[#2B3D50] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)]">
      <div className="flex items-start justify-between">
        <span className="font-label-sm text-[11px] uppercase tracking-wider font-semibold text-[#A0B0BA]">{title}</span>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-[#F5F2EA] flex-shrink-0 shadow-xs" style={{ backgroundColor: accentColor }}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[#F5F2EA] tabular-nums tracking-tight">{value}</span>
          {change && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[#EFA339]/10 text-[#EFA339] border border-[#EFA339]/30">{change}</span>}
        </div>
        <p className="text-[10px] text-[#A0B0BA] mt-1 font-normal">{subtitle}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [period, setPeriod] = useState<'hoje' | '7dias' | '30dias'>('hoje');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [loading, setLoading] = useState(true);

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
  }>({ connected: false });

  const [attendantStats, setAttendantStats] = useState<{
    attendantName: string;
    meusAtivos: number;
    finalizadosHoje: number;
    tempoMedioResposta: string | null;
    filaGeralEmpresa: number | null;
    conversas: any[];
    whatsappStatus: { connected: boolean; phoneNumber: string | null; lastChecked: string | null };
  }>({
    attendantName: user?.name || 'Atendente Operacional',
    meusAtivos: 0,
    finalizadosHoje: 0,
    tempoMedioResposta: null,
    filaGeralEmpresa: null,
    conversas: [],
    whatsappStatus: { connected: false, phoneNumber: null, lastChecked: null },
  });

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
    if (!isAdmin) {
      pollIntervalRef.current = setInterval(() => loadData(), 30000);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isAdmin, user]);

  // Permite abrir o formulário existente por link direto do menu:
  // /dashboard?config=1 (somente administrador).
  useEffect(() => {
    if (isAdmin && searchParams.get('config') === '1') {
      setShowConfigModal(true);
    }
  }, [isAdmin, searchParams]);

  const closeConfigModal = () => {
    setShowConfigModal(false);
    if (searchParams.get('config') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('config');
      setSearchParams(next, { replace: true });
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      if (isAdmin) {
        const [convs, uList, wa] = await Promise.all([api.getConversations(), api.getUsers(), api.getWhatsAppConfig()]);
        setAllConversations(convs);
        setUsersList(uList);
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
        setCfgVerifyToken(wa.verifyToken || '');
      } else {
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
      setModalFeedback({ type: 'success', message: res.message || 'Configurações salvas no servidor.' });
      loadData();
    } catch (err: any) {
      setModalFeedback({ type: 'error', message: err.message || 'Erro ao salvar configuração do WhatsApp.' });
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
      setModalFeedback({ type: 'error', message: err.message || 'Falha na validação com a Meta. Verifique as credenciais no formulário.' });
      loadData();
    } finally {
      setTestingConnection(false);
    }
  };

  const openCount = allConversations.filter((c) => c.status === 'open').length;
  const inProgressCount = allConversations.filter((c) => c.status === 'in_progress').length;
  const closedCount = allConversations.filter((c) => c.status === 'closed').length;
  const unreadTotal = allConversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const attendantUnreadCount = attendantStats.conversas.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  const badgeClassT = isAdmin ? 'bg-[#EFA339]/10 text-[#EFA339] border border-[#EFA339]/30' : 'bg-[#C9AE69]/10 text-[#C9AE69] border border-[#C9AE69]/30';
  const badgeLabelT = isAdmin ? 'Painel Administrativo' : 'Painel do Atendente';
  const pageTitleT = isAdmin ? 'Monitoramento Geral e Indicadores Oficiais' : `Central de Atendimento — ${user?.name}`;
  const pageSubtitleT = isAdmin ? 'Visão consolidada de todas as filas, conexões oficiais Meta WhatsApp e operadores da empresa.' : 'Acompanhe seus atendimentos atribuídos e produtividade em tempo real.';

  const btnHojeClass = 'px-2 py-1.5 rounded-md text-xs font-semibold transition-all ' + (period === 'hoje' ? 'bg-[#C9AE69] text-[#F5F2EA] shadow-xs' : 'text-[#A0B0BA] hover:text-[#F5F2EA]');
  const btn7diasClass = 'px-2 py-1.5 rounded-md text-xs font-semibold transition-all ' + (period === '7dias' ? 'bg-[#C9AE69] text-[#F5F2EA] shadow-xs' : 'text-[#A0B0BA] hover:text-[#F5F2EA]');
  const btn30diasClass = 'px-2 py-1.5 rounded-md text-xs font-semibold transition-all ' + (period === '30dias' ? 'bg-[#C9AE69] text-[#F5F2EA] shadow-xs' : 'text-[#A0B0BA] hover:text-[#F5F2EA]');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={badgeClassT}>{badgeLabelT}</span>
            <span className="text-xs text-[#A0B0BA]">• {user?.companyName}</span>
          </div>
          <h1 className="text-xl font-bold text-[#F5F2EA] tracking-tight">{pageTitleT}</h1>
          <p className="text-xs text-[#A0B0BA]">{pageSubtitleT}</p>
        </div>
        {period && (
          <div className="flex bg-[#17374A] p-1 rounded-lg border border-[#2B3D50] shadow-xs gap-1">
            <button type="button" onClick={() => setPeriod('hoje')} className={btnHojeClass}>Hoje</button>
            <button type="button" onClick={() => setPeriod('7dias')} className={btn7diasClass}>7 dias</button>
            <button type="button" onClick={() => setPeriod('30dias')} className={btn30diasClass}>30 dias</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {isAdmin ? (
          <>
            <StatCard title="Atendimentos Abertos" value={String(openCount + inProgressCount)} change={`${openCount} na fila`} subtitle="Conversas aguardando ou em curso" icon="pending_actions" accentColor="#C9AE69" />
            <StatCard title="Atendimentos Finalizados" value={String(closedCount)} subtitle="Encerrados com sucesso no banco de dados" icon="task_alt" accentColor="#C9AE69" />
            <StatCard title="Atendentes" value={String(usersList.length)} subtitle="Operadores cadastrados no sistema" icon="manage_accounts" accentColor="#C9AE69" />
            <StatCard title="Aguardando Atendimento" value={String(openCount)} subtitle="Conversas aguardando resposta" icon="pending_actions" accentColor="#EFA339" />
          </>
        ) : (
          <>
            <StatCard title="Meus Atendimentos Ativos" value={String(attendantStats.meusAtivos)} subtitle="Conversas sob sua responsabilidade direta" icon="headset_mic" accentColor="#C9AE69" />
            <StatCard title="Finalizados Hoje" value={String(attendantStats.finalizadosHoje)} subtitle="Casos resolvidos e encerrados por você" icon="check_circle" accentColor="#C9AE69" />
            <StatCard title="Tempo Médio de Resposta" value={attendantStats.tempoMedioResposta || '—'} subtitle={attendantStats.tempoMedioResposta ? 'Baseado nas mensagens respondidas' : 'Sem dados suficientes hoje'} icon="timer" accentColor="#4F5F78" />
            {attendantStats.filaGeralEmpresa !== null ? (
              <StatCard title="Fila Geral da Empresa" value={String(attendantStats.filaGeralEmpresa)} subtitle="Aguardando atendimento na unidade" icon="hourglass_top" accentColor="#EFA339" />
            ) : (
              <StatCard title="Mensagens na Sua Fila" value={String(attendantUnreadCount)} subtitle="Mensagens pendentes de leitura" icon="mark_chat_unread" accentColor="#EFA339" />
            )}
          </>
        )}
      </div>

      {isAdmin ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#17374A] p-4 rounded-xl border border-[#2B3D50] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)]">
                <div className="p-4 border-b border-[#2B3D50] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#F5F2EA] text-[20px]">settings</span>
                    <h2 className="font-headline-md text-base font-semibold text-[#F5F2EA]">Configurações do WhatsApp</h2>
                  </div>
                </div>
                <div className="p-4 text-center">
                  <p className="text-sm text-[#A0B0BA] mb-4">Configure as credenciais oficiais da Meta WhatsApp Business Cloud API para enviar e receber mensagens em tempo real.</p>
                  <button type="button" onClick={() => setShowConfigModal(true)} className="w-full py-2.5 rounded-lg bg-[#C9AE69] text-[#F5F2EA] text-xs font-semibold hover:brightness-95 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-[16px]">settings</span>
                    <span>Configurar Conexão WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#17374A] rounded-xl border border-[#2B3D50] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)] overflow-hidden">
                <div className="p-4 border-b border-[#2B3D50] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#F5F2EA] text-[20px]">support_agent</span>
                    <h2 className="font-headline-md text-base font-semibold text-[#F5F2EA]">Minhas Conversas Atribuídas ({attendantStats.conversas.length})</h2>
                  </div>
                  <Link to="/atendimento" className="text-xs font-semibold text-[#C9AE69] hover:underline flex items-center gap-1">
                    <span>Abrir Chat WhatsApp</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>
                {loading ? (
                  <div className="p-8 text-center text-xs text-[#A0B0BA]">Carregando atendimentos atribuídos...</div>
                ) : attendantStats.conversas.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-[#101D2D] border border-[#2B3D50] flex items-center justify-center text-[#A0B0BA] mb-3">
                      <span className="material-symbols-outlined text-[24px]">inbox</span>
                    </div>
                    <h3 className="text-sm font-semibold text-[#F5F2EA] mb-1">Nenhum atendimento atribuído no momento</h3>
                    <p className="text-xs text-[#A0B0BA] max-w-sm mb-4 leading-relaxed">Você não possui conversas ativas em sua fila individual. Novos atendimentos atribuídos a você aparecerão aqui automaticamente.</p>
                    <Link to="/atendimento" className="px-4 py-2 rounded-lg bg-[#C9AE69] text-[#F5F2EA] text-xs font-semibold hover:brightness-95 transition-all shadow-xs inline-flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">chat</span>
                      <span>Ir para Atendimento WhatsApp</span>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-[#2B3D50]">
                    {attendantStats.conversas.map((item) => (
                      <div key={item.id} className="p-4 hover:bg-[#101D2D] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[#17374A] text-[#F5F2EA] font-bold text-xs flex items-center justify-center flex-shrink-0">{item.contactName.charAt(0)}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-[#F5F2EA] truncate">{item.contactName}</p>
                              <ConversationStatusIndicator status={item.visualStatus} unreadCount={item.unreadCount} />
                              <span className="text-[11px] text-[#A0B0BA]">{item.contactPhone}</span>
                            </div>
                            <p className="text-xs text-[#A0B0BA] truncate mt-0.5">{item.lastMessage || 'Sem mensagens anteriores.'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 flex-shrink-0 justify-between sm:justify-end">
                          <span className={item.status === 'open' ? 'text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#EFA339]/10 text-[#EFA339] border border-[#EFA339]/30' : item.status === 'in_progress' ? 'text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#C9AE69]/10 text-[#C9AE69] border border-[#C9AE69]/30' : 'text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#39AC6B]/10 text-[#39AC6B]/90 border border-[#39AC6B]/30'}>
                            {item.status === 'open' ? 'Aguardando' : item.status === 'in_progress' ? 'Em atendimento' : 'Resolvido'}
                          </span>
                          <Link to={`/atendimento?id=${item.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#17374A] text-[#F5F2EA] hover:bg-[#253246] transition-colors text-xs font-semibold shadow-xs cursor-pointer">
                            <span className="material-symbols-outlined text-[15px]">chat</span>
                            <span>Abrir Atendimento</span>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="bg-[#17374A] p-4 rounded-xl border border-[#2B3D50] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)]">
                  <h3 className="font-headline-md text-sm font-semibold text-[#F5F2EA] mb-3">Ações Rápidas</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Link to="/atendimento" className="p-3 rounded-lg border border-[#2B3D50] hover:border-[#C9AE69] hover:bg-[#101D2D] transition-all text-left flex flex-col gap-1 group">
                      <span className="material-symbols-outlined text-[#C9AE69] text-[20px]">chat</span>
                      <span className="text-xs font-semibold text-[#F5F2EA] group-hover:text-[#C9AE69]">Atendimento</span>
                    </Link>
                    <Link to="/mensagens" className="p-3 rounded-lg border border-[#2B3D50] hover:border-[#C9AE69] hover:bg-[#101D2D] transition-all text-left flex flex-col gap-1 group">
                      <span className="material-symbols-outlined text-[#C9AE69] text-[20px]">quickreply</span>
                      <span className="text-xs font-semibold text-[#F5F2EA] group-hover:text-[#C9AE69]">Respostas Prontas</span>
                    </Link>
                    <Link to="/contatos" className="p-3 rounded-lg border border-[#2B3D50] hover:border-[#C9AE69] hover:bg-[#101D2D] transition-all text-left flex flex-col gap-1 group">
                      <span className="material-symbols-outlined text-[#C9AE69] text-[20px]">contacts</span>
                      <span className="text-xs font-semibold text-[#F5F2EA] group-hover:text-[#C9AE69]">Contatos</span>
                    </Link>
                    <button type="button" onClick={loadData} className="p-3 rounded-lg border border-[#2B3D50] hover:border-[#C9AE69] hover:bg-[#101D2D] transition-all text-left flex flex-col gap-1 group cursor-pointer">
                      <span className="material-symbols-outlined text-[#C9AE69] text-[20px]">refresh</span>
                      <span className="text-xs font-semibold text-[#F5F2EA] group-hover:text-[#C9AE69]">Atualizar Dados</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {showConfigModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-[#17374A]/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#17374A] rounded-xl shadow-2xl border border-[#2B3D50] max-w-lg w-full p-6 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#2B3D50] mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#C9AE69]">settings</span>
                <h3 className="font-headline-md text-base font-bold text-[#F5F2EA]">Configuração Oficial do WhatsApp (Meta Cloud API)</h3>
              </div>
              <button type="button" onClick={closeConfigModal} className="text-[#A0B0BA] hover:text-[#F5F2EA] p-1 cursor-pointer" aria-label="Fechar modal">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            {modalFeedback && (
              <div className={modalFeedback.type === 'success' ? 'p-3 rounded-lg mb-4 text-xs font-medium bg-[#39AC6B]/10 border border-[#39AC6B]/30 text-[#39AC6B]/90' : 'p-3 rounded-lg mb-4 text-xs font-medium bg-[#D14747]/10 border border-[#D14747]/30 text-[#D14747]/90'}>
                {modalFeedback.message}
              </div>
            )}
            <form onSubmit={handleSaveWhatsAppConfig} className="space-y-3.5 text-xs text-left">
              <div>
                <label className="font-semibold text-[#F5F2EA] block mb-1">Número Oficial da Empresa no WhatsApp *</label>
                <input type="text" required value={cfgPhone} onChange={(e) => setCfgPhone(e.target.value)} placeholder="+55 (11) 98000-0199" className="w-full px-3 py-2 rounded border border-[#2B3D50] text-[#F5F2EA] outline-none focus:border-[#C9AE69]" />
              </div>
              <div>
                <label className="font-semibold text-[#F5F2EA] block mb-1">Phone Number ID (Meta Graph API) *</label>
                <input type="text" required value={cfgPhoneId} onChange={(e) => setCfgPhoneId(e.target.value)} placeholder="Ex.: 102938475610293" className="w-full px-3 py-2 rounded border border-[#2B3D50] text-[#F5F2EA] font-mono text-xs outline-none focus:border-[#C9AE69]" />
              </div>
              <div>
                <label className="font-semibold text-[#F5F2EA] block mb-1">WhatsApp Business Account ID (WABA ID) *</label>
                <input type="text" required value={cfgWabaId} onChange={(e) => setCfgWabaId(e.target.value)} placeholder="Ex.: 109283912093847" className="w-full px-3 py-2 rounded border border-[#2B3D50] text-[#F5F2EA] font-mono text-xs outline-none focus:border-[#C9AE69]" />
              </div>
              <div>
                <label className="font-semibold text-[#F5F2EA] block mb-1">Token de Acesso do Desenvolvedor Meta (System User Token)</label>
                <input type="password" value={cfgToken} onChange={(e) => setCfgToken(e.target.value)} placeholder={whatsappInfo.maskedToken || 'Cole aqui o token de acesso da Meta...'} className="w-full px-3 py-2 rounded border border-[#2B3D50] text-[#F5F2EA] font-mono text-xs outline-none focus:border-[#C9AE69]" />
                <span className="text-[10px] text-[#A0B0BA] mt-0.5 block">Segredo armazenado exclusivamente no servidor backend. Nunca exposto ao navegador.</span>
              </div>
              <div>
                <label className="font-semibold text-[#F5F2EA] block mb-1">Token de Verificação do Webhook (Verify Token)</label>
                <input type="text" value={cfgVerifyToken} onChange={(e) => setCfgVerifyToken(e.target.value)} placeholder="Token configurado no painel da Meta" className="w-full px-3 py-2 rounded border border-[#2B3D50] text-[#F5F2EA] font-mono text-xs outline-none focus:border-[#C9AE69]" />
              </div>
              {whatsappInfo.webhookUrl && (
                <div className="p-3 bg-[#101D2D] border border-[#2B3D50] rounded-lg">
                  <span className="text-[10px] font-bold uppercase text-[#A0B0BA] block mb-1">URL Oficial do Webhook (Cole no Painel Meta Developer):</span>
                  <code className="text-[11px] font-mono text-[#F5F2EA] break-all select-all block">{whatsappInfo.webhookUrl}</code>
                </div>
              )}
              <div className="pt-3 border-t border-[#2B3D50] flex flex-col sm:flex-row items-center justify-between gap-3">
                <button type="button" onClick={handleTestMetaConnection} disabled={testingConnection} className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-[#39AC6B] text-[#F5F2EA] font-semibold hover:bg-[#39AC6B]/80 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50">
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  <span>{testingConnection ? 'Validando na Meta...' : 'Testar Conexão Oficial'}</span>
                </button>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button type="button" onClick={closeConfigModal} className="px-4 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] font-semibold hover:bg-[#101D2D] cursor-pointer">Fechar</button>
                  <button type="submit" disabled={savingConfig} className="px-4 py-2 rounded-lg bg-[#C9AE69] text-[#F5F2EA] font-semibold hover:brightness-95 transition-all cursor-pointer disabled:opacity-50">{savingConfig ? 'Salvando...' : 'Salvar Configurações'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
