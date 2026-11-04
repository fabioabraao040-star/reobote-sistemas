-- ============================================================================
-- SQL PENDENTE DE APROVAÇÃO — Google Calendar OAuth 2.0 (REOBOTE)
-- NÃO EXECUTADO. Requer aprovação explícita antes de aplicar em produção.
-- ============================================================================
-- Tabela: public.google_calendar_integrations
-- Armazena tokens criptografados (AES-256-GCM) por empresa.
-- RLS: sem acesso para anon/authenticated; service_role exclusivamente no backend.
-- ============================================================================

create table if not exists public.google_calendar_integrations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    user_id uuid references public.users(id) on delete set null,
    encrypted_access_token text not null,
    encrypted_refresh_token text,
    token_expiry timestamptz,
    calendar_id text not null,
    scopes text,
    status varchar(20) not null default 'connected'
        check (status in ('connected', 'error', 'disconnected')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint google_calendar_integrations_company_id_key unique (company_id)
);

alter table public.google_calendar_integrations enable row level security;

-- Sem policies para anon/authenticated => acesso negado por padrão.
-- O backend usa service_role, que ignora RLS.

comment on table public.google_calendar_integrations is
  'Tokens OAuth criptografados do Google Calendar por empresa. Acesso somente via backend (service_role).';
comment on column public.google_calendar_integrations.encrypted_access_token is
  'Token de acesso criptografado (AES-256-GCM). Nunca expor.';
comment on column public.google_calendar_integrations.encrypted_refresh_token is
  'Refresh token criptografado (AES-256-GCM). Nunca expor.';
