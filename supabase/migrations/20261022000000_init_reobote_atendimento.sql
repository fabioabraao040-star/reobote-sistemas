-- ============================================================================
-- REOBOTE SISTEMAS — ATENDIMENTO
-- Migration inicial para um projeto Supabase NOVO e exclusivo.
--
-- Objetivo:
--   Criar o schema esperado pelo backend atual (server.ts) com isolamento por
--   empresa, proteção administrativa e integração com o Supabase Auth.
--
-- Garantias desta migration:
--   * Não contém credenciais, tokens, senhas ou dados de demonstração.
--   * Não executa DROP TABLE, TRUNCATE ou DELETE.
--   * É idempotente: pode ser reaplicada sem recriar tabelas/dados.
--   * Não altera nenhum projeto Supabase existente por si só; deve ser
--     aplicada manualmente no projeto NOVO.
--
-- Requisitos:
--   * Projeto Supabase com o schema auth (auth.users e auth.uid()).
--   * PostgreSQL 13+ (Supabase atual), por causa de gen_random_uuid().
--   * Executar como role postgres / SQL Editor / CLI oficial do Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Pré-condições do Supabase Auth
-- ----------------------------------------------------------------------------
do $precheck$
begin
  if to_regclass('auth.users') is null then
    raise exception
      'Schema auth do Supabase não encontrado (auth.users). Aplique esta migration em um projeto Supabase, não em um PostgreSQL comum.';
  end if;

  if to_regprocedure('auth.uid()') is null then
    raise exception
      'Função auth.uid() não encontrada. Verifique se o schema auth do Supabase está íntegro.';
  end if;
end;
$precheck$;

-- Checagem de compatibilidade ANTES de qualquer DDL.
-- Isso impede que a migration seja aplicada por engano no projeto legado
-- (tenants/users text) e cria objetos parciais antes de abortar.
do $compat_check$
declare
  v_users_exists boolean;
  v_companies_exists boolean;
  v_users_id_type text;
  v_users_company_type text;
  v_companies_id_type text;
  v_missing_columns text;
begin
  v_users_exists := to_regclass('public.users') is not null;
  v_companies_exists := to_regclass('public.companies') is not null;

  if v_users_exists then
    select string_agg(required.column_name, ', ' order by required.column_name)
      into v_missing_columns
    from (values
      ('id'), ('company_id'), ('email'), ('name'), ('role'), ('status')
    ) as required(column_name)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'users'
        and c.column_name = required.column_name
    );

    if v_missing_columns is not null then
      raise exception
        'Projeto incompatível: public.users sem as colunas: %. Nada foi alterado.',
        v_missing_columns;
    end if;

    select c.data_type
      into v_users_id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'users'
      and c.column_name = 'id';

    select c.data_type
      into v_users_company_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'users'
      and c.column_name = 'company_id';

    if v_users_id_type is distinct from 'uuid'
       or v_users_company_type is distinct from 'uuid' then
      raise exception
        'Projeto incompatível: public.users já existe com id=% e company_id=%. Esta migration é para um projeto NOVO com Supabase Auth (uuid). Nada foi alterado.',
        coalesce(v_users_id_type, 'inexistente'),
        coalesce(v_users_company_type, 'inexistente');
    end if;
  end if;

  if v_companies_exists then
    select c.data_type
      into v_companies_id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'companies'
      and c.column_name = 'id';

    if v_companies_id_type is distinct from 'uuid' then
      raise exception
        'Projeto incompatível: public.companies.id deveria ser uuid; encontrado %. Nada foi alterado.',
        coalesce(v_companies_id_type, 'inexistente');
    end if;
  end if;
end;
$compat_check$;

-- ----------------------------------------------------------------------------
-- 1. Empresas / Unidades (multiempresa)
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
    id uuid primary key default gen_random_uuid(),
    name varchar(255) not null,
    cnpj varchar(20),
    plan varchar(50) not null default 'padrao',
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.companies is
  'Empresas/unidades do REOBOTE. O isolamento das demais tabelas usa companies.id via company_id.';

