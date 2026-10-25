-- ============================================================================
-- REOBOTE SISTEMAS — ADM MASTER ROLE
-- Migration para adicionar o papel 'master_admin' ao sistema existente.
-- ============================================================================

-- 1. Atualizar a constraint de role na tabela users para incluir 'master_admin'
-- A constraint atual: check (role in ('admin', 'user'))
-- Nova constraint: check (role in ('master_admin', 'admin', 'user'))

-- Remove a constraint antiga se existir
alter table public.users
  drop constraint if exists users_role_check;

-- Adiciona a nova constraint
alter table public.users
  add constraint users_role_check
  check (role in ('master_admin', 'admin', 'user'));

-- 2. Atualizar a função is_admin() para considerar master_admin como admin
-- (master_admin tem todos os privilégios de admin + configuração global Meta)
-- A função atual já verifica role = 'admin', então mantemos e adicionamos verificação extra onde necessário

-- 3. Criar função helper para verificar se é master_admin
create or replace function public.is_master_admin()
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
      and u.role = 'master_admin'
  );
$fn$;

comment on function public.is_master_admin() is
  'Retorna true quando o usuário autenticado tem role = master_admin em public.users.';

-- 4. Garantir privilégios para a nova função
revoke all on function public.is_master_admin() from public;
grant execute on function public.is_master_admin() to authenticated, service_role;

-- 5. Índice para consultas de master_admin (opcional, mas útil)
create index if not exists idx_users_role
  on public.users (role)
  where role = 'master_admin';

-- 6. Comentário na tabela users sobre o novo papel
comment on table public.users is
  'Perfis do REOBOTE. id = auth.users.id.
   role = master_admin → acesso total + configuração global Meta WhatsApp (único).
   role = admin → acesso administrativo da empresa (sem segredos Meta).
   role = user → acesso operacional (atendimento).';