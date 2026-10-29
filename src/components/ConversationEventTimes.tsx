interface ConversationEventTimesProps {
  receivedAt?: string | null;
  openedAt?: string | null;
  repliedAt?: string | null;
  className?: string;
}

function formatEventTime(value?: string | null): { short: string; full: string } | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    short: date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
    full: date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

/**
 * Exibe os três horários reais do ciclo de atendimento:
 * recebimento da mensagem, abertura no REOBOTE e resposta do atendente.
 * Quando um evento ainda não ocorreu, mostra "—" em vez de inventar horário.
 */
export function ConversationEventTimes({
  receivedAt,
  openedAt,
  repliedAt,
  className = '',
}: ConversationEventTimesProps) {
  const events = [
    { key: 'received', label: 'Recebida', value: receivedAt, icon: 'mark_chat_unread' },
    { key: 'opened', label: 'Aberta', value: openedAt, icon: 'visibility' },
    { key: 'replied', label: 'Respondida', value: repliedAt, icon: 'reply' },
  ];

  return (
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-[#B4C5CE] ${className}`}>
      {events.map((event) => {
        const formatted = formatEventTime(event.value);
        return (
          <span
            key={event.key}
            className="inline-flex items-center gap-1 whitespace-nowrap"
            title={formatted ? `${event.label}: ${formatted.full}` : `${event.label}: ainda não registrada`}
          >
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
              {event.icon}
            </span>
            <span>{event.label}:</span>
            <span className={`tabular-nums ${formatted ? 'text-[#E1E8EC]' : 'text-[#B4C5CE]'}`}>
              {formatted?.short || '—'}
            </span>
          </span>
        );
      })}
    </div>
  );
}