-- ----------------------------------------------------------------------------
-- 2. Usuários / Atendentes
--    public.users.id é o MESMO id de auth.users.id (Supabase Auth).
-- ----------------------------------------------------------------------------
create table if not exists public.users (
    id uuid primary key,
    company_id uuid references public.companies(id) on delete cascade,
    email varchar(255) not null,
    name varchar(255) not null,
    role varchar(50) not null default 'user'
        check (role in ('admin', 'user')),
    status varchar(50) not null default 'offline'
        check (status in ('online', 'busy', 'offline')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint users_email_key unique (email),
    constraint users_auth_fk foreign key (id)
        references auth.users(id) on delete cascade
);

-- Falha cedo e com mensagem clara se alguém tentar aplicar no schema legado.
do $users_id_type$
declare
  v_type text;
begin
  select c.data_type
    into v_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'users'
    and c.column_name = 'id';

  if v_type is distinct from 'uuid' then
    raise exception
      'public.users.id deve ser uuid para integração com auth.users; encontrado: %.',
      coalesce(v_type, 'inexistente');
  end if;
end;
$users_id_type$;

-- Garante que public.users existente tem o formato esperado pelo backend.
do $users_columns$
declare
  v_missing text;
  v_company_type text;
begin
  select string_agg(required.column_name, ', ' order by required.column_name)
    into v_missing
  from (values
    ('id'), ('company_id'), ('email'), ('name'), ('role'), ('status')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'users'
      and c.column_name = required.column_name
  );

  if v_missing is not null then
    raise exception
      'public.users incompatível com o REOBOTE; colunas ausentes: %.',
      v_missing;
  end if;

  select c.data_type
    into v_company_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'users'
    and c.column_name = 'company_id';

  if v_company_type is distinct from 'uuid' then
    raise exception
      'public.users.company_id deve ser uuid; encontrado: %.',
      coalesce(v_company_type, 'inexistente');
  end if;
end;
$users_columns$;

-- Em projetos antigos/parciais, garante que o id não seja gerado aleatoriamente.
alter table public.users alter column id drop default;

-- Adiciona a FK com auth.users em bancos que já tinham public.users sem ela.
do $users_auth_fk$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.users'::regclass
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and a.attname = 'id'
  ) then
    alter table public.users
      add constraint users_auth_fk
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end;
$users_auth_fk$;

-- Garante a FK de empresa mesmo se public.users já existisse sem ela.
do $users_company_fk$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.users'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.companies'::regclass
      and a.attname = 'company_id'
  ) then
    alter table public.users
      add constraint users_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete cascade;
  end if;
end;
$users_company_fk$;

comment on table public.users is
  'Perfis do REOBOTE. id = auth.users.id. role admin = acesso global; role user = acesso à própria empresa.';
comment on column public.users.id is
  'Mesmo UUID do usuário em auth.users. A FK garante remoção do perfil quando o login é removido.';
comment on column public.users.company_id is
  'Empresa do usuário. Pode ser NULL apenas para um admin global sem empresa.';

-- ----------------------------------------------------------------------------
-- 3. Configuração do WhatsApp (Meta Cloud API)
--    Acesso somente pelo backend (service_role). Nunca expor tokens ao frontend.
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_configs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references public.companies(id) on delete cascade,
    phone_number varchar(50) not null,
    phone_number_id varchar(100) not null,
    waba_id varchar(100) not null,
    access_token text not null default '',
    verify_token varchar(255) not null default '',
    is_verified boolean not null default false,
    verified_name varchar(255),
    quality_rating varchar(50),
    last_health_check timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint whatsapp_configs_company_id_key unique (company_id)
);

-- Campos usados pelo backend que não existiam no schema original.
alter table public.whatsapp_configs
  add column if not exists verified_name varchar(255);
alter table public.whatsapp_configs
  add column if not exists quality_rating varchar(50);

-- O código permite salvar a configuração sem informar os tokens inicialmente.
alter table public.whatsapp_configs
  alter column access_token set default '';
alter table public.whatsapp_configs
  alter column verify_token set default '';

comment on table public.whatsapp_configs is
  'Credenciais da Meta Cloud API. Acesso direto negado a anon/authenticated; somente o backend com service_role.';
comment on column public.whatsapp_configs.access_token is
  'Segredo da Meta. Nunca expor no frontend, em logs ou em respostas da API.';
comment on column public.whatsapp_configs.verify_token is
  'Token de verificação do webhook da Meta. Nunca expor no frontend.';
