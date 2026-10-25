import {
  CONVERSATION_VISUAL_STATUS_META,
  normalizeConversationVisualStatus,
  type ConversationVisualStatus,
} from '../utils/conversationStatus';

interface ConversationStatusIndicatorProps {
  status?: string | null;
  unreadCount?: number;
  withLabel?: boolean;
  className?: string;
}

export function ConversationStatusIndicator({
  status,
  unreadCount = 0,
  withLabel = false,
  className = '',
}: ConversationStatusIndicatorProps) {
  const normalized = normalizeConversationVisualStatus(status, unreadCount);
  const meta = CONVERSATION_VISUAL_STATUS_META[normalized];

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={meta.label}
      aria-label={`Status da conversa: ${meta.label}`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: meta.color }}
        aria-hidden="true"
      />
      {withLabel && (
        <span
          className="text-[10px] font-semibold whitespace-nowrap leading-none"
          style={{ color: meta.color }}
        >
          {meta.label}
        </span>
      )}
    </span>
  );
}

export function ConversationStatusLegend({ className = '' }: { className?: string }) {
  const statuses: ConversationVisualStatus[] = ['unread', 'awaiting_reply', 'replied'];

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[#B4C5CE] ${className}`}>
      {statuses.map((status) => {
        const meta = CONVERSATION_VISUAL_STATUS_META[status];
        return (
          <span key={status} className="inline-flex items-center gap-1" title={meta.label}>
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: meta.color }}
              aria-hidden="true"
            />
            <span>{meta.shortLabel}</span>
          </span>
        );
      })}
    </div>
  );
}
