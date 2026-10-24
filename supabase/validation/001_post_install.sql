-- ============================================================================
-- REOBOTE SISTEMA ATENDIMENTO
-- Validação pós-instalação (SOMENTE LEITURA)
--
-- Execute depois da migration no projeto Supabase NOVO.
-- Este arquivo não cria, altera nem apaga dados.
-- ============================================================================

-- 1. Tabelas esperadas (devem existir 8).
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'companies',
    'users',
    'whatsapp_configs',
    'contacts',
    'conversations',
    'messages',
    'automations',
    'quick_replies'
  )
order by table_name;

-- 2. Colunas críticas usadas pelo backend.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'conversations' and column_name in ('last_message', 'last_message_at', 'updated_at', 'unread_count', 'assigned_to', 'status'))
    or (table_name = 'whatsapp_configs' and column_name in ('access_token', 'verify_token', 'verified_name', 'quality_rating', 'is_verified', 'company_id'))
    or (table_name = 'users' and column_name in ('id', 'company_id', 'email', 'role', 'status'))
    or (table_name = 'messages' and column_name in ('conversation_id', 'sender_type', 'sender_id', 'content', 'status', 'whatsapp_message_id'))
  )
order by table_name, column_name;

-- 3. RLS habilitado (relrowsecurity deve ser true nas 8 tabelas).
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'companies',
    'users',
    'whatsapp_configs',
    'contacts',
    'conversations',
    'messages',
    'automations',
    'quick_replies'
  )
order by c.relname;

-- 4. Políticas RLS criadas.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'companies',
    'users',
    'whatsapp_configs',
    'contacts',
    'conversations',
    'messages',
    'automations',
    'quick_replies'
  )
order by tablename, policyname;

-- 5. Funções de segurança e triggers (prosecdef = security definer).
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_user_id',
    'current_company_id',
    'is_admin',
    'set_updated_at',
    'enforce_conversation_company',
    'enforce_message_company'
  )
order by p.proname;

-- 6. Triggers instalados.
select event_object_table as table_name,
       trigger_name,
       event_manipulation,
       action_timing
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'companies',
    'users',
    'whatsapp_configs',
    'contacts',
    'conversations',
    'messages',
    'automations',
    'quick_replies'
  )
order by event_object_table, trigger_name, event_manipulation;

-- 7. Índices criados.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'companies',
    'users',
    'whatsapp_configs',
    'contacts',
    'conversations',
    'messages',
    'automations',
    'quick_replies'
  )
order by tablename, indexname;

-- 8. FK de public.users.id -> auth.users.id.
select conname,
       conrelid::regclass as table_name,
       confrelid::regclass as referenced_table,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and conrelid = 'public.users'::regclass
order by conname;

-- 9. Privilégios da tabela sensível (não deve haver anon/authenticated).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'whatsapp_configs'
order by grantee, privilege_type;

-- 9b. Visão geral dos grants das tabelas do REOBOTE.
--     anon não deve ter privilégios; authenticated não deve ter em whatsapp_configs.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'companies',
    'users',
    'whatsapp_configs',
    'contacts',
    'conversations',
    'messages',
    'automations',
    'quick_replies'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

-- 10. Contagem inicial. Antes de criar o ADM real, todas devem ser 0.
select 'companies' as table_name, count(*) as total from public.companies
union all
select 'users', count(*) from public.users
union all
select 'whatsapp_configs', count(*) from public.whatsapp_configs
union all
select 'contacts', count(*) from public.contacts
union all
select 'conversations', count(*) from public.conversations
union all
select 'messages', count(*) from public.messages
union all
select 'automations', count(*) from public.automations
union all
select 'quick_replies', count(*) from public.quick_replies
order by table_name;

-- 11. Nenhum usuário de demonstração/teste deve existir.
select id, email, role, status
from public.users
where email ilike '%demo%'
   or email ilike '%teste%'
   or email ilike '%test@%'
   or email ilike '%example%'
order by email;

-- 12. Tabelas legadas do projeto antigo NÃO devem existir neste projeto novo.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'tenants',
    'customers',
    'charges_pix',
    'audit_logs',
    'conversation_events',
    'legacy_users',
    'legacy_conversations',
    'legacy_messages'
  )
order by table_name;

-- 13. Checagem de que as funções security definer têm search_path fixo.
--     O resultado esperado é proconfig contendo search_path=public, pg_temp.
select p.proname,
       p.prosecdef,
       p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname;