comment on column public.whatsapp_configs.company_id is
  'Opcional no código atual: a API trata a configuração como global.';

-- A API atual usa limit(1).single() e grava sem company_id.
-- Este índice permite no máximo UMA configuração global (company_id NULL),
-- sem impedir uma configuração por empresa no futuro.
create unique index if not exists uq_whatsapp_configs_global_singleton
  on public.whatsapp_configs ((true))
  where company_id is null;

-- ----------------------------------------------------------------------------
-- 4. Contatos (clientes finais da empresa)
-- ----------------------------------------------------------------------------
create table if not exists public.contacts (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    name varchar(255) not null,
    phone varchar(50) not null,
    email varchar(255),
    tags text[] not null default '{}',
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint contacts_company_phone_key unique (company_id, phone)
);

comment on table public.contacts is
  'Contatos da empresa. O par (company_id, phone) é único.';

-- ----------------------------------------------------------------------------
-- 5. Conversas
-- ----------------------------------------------------------------------------
create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    contact_id uuid not null references public.contacts(id) on delete cascade,
    assigned_to uuid references public.users(id) on delete set null,
    status varchar(50) not null default 'open'
        check (status in ('open', 'in_progress', 'closed')),
    last_message text not null default '',
    last_message_at timestamptz not null default now(),
    unread_count integer not null default 0 check (unread_count >= 0),
    opened_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Campos usados por server.ts que não existiam no schema original.
alter table public.conversations
  add column if not exists last_message text not null default '';
alter table public.conversations
  add column if not exists updated_at timestamptz not null default now();
alter table public.conversations
  add column if not exists opened_at timestamptz;

alter table public.conversations
  alter column last_message set default '';
alter table public.conversations
  alter column updated_at set default now();

comment on table public.conversations is
  'Atendimentos por empresa. last_message e updated_at são usados pelo backend atual.';
comment on column public.conversations.opened_at is
  'Última abertura da conversa por um atendente no REOBOTE. NULL quando ainda não aberta ou em dados históricos.';

-- ----------------------------------------------------------------------------
-- 6. Mensagens
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    sender_type varchar(50) not null
        check (sender_type in ('customer', 'agent', 'system', 'internal_note')),
    sender_id uuid references public.users(id) on delete set null,
    content text not null,
    status varchar(50) not null default 'sent'
        check (status in ('sent', 'delivered', 'read', 'failed')),
    whatsapp_message_id varchar(255),
    created_at timestamptz not null default now()
);

comment on table public.messages is
  'Mensagens da conversa. O isolamento por empresa é derivado de conversations.company_id.';

-- ----------------------------------------------------------------------------
-- 7. Automações
-- ----------------------------------------------------------------------------
create table if not exists public.automations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    name varchar(255) not null,
    trigger_type varchar(100) not null
        check (trigger_type in ('welcome', 'out_of_hours', 'keyword', 'auto_close')),
    trigger_value varchar(255),
    action_type varchar(100) not null
        check (action_type in ('send_message', 'assign_queue', 'add_tag')),
    action_payload text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.automations is
  'Automações por empresa. company_id é obrigatório; um admin global sem empresa precisa estar vinculado a uma unidade.';

-- ----------------------------------------------------------------------------
-- 8. Respostas rápidas
-- ----------------------------------------------------------------------------
create table if not exists public.quick_replies (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    title varchar(255) not null,
    shortcut varchar(50) not null,
    category varchar(100) not null default 'Geral',
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.quick_replies is
  'Mensagens prontas por empresa.';

-- ----------------------------------------------------------------------------
-- 9. Índices para as consultas reais do backend
-- ----------------------------------------------------------------------------
create index if not exists idx_users_company_id
  on public.users (company_id);

create index if not exists idx_conversations_company_last_message
  on public.conversations (company_id, last_message_at desc);

create index if not exists idx_conversations_company_status
  on public.conversations (company_id, status);

create index if not exists idx_conversations_contact_id
  on public.conversations (contact_id);

create index if not exists idx_conversations_assigned_to
  on public.conversations (assigned_to);

create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at);

create index if not exists idx_messages_whatsapp_message_id
  on public.messages (whatsapp_message_id)
  where whatsapp_message_id is not null;

create index if not exists idx_automations_company_id
  on public.automations (company_id);

