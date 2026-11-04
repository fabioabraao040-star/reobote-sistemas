import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

// ============================================================================
// PAINEL DE INTEGRAÇÃO META BUSINESS AGENT (somente ADM)
// ============================================================================
// O frontend NÃO contém regras de negócio: todos os estados, permissões e
// chamadas à Meta vêm do backend. Não há secrets, tokens nem URLs da Meta aqui.
// Ações administrativas: verificar conexão, conectar, ativar/desativar e
// devolver conversa ao agente (thread control release).

interface MetaAgentIntegration {
  id?: string;
  status?: 'pending' | 'connected' | 'error' | 'disabled';
  metaAgentId?: string | null;
  updatedAt?: string | null;
}

interface MetaAgentLive {
  checked?: boolean;
  agentIdFound?: boolean;
  rolloutEnabled?: boolean | null;
  aiAudience?: 'EVERYONE' | 'ALLOWLISTED_ONLY' | null;
  handoff?: { enabled?: boolean; messageSelection?: string | null } | null;
  isEligible?: boolean | null;
  errorKind?: 'meta' | 'not-configured' | 'persist' | 'none';
  errorDetail?: string | null;
}

interface MetaAgentEvent {
  eventType?: string;
  outcome?: string;
  errorCode?: string | null;
  createdAt?: string;
}

