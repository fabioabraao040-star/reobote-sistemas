import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

export default function GoogleCalendarIntegration() {
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getGoogleCalendarStatus();
      setStatus(data);
    } catch (e: any) {
      setError(e?.message || 'Erro ao consultar Google Calendar.');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status');
    if (s === 'connected') setNotice('Google Calendar conectado com sucesso.');
    if (s === 'error') setNotice(`Falha na conexão: ${params.get('reason') || 'erro desconhecido'}`);
    fetchStatus();
  }, [fetchStatus]);

  async function disconnect() {
    setBusy('disconnect');
    try {
      const data = await api.disconnectGoogleCalendar();
      setNotice(data?.message || 'Desconectado.');
      await fetchStatus();
    } catch (e: any) {
      setNotice(e?.message || 'Falha ao desconectar.');
    } finally {
      setBusy(null);
    }
  }

  const connected = status?.connected === true;

  return (
    <div className="p-3 sm:p-6 max-w-3xl mx-auto space-y-4 text-[#E1E8EC]">
      <header className="bg-[#344956] rounded-xl border border-[#526673] p-4">
        <h2 className="text-lg font-bold">Integração Google Calendar</h2>
        <p className="text-xs text-[#B4C5CE] mt-1">OAuth 2.0 oficial. Tokens armazenados criptografados no backend.</p>
      </header>

      {error && <div className="bg-[#FF5252]/10 border border-[#FF5252]/40 rounded-lg p-3 text-sm text-[#FFA8A8]">{error}</div>}
      {notice && <div className="bg-[#39AC6B]/10 border border-[#39AC6B]/30 rounded-lg p-3 text-sm text-[#8FE3AC]">{notice}</div>}

      <section className="bg-[#344956] rounded-xl border border-[#526673] p-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-[#B4C5CE]">Status</dt>
            <dd className="text-sm">{connected ? 'Conectado' : 'Desconectado'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-[#B4C5CE]">Calendar ID</dt>
            <dd className="text-sm break-words">{status?.calendarId || '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-[#B4C5CE]">Expiração do token</dt>
            <dd className="text-sm">{status?.tokenExpiry ? new Date(status.tokenExpiry).toLocaleString('pt-BR') : '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-[#B4C5CE]">Escopos</dt>
            <dd className="text-sm break-words">{status?.scopes || '—'}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2 mt-4">
          {!connected && (
            <button
              type="button"
              onClick={() => api.connectGoogleCalendar()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#D0B783] text-[#26333B] cursor-pointer"
            >
              Conectar Google Calendar
            </button>
          )}
          {connected && (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy === 'disconnect'}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#527D91] text-white cursor-pointer disabled:opacity-40"
            >
              {busy === 'disconnect' ? 'Desconectando…' : 'Desconectar'}
            </button>
          )}
          <button
            type="button"
            onClick={fetchStatus}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#526673]/40 text-[#E1E8EC] cursor-pointer"
          >
            Atualizar
          </button>
        </div>
      </section>
    </div>
  );
}
