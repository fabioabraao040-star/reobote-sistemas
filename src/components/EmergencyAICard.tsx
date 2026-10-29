import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

type IntegrationState = 'configured' | 'pending' | 'unavailable';
type PendingAction = 'activate' | 'deactivate' | null;

interface EmergencyAIStatus {
  config: {
    id: string | null;
    enabled: boolean;
    provider: string | null;
    model: string | null;
    integrationStatus: IntegrationState | null;
    lastChangedBy: string | null;
    lastChangedByName: string | null;
    lastChangedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  provider: {
    status: IntegrationState;
    provider: string | null;
    model: string | null;
  };
  whatsapp: {
    status: IntegrationState;
    lastChecked: string | null;
  };
  message?: string;
}

interface EmergencyAIHistoryEntry {
  id: string;
  action: 'activate' | 'deactivate';
  actorName: string;
  previousEnabled: boolean;
  newEnabled: boolean;
  result: 'success' | 'failed';
  reason: string | null;
  integrationStatus: IntegrationState;
  createdAt: string;
}

interface Feedback {
  type: 'success' | 'error';
  message: string;
}

const INTEGRATION_META: Record<IntegrationState, {
  label: string;
  feminineLabel: string;
  dot: string;
  text: string;
  box: string;
}> = {
  configured: {
    label: 'Configurado',
    feminineLabel: 'Configurada',
    dot: '#8FE3AC',
    text: 'text-[#8FE3AC]',
    box: 'bg-[#39AC6B]/10 border-[#39AC6B]/30',
  },
  pending: {
    label: 'Pendente',
    feminineLabel: 'Pendente',
    dot: '#F5C26B',
    text: 'text-[#F5C26B]',
    box: 'bg-[#EFA339]/10 border-[#EFA339]/30',
  },
  unavailable: {
    label: 'Indisponível',
    feminineLabel: 'Indisponível',
    dot: '#FFA8A8',
    text: 'text-[#FFA8A8]',
    box: 'bg-[#D14747]/10 border-[#D14747]/30',
  },
};

function formatDateTime(value?: string | null) {
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

function IntegrationStateBadge({
  state,
  feminine = false,
}: {
  state: IntegrationState;
  feminine?: boolean;
}) {
  const meta = INTEGRATION_META[state];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${meta.box} ${meta.text}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: meta.dot }} aria-hidden="true" />
      {feminine ? meta.feminineLabel : meta.label}
    </span>
  );
}

