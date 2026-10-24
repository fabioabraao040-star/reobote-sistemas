-- Evita mensagens duplicadas quando a Meta reenvia o mesmo evento.
-- O índice é parcial para permitir mensagens internas sem whatsapp_message_id.
create unique index if not exists idx_messages_whatsapp_message_id_unique
  on public.messages (whatsapp_message_id)
  where whatsapp_message_id is not null;
