import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

type Periodo = 'hoje' | '7dias' | 'mes' | 'personalizado';
type CategoriaKey = 'finalizados' | 'respondidos' | 'semResposta' | 'abriuNaoRespondeu';

interface ConversationItem {
  id: string;
  status?: string | null;
  visualStatus?: string | null;
  lastAgentMessageStatus?: string | null;
  createdAt?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  lastMessage?: string | null;
  unreadCount?: number | null;
}

interface CategoriaConfig {
  key: CategoriaKey;
  label: string;
  color: string;
  descricao: string;
}

const CATEGORIAS: CategoriaConfig[] = [
  {
    key: 'finalizados',
    label: 'Finalizados',
    color: '#C9AE69',
    descricao: 'Atendimentos encerrados no período',
  },
  {
    key: 'respondidos',
    label: 'Respondidos',
    color: '#39AC6B',
    descricao: 'Recebeu resposta e ainda não há confirmação de leitura do cliente',
  },
  {
    key: 'semResposta',
    label: 'Sem resposta',
    color: '#EFA339',
    descricao: 'Recebido e ainda sem resposta do atendente',
  },
  {
    key: 'abriuNaoRespondeu',
    label: 'Abriu e não respondeu',
    color: '#636E72',
    descricao: 'Cliente confirmou a leitura da resposta e não enviou nova mensagem',
  },
];

const PERIODOS: Array<{ key: Periodo; label: string }> = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7dias', label: '7 dias' },
  { key: 'mes', label: 'Mês atual' },
  { key: 'personalizado', label: 'Personalizado' },
];

/**
 * Cada atendimento entra em exatamente uma categoria (mutuamente exclusivas):
 * - Finalizados: status 'closed' no banco.
 * - Abriu e não respondeu: resposta do atendente já marcada como 'read' pelo
 *   WhatsApp (confirmação de leitura) e nenhuma mensagem posterior do cliente.
 * - Respondidos: resposta do atendente ainda sem confirmação de leitura.
 * - Sem resposta: recebido e ainda sem resposta válida do atendente.
 *
 * Não presumimos leitura: sem o evento 'read' do canal, o atendimento fica em
 * "Respondidos", nunca em "Abriu e não respondeu".
 */