interface ConversationOption {
  id: string;
  contactName: string;
  status: string;
  lastMessage: string;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-[#D0B783]/10 text-[#D0B783] border-[#D0B783]/40' },
  connected: { label: 'Conectado', className: 'bg-[#39AC6B]/10 text-[#8FE3AC] border-[#39AC6B]/30' },
  error: { label: 'Erro', className: 'bg-[#FF5252]/10 text-[#FFA8A8] border-[#FF5252]/40' },
  disabled: { label: 'Desativado', className: 'bg-[#526673]/20 text-[#B4C5CE] border-[#526673]/50' },
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function MetaAgentIntegrationPanel() {
  const [integration, setIntegration] = useState<MetaAgentIntegration | null>(null);
  const [live, setLive] = useState<MetaAgentLive | null>(null);
  const [events, setEvents] = useState<MetaAgentEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationOption[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string>('');

  const writeNotice = (ok: boolean, message: string) => setNotice({ ok, message });

  const fetchStatus = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api.getMetaAgentStatus();
      setIntegration((data.integration ?? null) as MetaAgentIntegration | null);
      setLive((data.live ?? null) as MetaAgentLive | null);
      setEvents((data.lastEvents ?? []) as MetaAgentEvent[]);
      setEventsError((data.eventsError as string | null) ?? null);
    } catch (error: any) {
      setLoadError(error?.message || 'Erro ao consultar a integração.');
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await api.getConversations();
      const options = (data || [])
        .filter((conversation: any) => conversation.status === 'open' || conversation.status === 'in_progress')
        .slice(0, 50)
        .map((conversation: any) => ({
          id: String(conversation.id),
          contactName: conversation.contactName || conversation.contact_name || 'Cliente',
          status: String(conversation.status ?? ''),
          lastMessage: String(conversation.lastMessage || conversation.last_message || ''),
        }));
      setConversations(options);
    } catch {
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchConversations();
  }, [fetchStatus, fetchConversations]);

  async function runAction(action: string, callback: () => Promise<{ ok?: boolean; message?: string; error?: string }>) {
    setBusy(action);
    setNotice(null);
    try {
      const result = await callback();
      const ok = result?.ok !== false;
      writeNotice(ok, result?.message || result?.error || 'Operação concluída.');
      await fetchStatus();
    } catch (error: any) {
      writeNotice(false, error?.message || 'Operação falhou.');
    } finally {
      setBusy(null);
    }
  }

  const status = integration?.status ?? null;
  const statusBadge = status ? STATUS_LABEL[status] : null;

  const canConnect = status !== 'connected';
  const canToggle = Boolean(integration?.metaAgentId);
  const rolloutOn = live?.rolloutEnabled === true;

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4 text-[#E1E8EC]">
      <header className="bg-[#344956] rounded-xl border border-[#526673] shadow-sm p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Integração Meta Business Agent</h2>
            <p className="text-xs text-[#B4C5CE] mt-1">
              Agente oficial da Meta sobre a configuração WhatsApp já conectada. Sem provedores de IA alternativos.
            </p>
          </div>
          {statusBadge ? (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full border border-[#526673]/50 text-[#B4C5CE] bg-[#526673]/20">
              Sem integração
            </span>
          )}
        </div>
      </header>

      {loadError && (
        <div className="bg-[#FF5252]/10 border border-[#FF5252]/40 rounded-lg p-3 text-sm text-[#FFA8A8]">
          {loadError}
        </div>
      )}

      {notice && (
        <div
          className={`rounded-lg p-3 text-sm border ${
            notice.ok
              ? 'bg-[#39AC6B]/10 border-[#39AC6B]/30 text-[#8FE3AC]'
              : 'bg-[#FF5252]/10 border-[#FF5252]/40 text-[#FFA8A8]'
          }`}
        >
          {notice.message}
        </div>
      )}

      <section className="bg-[#344956] rounded-xl border border-[#526673] p-4">
        <h3 className="text-sm font-semibold text-[#D0B783] mb-3">Estado da integração</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Detail label="Status WhatsApp da Meta" value={live?.checked ? 'Consultado' : 'Não verificado'} />
          <Detail label="Elegibilidade do número" value={live?.isEligible === null || live?.isEligible === undefined ? '—' : live.isEligible ? 'Elegível' : 'Não elegível'} />
          <Detail label="Id do agente" value={integration?.metaAgentId ? integration.metaAgentId : '—'} />
          <Detail label="Agente habilitado (rollout)" value={live?.rolloutEnabled == null ? '—' : live.rolloutEnabled ? 'Sim' : 'Não'} />
          <Detail label="Público (ai_audience)" value={live?.aiAudience ?? '—'} />
          <Detail
            label="Handoff para humano"
            value={
              live?.handoff
                ? `${live.handoff.enabled ? 'Configurado' : 'Sem liberação automática'}${live.handoff.messageSelection ? ` (${live.handoff.messageSelection})` : ''}`
                : '—'
            }
          />
          <Detail label="Última atualização" value={formatTimestamp(integration?.updatedAt)} />
          <Detail
            label="Erro da Meta"
            value={
              live?.errorKind && live.errorKind !== 'none'
                ? `${live.errorKind}: ${live.errorDetail || 'sem detalhe'}`
                : '—'
            }
            wide
          />
        </dl>
      </section>

      <section className="bg-[#344956] rounded-xl border border-[#526673] p-4">
        <h3 className="text-sm font-semibold text-[#D0B783] mb-3">Ações administrativas</h3>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Verificar conexão"
            busy={busy === 'verify'}
            variant="secondary"
            onClick={() => runAction('verify', () => api.verifyMetaAgentConnection())}
          />
          <ActionButton
            label={integration?.metaAgentId ? 'Reconfirmar agente' : 'Conectar agente'}
            busy={busy === 'connect'}
            variant="primary"
            disabled={!canConnect && busy !== null}
            onClick={() => runAction('connect', () => api.connectMetaAgent())}
          />
          <ActionButton
            label={rolloutOn ? 'Desativar agente' : 'Ativar agente'}
            busy={busy === 'toggle'}
            variant={rolloutOn ? 'secondary' : 'primary'}
            disabled={!canToggle}
            onClick={() => runAction('toggle', () => api.setMetaAgentRollout(!rolloutOn))}
          />
        </div>
        <p className="text-xs text-[#B4C5CE] mt-2">
          Ativar o agente exige as exigências da Meta (termos aceitos no WhatsApp Manager e, para todos os públicos, método de
          pagamento). O REOBOTE mostra o estado real devolvido pela Meta — nunca "conectado" sem confirmação.
        </p>
      </section>

      <section className="bg-[#344956] rounded-xl border border-[#526673] p-4">
        <h3 className="text-sm font-semibold text-[#D0B783] mb-3">Transferência de conversas (thread control)</h3>
        <p className="text-xs text-[#B4C5CE] mb-2">
          Quando o atendente envia mensagem, o REOBOTE assume automaticamente o controle da conversa perante a Meta. Para devolver a
          conversa ao agente, selecione-a abaixo.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedConversation}
            onChange={(event) => setSelectedConversation(event.target.value)}
            className="flex-1 bg-[#2E4053] border border-[#526673] rounded-lg px-3 py-2 text-sm text-[#E1E8EC]"
          >
            <option value="">Selecione uma conversa aberta…</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.contactName} · {conversation.status}
              </option>
            ))}
          </select>
          <ActionButton
            label="Devolver ao agente"
            busy={busy === 'release'}
            variant="primary"
            disabled={!selectedConversation}
            onClick={() =>
              selectedConversation
                ? runAction('release', () => api.releaseMetaAgentHandoff(selectedConversation))
                : undefined
            }
          />
        </div>
      </section>

      <section className="bg-[#344956] rounded-xl border border-[#526673] p-4">
        <h3 className="text-sm font-semibold text-[#D0B783] mb-3">Histórico técnico</h3>
        {eventsError && <p className="text-xs text-[#FFA8A8] mb-2">{eventsError}</p>}
        {events.length === 0 ? (
          <p className="text-xs text-[#B4C5CE]">Nenhum evento registrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event, index) => (
              <li
                key={`${event.createdAt}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#2E4053] rounded-lg px-3 py-2"
              >
                <span className="font-semibold text-[#E1E8EC]">{event.eventType}</span>
                <span
                  className={
                    event.outcome === 'ok'
                      ? 'text-[#8FE3AC]'
                      : 'text-[#FFA8A8]'
                  }
                >
                  {event.outcome === 'ok' ? 'ok' : 'falha'}
                  {event.errorCode ? ` · ${event.errorCode}` : ''}
                </span>
                <span className="text-[#B4C5CE]">{formatTimestamp(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[10px] uppercase tracking-wide text-[#B4C5CE]">{label}</dt>
      <dd className="text-sm text-[#E1E8EC] break-words">{value}</dd>
    </div>
  );
}

function ActionButton({
  label,
  busy,
  disabled,
  variant,
  onClick,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  variant: 'primary' | 'secondary';
  onClick: () => void;
}) {
  const base =
    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed';
  const palette =
    variant === 'primary'
      ? 'bg-[#D0B783] text-[#26333B] hover:brightness-95'
      : 'bg-[#527D91] text-white hover:brightness-95';
  return (
    <button type="button" className={`${base} ${palette} cursor-pointer`} disabled={disabled || busy} onClick={onClick}>
      {busy ? 'Processando…' : label}
    </button>
  );
}
