-- Registra quando o atendente abriu a conversa dentro do REOBOTE.
-- Esta informação não vem da Meta: é gravada pelo backend quando a conversa
-- com mensagens pendentes é aberta no dashboard/atendimento.
alter table public.conversations
  add column if not exists opened_at timestamptz;

comment on column public.conversations.opened_at is
  'Última abertura da conversa por um atendente no REOBOTE. NULL quando ainda não aberta ou em dados históricos.';
