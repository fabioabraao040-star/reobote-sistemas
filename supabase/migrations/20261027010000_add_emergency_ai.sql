-- ============================================================================
-- REOBOTE SISTEMAS — IA DE EMERGÊNCIA
-- Estrutura administrativa, auditoria e preparação para integração futura.
--
-- Garantias:
--   * A ausência de configuração significa IA DESATIVADA.
--   * Nenhuma credencial de IA/WhatsApp é armazenada nas novas tabelas.
--   * Nenhum conteúdo integral de mensagem é armazenado para auditoria.
--   * A escrita administrativa é atômica e auditada na mesma transação.
--   * O ADM MASTER não herda acesso operacional; o backend exige role = admin.
--
-- Esta migration não cria configuração ativa, não cadastra administrador e
-- não altera o webhook ativo, a integração Meta ou variáveis de ambiente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Configuração global da IA de Emergência
--    O modelo atual trata a configuração do WhatsApp como global. A coluna
--    company_id fica opcional para permitir uma configuração por empresa no
--    futuro sem alterar o formato atual.
-- ----------------------------------------------------------------------------
create table if not exists public.emergency_ai_configs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references public.companies(id) on delete cascade,
    enabled boolean not null default false,
    provider varchar(50),
    model varchar(150),
    integration_status varchar(20) not null default 'pending'
        check (integration_status in ('configured', 'pending', 'unavailable')),
    last_changed_by uuid references public.users(id) on delete set null,
    last_changed_by_name varchar(255),
    last_changed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.emergency_ai_configs is
  'Estado administrativo da IA de Emergência. enabled é a fonte de verdade. Ausência de linha = desativada.';
comment on column public.emergency_ai_configs.company_id is
  'NULL representa a configuração global do modelo atual. Uma linha por empresa é permitida no futuro.';
comment on column public.emergency_ai_configs.provider is
  'Nome do provedor futuro. Nenhuma credencial é armazenada nesta tabela.';
comment on column public.emergency_ai_configs.model is
  'Modelo futuro do provedor. Nenhuma credencial ou token é armazenado nesta tabela.';
comment on column public.emergency_ai_configs.integration_status is
  'Instantâneo informativo da integração no momento da última alteração. A leitura atual deriva o estado real do WhatsApp no backend.';
comment on column public.emergency_ai_configs.last_changed_by_name is
  'Nome do administrador no momento da alteração, preservado na auditoria mesmo se o usuário for removido.';

-- Exatamente uma configuração global (company_id NULL) e, se houver, uma por
-- empresa. O índice parcial é necessário porque NULL não conflita em UNIQUE.
create unique index if not exists uq_emergency_ai_configs_global_singleton
  on public.emergency_ai_configs ((true))
  where company_id is null;

create unique index if not exists uq_emergency_ai_configs_company
  on public.emergency_ai_configs (company_id)
  where company_id is not null;

create index if not exists idx_emergency_ai_configs_last_changed
  on public.emergency_ai_configs (last_changed_at desc);

-- ----------------------------------------------------------------------------
-- 2. Auditoria administrativa
--    Registra apenas ações confirmadas. Não contém mensagens, telefones,
--    tokens, senhas ou credenciais.
-- ----------------------------------------------------------------------------
create table if not exists public.emergency_ai_audit_logs (
    id uuid primary key default gen_random_uuid(),
    config_id uuid references public.emergency_ai_configs(id) on delete set null,
    company_id uuid references public.companies(id) on delete set null,
    action varchar(20) not null
        check (action in ('activate', 'deactivate')),
    actor_id uuid references public.users(id) on delete set null,
    actor_name varchar(255) not null,
    previous_enabled boolean not null,
    new_enabled boolean not null,
    result varchar(20) not null default 'success'
        check (result in ('success', 'failed')),
    reason varchar(500),
    integration_status varchar(20) not null default 'pending'
        check (integration_status in ('configured', 'pending', 'unavailable')),
    created_at timestamptz not null default now()
);

comment on table public.emergency_ai_audit_logs is
  'Histórico administrativo da IA de Emergência. Somente ADM consulta pela API.';
comment on column public.emergency_ai_audit_logs.actor_name is
  'Snapshot do nome do administrador responsável, preservado mesmo após remoção do usuário.';
comment on column public.emergency_ai_audit_logs.reason is
  'Motivo opcional informado pelo administrador. Não armazena tokens nem conteúdo de mensagens.';