export function EmergencyAICard() {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState<EmergencyAIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<EmergencyAIHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) void loadStatus();
  }, [isAdmin]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await api.getEmergencyAIStatus();
      setStatus(data);
    } catch (error: any) {
      // Nunca inferir "ATIVA" a partir de falha de leitura. O card fica
      // indisponível e as ações são bloqueadas até uma nova confirmação.
      setStatus(null);
      setLoadError(error?.message || 'Não foi possível consultar o estado da IA de Emergência.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const data = await api.getEmergencyAIHistory(20);
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (error: any) {
      setHistory([]);
      setHistoryError(error?.message || 'Não foi possível consultar o histórico da IA de Emergência.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next) void loadHistory();
  };

  const confirmAction = async () => {
    if (!pendingAction || actionLoading) return;

    try {
      setActionLoading(true);
      setFeedback(null);

      const response = pendingAction === 'activate'
        ? await api.activateEmergencyAI(reason)
        : await api.deactivateEmergencyAI(reason);

      // A resposta vem da confirmação persistida no backend. Não alteramos o
      // estado local antes disso nem usamos o clique como prova de sucesso.
      setStatus(response as EmergencyAIStatus);
      setFeedback({
        type: 'success',
        message: response.message || (pendingAction === 'activate'
          ? 'IA de Emergência ativada.'
          : 'IA de Emergência desativada.'),
      });
      setPendingAction(null);
      setReason('');
      if (showHistory) await loadHistory();
    } catch (error: any) {
      setFeedback({
        type: 'error',
        message: error?.message || 'Não foi possível alterar o estado da IA de Emergência.',
      });
      // Reconcilia com o banco após erro de rede/HTTP. Se a leitura também
      // falhar, o card fica INDISPONÍVEL em vez de manter um estado local
      // possivelmente desatualizado.
      await loadStatus();
    } finally {
      setActionLoading(false);
    }
  };

  if (!isAdmin) return null;

  const active = status?.config.enabled === true;
  const stateLabel = !status ? 'INDISPONÍVEL' : active ? 'ATIVA' : 'DESATIVADA';
  const stateClasses = !status
    ? 'bg-[#B4C5CE]/10 text-[#B4C5CE] border-[#B4C5CE]/30'
    : active
      ? 'bg-[#D14747]/10 text-[#FFA8A8] border-[#D14747]/30'
      : 'bg-[#263744] text-[#B4C5CE] border-[#526673]';

  const confirmationTitle = pendingAction === 'activate'
    ? 'Confirmar ativação da IA de Emergência?'
    : 'Confirmar desativação da IA de Emergência?';

  return (
    <section className="bg-[#344956] rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden">
      <div className="p-4 border-b border-[#526673] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-[#D0B783] text-[20px] flex-shrink-0">smart_toy</span>
          <div className="min-w-0">
            <h2 className="font-headline-md text-base font-semibold text-[#E1E8EC] truncate">
              IA DE EMERGÊNCIA
            </h2>
            <p className="text-[10px] text-[#B4C5CE]">Configuração administrativa e auditoria</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadStatus}
          disabled={loading || actionLoading}
          className="text-[#B4C5CE] hover:text-[#E1E8EC] p-1 rounded transition-colors disabled:opacity-50"
          title="Atualizar estado"
          aria-label="Atualizar estado da IA de Emergência"
        >
          <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
            refresh
          </span>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {loading && !status ? (
          <div className="py-6 text-center text-xs text-[#B4C5CE]">
            <span className="material-symbols-outlined text-[20px] align-middle mr-1 animate-spin">progress_activity</span>
            Consultando estado persistido...
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-[#D14747]/30 bg-[#D14747]/10 p-3 space-y-2">
            <div className="flex items-start gap-2 text-xs text-[#FFA8A8]">
              <span className="material-symbols-outlined text-[16px] mt-0.5">error</span>
              <span className="leading-relaxed">{loadError}</span>
            </div>
            <button
              type="button"
              onClick={loadStatus}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#526673] text-[11px] font-semibold text-[#E1E8EC] hover:bg-[#263744] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <div className={`rounded-xl border p-3 ${stateClasses}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">Estado real</p>
                  <p className="text-lg font-bold tracking-wide mt-0.5">{stateLabel}</p>
                </div>
                <span className="material-symbols-outlined text-[30px] opacity-80">
                  {active ? 'warning' : 'shield_lock'}
                </span>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#B4C5CE]">Última alteração</dt>
                <dd className="text-right font-medium text-[#E1E8EC] tabular-nums">
                  {formatDateTime(status?.config.lastChangedAt)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#B4C5CE]">Administrador responsável</dt>
                <dd className="text-right font-medium text-[#E1E8EC] break-words">
                  {status?.config.lastChangedByName || '—'}
                </dd>
              </div>
            </dl>

            <div className="space-y-2 border-t border-[#526673] pt-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-[#B4C5CE]">Provedor de IA</p>
                  <p className="text-[11px] text-[#E1E8EC] mt-0.5 break-words">
                    {status?.provider.provider && status.provider.model
                      ? `${status.provider.provider} / ${status.provider.model}`
                      : 'Provedor e modelo não definidos'}
                  </p>
                </div>
                {status && <IntegrationStateBadge state={status.provider.status} />}
              </div>

              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-[#B4C5CE]">Integração WhatsApp</p>
                  <p className="text-[11px] text-[#E1E8EC] mt-0.5">
                    {status?.whatsapp.lastChecked
                      ? `Última validação: ${formatDateTime(status.whatsapp.lastChecked)}`
                      : 'Sem validação registrada'}
                  </p>
                </div>
                {status && <IntegrationStateBadge state={status.whatsapp.status} feminine />}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingAction('activate');
                  setReason('');
                  setFeedback(null);
                }}
                disabled={actionLoading || !status || active}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#527D91] text-white text-[11px] font-semibold hover:brightness-95 transition-all shadow-xs disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">power_settings_new</span>
                ATIVAR IA
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingAction('deactivate');
                  setReason('');
                  setFeedback(null);
                }}
                disabled={actionLoading || !status || !active}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-[#526673] bg-[#263744] text-[#E1E8EC] text-[11px] font-semibold hover:bg-[#2D404D] transition-all shadow-xs disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">power_off</span>
                DESATIVAR IA
              </button>
            </div>

            {pendingAction && (
              <div className="rounded-lg border border-[#D0B783]/40 bg-[#263744] p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[#F5C26B] text-[18px] mt-0.5">warning</span>
                  <div>
                    <p className="text-xs font-semibold text-[#E1E8EC]">{confirmationTitle}</p>
                    <p className="text-[11px] text-[#B4C5CE] mt-1 leading-relaxed">
                      A alteração será gravada no banco e registrada no histórico em seu nome.
                      Não informe tokens, senhas ou credenciais neste campo.
                    </p>
                  </div>
                </div>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#B4C5CE]">
                    Motivo (opcional)
                  </span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Ex.: contingência operacional aprovada pela direção."
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-[#526673] bg-[#2D404D] text-[#E1E8EC] text-xs outline-none focus:border-[#527D91] resize-none"
                  />
                  <span className="text-[10px] text-[#B4C5CE]">{reason.length}/500</span>
                </label>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAction(null);
                      setReason('');
                    }}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-lg border border-[#526673] text-[11px] font-semibold text-[#B4C5CE] hover:text-[#E1E8EC] hover:bg-[#344956] transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmAction}
                    disabled={actionLoading}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      pendingAction === 'activate'
                        ? 'bg-[#D14747] hover:brightness-95'
                        : 'bg-[#527D91] hover:brightness-95'
                    }`}
                  >
                    {actionLoading
                      ? 'Gravando...'
                      : pendingAction === 'activate'
                        ? 'Confirmar ativação'
                        : 'Confirmar desativação'}
                  </button>
                </div>
              </div>
            )}

            {feedback && (
              <div
                role="status"
                aria-live="polite"
                className={`rounded-lg border p-3 text-[11px] leading-relaxed ${
                  feedback.type === 'success'
                    ? 'border-[#39AC6B]/30 bg-[#39AC6B]/10 text-[#8FE3AC]'
                    : 'border-[#D14747]/30 bg-[#D14747]/10 text-[#FFA8A8]'
                }`}
              >
                {feedback.message}
              </div>
            )}

            <div className="rounded-lg border border-[#526673] bg-[#263744] p-2.5">
              <p className="text-[10px] text-[#B4C5CE] leading-relaxed">
                Nesta etapa a IA permanece apenas como configuração administrativa. Nenhuma resposta
                automática é enviada pelo WhatsApp.
              </p>
            </div>

            <div className="border-t border-[#526673] pt-3">
              <button
                type="button"
                onClick={toggleHistory}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#D0B783] hover:underline"
              >
                <span className="material-symbols-outlined text-[15px]">
                  {showHistory ? 'expand_less' : 'history'}
                </span>
                {showHistory ? 'Ocultar histórico' : 'Ver histórico de alterações'}
              </button>

              {showHistory && (
                <div className="mt-2 space-y-2">
                  {historyLoading ? (
                    <p className="text-[11px] text-[#B4C5CE] text-center py-2">Carregando histórico...</p>
                  ) : historyError ? (
                    <p className="text-[11px] text-[#FFA8A8] leading-relaxed">{historyError}</p>
                  ) : history.length === 0 ? (
                    <p className="text-[11px] text-[#B4C5CE] text-center py-2">Nenhuma alteração registrada.</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-[#526673] rounded-lg border border-[#526673]">
                      {history.map((entry) => (
                        <div key={entry.id} className="p-2.5 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#E1E8EC]">
                              {entry.action === 'activate' ? 'Ativação' : 'Desativação'}
                            </span>
                            <span className={entry.result === 'success' ? 'text-[#8FE3AC]' : 'text-[#FFA8A8]'}>
                              {entry.result === 'success' ? 'Confirmada' : 'Falhou'}
                            </span>
                          </div>
                          <p className="text-[#B4C5CE] mt-0.5">
                            {formatDateTime(entry.createdAt)} • {entry.actorName || '—'}
                          </p>
                          {entry.reason && (
                            <p className="text-[#B4C5CE] mt-0.5 break-words">Motivo: {entry.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
