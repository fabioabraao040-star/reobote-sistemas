-- ============================================================================
-- REOBOTE SISTEMAS — CORREÇÃO DE AUTORIZAÇÃO RLS: CONVERSAS E MENSAGENS
-- Auditiva local. Nao executa GRANT/REVOKE/ALTER/DROP/TRUNCATE/UPDATE/INSERT
-- contra o banco remoto. Apenas cria objetos locais para revisao e aplicacao.
-- ============================================================================

-- Conversas: substitui a policy ampla por operacoes explicitas.
DROP POLICY IF EXISTS conversations_company_isolation ON public.conversations;

CREATE POLICY conversations_admin_select
ON public.conversations
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  AND company_id = public.current_company_id()
);

CREATE POLICY conversations_attendant_select
ON public.conversations
FOR SELECT
TO authenticated
USING (
  assigned_to = public.current_user_id()
  AND EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = contact_id
      AND c.company_id = company_id
  )
);

CREATE POLICY conversations_admin_insert
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  AND company_id = public.current_company_id()
  AND EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = contact_id
      AND c.company_id = company_id
  )
);

CREATE POLICY conversations_attendant_insert
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  assigned_to = public.current_user_id()
  AND EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = contact_id
      AND c.company_id = company_id
  )
);

CREATE POLICY conversations_admin_update
ON public.conversations
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  AND company_id = public.current_company_id()
)
WITH CHECK (
  public.is_admin()
  AND company_id = public.current_company_id()
);

CREATE POLICY conversations_attendant_update
ON public.conversations
FOR UPDATE
TO authenticated
USING (
  assigned_to = public.current_user_id()
  AND EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = contact_id
      AND c.company_id = company_id
  )
)
WITH CHECK (
  assigned_to = public.current_user_id()
  AND EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = contact_id
      AND c.company_id = company_id
  )
);

CREATE POLICY conversations_admin_delete
ON public.conversations
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  AND company_id = public.current_company_id()
);

-- Mensagens: substitui a policy ampla por operacoes explicitas.
DROP POLICY IF EXISTS messages_company_isolation ON public.messages;

CREATE POLICY messages_admin_select
ON public.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.company_id = public.current_company_id()
      AND public.is_admin()
  )
);

CREATE POLICY messages_attendant_select
ON public.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.assigned_to = public.current_user_id()
      AND c.company_id = public.current_company_id()
  )
);

CREATE POLICY messages_admin_insert
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.company_id = public.current_company_id()
      AND public.is_admin()
  )
  AND (
    (sender_type IN ('agent', 'internal_note') AND sender_id = public.current_user_id())
    OR (sender_type IN ('customer', 'system') AND sender_id IS NULL)
  )
);

CREATE POLICY messages_attendant_insert
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.assigned_to = public.current_user_id()
      AND c.company_id = public.current_company_id()
  )
  AND (
    (sender_type IN ('agent', 'internal_note') AND sender_id = public.current_user_id())
    OR (sender_type IN ('customer', 'system') AND sender_id IS NULL)
  )
);

CREATE POLICY messages_admin_update
ON public.messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.company_id = public.current_company_id()
      AND public.is_admin()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.company_id = public.current_company_id()
      AND public.is_admin()
  )
);

CREATE POLICY messages_admin_delete
ON public.messages
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND c.company_id = public.current_company_id()
      AND public.is_admin()
  )
);
