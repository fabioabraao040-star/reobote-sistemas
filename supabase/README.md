# Supabase — REOBOTE SISTEMAS

Esta pasta contém a migration inicial para um **projeto Supabase novo e exclusivo** do REOBOTE. Ela **não** deve ser aplicada no projeto atual que contém `tenants`, `customers`, `charges_pix`, `audit_logs` e `conversation_events`.

## Arquivos

- `migrations/20261022000000_init_reobote_atendimento.sql` — schema, RLS, funções, triggers, índices e grants.
- `migrations/20261022010000_unique_whatsapp_message_id.sql` — unicidade parcial de `messages.whatsapp_message_id` para idempotência do webhook.
- `migrations/20261025000000_add_master_admin_role.sql` — papel `master_admin` e helpers de autorização global.
- `migrations/20261027000000_add_conversation_opened_at.sql` — coluna `conversations.opened_at`, gravada pelo REOBOTE quando o atendente abre a conversa.
- `migrations/20261027010000_add_emergency_ai.sql` — configuração, auditoria e eventos futuros da IA de Emergência. **Não aplicada automaticamente por este repositório.**
- `validation/001_post_install.sql` — verificações somente leitura após a instalação.

## O que a migration cria

| Tabela | Finalidade |
|---|---|
| `companies` | Empresas/unidades |
| `users` | Perfis vinculados a `auth.users.id` |
| `whatsapp_configs` | Credenciais Meta (somente backend) |
| `contacts` | Contatos por empresa |
| `conversations` | Conversas por empresa |
| `messages` | Mensagens da conversa |
| `automations` | Automações por empresa |
| `quick_replies` | Respostas rápidas por empresa |
| `emergency_ai_configs` | Estado administrativo da IA de Emergência (global no modelo atual) |
| `emergency_ai_audit_logs` | Histórico de ativação/desativação, somente ADM pela API |
| `emergency_ai_events` | Estrutura futura para eventos, tokens e idempotência, sem conteúdo de mensagem |

Proteções incluídas:

- RLS em todas as tabelas.
- Isolamento por `company_id`.
- Acesso administrativo por `users.role = 'admin'`.
- `whatsapp_configs` sem acesso direto para `anon`/`authenticated`.
- `emergency_ai_configs` e `emergency_ai_events` sem acesso direto para `anon`/`authenticated`; o backend usa `service_role`.
- `emergency_ai_audit_logs`: `authenticated` só lê com `public.is_admin()`; sem policies de escrita.
- FK `public.users.id -> auth.users(id) ON DELETE CASCADE`.
- Triggers que impedem mistura de empresas mesmo quando o backend usa `service_role`.
- Helpers `public.current_user_id()`, `public.current_company_id()` e `public.is_admin()`.
- Função atômica `public.set_emergency_ai_enabled(...)`, exclusiva de `service_role`, com advisory lock e auditoria na mesma transação.

## Pré-requisitos

1. Projeto Supabase novo e vazio.
2. Schema `auth` do Supabase disponível (todo projeto Supabase tem).
3. PostgreSQL 13+ (usa `gen_random_uuid()`).
4. Executar como `postgres` (SQL Editor ou CLI oficial). Não executar como `anon`/`authenticated`.

A migration tem uma checagem prévia antes de qualquer DDL: se `public.users` já existir com `id`/`company_id` incompatíveis (por exemplo, o schema legado com `tenant_id` e `id text`), ela aborta e informa o motivo sem criar tabelas parciais.

## Aplicação manual

O arquivo não abre transação explícita (`BEGIN`/`COMMIT`) para ser compatível com o runner do `supabase db push`, que já controla a transação. Ele é idempotente: se uma instrução falhar no SQL Editor, corrija a causa e reaplique o arquivo; tabelas já criadas não serão recriadas nem apagadas.

### Opção A — SQL Editor (mais simples)

1. Abra o projeto novo no Supabase.
2. Vá em **SQL Editor**.
3. Cole todo o conteúdo de `migrations/20261022000000_init_reobote_atendimento.sql`.
4. Execute uma vez.
5. Em um banco que já existia antes destas alterações, execute também, nesta ordem, `migrations/20261025000000_add_master_admin_role.sql`, `migrations/20261027000000_add_conversation_opened_at.sql` e `migrations/20261027010000_add_emergency_ai.sql`.
6. Rode `validation/001_post_install.sql` e confira os resultados.

> A migration da IA de Emergência não é aplicada automaticamente por este
> repositório e não deve ser executada em produção sem autorização específica.
> Ela não cria configuração ativa: a ausência de linha em
> `emergency_ai_configs` significa `DESATIVADA`.

### Opção B — CLI do Supabase (com histórico de migrations)

```bash
# Na raiz do repositório. Crie a configuração apenas se ainda não existir.
supabase init

# Projeto NOVO (o ref não é segredo, mas não use o projeto antigo).
supabase link --project-ref <NOVO_PROJECT_REF>

# Aplica as migrations pendentes.
supabase db push
```

