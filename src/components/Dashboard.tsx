import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  ConversationStatusIndicator,
  ConversationStatusLegend,
} from './ConversationStatusIndicator';
import { ConversationEventTimes } from './ConversationEventTimes';
import { EmergencyAICard } from './EmergencyAICard';
import { PieChartDeAtendimentos } from './PieChartDeAtendimentos';

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  subtitle: string;
  icon: string;
  accentColor?: string;
}

function StatCard({ title, value, change, subtitle, icon, accentColor = '#527D91' }: StatCardProps) {
  const iconTextColor = accentColor === '#EFA339' ? '#263744' : '#FFFFFF';
  return (
    <div className="bg-[#344956] p-4 rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between">
        <span className="font-label-sm text-[11px] uppercase tracking-wider font-semibold text-[#B4C5CE]">{title}</span>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 shadow-xs" style={{ backgroundColor: accentColor, color: iconTextColor }}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[#E1E8EC] tabular-nums tracking-tight">{value}</span>
          {change && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[#EFA339]/10 text-[#F5C26B] border border-[#EFA339]/30">{change}</span>}
        </div>
        <p className="text-[10px] text-[#B4C5CE] mt-1 font-normal">{subtitle}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [period, setPeriod] = useState<'hoje' | '7dias' | '30dias'>('hoje');
  const [loading, setLoading] = useState(true);

  const [allConversations, setAllConversations] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
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

  const loadData = async () => {
    try {
      setLoading(true);
      if (isAdmin) {
        const [convs, uList] = await Promise.all([api.getConversations(), api.getUsers()]);
        setAllConversations(convs);
        setUsersList(uList);
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

  const openCount = allConversations.filter((c) => c.status === 'open').length;
  const inProgressCount = allConversations.filter((c) => c.status === 'in_progress').length;
  const closedCount = allConversations.filter((c) => c.status === 'closed').length;
  const unreadTotal = allConversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const attendantUnreadCount = attendantStats.conversas.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const recentConversations = allConversations.slice(0, 5);

  const badgeClassT = isAdmin ? 'bg-[#EFA339]/10 text-[#F5C26B] border border-[#EFA339]/30' : 'bg-[#263744] text-[#D0B783] border border-[#D0B783]/30';
  const badgeLabelT = isAdmin ? 'Painel Administrativo' : 'Painel do Atendente';
  const pageTitleT = isAdmin ? 'Monitoramento Geral e Indicadores' : `Central de Atendimento — ${user?.name}`;
  const pageSubtitleT = isAdmin ? 'Visão consolidada de todas as filas, operadores e métricas da empresa.' : 'Acompanhe seus atendimentos atribuídos e produtividade em tempo real.';

  const btnHojeClass = 'px-2 py-1.5 rounded-md text-xs font-semibold transition-all ' + (period === 'hoje' ? 'bg-[#527D91] text-white shadow-xs' : 'text-[#B4C5CE] hover:text-[#E1E8EC]');
  const btn7diasClass = 'px-2 py-1.5 rounded-md text-xs font-semibold transition-all ' + (period === '7dias' ? 'bg-[#527D91] text-white shadow-xs' : 'text-[#B4C5CE] hover:text-[#E1E8EC]');
  const btn30diasClass = 'px-2 py-1.5 rounded-md text-xs font-semibold transition-all ' + (period === '30dias' ? 'bg-[#527D91] text-white shadow-xs' : 'text-[#B4C5CE] hover:text-[#E1E8EC]');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={badgeClassT}>{badgeLabelT}</span>
            <span className="text-xs text-[#B4C5CE]">• {user?.companyName}</span>
          </div>
          <h1 className="text-xl font-bold text-[#E1E8EC] tracking-tight">{pageTitleT}</h1>
          <p className="text-xs text-[#B4C5CE]">{pageSubtitleT}</p>
        </div>
        {period && (
          <div className="flex bg-[#344956] p-1 rounded-lg border border-[#526673] shadow-xs gap-1">
            <button type="button" onClick={() => setPeriod('hoje')} className={btnHojeClass}>Hoje</button>
            <button type="button" onClick={() => setPeriod('7dias')} className={btn7diasClass}>7 dias</button>
            <button type="button" onClick={() => setPeriod('30dias')} className={btn30diasClass}>30 dias</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {isAdmin ? (
          <>
            <StatCard title="Atendimentos Abertos" value={String(openCount + inProgressCount)} change={`${openCount} na fila`} subtitle="Conversas aguardando ou em curso" icon="pending_actions" accentColor="#527D91" />
            <StatCard title="Atendimentos Finalizados" value={String(closedCount)} subtitle="Encerrados com sucesso no banco de dados" icon="task_alt" accentColor="#527D91" />
            <StatCard title="Atendentes" value={String(usersList.length)} subtitle="Operadores cadastrados no sistema" icon="manage_accounts" accentColor="#527D91" />
            <StatCard title="Aguardando Atendimento" value={String(openCount)} subtitle="Conversas aguardando resposta" icon="pending_actions" accentColor="#EFA339" />
          </>
        ) : (
          <>
            <StatCard title="Meus Atendimentos Ativos" value={String(attendantStats.meusAtivos)} subtitle="Conversas sob sua responsabilidade direta" icon="headset_mic" accentColor="#527D91" />
            <StatCard title="Finalizados Hoje" value={String(attendantStats.finalizadosHoje)} subtitle="Casos resolvidos e encerrados por você" icon="check_circle" accentColor="#527D91" />
            <StatCard title="Tempo Médio de Resposta" value={attendantStats.tempoMedioResposta || '—'} subtitle={attendantStats.tempoMedioResposta ? 'Baseado nas mensagens respondidas' : 'Sem dados suficientes hoje'} icon="timer" accentColor="#527D91" />
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
          <PieChartDeAtendimentos isAdmin={isAdmin} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#344956] p-4 rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]">
                <div className="p-4 border-b border-[#526673] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#E1E8EC] text-[20px]">monitoring</span>
                    <h2 className="font-headline-md text-base font-semibold text-[#E1E8EC]">Monitoramento Geral de Atendimentos</h2>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm text-[#B4C5CE]">Últimas conversas</p>
                    <ConversationStatusLegend />
                  </div>
                  {recentConversations.length === 0 ? (
                    <p className="text-xs text-[#B4C5CE] text-center py-4">Nenhuma conversa registrada.</p>
                  ) : (
                    <div className="divide-y divide-[#526673]">
                      {recentConversations.map((conv) => (
                        <Link
                          key={conv.id}
                          to={`/atendimento?id=${conv.id}`}
                          className="py-2 flex items-center justify-between gap-3 group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <ConversationStatusIndicator status={conv.visualStatus} unreadCount={conv.unreadCount} />
                              <span className="text-xs font-semibold text-[#E1E8EC] truncate group-hover:text-[#D0B783]">
                                {conv.contactName}
                              </span>
                            </div>
                            <ConversationEventTimes
                              receivedAt={conv.lastCustomerAt}
                              openedAt={conv.openedAt}
                              repliedAt={conv.lastAgentAt}
                              className="mt-1"
                            />
                          </div>
                          <span className="material-symbols-outlined text-[16px] text-[#D0B783] flex-shrink-0">chevron_right</span>
                        </Link>
                      ))}
                    </div>
                  )}
                  <Link to="/atendimento" className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#527D91] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs">
                    <span className="material-symbols-outlined text-[16px]">chat_bubble_outline</span>
                    <span>Ir para Atendimento WhatsApp</span>
                  </Link>
                </div>
              </div>
              <div className="bg-[#344956] p-4 rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]">
                <div className="p-4 border-b border-[#526673] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#E1E8EC] text-[20px]">settings</span>
                    <h2 className="font-headline-md text-base font-semibold text-[#E1E8EC]">Gestão Administrativa</h2>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-sm text-[#B4C5CE] mb-4">Gerencie usuários, contatos, automações e mensagens prontas da sua unidade.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Link to="/atendentes" className="p-3 rounded-lg border border-[#526673] hover:border-[#527D91] hover:bg-[#263744] transition-all text-left flex flex-col gap-1 group">
                      <span className="material-symbols-outlined text-[#D0B783] text-[20px]">manage_accounts</span>
                      <span className="text-xs font-semibold text-[#E1E8EC] group-hover:text-[#D0B783]">Atendentes</span>
                    </Link>
                    <Link to="/contatos" className="p-3 rounded-lg border border-[#526673] hover:border-[#527D91] hover:bg-[#263744] transition-all text-left flex flex-col gap-1 group">
                      <span className="material-symbols-outlined text-[#D0B783] text-[20px]">contacts</span>
                      <span className="text-xs font-semibold text-[#E1E8EC] group-hover:text-[#D0B783]">Contatos</span>
                    </Link>
                    <Link to="/automacoes" className="p-3 rounded-lg border border-[#526673] hover:border-[#527D91] hover:bg-[#263744] transition-all text-left flex flex-col gap-1 group">
                      <span className="material-symbols-outlined text-[#D0B783] text-[20px]">smart_toy</span>
                      <span className="text-xs font-semibold text-[#E1E8EC] group-hover:text-[#D0B783]">Automações</span>
                    </Link>
                    <Link to="/mensagens" className="p-3 rounded-lg border border-[#526673] hover:border-[#527D91] hover:bg-[#263744] transition-all text-left flex flex-col gap-1 group">
                      <span className="material-symbols-outlined text-[#D0B783] text-[20px]">quickreply</span>
                      <span className="text-xs font-semibold text-[#E1E8EC] group-hover:text-[#D0B783]">Mensagens Prontas</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-1">
              <EmergencyAICard />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#344956] rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden">
                <div className="p-4 border-b border-[#526673] flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#E1E8EC] text-[20px]">support_agent</span>
                      <h2 className="font-headline-md text-base font-semibold text-[#E1E8EC]">Minhas Conversas Atribuídas ({attendantStats.conversas.length})</h2>
                    </div>
                    <ConversationStatusLegend className="mt-1.5 ml-7" />
                  </div>
                  <Link to="/atendimento" className="text-xs font-semibold text-[#D0B783] hover:underline flex items-center gap-1">
                    <span>Abrir Chat WhatsApp</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>
                {loading ? (
                  <div className="p-8 text-center text-xs text-[#B4C5CE]">Carregando atendimentos atribuídos...</div>
                ) : attendantStats.conversas.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-[#263744] border border-[#526673] flex items-center justify-center text-[#B4C5CE] mb-3">
                      <span className="material-symbols-outlined text-[24px]">inbox</span>
                    </div>
                    <h3 className="text-sm font-semibold text-[#E1E8EC] mb-1">Nenhum atendimento atribuído no momento</h3>
                    <p className="text-xs text-[#B4C5CE] max-w-sm mb-4 leading-relaxed">Você não possui conversas ativas em sua fila individual. Novos atendimentos atribuídos a você aparecerão aqui automaticamente.</p>
                    <Link to="/atendimento" className="px-4 py-2 rounded-lg bg-[#527D91] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs inline-flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">chat</span>
                      <span>Ir para Atendimento WhatsApp</span>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-[#526673]">
                    {attendantStats.conversas.map((item) => (
                      <div key={item.id} className="p-4 hover:bg-[#263744] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[#344956] text-[#E1E8EC] font-bold text-xs flex items-center justify-center flex-shrink-0">{item.contactName.charAt(0)}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-[#E1E8EC] truncate">{item.contactName}</p>
                              <ConversationStatusIndicator status={item.visualStatus} unreadCount={item.unreadCount} />
                              <span className="text-[11px] text-[#B4C5CE]">{item.contactPhone}</span>
                            </div>
                            <p className="text-xs text-[#B4C5CE] truncate mt-0.5">{item.lastMessage || 'Sem mensagens anteriores.'}</p>
                            <ConversationEventTimes
                              receivedAt={item.lastCustomerAt}
                              openedAt={item.openedAt}
                              repliedAt={item.lastAgentAt}
                              className="mt-1.5"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 flex-shrink-0 justify-between sm:justify-end">
                          <span className={item.status === 'open' ? 'text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#EFA339]/10 text-[#F5C26B] border border-[#EFA339]/30' : item.status === 'in_progress' ? 'text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#263744] text-[#D0B783] border border-[#D0B783]/30' : 'text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#39AC6B]/10 text-[#8FE3AC] border border-[#39AC6B]/30'}>
                            {item.status === 'open' ? 'Aguardando' : item.status === 'in_progress' ? 'Em atendimento' : 'Resolvido'}
                          </span>
                          <Link to={`/atendimento?id=${item.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#344956] text-[#E1E8EC] hover:bg-[#2D404D] transition-colors text-xs font-semibold shadow-xs cursor-pointer">
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
                <div className="bg-[#344956] p-4 rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]">
                  <h3 className="font-headline-md text-sm font-semibold text-[#E1E8EC] mb-3">Ações Rápidas</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Link to="/atendimento" className="p-3 rounded-lg border border-[#526673] hover:border-[#527D91] hover:bg-[#263744] transition-all text-left flex flex-col gap-1 group">
                      <span className="material-symbols-outlined text-[#D0B783] text-[20px]">chat</span>
                      <span className="text-xs font-semibold text-[#E1E8EC] group-hover:text-[#D0B783]">Atendimento</span>
                    </Link>
                    <Link to="/mensagens" className="p-3 rounded-lg border border-[#526673] hover:border-[#527D91] hover:bg-[#263744] transition-all text-left flex flex-col gap-1 group">
                      <span className="material-symbols-outlined text-[#D0B783] text-[20px]">quickreply</span>
                      <span className="text-xs font-semibold text-[#E1E8EC] group-hover:text-[#D0B783]">Respostas Prontas</span>
                    </Link>
                    <Link to="/contatos" className="p-3 rounded-lg border border-[#526673] hover:border-[#527D91] hover:bg-[#263744] transition-all text-left flex flex-col gap-1 group">
                      <span className="material-symbols-outlined text-[#D0B783] text-[20px]">contacts</span>
                      <span className="text-xs font-semibold text-[#E1E8EC] group-hover:text-[#D0B783]">Contatos</span>
                    </Link>
                    <button type="button" onClick={loadData} className="p-3 rounded-lg border border-[#526673] hover:border-[#527D91] hover:bg-[#263744] transition-all text-left flex flex-col gap-1 group cursor-pointer">
                      <span className="material-symbols-outlined text-[#D0B783] text-[20px]">refresh</span>
                      <span className="text-xs font-semibold text-[#E1E8EC] group-hover:text-[#D0B783]">Atualizar Dados</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}