function categorizar(conv: ConversationItem): CategoriaKey {
  if (conv.status === 'closed') {
    return 'finalizados';
  }

  if (conv.visualStatus === 'replied') {
    return conv.lastAgentMessageStatus === 'read' ? 'abriuNaoRespondeu' : 'respondidos';
  }

  return 'semResposta';
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRange(periodo: Periodo, customStart: string, customEnd: string): { from: number; to: number } {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  if (periodo === 'hoje') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from: from.getTime(), to: endOfToday.getTime() };
  }

  if (periodo === '7dias') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - 6);
    return { from: from.getTime(), to: endOfToday.getTime() };
  }

  if (periodo === 'mes') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.getTime(), to: endOfToday.getTime() };
  }

  const from = customStart ? new Date(`${customStart}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const to = customEnd ? new Date(`${customEnd}T23:59:59.999`).getTime() : endOfToday.getTime();
  return { from, to };
}

function formatPercent(value: number, total: number): string {
  if (total <= 0) return '0%';
  const percent = (value / total) * 100;
  return percent % 1 === 0 ? `${percent.toFixed(0)}%` : `${percent.toFixed(1)}%`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SliceData extends CategoriaConfig {
  value: number;
  pct: string;
}

function PieSvg({
  slices,
  total,
  onSelect,
}: {
  slices: SliceData[];
  total: number;
  onSelect: (key: CategoriaKey) => void;
}) {
  const cx = 100;
  const cy = 100;
  const radius = 78;
  const nonZero = slices.filter((slice) => slice.value > 0);
  let cursor = -Math.PI / 2;

  return (
    <svg
      viewBox="0 0 200 200"
      className="w-full max-w-[250px]"
      role="img"
      aria-label="Distribuição dos atendimentos por situação"
    >
      {nonZero.length === 1 ? (
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill={nonZero[0].color}
          stroke="#17374A"
          strokeWidth={2}
          className="cursor-pointer transition-opacity hover:opacity-85"
          onClick={() => onSelect(nonZero[0].key)}
        >
          <title>{`${nonZero[0].label}: ${nonZero[0].value} (${nonZero[0].pct})`}</title>
        </circle>
      ) : (
        nonZero.map((slice) => {
          const angle = (slice.value / total) * Math.PI * 2;
          const start = cursor;
          const end = cursor + angle;
          cursor = end;

          const largeArc = angle > Math.PI ? 1 : 0;
          const startX = cx + radius * Math.cos(start);
          const startY = cy + radius * Math.sin(start);
          const endX = cx + radius * Math.cos(end);
          const endY = cy + radius * Math.sin(end);
          const path = [
            `M ${cx} ${cy}`,
            `L ${startX} ${startY}`,
            `A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`,
            'Z',
          ].join(' ');

          return (
            <path
              key={slice.key}
              d={path}
              fill={slice.color}
              stroke="#17374A"
              strokeWidth={2}
              className="cursor-pointer transition-opacity hover:opacity-85"
              onClick={() => onSelect(slice.key)}
            >
              <title>{`${slice.label}: ${slice.value} (${slice.pct})`}</title>
            </path>
          );
        })
      )}
    </svg>
  );
}

export function PieChartDeAtendimentos({ isAdmin }: { isAdmin: boolean }) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [customStart, setCustomStart] = useState(() => toDateInputValue(new Date()));
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue(new Date()));
  const [selected, setSelected] = useState<CategoriaKey | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!isAdmin) return;
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await api.getConversations();
        setConversations(Array.isArray(data) ? (data as ConversationItem[]) : []);
      } catch {
        setError('Não foi possível carregar os atendimentos. Tente novamente.');
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [isAdmin]
  );

  useEffect(() => {
    load();
    const interval = window.setInterval(() => load(true), 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  const { from, to, intervaloInvalido } = useMemo(() => {
    const range = getRange(periodo, customStart, customEnd);
    const invalid =
      periodo === 'personalizado' &&
      Boolean(customStart) &&
      Boolean(customEnd) &&
      customStart > customEnd;
    return { ...range, intervaloInvalido: invalid };
  }, [periodo, customStart, customEnd]);

  const recebidos = useMemo(() => {
    if (intervaloInvalido) return [];
    return conversations.filter((conversation) => {
      if (!conversation.createdAt) return false;
      const timestamp = new Date(conversation.createdAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= from && timestamp <= to;
    });
  }, [conversations, from, to, intervaloInvalido]);

  const contagem = useMemo(() => {
    const counts: Record<CategoriaKey, number> = {
      finalizados: 0,
      respondidos: 0,
      semResposta: 0,
      abriuNaoRespondeu: 0,
    };
    for (const conversation of recebidos) {
      counts[categorizar(conversation)] += 1;
    }
    return counts;
  }, [recebidos]);

  const total = recebidos.length;
  const slices: SliceData[] = CATEGORIAS.map((categoria) => ({
    ...categoria,
    value: contagem[categoria.key],
    pct: formatPercent(contagem[categoria.key], total),
  }));

  const selectedConfig = selected ? CATEGORIAS.find((categoria) => categoria.key === selected) ?? null : null;
  const selectedConversations = selected
    ? recebidos
        .filter((conversation) => categorizar(conversation) === selected)
        .sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        )
    : [];

  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      {/* Indicador geral separado: total de recebidos (Regra 9) */}
      <div className="bg-[#17374A] p-4 rounded-xl border border-[#2B3D50] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A0B0BA]">
              Total de recebidos
            </p>
            <p className="text-2xl font-bold text-[#F5F2EA] tabular-nums tracking-tight">{total}</p>
            <p className="text-[10px] text-[#A0B0BA] mt-1">
              Atendimentos criados no período selecionado
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#C9AE69]/15 border border-[#C9AE69]/30 flex items-center justify-center text-[#C9AE69] flex-shrink-0">
            <span className="material-symbols-outlined text-[20px]">mark_email_read</span>
          </div>
        </div>
      </div>

      <div className="bg-[#17374A] rounded-xl border border-[#2B3D50] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)] overflow-hidden">
        <div className="p-4 border-b border-[#2B3D50] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#F5F2EA] text-[20px]">pie_chart</span>
            <div>
              <h2 className="text-base font-semibold text-[#F5F2EA]">Situação dos atendimentos</h2>
              <p className="text-[11px] text-[#A0B0BA]">
                Distribuição por situação — dados reais do Supabase
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#2B3D50] text-[11px] font-semibold text-[#A0B0BA] hover:text-[#F5F2EA] hover:border-[#C9AE69] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>Atualizar</span>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-1 bg-[#101D2D] p-1 rounded-lg border border-[#2B3D50] w-fit max-w-full">
            {PERIODOS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPeriodo(option.key)}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  periodo === option.key
                    ? 'bg-[#C9AE69] text-[#F5F2EA] shadow-xs'
                    : 'text-[#A0B0BA] hover:text-[#F5F2EA]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {periodo === 'personalizado' && (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <label className="flex flex-col gap-1 text-[10px] font-semibold text-[#A0B0BA]">
                Data inicial
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="bg-[#101D2D] border border-[#2B3D50] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F2EA] outline-none focus:border-[#C9AE69]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[10px] font-semibold text-[#A0B0BA]">
                Data final
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="bg-[#101D2D] border border-[#2B3D50] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F2EA] outline-none focus:border-[#C9AE69]"
                />
              </label>
            </div>
          )}

          {intervaloInvalido && (
            <p className="text-[11px] text-[#EFA339]">
              A data inicial não pode ser posterior à data final.
            </p>
          )}

          {error && conversations.length > 0 && (
            <p className="text-[11px] text-[#D14747]">{error}</p>
          )}

          {loading && conversations.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#2B3D50] border-t-[#C9AE69] animate-spin" />
              <p className="text-xs text-[#A0B0BA]">Carregando atendimentos...</p>
            </div>
          ) : error && conversations.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
              <span className="material-symbols-outlined text-[#D14747] text-[28px]">error</span>
              <p className="text-xs text-[#A0B0BA] max-w-sm">{error}</p>
              <button
                type="button"
                onClick={() => load()}
                className="px-3 py-1.5 rounded-lg bg-[#C9AE69] text-[#F5F2EA] text-xs font-semibold hover:brightness-95 transition-all cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : total === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-center">
              <span className="material-symbols-outlined text-[#A0B0BA] text-[28px]">inbox</span>
              <p className="text-xs text-[#A0B0BA]">
                {intervaloInvalido
                  ? 'Corrija o período personalizado para visualizar os dados.'
                  : 'Nenhum atendimento recebido no período selecionado.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="flex justify-center">
                <PieSvg slices={slices} total={total} onSelect={setSelected} />
              </div>
              <ul className="space-y-1">
                {slices.map((slice) => (
                  <li key={slice.key}>
                    <button
                      type="button"
                      onClick={() => setSelected(slice.key)}
                      title={slice.descricao}
                      className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[#101D2D] transition-colors text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="text-xs text-[#F5F2EA] truncate">{slice.label}</span>
                      </span>
                      <span className="text-xs tabular-nums text-[#F5F2EA] flex-shrink-0">
                        {slice.value} <span className="text-[#A0B0BA]">({slice.pct})</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] leading-relaxed text-[#A0B0BA] border-t border-[#2B3D50] pt-3">
            “Abriu e não respondeu” usa a confirmação de leitura (status{' '}
            <code className="text-[#C9AE69]">read</code>) enviada pelo WhatsApp. Sem esse evento do
            canal, o atendimento permanece em “Respondidos”; nenhum valor é presumido.
          </p>
        </div>
      </div>

      {selectedConfig && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Atendimentos: ${selectedConfig.label}`}
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#17374A] border border-[#2B3D50] rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 border-b border-[#2B3D50] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#F5F2EA]">{selectedConfig.label}</h3>
                <p className="text-[11px] text-[#A0B0BA] mt-0.5">
                  {selectedConversations.length} atendimento(s) •{' '}
                  {formatPercent(selectedConversations.length, total)} do período
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[#A0B0BA] hover:text-[#F5F2EA] p-1 cursor-pointer"
                aria-label="Fechar lista de atendimentos"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="overflow-y-auto divide-y divide-[#2B3D50]">
              {selectedConversations.length === 0 ? (
                <p className="p-6 text-center text-xs text-[#A0B0BA]">
                  Nenhum atendimento nesta situação no período selecionado.
                </p>
              ) : (
                selectedConversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-[#101D2D] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F5F2EA] truncate">
                        {conversation.contactName || 'Sem nome'}
                      </p>
                      <p className="text-[11px] text-[#A0B0BA] truncate">
                        {conversation.contactPhone || 'Telefone não informado'}
                      </p>
                      <p className="text-[10px] text-[#A0B0BA] mt-0.5">
                        Recebido em {formatDateTime(conversation.createdAt)}
                      </p>
                    </div>
                    <Link
                      to={`/atendimento?id=${conversation.id}`}
                      onClick={() => setSelected(null)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#17374A] border border-[#2B3D50] text-[11px] font-semibold text-[#F5F2EA] hover:border-[#C9AE69] transition-colors flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      <span>Abrir</span>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