### Opção C — psql

Use a connection string do projeto **novo** (Project Settings → Database). Não grave a URL no repositório.

```bash
export SUPABASE_DB_URL='postgresql://...'   # segredo: não commitar
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261022000000_init_reobote_atendimento.sql
```

## Criar o primeiro ADM real

Não há seed, usuário padrão ou senha nesta migration. Crie o primeiro ADM manualmente.

1. No Supabase, vá em **Authentication → Users → Add user**.
2. Informe e-mail e senha do ADM real; confirme o e-mail.
3. Copie o UUID do usuário criado.
4. No **SQL Editor**, execute o modelo abaixo substituindo os placeholders:

```sql
-- Substitua os três placeholders. Não use dados de demonstração.
insert into public.companies (name)
values ('<NOME_DA_EMPRESA>')
returning id;

-- Use o id retornado acima e o UUID do Auth.
insert into public.users (id, company_id, email, name, role, status)
values (
  '<AUTH_USER_UUID>'::uuid,
  '<COMPANY_ID>'::uuid,
  '<EMAIL_DO_ADMIN>',
  '<NOME_DO_ADMIN>',
  'admin',
  'offline'
);
```

Alternativa: cadastre pelo próprio sistema e depois promova o perfil:

```sql
update public.users
set role = 'admin'
where email = '<EMAIL_DO_ADMIN>';
```

## Variáveis de ambiente do backend