create index if not exists idx_quick_replies_company_id
  on public.quick_replies (company_id);

-- ----------------------------------------------------------------------------
-- 10. Helpers de identidade/empresa
--     Substituem os helpers auth.company_id()/auth.is_admin() do schema antigo,
--     que dependiam de app_metadata nunca preenchido pelo backend.
-- ----------------------------------------------------------------------------
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select auth.uid();
$fn$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select u.company_id
  from public.users u
  where u.id = auth.uid()
  limit 1;
$fn$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  );
$fn$;

comment on function public.current_company_id() is
  'Retorna company_id do usuário autenticado (auth.uid()) lendo public.users.';
comment on function public.is_admin() is
  'Retorna true quando o usuário autenticado tem role = admin em public.users.';

-- ----------------------------------------------------------------------------
-- 11. Trigger de updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists set_updated_at_companies on public.companies;
create trigger set_updated_at_companies
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_users on public.users;
create trigger set_updated_at_users
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_whatsapp_configs on public.whatsapp_configs;
create trigger set_updated_at_whatsapp_configs
before update on public.whatsapp_configs
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_contacts on public.contacts;
create trigger set_updated_at_contacts
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_conversations on public.conversations;
create trigger set_updated_at_conversations
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_automations on public.automations;
create trigger set_updated_at_automations
before update on public.automations
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_quick_replies on public.quick_replies;
create trigger set_updated_at_quick_replies
before update on public.quick_replies
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 12. Validação de integridade entre empresas
--     RLS não protege contra a service_role (usada pelo backend), portanto
--     estes triggers impedem mistura de empresas mesmo em operações de serviço.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_conversation_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_contact_company uuid;
  v_assigned_role varchar(50);
  v_assigned_company uuid;
begin
  select c.company_id
    into v_contact_company
  from public.contacts c
  where c.id = new.contact_id;

  if v_contact_company is null then
    raise exception 'Contato inexistente para a conversa.'
      using errcode = '23503';
  end if;

  if v_contact_company <> new.company_id then
    raise exception 'O contato pertence a outra empresa.'
      using errcode = '23514';
  end if;

  if new.assigned_to is not null then
    select u.role, u.company_id
      into v_assigned_role, v_assigned_company
    from public.users u
    where u.id = new.assigned_to;

    if v_assigned_role is null then
      raise exception 'Atendente inexistente para a conversa.'
        using errcode = '23503';
    end if;

    if v_assigned_role <> 'admin'
       and v_assigned_company is distinct from new.company_id then
      raise exception 'O atendente pertence a outra empresa.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists enforce_conversation_company on public.conversations;
create trigger enforce_conversation_company
before insert or update of company_id, contact_id, assigned_to
on public.conversations
for each row execute function public.enforce_conversation_company();

create or replace function public.enforce_message_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_company uuid;
  v_sender_role varchar(50);
  v_sender_company uuid;
begin
  select c.company_id
    into v_company
  from public.conversations c
  where c.id = new.conversation_id;

  if v_company is null then
    raise exception 'Conversa inexistente para a mensagem.'
      using errcode = '23503';
  end if;

  if new.sender_id is not null then
    select u.role, u.company_id
      into v_sender_role, v_sender_company
    from public.users u
    where u.id = new.sender_id;

    if v_sender_role is null then
      raise exception 'Remetente inexistente para a mensagem.'
        using errcode = '23503';
    end if;

    if v_sender_role <> 'admin'
       and v_sender_company is distinct from v_company then
      raise exception 'O remetente pertence a outra empresa.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists enforce_message_company on public.messages;
create trigger enforce_message_company
before insert or update of conversation_id, sender_id
on public.messages
for each row execute function public.enforce_message_company();

-- ----------------------------------------------------------------------------
-- 13. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.whatsapp_configs enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.automations enable row level security;
alter table public.quick_replies enable row level security;

-- Empresas: admin gerencia tudo; usuário vê apenas a própria empresa.
drop policy if exists companies_admin_all on public.companies;
create policy companies_admin_all
on public.companies
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists companies_company_select on public.companies;
create policy companies_company_select
on public.companies
for select
to authenticated
using (id = public.current_company_id());

