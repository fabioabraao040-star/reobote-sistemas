// Limpeza de dados de demonstração/teste e de usuários provisórios do Supabase.
//
// Uso:
//   node --env-file=.env scripts/cleanup-demo.mjs            -> apenas LISTA
//   node --env-file=.env scripts/cleanup-demo.mjs --apply    -> LISTA e REMOVE
//
// Opções:
//   --pattern="demo|teste|test"   Regex aplicada em e-mail e nome (padrão)
//   --keep="email@real.com,..."   Nunca remove estas contas
//
// Remove:
//   1. Contas de login (auth.users) sem perfil em public.users -> "usuários provisórios"
//   2. Perfis demo/teste em public.users (e a conta de login deles)
//   3. Empresas demo que ficarem sem usuários reais (contatos, conversas,
//      mensagens, automações, mensagens prontas e config. WhatsApp em cascata)
//
// Requer no .env: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error('\n[ERRO] Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env antes de rodar.\n');
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const patternArg = args.find((a) => a.startsWith('--pattern='));
const keepArg = args.find((a) => a.startsWith('--keep='));
const pattern = new RegExp(patternArg ? patternArg.split('=')[1] : 'demo|teste|test', 'i');
const keep = new Set(
  (keepArg ? keepArg.split('=')[1] : '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const isDemoUser = (u) =>
  !keep.has((u.email || '').toLowerCase()) && pattern.test(`${u.name || ''} ${u.email || ''}`);

const isDemoCompany = (c) => pattern.test(`${c.name || ''} ${c.cnpj || ''}`);

async function listAuthUsers() {
  const all = [];
  let page = 1;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...(data?.users || []));
    if (!data?.users || data.users.length < 1000) break;
    page += 1;
  }

  return all;
}

async function main() {
  console.log(`\nModo: ${apply ? 'APLICAR EXCLUSÃO' : 'SOMENTE LISTAR'}`);
  console.log(`Padrão demo: ${pattern}\n`);

  const [
    { data: companies, error: cErr },
    { data: users, error: uErr },
    authUsers,
  ] = await Promise.all([
    supabase.from('companies').select('id, name, cnpj, created_at').order('created_at'),
    supabase.from('users').select('id, company_id, name, email, role, created_at').order('created_at'),
    listAuthUsers(),
  ]);

  if (cErr) throw cErr;
  if (uErr) throw uErr;

  const companiesById = new Map((companies || []).map((c) => [c.id, c]));
  const profileIds = new Set((users || []).map((u) => u.id));

  const authOnly = authUsers.filter(
    (a) => !profileIds.has(a.id) && !keep.has((a.email || '').toLowerCase())
  );
  const demoUsers = (users || []).filter(isDemoUser);
  const demoCompanyIds = new Set();

  console.log(`Empresas (${(companies || []).length}):`);
  for (const c of companies || []) {
    const count = (users || []).filter((u) => u.company_id === c.id).length;
    if (isDemoCompany(c)) demoCompanyIds.add(c.id);
    console.log(`  ${isDemoCompany(c) ? '[DEMO]' : '[    ]'} ${c.id}  ${c.name}  (${count} usuários)`);
  }

  console.log(`\nPerfis em public.users (${(users || []).length}):`);
  for (const u of users || []) {
    const company = companiesById.get(u.company_id);
    console.log(
      `  ${isDemoUser(u) ? '[DEMO]' : '[REAL]'} ${u.role.padEnd(5)} ${(u.email || '').padEnd(38)} ${u.name}  | ${company?.name || 'sem empresa'}`
    );
  }

  console.log(`\nContas de login sem perfil — usuários provisórios (${authOnly.length}):`);
  for (const a of authOnly) {
    console.log(`  [ÓRFÃ] ${a.email}  (criada em ${a.created_at})`);
  }
  if (authOnly.length === 0) console.log('  nenhuma');

  const demoNames = [...new Set([...demoCompanyIds, ...demoUsers.map((u) => u.company_id)])]
    .map((id) => companiesById.get(id)?.name)
    .filter(Boolean);

  console.log('\nResumo:');
  console.log(`  ${authOnly.length} conta(s) provisória(s) sem perfil`);
  console.log(`  ${demoUsers.length} perfil(is) demo/teste`);
  console.log(`  ${demoNames.length ? demoNames.join(', ') : 'nenhuma'} empresa(s) demo`);

  if (!apply) {
    console.log('\nNada foi alterado. Rode com --apply para excluir.\n');
    return;
  }

  let removedAuth = 0;
  let removedProfiles = 0;
  let removedCompanies = 0;

  // 1) Contas de login sem perfil (não conseguem entrar: "Usuário não encontrado")
  for (const a of authOnly) {
    const { error } = await supabase.auth.admin.deleteUser(a.id);
    if (error) console.warn(`  [aviso] auth.deleteUser(${a.email}): ${error.message}`);
    else {
      removedAuth++;
      console.log(`  removida conta provisória: ${a.email}`);
    }
  }

  // 2) Perfis demo/teste + conta de login correspondente
  for (const u of demoUsers) {
    const { error: authErr } = await supabase.auth.admin.deleteUser(u.id);
    if (authErr) console.warn(`  [aviso] auth.deleteUser(${u.email}): ${authErr.message}`);
    else removedAuth++;

    const { error: dbErr } = await supabase.from('users').delete().eq('id', u.id);
    if (dbErr) console.warn(`  [aviso] users.delete(${u.email}): ${dbErr.message}`);
    else {
      removedProfiles++;
      console.log(`  removido perfil demo: ${u.email}`);
    }
  }

  // 3) Empresas demo que ficaram sem usuários reais
  const { data: remainingUsers } = await supabase.from('users').select('id, company_id');
  const remainingByCompany = new Map();
  for (const u of remainingUsers || []) {
    remainingByCompany.set(u.company_id, (remainingByCompany.get(u.company_id) || 0) + 1);
  }

  for (const c of companies || []) {
    if ((remainingByCompany.get(c.id) || 0) > 0) continue; // preserva empresa com usuário real
    const hadDemo = (users || []).some((u) => u.company_id === c.id && isDemoUser(u));
    if (!isDemoCompany(c) && !hadDemo) continue;

    const { error } = await supabase.from('companies').delete().eq('id', c.id);
    if (error) {
      console.warn(`  [aviso] companies.delete(${c.name}): ${error.message}`);
    } else {
      removedCompanies++;
      console.log(`  removida empresa demo: ${c.name} (dados em cascata)`);
    }
  }

  console.log(
    `\nConcluído: ${removedAuth} conta(s) de login, ${removedProfiles} perfil(is) e ${removedCompanies} empresa(s) removidos.\n`
  );
}

main().catch((err) => {
  console.error('\n[ERRO]', err.message || err, '\n');
  process.exit(1);
});