create index if not exists idx_emergency_ai_audit_created
  on public.emergency_ai_audit_logs (created_at desc);

create index if not exists idx_emergency_ai_audit_actor
  on public.emergency_ai_audit_logs (actor_id, created_at desc);

create index if not exists idx_emergency_ai_audit_action
  on public.emergency_ai_audit_logs (action, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. Eventos de atendimento (preparação futura)
--    Estrutura mínima para relacionar conversas/mensagens ao modo de emergência
--    e registrar tokens de entrada/saída quando o provedor existir. Não há
--    coluna de conteúdo integral de mensagem.
-- ----------------------------------------------------------------------------
create table if not exists public.emergency_ai_events (
    id uuid primary key default gen_random_uuid(),
    config_id uuid references public.emergency_ai_configs(id) on delete set null,
    company_id uuid references public.companies(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete cascade,
    inbound_message_id uuid references public.messages(id) on delete set null,
    outbound_message_id uuid references public.messages(id) on delete set null,
    event_type varchar(50) not null
        check (event_type in (
          'inbound_detected',
          'ai_response',
          'human_handoff',
          'duplicate_blocked',
          'disabled_skip',
          'error'
        )),
    outcome varchar(20) not null default 'recorded'
        check (outcome in ('recorded', 'allowed', 'blocked', 'skipped', 'failed')),
    provider varchar(50),
    model varchar(150),
    input_tokens integer check (input_tokens is null or input_tokens >= 0),
    output_tokens integer check (output_tokens is null or output_tokens >= 0),
    total_tokens integer check (total_tokens is null or total_tokens >= 0),
    idempotency_key varchar(255),
    error_code varchar(100),
    created_at timestamptz not null default now()
);

comment on table public.emergency_ai_events is
  'Eventos mínimos para a futura IA. Não armazena conteúdo de mensagens nem credenciais.';
comment on column public.emergency_ai_events.idempotency_key is
  'Chave idempotente para impedir respostas automáticas duplicadas no futuro.';

create unique index if not exists uq_emergency_ai_events_idempotency
  on public.emergency_ai_events (idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_emergency_ai_events_conversation
  on public.emergency_ai_events (conversation_id, created_at desc);

create index if not exists idx_emergency_ai_events_company_created
  on public.emergency_ai_events (company_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. Atualização de updated_at
-- ----------------------------------------------------------------------------
drop trigger if exists set_updated_at_emergency_ai_configs on public.emergency_ai_configs;
create trigger set_updated_at_emergency_ai_configs
before update on public.emergency_ai_configs
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Ativação/desativação atômica com auditoria
--    Uma única transação:
--      * serializa concorrentes com advisory lock;
--      * cria a configuração desativada se ela não existir;
--      * atualiza o estado e grava a auditoria juntos;
--      * não altera nada se o estado desejado já for o atual.
--    Somente service_role executa esta função; o backend valida o ADM antes.
-- ----------------------------------------------------------------------------
create or replace function public.set_emergency_ai_enabled(
  p_enabled boolean,
  p_actor_id uuid,
  p_actor_name text,
  p_reason text default null,
  p_whatsapp_status text default 'pending'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_config public.emergency_ai_configs%rowtype;
  v_previous_enabled boolean;
  v_action text;
  v_actor_name text;
  v_reason text;
  v_whatsapp_status text;
  v_changed boolean := false;
  v_audit_id uuid;
begin
  if p_enabled is null then
    raise exception 'Estado desejado da IA de Emergência é obrigatório.';
  end if;

  if p_actor_id is null then
    raise exception 'Administrador responsável é obrigatório.';
  end if;

  -- Defesa em profundidade: mesmo que apenas o service_role execute a função,
  -- o ator precisa continuar sendo um ADM operacional no banco.
  if not exists (
    select 1
    from public.users
    where id = p_actor_id
      and role = 'admin'
  ) then
    raise exception 'Administrador responsável inválido ou sem permissão.';
  end if;

  v_actor_name := nullif(btrim(coalesce(p_actor_name, '')), '');
  if v_actor_name is null then
    raise exception 'Nome do administrador responsável é obrigatório.';
  end if;

  if length(v_actor_name) > 255 then
    raise exception 'Nome do administrador responsável é inválido.';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'Motivo da alteração excede 500 caracteres.';
  end if;

  v_whatsapp_status := nullif(btrim(coalesce(p_whatsapp_status, '')), '');
  if v_whatsapp_status is null then
    v_whatsapp_status := 'pending';
  end if;

  if v_whatsapp_status not in ('configured', 'pending', 'unavailable') then
    raise exception 'Estado da integração WhatsApp inválido.';
  end if;

  -- Serializa ativações concorrentes. O lock vale até o fim da transação.
  perform pg_advisory_xact_lock(hashtext('reobote:emergency_ai_config'));

  select *
    into v_config
  from public.emergency_ai_configs
  where company_id is null
  for update;

  if not found then
    insert into public.emergency_ai_configs (
      company_id,
      enabled,
      integration_status,
      last_changed_by,
      last_changed_by_name,
      last_changed_at
    )
    values (
      null,
      false,
      v_whatsapp_status,
      null,
      null,
      null
    )
    returning * into v_config;
  end if;

  v_previous_enabled := v_config.enabled;

  if v_previous_enabled is distinct from p_enabled then
    v_action := case when p_enabled then 'activate' else 'deactivate' end;

    update public.emergency_ai_configs
       set enabled = p_enabled,
           last_changed_by = p_actor_id,
           last_changed_by_name = v_actor_name,
           last_changed_at = clock_timestamp(),
           integration_status = v_whatsapp_status,
           updated_at = clock_timestamp()
     where id = v_config.id
     returning * into v_config;

    insert into public.emergency_ai_audit_logs (
      config_id,
      company_id,
      action,
      actor_id,
      actor_name,
      previous_enabled,
      new_enabled,
      result,
      reason,
      integration_status
    )
    values (
      v_config.id,
      v_config.company_id,
      v_action,
      p_actor_id,
      v_actor_name,
      v_previous_enabled,
      p_enabled,
      'success',
      v_reason,
      v_whatsapp_status
    )
    returning id into v_audit_id;

    v_changed := true;
  end if;

  return jsonb_build_object(
    'config', to_jsonb(v_config),
    'changed', v_changed,
    'audit_id', v_audit_id
  );
end;
$fn$;

comment on function public.set_emergency_ai_enabled(boolean, uuid, text, text, text) is
  'Ativa/desativa a IA de Emergência de forma atômica, com auditoria. Exclusiva do service_role; o backend valida o ADM.';

-- ----------------------------------------------------------------------------
-- 6. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.emergency_ai_configs enable row level security;
alter table public.emergency_ai_audit_logs enable row level security;
alter table public.emergency_ai_events enable row level security;

-- Configuração: nenhum acesso direto do navegador. Toda leitura/escrita passa
-- pelo backend com service_role e validação explícita de role = admin.
drop policy if exists emergency_ai_configs_service_only on public.emergency_ai_configs;
create policy emergency_ai_configs_service_only
on public.emergency_ai_configs
for all
to authenticated
using (false)
with check (false);

-- Histórico: defesa em profundidade. Mesmo com JWT direto, só admin lê.
-- Não há policy de INSERT/UPDATE/DELETE para authenticated.
drop policy if exists emergency_ai_audit_admin_select on public.emergency_ai_audit_logs;
create policy emergency_ai_audit_admin_select
on public.emergency_ai_audit_logs
for select
to authenticated
using (public.is_admin());

-- Eventos: somente backend. Não expor conversas/mensagens para acesso direto.
drop policy if exists emergency_ai_events_service_only on public.emergency_ai_events;
create policy emergency_ai_events_service_only
on public.emergency_ai_events
for all
to authenticated
using (false)
with check (false);

-- ----------------------------------------------------------------------------
-- 7. Privilégios mínimos
-- ----------------------------------------------------------------------------
revoke all on table
  public.emergency_ai_configs,
  public.emergency_ai_audit_logs,
  public.emergency_ai_events
from anon, authenticated;

grant select on table public.emergency_ai_audit_logs to authenticated;
grant all on table
  public.emergency_ai_configs,
  public.emergency_ai_audit_logs,
  public.emergency_ai_events
to service_role;

revoke all on function public.set_emergency_ai_enabled(boolean, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_emergency_ai_enabled(boolean, uuid, text, text, text)
  to service_role;

-- Atualiza o cache do PostgREST após criar tabelas/função novas.
notify pgrst, 'reload schema';
