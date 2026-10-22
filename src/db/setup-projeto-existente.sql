-- ============================================================================
-- PREPARAR O PROJETO EXISTENTE PARA O REOBOTE SISTEMAS
-- Renomeia (NÃO apaga) as 3 tabelas conflitantes do outro sistema e aplica
-- o schema do Reobote. As tabelas tenants/customers/charges_pix continuam.
-- Execute UMA vez no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE IF EXISTS public.users RENAME TO legacy_users;
ALTER TABLE IF EXISTS public.conversations RENAME TO legacy_conversations;
ALTER TABLE IF EXISTS public.messages RENAME TO legacy_messages;

-- ============================================================================
-- REOBOTE SISTEMA ATENDIMENTO — SCHEMA SUPABASE POSTGRESQL & POLÍTICAS RLS
-- ============================================================================

-- 1. Habilitar extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Empresas / Unidades (Multi-tenant)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20),
    plan VARCHAR(50) DEFAULT 'padrao',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Usuários e Atendentes
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'user')),
    status VARCHAR(50) DEFAULT 'offline' CHECK (status IN ('online', 'busy', 'offline')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabela de Configurações do WhatsApp Business Oficial (Meta Cloud API)
-- OBS: Acesso restrito exclusivamente ao servidor backend (nunca exposto ao frontend)
CREATE TABLE IF NOT EXISTS public.whatsapp_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
    phone_number VARCHAR(50) NOT NULL,
    phone_number_id VARCHAR(100) NOT NULL,
    waba_id VARCHAR(100) NOT NULL,
    access_token TEXT NOT NULL,
    verify_token VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    last_health_check TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Tabela de Contatos (Clientes finais da empresa)
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(company_id, phone)
);

-- 6. Tabela de Conversas (Atendimentos WhatsApp)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Tabela de Mensagens
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    sender_type VARCHAR(50) NOT NULL CHECK (sender_type IN ('customer', 'agent', 'system', 'internal_note')),
    sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    whatsapp_message_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Tabela de Automações (Gatilhos e fluxos)
CREATE TABLE IF NOT EXISTS public.automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    trigger_type VARCHAR(100) NOT NULL CHECK (trigger_type IN ('welcome', 'out_of_hours', 'keyword', 'auto_close')),
    trigger_value VARCHAR(255),
    action_type VARCHAR(100) NOT NULL CHECK (action_type IN ('send_message', 'assign_queue', 'add_tag')),
    action_payload TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Tabela de Mensagens Prontas (Respostas Rápidas)
CREATE TABLE IF NOT EXISTS public.quick_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    shortcut VARCHAR(50) NOT NULL,
    category VARCHAR(100) DEFAULT 'Geral',
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- POLÍTICAS DE SEGURANÇA POR LINHA (ROW LEVEL SECURITY - RLS)
-- ============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

-- Helper para obter o company_id do usuário autenticado no JWT
CREATE OR REPLACE FUNCTION auth.company_id() 
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'company_id')::UUID;
$$ LANGUAGE SQL STABLE;

-- Helper para verificar se o usuário autenticado é Admin
CREATE OR REPLACE FUNCTION auth.is_admin() 
RETURNS BOOLEAN AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$ LANGUAGE SQL STABLE;

-- RLS: Empresas
CREATE POLICY "Admin pode gerenciar todas as empresas" 
ON public.companies FOR ALL 
USING (auth.is_admin());

CREATE POLICY "Usuários podem visualizar sua própria empresa" 
ON public.companies FOR SELECT 
USING (id = auth.company_id());

-- RLS: Usuários
CREATE POLICY "Admin pode gerenciar todos os usuários" 
ON public.users FOR ALL 
USING (auth.is_admin());

CREATE POLICY "Usuários podem visualizar colegas da mesma empresa" 
ON public.users FOR SELECT 
USING (company_id = auth.company_id());

-- RLS: WhatsApp Config (NUNCA permitir SELECT direto com access_token ao frontend)
CREATE POLICY "Apenas serviço backend pode acessar credenciais de WhatsApp" 
ON public.whatsapp_configs FOR ALL 
USING (false);

-- RLS: Contatos
CREATE POLICY "Isolamento de Contatos por Empresa" 
ON public.contacts FOR ALL 
USING (auth.is_admin() OR company_id = auth.company_id());

-- RLS: Conversas
CREATE POLICY "Isolamento de Conversas por Empresa" 
ON public.conversations FOR ALL 
USING (auth.is_admin() OR company_id = auth.company_id());

-- RLS: Mensagens
CREATE POLICY "Isolamento de Mensagens por Empresa" 
ON public.messages FOR ALL 
USING (
  auth.is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = messages.conversation_id 
    AND c.company_id = auth.company_id()
  )
);

-- RLS: Automações
CREATE POLICY "Isolamento de Automações por Empresa" 
ON public.automations FOR ALL 
USING (auth.is_admin() OR company_id = auth.company_id());

-- RLS: Mensagens Prontas
CREATE POLICY "Isolamento de Mensagens Prontas por Empresa" 
ON public.quick_replies FOR ALL 
USING (auth.is_admin() OR company_id = auth.company_id());