Configure apenas no servidor/Vercel. **Nunca** exponha a service role no frontend.

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=
CORS_ORIGINS=
WHATSAPP_APP_SECRET=
```

Não há valores reais neste repositório.

## Validações pós-instalação

Execute `validation/001_post_install.sql`. Resultados esperados:

1. As 11 tabelas existem, incluindo as três tabelas `emergency_ai_*`.
2. `conversations.last_message`, `conversations.updated_at`, `whatsapp_configs.verified_name`, `whatsapp_configs.quality_rating` e as colunas críticas da IA de Emergência existem.
3. `relrowsecurity = true` nas 11 tabelas.
4. Existem políticas para as 11 tabelas.
5. As funções esperadas existem e as `security definer` têm `search_path` fixo, incluindo `set_emergency_ai_enabled`.
6. Triggers de `updated_at` e de isolamento existem.
7. Índices esperados existem, incluindo unicidade global da configuração e idempotência dos eventos.
8. `public.users.id` referencia `auth.users.id` com `ON DELETE CASCADE`.
9. `whatsapp_configs`, `emergency_ai_configs` e `emergency_ai_events` não têm grants para `anon`/`authenticated`; o histórico só tem `SELECT` para `authenticated`.
10. Antes do ADM, todas as contagens são 0.
11. Nenhum usuário demo/teste.
12. Nenhuma tabela legada (`tenants`, `customers`, etc.) foi criada.
13. As funções `security definer` têm `proconfig` com `search_path`.

Testes funcionais recomendados depois da configuração:

- Cadastro público cria Auth + empresa + perfil com `role = 'user'`.
- Login retorna token e perfil.
- ADM lista/cria/edita/exclui atendentes.
- Atendente não acessa contatos/conversas de outra empresa.
- ADM acessa todas as empresas.
- Configuração do WhatsApp só é acessível pelo backend.
- Webhook da Meta responde ao desafio e valida assinatura.

## IA de Emergência

Superfície administrativa implementada no backend:

| Método | Rota | Autorização |
|---|---|---|
| `GET` | `/api/emergency-ai` | JWT válido + `users.role = 'admin'` |
| `POST` | `/api/emergency-ai/activate` | JWT válido + `users.role = 'admin'` |
| `POST` | `/api/emergency-ai/deactivate` | JWT válido + `users.role = 'admin'` |
| `GET` | `/api/emergency-ai/history?limit=20` | JWT válido + `users.role = 'admin'` |

`master_admin` e `user` recebem `403`; sem Bearer token, `401`. A interface só
mostra `ATIVA` depois que o backend confirma a gravação. Falha de leitura ou de
persistência nunca é interpretada como autorização.

Contrato preparado para a futura integração com mensagens:

1. Antes de qualquer resposta automática, consultar
   `public.emergency_ai_configs` pelo identificador global (`company_id IS NULL`)
   e exigir `enabled = true`.
2. Qualquer erro de leitura deve ser tratado como desativado e a conversa deve
   seguir para atendimento humano.
3. Não chamar provedor de IA quando `enabled = false`; registrar
   `disabled_skip` em `emergency_ai_events` se o evento for pertinente.
4. Usar `idempotency_key` único para impedir duas respostas para o mesmo evento.
5. Registrar `provider`, `model`, `input_tokens`, `output_tokens` e
   `total_tokens` quando o provedor informar; nunca gravar conteúdo integral da
   mensagem nem credenciais.
6. Em falha do provedor, transferir para humano e registrar `human_handoff` ou
   `error`, sem repetir a resposta automaticamente.
7. A desativação deve interromper novas respostas; uma resposta já em voo não
   pode ser reenviada pelo webhook.

O webhook atual **permanece inalterado** nesta etapa. Não há chamada real a
provedor de IA, envio de mensagem automática, cobrança de tokens ou integração
Meta nova.

## Riscos e limites conhecidos

- **A service role ignora RLS.** Os triggers de isolamento e as validações do backend são a proteção efetiva para chamadas do servidor. As policies protegem acesso direto com JWT.
- **Mapeamento `snake_case`/`camelCase`:** o backend mantém `snake_case`; `src/services/api.ts` normaliza as respostas para `camelCase` antes de entregar às telas. As conversas também são enriquecidas com `contact_name`, `contact_phone` e `assigned_name`.
- **Não há trigger de auto-perfil em `auth.users`.** O backend cria `public.users` depois do `signUp`/`createUser`. Se um usuário existir no Auth sem perfil, ele autentica mas recebe “Usuário não encontrado no sistema”.
- **Rollback do cadastro:** o cadastro verifica e-mail existente antes do `signUp` e também detecta o usuário ofuscado sem identidades, sem apagar contas existentes. Falhas posteriores removem apenas o usuário recém-criado.
- **Isolamento de conversas:** `GET/POST /api/conversations/:id/messages` e `PATCH /api/conversations/:id/status` validam a empresa do usuário e o vínculo do atendente antes de qualquer alteração.
- **`whatsapp_configs` é tratada como global pelo código** (`limit(1).single()`), embora tenha `company_id` opcional. A migration cria um índice parcial que permite no máximo uma configuração global (`company_id IS NULL`) e continua permitindo uma por empresa. Ainda assim, se existirem configurações por empresa, o `limit(1).single()` do código pode falhar por haver mais de uma linha.
- **E-mail do perfil x e-mail do Auth:** `PUT /api/users/:id` atualiza também o e-mail em `auth.users` e reverte se a atualização do perfil falhar.
- **Webhook da Meta:** o endpoint valida `x-hub-signature-256` e grava mensagens recebidas, atualiza status de entrega/leitura e ignora reenvios pelo `whatsapp_message_id`. Requer `WHATSAPP_APP_SECRET` configurado na Vercel; sem ele o webhook responde 500.
- **Excluir empresa não exclui logins do Auth.** A FK vai de `public.users` para `auth.users`; o cascade remove o perfil quando o login é removido, não o contrário.
- **Confirmação de e-mail:** se estiver ativa no Supabase, o cadastro não conseguirá entrar até confirmar. Configure SMTP ou desative a confirmação para uso interno, conforme a política da operação.
- **`automations` e `quick_replies` exigem `company_id`.** Um admin global sem empresa não consegue criá-las.
- **`messages.whatsapp_message_id` agora é único quando preenchido** (índice parcial). Reenvios do mesmo evento da Meta são ignorados; mensagens internas continuam sem esse campo.
- **A migration pressupõe projeto novo/vazio.** Em um banco com dados antigos, a FK para `auth.users` ou os `NOT NULL` podem falhar. Ela não apaga dados.
- **`whatsapp_configs.access_token`/`verify_token` têm default vazio** para compatibilidade com o código, que permite salvar a configuração sem tokens. A conexão com a Meta só funciona após preenchê-los.
- **Rotas temporárias removidas:** `/api/diag`, `/api/diag/create-admin`, `DIAG_TOKEN` e as páginas públicas de diagnóstico não fazem mais parte do código de produção.
- **Migrations aplicadas:** o schema inicial e o índice único do webhook foram aplicados no projeto novo `csizihsuyzwaukdvzsaj` em 22/10/2026. O projeto legado `uidjqspmkbeztjzftvkv` permanece intocado.
- **IA de Emergência ainda não integrada ao fluxo real:** a migration, as rotas e o card administrativo estão implementados localmente, mas o webhook continua sem chamar IA. Ativar o card não envia mensagens. A configuração de provedor/modelo ainda é manual na tabela, sem tela de edição nesta etapa.
- **Credencial do provedor:** `GEMINI_API_KEY` é usada apenas para indicar `configured`/`unavailable`; o valor nunca é retornado. Se o provedor/modelo estiver definido sem credencial válida, o estado é `unavailable`.
- **Concorrência:** a alteração de estado usa `pg_advisory_xact_lock` e grava estado + auditoria na mesma transação. Ainda assim, chamadas simultâneas são serializadas; não há promessa de ordem entre elas.
- **Histórico:** registra apenas alterações efetivas confirmadas. Uma ativação quando já está ativa não gera novo registro; falhas de persistência não geram registro de sucesso.