-- Usuários: admin gerencia tudo; usuário vê colegas da mesma empresa.
drop policy if exists users_admin_all on public.users;
create policy users_admin_all
on public.users
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists users_company_select on public.users;
create policy users_company_select
on public.users
for select
to authenticated
using (company_id = public.current_company_id());

-- WhatsApp: nenhum acesso direto de anon/authenticated.
-- O backend usa service_role e é o único caminho para ler/gravar tokens.
drop policy if exists whatsapp_configs_service_only on public.whatsapp_configs;
create policy whatsapp_configs_service_only
on public.whatsapp_configs
for all
to authenticated
using (false)
with check (false);

-- Contatos: isolamento por empresa; admin global acessa tudo.
drop policy if exists contacts_company_isolation on public.contacts;
create policy contacts_company_isolation
on public.contacts
for all
to authenticated
using (public.is_admin() or company_id = public.current_company_id())
with check (public.is_admin() or company_id = public.current_company_id());

-- Conversas: empresa da conversa + contato da mesma empresa.
-- O trigger enforce_conversation_company reforça a regra até para service_role.
drop policy if exists conversations_company_isolation on public.conversations;
create policy conversations_company_isolation
on public.conversations
for all
to authenticated
using (
  public.is_admin()
  or (
    company_id = public.current_company_id()
    and exists (
      select 1
      from public.contacts c
      where c.id = contact_id
        and c.company_id = public.current_company_id()
    )
  )
)
with check (
  public.is_admin()
  or (
    company_id = public.current_company_id()
    and exists (
      select 1
      from public.contacts c
      where c.id = contact_id
        and c.company_id = public.current_company_id()
    )
    and (
      assigned_to is null
      or exists (
        select 1
        from public.users u
        where u.id = assigned_to
          and (
            u.role = 'admin'
            or u.company_id = public.current_company_id()
          )
      )
    )
  )
);

-- Mensagens: isolamento pela conversa; remetente não pode ser de outra empresa.
drop policy if exists messages_company_isolation on public.messages;
create policy messages_company_isolation
on public.messages
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.company_id = public.current_company_id()
  )
)
with check (
  public.is_admin()
  or (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.company_id = public.current_company_id()
    )
    and (
      (sender_type in ('agent', 'internal_note') and sender_id = public.current_user_id())
      or (sender_type in ('customer', 'system') and sender_id is null)
    )
  )
);

-- Automações e respostas rápidas: isolamento por empresa.
drop policy if exists automations_company_isolation on public.automations;
create policy automations_company_isolation
on public.automations
for all
to authenticated
using (public.is_admin() or company_id = public.current_company_id())
with check (public.is_admin() or company_id = public.current_company_id());

drop policy if exists quick_replies_company_isolation on public.quick_replies;
create policy quick_replies_company_isolation
on public.quick_replies
for all
to authenticated
using (public.is_admin() or company_id = public.current_company_id())
with check (public.is_admin() or company_id = public.current_company_id());

-- ----------------------------------------------------------------------------
-- 14. Privilégios
--     RLS não substitui GRANT. O frontend não acessa o banco diretamente;
--     ainda assim, authenticated recebe apenas o necessário e anon é negado.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

revoke all on table
  public.companies,
  public.users,
  public.whatsapp_configs,
  public.contacts,
  public.conversations,
  public.messages,
  public.automations,
  public.quick_replies
from anon;

revoke all on table public.whatsapp_configs from authenticated;

grant select, insert, update, delete on table
  public.companies,
  public.users,
  public.contacts,
  public.conversations,
  public.messages,
  public.automations,
  public.quick_replies
to authenticated;

grant all on table
  public.companies,
  public.users,
  public.whatsapp_configs,
  public.contacts,
  public.conversations,
  public.messages,
  public.automations,
  public.quick_replies
to service_role;

revoke all on function public.current_user_id() from public;
revoke all on function public.current_company_id() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.enforce_conversation_company() from public;
revoke all on function public.enforce_message_company() from public;

grant execute on function public.current_user_id() to authenticated, service_role;
grant execute on function public.current_company_id() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.set_updated_at() to authenticated, service_role;
grant execute on function public.enforce_conversation_company() to authenticated, service_role;
grant execute on function public.enforce_message_company() to authenticated, service_role;

comment on function public.current_user_id() is
  'Retorna auth.uid() por meio de função security definer, sem exigir acesso direto ao schema auth.';
