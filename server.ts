import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import {
  computeConversationVisualStatusMap,
  type ConversationVisualStatus,
} from './src/utils/conversationStatus.js';

dotenv.config();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const app = express();

// O webhook da Meta exige o corpo bruto (Buffer) para validar a assinatura HMAC.
// Precisa ser registrado ANTES do express.json(), que consumiria o corpo.
app.use('/api/webhook/whatsapp', express.raw({ type: 'application/json' }));

app.use(express.json());

// ============================================================================
// SEGURANÇA DO SERVIDOR
// ============================================================================

// CORS com origens permitidas (configurável via variável de ambiente)
const corsOrigins = process.env.CORS_ORIGINS || 'http://localhost:3000';
app.use(cors({
  origin: corsOrigins.split(',').map(s => s.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
}));

// Headers de segurança com Helmet
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));

// Rate limiting geral para API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requisições por IP por janela de 15 min
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Rate limiting mais rígido para rotas de autenticação
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 tentativas por IP por janela de 15 min
  message: { error: 'Muitas tentativas de autenticação. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/', authLimiter);

// ============================================================================
// SUPABASE CLIENT (SOMENTE BACKEND)
// ============================================================================

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase: SupabaseClient | null = null;
// Cliente separado para login. O cliente de dados permanece sempre com a
// service role, evitando que um login mude a sessão e aplique RLS nas rotas.
let supabaseAuth: SupabaseClient | null = null;

if (supabaseUrl && supabaseServiceRoleKey) {
  const authOptions = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  };

  supabase = createClient(supabaseUrl, supabaseServiceRoleKey, authOptions);
  supabaseAuth = createClient(supabaseUrl, supabaseServiceRoleKey, authOptions);
} else {
  console.warn('[AVISO] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados. O servidor funcionará em modo limitado.');
}

// ============================================================================
// INTERFACES (espelham as tabelas do schema.sql)
// ============================================================================

interface Company {
  id: string;
  name: string;
  cnpj?: string;
  plan?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface User {
  id: string;
  company_id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  status: 'online' | 'busy' | 'offline';
  created_at?: string;
  updated_at?: string;
}

interface Contact {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  email?: string;
  tags?: string[];
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

interface Conversation {
  id: string;
  company_id: string;
  contact_id: string;
  assigned_to?: string;
  status: 'open' | 'in_progress' | 'closed';
  last_message_at?: string;
  unread_count?: number;
  created_at?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'agent' | 'system' | 'internal_note';
  sender_id?: string;
  content: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  whatsapp_message_id?: string;
  created_at?: string;
}

interface Automation {
  id: string;
  company_id: string;
  name: string;
  trigger_type: 'welcome' | 'out_of_hours' | 'keyword' | 'auto_close';
  trigger_value?: string;
  action_type: 'send_message' | 'assign_queue' | 'add_tag';
  action_payload: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface QuickReply {
  id: string;
  company_id: string;
  title: string;
  shortcut: string;
  category?: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

interface WhatsAppConfig {
  id: string;
  company_id: string;
  phone_number: string;
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  verify_token: string;
  is_verified: boolean;
  verified_name?: string;
  quality_rating?: string;
  last_health_check?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// MIDDLEWARE DE AUTENTICAÇÃO REAL (JWT via Supabase)
// ============================================================================

interface AuthenticatedRequest extends Request {
  authRole?: 'admin' | 'user';
  authCompanyId?: string;
  authUserId?: string;
  authUserName?: string;
}

const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.substring(7);

  if (!supabase || !supabaseAuth) {
    return res.status(500).json({ error: 'Serviço de autenticação não configurado no servidor.' });
  }

  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    // Busca dados do usuário na tabela users
    const { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id, company_id, name, email, role, status')
      .eq('id', user.id)
      .single();

    if (userError || !dbUser) {
      return res.status(401).json({ error: 'Usuário não encontrado no sistema.' });
    }

    req.authRole = dbUser.role as 'admin' | 'user';
    req.authCompanyId = dbUser.company_id;
    req.authUserId = dbUser.id;
    req.authUserName = dbUser.name;

    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Falha na autenticação: ' + err.message });
  }
};

const adminOnlyMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.authRole !== 'admin') {
    return res.status(403).json({
      error: 'Acesso Proibido: Esta operação exige privilégios de Administrador.',
    });
  }
  next();
};

// ============================================================================
// ROTAS DE API DO SISTEMA (BACKEND REST)
// ============================================================================

// 1. WhatsApp Official Meta API Configuration (Admin Only)
app.get('/api/whatsapp/config', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: config, error } = await supabase
    .from('whatsapp_configs')
    .select('*')
    .limit(1)
    .single();

  if (error || !config) {
    return res.status(404).json({ error: 'Configuração do WhatsApp não encontrada.' });
  }

  res.json({
    companyId: config.company_id,
    phoneNumber: config.phone_number,
    phoneNumberId: config.phone_number_id,
    wabaId: config.waba_id,
    verifyToken: config.verify_token,
    isVerified: config.is_verified,
    hasAccessToken: Boolean(config.access_token && config.access_token.trim().length > 0),
    maskedToken: config.access_token ? `${config.access_token.slice(0, 6)}••••••••${config.access_token.slice(-4)}` : '',
    verifiedName: config.verified_name,
    qualityRating: config.quality_rating,
    lastChecked: config.last_health_check,
    webhookUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/webhook/whatsapp`,
  });
});

app.post('/api/whatsapp/config', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { phoneNumber, phoneNumberId, wabaId, accessToken, verifyToken } = req.body;

  if (!phoneNumber || !phoneNumberId || !wabaId) {
    return res.status(400).json({ error: 'Número oficial, Phone Number ID e WABA ID são obrigatórios.' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('whatsapp_configs')
    .select('*')
    .limit(1)
    .single();

  if (existing) {
    const { error: updateError } = await supabase
      .from('whatsapp_configs')
      .update({
        phone_number: phoneNumber.trim(),
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim(),
        ...(verifyToken ? { verify_token: verifyToken.trim() } : {}),
        ...(accessToken && accessToken.trim() ? { access_token: accessToken.trim() } : {}),
        is_verified: false,
        last_health_check: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateError) {
      return res.status(500).json({ error: 'Erro ao atualizar configurações do WhatsApp.' });
    }

    return res.json({
      success: true,
      message: 'Configurações do WhatsApp salvas no servidor. Valide a conexão para ativar.',
      isVerified: false,
    });
  }

  // Criar nova configuração (assumindo empresa única)
  const { error: insertError } = await supabase
    .from('whatsapp_configs')
    .insert({
      phone_number: phoneNumber.trim(),
      phone_number_id: phoneNumberId.trim(),
      waba_id: wabaId.trim(),
      ...(verifyToken ? { verify_token: verifyToken.trim() } : {}),
      ...(accessToken && accessToken.trim() ? { access_token: accessToken.trim() } : {}),
      is_verified: false,
    });

  if (insertError) {
    return res.status(500).json({ error: 'Erro ao criar configuração do WhatsApp.' });
  }

  res.json({
    success: true,
    message: 'Configurações do WhatsApp salvas no servidor. Valide a conexão para ativar.',
    isVerified: false,
  });
});

// Teste Real de Conexão com Meta Cloud Platform (Chamada de saúde na Graph API)
app.post('/api/whatsapp/verify-connection', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: cfg, error } = await supabase
    .from('whatsapp_configs')
    .select('*')
    .limit(1)
    .single();

  if (error || !cfg) {
    return res.status(400).json({
      connected: false,
      error: 'Configuração do WhatsApp não encontrada.',
    });
  }

  if (!cfg.phone_number_id || !cfg.access_token) {
    return res.status(400).json({
      connected: false,
      error: 'Phone Number ID e Token de Acesso da Meta não estão preenchidos no servidor.',
    });
  }

  try {
    const metaUrl = `https://graph.facebook.com/v20.0/${cfg.phone_number_id}?fields=verified_name,display_phone_number,quality_rating`;
    const response = await fetch(metaUrl, {
      headers: {
        Authorization: `Bearer ${cfg.access_token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      await supabase
        .from('whatsapp_configs')
        .update({
          is_verified: false,
          last_health_check: new Date().toISOString(),
        })
        .eq('id', cfg.id);

      return res.status(400).json({
        connected: false,
        error: data.error?.message || 'Falha ao autenticar na Meta Cloud Platform. Verifique o token e os IDs.',
        metaError: data.error,
      });
    }

    await supabase
      .from('whatsapp_configs')
      .update({
        is_verified: true,
        verified_name: data.verified_name || 'Reobote Oficial',
        quality_rating: data.quality_rating || 'GREEN',
        last_health_check: new Date().toISOString(),
      })
      .eq('id', cfg.id);

    return res.json({
      connected: true,
      verifiedName: data.verified_name || 'Reobote Oficial',
      displayPhoneNumber: data.display_phone_number || cfg.phone_number,
      qualityRating: data.quality_rating || 'GREEN',
      lastChecked: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      connected: false,
      error: `Erro ao comunicar com os servidores da Meta: ${err.message}`,
    });
  }
});

// Status público de conexão (Sem expor credenciais)
app.get('/api/whatsapp/status', authMiddleware, async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: cfg, error } = await supabase
    .from('whatsapp_configs')
    .select('is_verified, phone_number, last_health_check')
    .limit(1)
    .single();

  if (error || !cfg) {
    return res.json({
      connected: false,
      phoneNumber: null,
      lastChecked: null,
    });
  }

  res.json({
    connected: cfg.is_verified,
    phoneNumber: cfg.phone_number,
    lastChecked: cfg.last_health_check,
  });
});

// Webhook Oficial da Meta (Verificação de Assinatura GET)
app.get('/api/webhook/whatsapp', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // 1. Tentar obter o verify token a partir da variável de ambiente (definido explicitamente).
  //    Isso evita depender de uma linha na tabela whatsapp_configs e não cria fallback inseguro.
  let expectedToken: string | null = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || null;

  // 2. Se não houver variável de ambiente, consultar a configuração no banco (maybeSingle não falha se vazio).
  if (!expectedToken && supabase) {
    try {
      const { data } = await supabase
        .from('whatsapp_configs')
        .select('verify_token')
        .limit(1)
        .maybeSingle();
      expectedToken = data?.verify_token?.trim() || null;
    } catch {
      // Sem configuração disponível; expectedToken permanece null.
    }
  }

  // 3. Validar: mode=subscribe, token presente e igual ao esperado.
  if (mode === 'subscribe' && typeof token === 'string' && token.length > 0 && expectedToken && token === expectedToken) {
    console.log('[Meta Webhook] Desafio de verificação aceito com sucesso!');
    return res.status(200).send(typeof challenge === 'string' ? challenge : String(challenge ?? ''));
  }

  return res.status(403).send('Token de verificação inválido.');
});

// Webhook Oficial da Meta (Recebimento de Eventos POST)
app.post('/api/webhook/whatsapp', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];

  if (!supabase) {
    return res.status(500).send('Erro interno.');
  }

  if (!signature) {
    return res.status(401).send('Assinatura ausente.');
  }

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error('[Webhook] WHATSAPP_APP_SECRET não configurado.');
    return res.status(500).send('Erro interno.');
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).send('Corpo inválido.');
  }

  // Validar assinatura HMAC-SHA256 da Meta
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(rawBody);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  const sig = String(signature);
  if (sig.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))) {
    return res.status(401).send('Assinatura inválida.');
  }

  let body: any;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('JSON inválido.');
  }

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  try {
    // A configuração é global no schema atual. Se houver company_id, usa;
    // caso contrário, resolve pela primeira unidade (cenário de uma empresa).
    const { data: cfg } = await supabase
      .from('whatsapp_configs')
      .select('company_id')
      .limit(1)
      .maybeSingle();

    let companyId: string | null = cfg?.company_id || null;
    if (!companyId) {
      const { data: firstCompany } = await supabase
        .from('companies')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      companyId = firstCompany?.id || null;
    }

    if (!companyId) {
      console.error('[Meta Webhook] Nenhuma empresa cadastrada para associar a mensagem.');
      return res.status(200).send('EVENT_RECEIVED');
    }

    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change?.value;
        if (!value) continue;

        // Mensagens recebidas do cliente
        const inboundMessages = Array.isArray(value.messages) ? value.messages : [];
        for (const inbound of inboundMessages) {
          const from = String(inbound?.from || '').replace(/\D/g, '');
          if (!from) continue;

          if (inbound?.id) {
            const { data: existingMessage } = await supabase
              .from('messages')
              .select('id')
              .eq('whatsapp_message_id', inbound.id)
              .maybeSingle();

            if (existingMessage) continue;
          }

          const contactName =
            value.contacts?.[0]?.profile?.name?.trim() || `Contato ${from}`;

          let { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('company_id', companyId)
            .eq('phone', from)
            .maybeSingle();

          if (!contact) {
            const { data: plusContact } = await supabase
              .from('contacts')
              .select('id')
              .eq('company_id', companyId)
              .eq('phone', `+${from}`)
              .maybeSingle();
            contact = plusContact;
          }

          if (!contact) {
            const { data: newContact, error: contactError } = await supabase
              .from('contacts')
              .insert({
                company_id: companyId,
                name: contactName,
                phone: from,
              })
              .select('id')
              .single();

            if (contactError || !newContact) {
              console.error('[Meta Webhook] Erro ao criar contato:', contactError?.message);
              continue;
            }
            contact = newContact;
          }

          const content =
            inbound?.text?.body ||
            (inbound?.type ? `[Mensagem de ${inbound.type}]` : '[Mensagem recebida]');
          const now = new Date().toISOString();

          const { data: existingConv } = await supabase
            .from('conversations')
            .select('*')
            .eq('company_id', companyId)
            .eq('contact_id', contact.id)
            .in('status', ['open', 'in_progress'])
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          let conversationId: string | null = existingConv?.id || null;

          if (conversationId && existingConv) {
            await supabase
              .from('conversations')
              .update({
                last_message: content,
                last_message_at: now,
                unread_count: (existingConv.unread_count || 0) + 1,
              })
              .eq('id', conversationId);
          } else {
            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({
                company_id: companyId,
                contact_id: contact.id,
                status: 'open',
                last_message: content,
                last_message_at: now,
                unread_count: 1,
              })
              .select('id')
              .single();

            if (convError || !newConv) {
              console.error('[Meta Webhook] Erro ao criar conversa:', convError?.message);
              continue;
            }
            conversationId = newConv.id;
          }

          const { error: messageError } = await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_type: 'customer',
            content,
            status: 'delivered',
            whatsapp_message_id: inbound?.id || null,
          });

          if (messageError) {
            console.error('[Meta Webhook] Erro ao salvar mensagem:', messageError.message);
          }
        }

        // Atualizações de entrega/leitura das mensagens enviadas
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const statusUpdate of statuses) {
          const messageId = statusUpdate?.id;
          const newStatus = statusUpdate?.status;
          if (!messageId || !['sent', 'delivered', 'read', 'failed'].includes(newStatus)) continue;

          await supabase
            .from('messages')
            .update({ status: newStatus })
            .eq('whatsapp_message_id', messageId);
        }
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  } catch (e) {
    console.error('[Meta Webhook] Erro ao processar evento:', e);
    return res.status(500).send('Erro interno.');
  }
});

// 2. CRUD: Contatos (Isolamento estrito por Empresa)
app.get('/api/contacts', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  let query = supabase.from('contacts').select('*');

  if (req.authRole !== 'admin') {
    query = query.eq('company_id', req.authCompanyId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Erro ao listar contatos.' });
  }

  res.json(data || []);
});

app.post('/api/contacts', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { name, phone, email, tags, notes } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Nome e telefone são obrigatórios.' });
  }

  const companyId = req.authRole === 'admin' && req.body.companyId ? req.body.companyId : req.authCompanyId;

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      company_id: companyId,
      name: name.trim(),
      phone: phone.trim(),
      email: (email || '').trim(),
      tags: Array.isArray(tags) ? tags : [],
      notes: (notes || '').trim(),
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Erro ao cadastrar contato.' });
  }

  res.status(201).json(data);
});

app.put('/api/contacts/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Contato não encontrado.' });
  }

  if (req.authRole !== 'admin' && existing.company_id !== req.authCompanyId) {
    return res.status(403).json({ error: 'Você não tem permissão para editar este contato.' });
  }

  const { name, phone, email, tags, notes } = req.body;

  const { data, error } = await supabase
    .from('contacts')
    .update({
      name: name ? name.trim() : existing.name,
      phone: phone ? phone.trim() : existing.phone,
      email: email !== undefined ? email.trim() : existing.email,
      tags: Array.isArray(tags) ? tags : existing.tags,
      notes: notes !== undefined ? notes.trim() : existing.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Erro ao atualizar contato.' });
  }

  res.json(data);
});

app.delete('/api/contacts/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Contato não encontrado.' });
  }

  if (req.authRole !== 'admin' && existing.company_id !== req.authCompanyId) {
    return res.status(403).json({ error: 'Você não tem permissão para excluir este contato.' });
  }

  const { error } = await supabase.from('contacts').delete().eq('id', req.params.id);

  if (error) {
    return res.status(500).json({ error: 'Erro ao excluir contato.' });
  }

  res.json({ success: true, message: 'Contato excluído com sucesso.' });
});

// 3. CRUD: Usuários e Atendentes
app.get('/api/users', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  let query = supabase.from('users').select('*');

  if (req.authRole !== 'admin') {
    query = query.eq('company_id', req.authCompanyId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Erro ao listar usuários.' });
  }

  res.json(data || []);
});

app.post('/api/users', authMiddleware, adminOnlyMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { name, email, role, companyId } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
  }

  const targetCompanyIdRaw: string | null =
    typeof companyId === 'string' && companyId.trim() ? companyId.trim() : req.authCompanyId || null;

  // ADM global (sem empresa) usa a primeira unidade existente; sem unidade, pede para criar
  let targetCompanyId = targetCompanyIdRaw;
  if (!targetCompanyId) {
    const { data: firstCompany } = await supabase
      .from('companies')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    targetCompanyId = firstCompany?.id || null;
  }

  // Sem empresa o atendente ficaria órfão e quebraria as consultas
  if (!targetCompanyId) {
    return res.status(400).json({ error: 'Nenhuma empresa cadastrada. Crie uma unidade antes de adicionar usuários.' });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetCompanyId)) {
    return res.status(400).json({ error: 'Empresa inválida.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing, error: fetchError } = await supabase
    .from('users')
    .select('id')
    .ilike('email', normalizedEmail)
    .limit(1);

  if (fetchError) {
    return res.status(500).json({ error: 'Erro ao verificar e-mail.' });
  }

  if (existing && existing.length > 0) {
    return res.status(400).json({ error: 'Este e-mail já está cadastrado no sistema.' });
  }

  // Não permite criar admin via cadastro público; apenas admin pode criar admin
  const userRole = role === 'admin' ? 'admin' : 'user';

  // Cria a conta de login junto com o perfil. Sem isso o atendente
  // ficava apenas na tabela users e não conseguia entrar no sistema.
  const temporaryPassword = `Rb!${crypto.randomBytes(6).toString('hex')}`;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { name: name.trim(), company_id: targetCompanyId },
  });

  if (authError || !authData.user) {
    const alreadyExists = /already|registered|exists/i.test(authError?.message || '');
    return res.status(alreadyExists ? 409 : 500).json({
      error: alreadyExists
        ? 'Este e-mail já possui conta de acesso. Edite o usuário existente ou redefina a senha.'
        : authError?.message || 'Erro ao criar conta de acesso.',
    });
  }

  const { data, error } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      company_id: targetCompanyId,
      name: name.trim(),
      email: normalizedEmail,
      role: userRole,
      status: 'offline',
    })
    .select()
    .single();

  if (error) {
    // Remove a conta de login para não deixar usuário provisório sem perfil
    await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
    return res.status(500).json({ error: 'Erro ao criar usuário.' });
  }

  res.status(201).json({ ...data, temporaryPassword });
});

app.put('/api/users/:id', authMiddleware, adminOnlyMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const { name, email, role, status } = req.body;

  if (name === undefined && email === undefined && role === undefined && status === undefined) {
    return res.status(400).json({ error: 'Informe ao menos um campo para atualizar.' });
  }

  if (role !== undefined && !['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Perfil inválido.' });
  }

  if (status !== undefined && !['online', 'busy', 'offline'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  if (req.params.id === req.authUserId && role !== undefined && role !== 'admin') {
    return res.status(400).json({ error: 'Você não pode remover seu próprio acesso de administrador.' });
  }

  let normalizedEmail = existing.email as string;
  if (email !== undefined) {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    normalizedEmail = email.trim().toLowerCase();
  }

  if (normalizedEmail !== existing.email) {
    const { data: duplicate, error: duplicateError } = await supabase
      .from('users')
      .select('id')
      .ilike('email', normalizedEmail)
      .neq('id', req.params.id)
      .limit(1);

    if (duplicateError) {
      return res.status(500).json({ error: 'Erro ao verificar e-mail.' });
    }

    if (duplicate && duplicate.length > 0) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado no sistema.' });
    }

    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(req.params.id, {
      email: normalizedEmail,
      email_confirm: true,
    });

    if (authUpdateError) {
      const alreadyExists = /already|registered|exists/i.test(authUpdateError.message || '');
      return res.status(alreadyExists ? 409 : 500).json({
        error: alreadyExists
          ? 'Este e-mail já possui conta de acesso.'
          : 'Erro ao atualizar o e-mail de acesso.',
      });
    }
  }

  const { data, error } = await supabase
    .from('users')
    .update({
      name: name !== undefined ? String(name).trim() : existing.name,
      email: normalizedEmail,
      role: role !== undefined ? role : existing.role,
      status: status !== undefined ? status : existing.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    if (normalizedEmail !== existing.email) {
      await supabase.auth.admin.updateUserById(req.params.id, {
        email: existing.email,
        email_confirm: true,
      });
    }
    return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }

  res.json(data);
});

app.delete('/api/users/:id', authMiddleware, adminOnlyMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('users')
    .select('id')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  if (req.params.id === req.authUserId) {
    return res.status(400).json({ error: 'Você não pode remover sua própria conta.' });
  }

  // Remove também a conta de login, evitando "usuário provisório" sem perfil
  await supabase.auth.admin.deleteUser(req.params.id).catch(() => {});

  const { error } = await supabase.from('users').delete().eq('id', req.params.id);

  if (error) {
    return res.status(500).json({ error: 'Erro ao remover usuário.' });
  }

  res.json({ success: true, message: 'Usuário removido da equipe com sucesso.' });
});

// 4. CRUD: Automações
app.get('/api/automations', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  let query = supabase.from('automations').select('*');

  if (req.authRole !== 'admin') {
    query = query.eq('company_id', req.authCompanyId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Erro ao listar automações.' });
  }

  res.json(data || []);
});

app.post('/api/automations', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { name, triggerType, triggerValue, actionType, actionPayload, isActive } = req.body;
  if (!name || !actionPayload) {
    return res.status(400).json({ error: 'Nome e mensagem de ação são obrigatórios.' });
  }

  const { data, error } = await supabase
    .from('automations')
    .insert({
      company_id: req.authCompanyId,
      name: name.trim(),
      trigger_type: triggerType || 'welcome',
      trigger_value: triggerValue || '',
      action_type: actionType || 'send_message',
      action_payload: actionPayload.trim(),
      is_active: isActive !== undefined ? Boolean(isActive) : true,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Erro ao salvar automação.' });
  }

  res.status(201).json(data);
});

app.put('/api/automations/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('automations')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Automação não encontrada.' });
  }

  if (req.authRole !== 'admin' && existing.company_id !== req.authCompanyId) {
    return res.status(403).json({ error: 'Permissão negada para editar esta automação.' });
  }

  const { name, triggerType, triggerValue, actionType, actionPayload, isActive } = req.body;

  const { data, error } = await supabase
    .from('automations')
    .update({
      name: name !== undefined ? name.trim() : existing.name,
      trigger_type: triggerType || existing.trigger_type,
      trigger_value: triggerValue !== undefined ? triggerValue : existing.trigger_value,
      action_type: actionType || existing.action_type,
      action_payload: actionPayload !== undefined ? actionPayload.trim() : existing.action_payload,
      is_active: isActive !== undefined ? Boolean(isActive) : existing.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Erro ao atualizar automação.' });
  }

  res.json(data);
});

app.delete('/api/automations/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('automations')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Automação não encontrada.' });
  }

  if (req.authRole !== 'admin' && existing.company_id !== req.authCompanyId) {
    return res.status(403).json({ error: 'Permissão negada para excluir esta automação.' });
  }

  const { error } = await supabase.from('automations').delete().eq('id', req.params.id);

  if (error) {
    return res.status(500).json({ error: 'Erro ao excluir automação.' });
  }

  res.json({ success: true, message: 'Automação excluída com sucesso.' });
});

// 5. CRUD: Mensagens Prontas (Respostas Rápidas)
app.get('/api/quick-replies', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  let query = supabase.from('quick_replies').select('*');

  if (req.authRole !== 'admin') {
    query = query.eq('company_id', req.authCompanyId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Erro ao listar mensagens prontas.' });
  }

  res.json(data || []);
});

app.post('/api/quick-replies', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { title, shortcut, category, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Título e conteúdo da mensagem são obrigatórios.' });
  }

  const cleanShortcut = (shortcut || `/${title.toLowerCase().replace(/\s+/g, '')}`).startsWith('/')
    ? shortcut
    : `/${shortcut}`;

  const { data, error } = await supabase
    .from('quick_replies')
    .insert({
      company_id: req.authCompanyId,
      title: title.trim(),
      shortcut: cleanShortcut.trim(),
      category: (category || 'Geral').trim(),
      content: content.trim(),
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Erro ao cadastrar resposta rápida.' });
  }

  res.status(201).json(data);
});

app.put('/api/quick-replies/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('quick_replies')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Mensagem pronta não encontrada.' });
  }

  if (req.authRole !== 'admin' && existing.company_id !== req.authCompanyId) {
    return res.status(403).json({ error: 'Permissão negada para alterar esta mensagem pronta.' });
  }

  const { title, shortcut, category, content } = req.body;

  const { data, error } = await supabase
    .from('quick_replies')
    .update({
      title: title !== undefined ? title.trim() : existing.title,
      shortcut: shortcut !== undefined ? (shortcut.startsWith('/') ? shortcut : `/${shortcut}`) : existing.shortcut,
      category: category !== undefined ? category.trim() : existing.category,
      content: content !== undefined ? content.trim() : existing.content,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Erro ao atualizar mensagem pronta.' });
  }

  res.json(data);
});

app.delete('/api/quick-replies/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('quick_replies')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Mensagem pronta não encontrada.' });
  }

  if (req.authRole !== 'admin' && existing.company_id !== req.authCompanyId) {
    return res.status(403).json({ error: 'Permissão negada para excluir esta mensagem.' });
  }

  const { error } = await supabase.from('quick_replies').delete().eq('id', req.params.id);

  if (error) {
    return res.status(500).json({ error: 'Erro ao excluir mensagem pronta.' });
  }

  res.json({ success: true, message: 'Mensagem pronta excluída com sucesso.' });
});

// Calcula o estado visual (não lida / sem resposta / respondida) a partir das
// mensagens persistidas. O unread_count é a fonte de verdade para "não lida".
async function loadConversationVisualStatuses(
  conversations: Array<{ id: string; unread_count?: number | null }>
): Promise<Record<string, ConversationVisualStatus>> {
  if (!supabase || conversations.length === 0) {
    return {};
  }

  const ids = conversations.map((conversation) => conversation.id);
  const unreadCounts = Object.fromEntries(
    conversations.map((conversation) => [conversation.id, conversation.unread_count || 0])
  );

  const messages: Array<{
    conversationId: string;
    senderType: 'customer' | 'agent' | 'system' | 'internal_note';
    createdAt: string;
  }> = [];

  // Consulta em blocos para não estourar o tamanho da URL do PostgREST.
  const CHUNK_SIZE = 200;
  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    const chunk = ids.slice(index, index + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('messages')
      .select('conversation_id, sender_type, created_at')
      .in('conversation_id', chunk);

    if (error) {
      console.error('[Conversas] Erro ao calcular status visual:', error.message);
      return Object.fromEntries(
        conversations.map((conversation) => [
          conversation.id,
          (conversation.unread_count || 0) > 0 ? 'unread' : 'awaiting_reply',
        ])
      );
    }

    for (const message of data || []) {
      messages.push({
        conversationId: message.conversation_id,
        senderType: message.sender_type as 'customer' | 'agent' | 'system' | 'internal_note',
        createdAt: message.created_at,
      });
    }
  }

  return computeConversationVisualStatusMap(ids, messages, unreadCounts);
}

// 6. Conversas e Mensagens (Atendimento WhatsApp)
app.get('/api/conversations', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  let query = supabase
    .from('conversations')
    .select('*, contact:contacts!conversations_contact_id_fkey(name, phone), assignee:users!conversations_assigned_to_fkey(name)');

  if (req.authRole !== 'admin') {
    query = query.eq('company_id', req.authCompanyId);
  }

  const { data, error } = await query.order('last_message_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Erro ao listar conversas.' });
  }

  const conversations = data || [];
  const visualStatuses = await loadConversationVisualStatuses(conversations);

  res.json(conversations.map((conv: any) => ({
    ...conv,
    contact_name: conv.contact?.name || '',
    contact_phone: conv.contact?.phone || '',
    assigned_name: conv.assignee?.name || null,
    visual_status: visualStatuses[conv.id] || 'awaiting_reply',
  })));
});

app.post('/api/conversations', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { contactId, contactName, contactPhone, initialMessage } = req.body;
  if (!contactName || !contactPhone) {
    return res.status(400).json({ error: 'Nome e telefone do contato são obrigatórios.' });
  }

  const companyId = req.authCompanyId;
  if (!companyId) {
    return res.status(400).json({ error: 'Seu usuário não está vinculado a uma empresa.' });
  }

  let contactIdFinal = typeof contactId === 'string' && contactId.trim() ? contactId.trim() : null;
  if (contactIdFinal) {
    const { data: existingContact, error: contactError } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('id', contactIdFinal)
      .single();

    if (contactError || !existingContact) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    if (existingContact.company_id !== companyId) {
      return res.status(403).json({ error: 'O contato não pertence à sua empresa.' });
    }
  } else {
    // Criar contato automaticamente
    const { data: newContact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        company_id: companyId,
        name: contactName.trim(),
        phone: contactPhone.trim(),
      })
      .select('id')
      .single();

    if (contactError || !newContact) {
      return res.status(500).json({ error: 'Erro ao criar contato para a conversa.' });
    }
    contactIdFinal = newContact.id;
  }

  const { data: newConv, error: convError } = await supabase
    .from('conversations')
    .insert({
      company_id: companyId,
      contact_id: contactIdFinal,
      assigned_to: req.authUserId,
      status: 'open',
      last_message: initialMessage ? initialMessage.trim() : 'Atendimento iniciado',
      unread_count: 0,
    })
    .select()
    .single();

  if (convError || !newConv) {
    return res.status(500).json({ error: 'Erro ao criar conversa.' });
  }

  if (initialMessage && initialMessage.trim()) {
    await supabase.from('messages').insert({
      conversation_id: newConv.id,
      sender_type: 'agent',
      sender_id: req.authUserId,
      content: initialMessage.trim(),
      status: 'sent',
    });
  }

  const { data: conversationContact } = await supabase
    .from('contacts')
    .select('name, phone')
    .eq('id', contactIdFinal)
    .single();

  res.status(201).json({
    ...newConv,
    contact_name: conversationContact?.name || contactName.trim(),
    contact_phone: conversationContact?.phone || contactPhone.trim(),
    assigned_name: req.authUserName || null,
  });
});

app.get('/api/conversations/:id/messages', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (convError || !conv) {
    return res.status(404).json({ error: 'Conversa não encontrada.' });
  }

  if (req.authRole !== 'admin' && conv.company_id !== req.authCompanyId) {
    return res.status(403).json({ error: 'Acesso negado a esta conversa.' });
  }

  // Marca como lida
  await supabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', req.params.id);

  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:users!messages_sender_id_fkey(name)')
    .eq('conversation_id', req.params.id)
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: 'Erro ao obter mensagens.' });
  }

  res.json((data || []).map((message: any) => ({
    ...message,
    sender_name: message.sender?.name || (message.sender_type === 'customer' ? 'Cliente' : 'Sistema'),
  })));
});

app.post('/api/conversations/:id/messages', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (convError || !conv) {
    return res.status(404).json({ error: 'Conversa não encontrada.' });
  }

  if (req.authRole !== 'admin' && conv.company_id !== req.authCompanyId) {
    return res.status(403).json({ error: 'Acesso negado a esta conversa.' });
  }

  const { content, senderType } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'O conteúdo da mensagem é obrigatório.' });
  }

  const isInternal = senderType === 'internal_note';

  const { data: newMsg, error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conv.id,
      sender_type: isInternal ? 'internal_note' : 'agent',
      sender_id: req.authUserId,
      content: content.trim(),
      status: 'sent',
    })
    .select()
    .single();

  if (msgError || !newMsg) {
    return res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }

  if (!isInternal) {
    await supabase
      .from('conversations')
      .update({
        last_message: content.trim(),
        last_message_at: newMsg.created_at || new Date().toISOString(),
        // Uma resposta do atendente atende/limpa as mensagens pendentes.
        // O estado visual é recalculado a partir das mensagens persistidas.
        unread_count: 0,
      })
      .eq('id', conv.id);

    // Se houver credencial oficial do WhatsApp conectada, despacha para a Meta Cloud API
    const { data: cfg } = await supabase
      .from('whatsapp_configs')
      .select('*')
      .limit(1)
      .single();

    if (cfg?.is_verified && cfg.access_token && cfg.phone_number_id) {
      try {
        // Precisamos buscar o telefone do contato
        const { data: contact } = await supabase
          .from('contacts')
          .select('phone')
          .eq('id', conv.contact_id)
          .single();

        const cleanTo = contact?.phone?.replace(/\D/g, '') || '';

        if (cleanTo) {
          await fetch(`https://graph.facebook.com/v20.0/${cfg.phone_number_id}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${cfg.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: cleanTo,
              type: 'text',
              text: { preview_url: false, body: content.trim() },
            }),
          });
        }
      } catch (e) {
        console.error('[WhatsApp Dispatch] Erro ao enviar para Meta:', e);
      }
    }
  }

  res.status(201).json({
    ...newMsg,
    sender_name: req.authUserName || 'Atendente',
  });
});

app.patch('/api/conversations/:id/status', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (convError || !conv) {
    return res.status(404).json({ error: 'Conversa não encontrada.' });
  }

  if (req.authRole !== 'admin' && conv.company_id !== req.authCompanyId) {
    return res.status(403).json({ error: 'Acesso negado a esta conversa.' });
  }

  const { status, assignedTo } = req.body;

  if (status !== undefined && !['open', 'in_progress', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  if (assignedTo !== undefined && assignedTo !== null) {
    if (typeof assignedTo !== 'string' || !UUID_REGEX.test(assignedTo)) {
      return res.status(400).json({ error: 'Atendente inválido.' });
    }

    const { data: assignee, error: assigneeError } = await supabase
      .from('users')
      .select('id, company_id')
      .eq('id', assignedTo)
      .single();

    if (assigneeError || !assignee) {
      return res.status(400).json({ error: 'Atendente não encontrado.' });
    }

    if (assignee.company_id !== conv.company_id) {
      return res.status(400).json({ error: 'O atendente pertence a outra empresa.' });
    }
  }

  if (status === undefined && assignedTo === undefined) {
    return res.status(400).json({ error: 'Informe o status ou o atendente responsável.' });
  }

  const updateData: any = {};
  if (status !== undefined) updateData.status = status;
  if (assignedTo !== undefined) updateData.assigned_to = assignedTo;
  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('conversations')
    .update(updateData)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Erro ao atualizar status da conversa.' });
  }

  res.json(data);
});

// 7. Dashboard de Atendente (Métricas e Conversas Reais)
app.get('/api/dashboard/attendant-stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const currentUserId = req.authUserId;
  const currentUserName = req.authUserName || 'Atendente Operacional';
  const companyId = req.authCompanyId;

  // Busca conversas da empresa (ou todas se admin)
  let convQuery = supabase
    .from('conversations')
    .select('*, contact:contacts!conversations_contact_id_fkey(name, phone), assignee:users!conversations_assigned_to_fkey(name)');
  if (req.authRole !== 'admin') {
    convQuery = convQuery.eq('company_id', companyId);
  }
  const { data: allConvs, error: convError } = await convQuery.order('last_message_at', { ascending: false });

  if (convError) {
    return res.status(500).json({ error: 'Erro ao carregar conversas.' });
  }

  const visualStatuses = await loadConversationVisualStatuses(allConvs || []);

  const enrichedConvs = (allConvs || []).map((conv: any) => ({
    ...conv,
    contact_name: conv.contact?.name || '',
    contact_phone: conv.contact?.phone || '',
    assigned_name: conv.assignee?.name || null,
    visual_status: visualStatuses[conv.id] || 'awaiting_reply',
  }));

  // Filtra conversas atribuídas especificamente ao atendente autenticado
  const myConversations = enrichedConvs.filter((c) => {
    if (req.authRole !== 'admin' && c.company_id !== companyId) return false;
    if (!c.assigned_to) return false;
    return c.assigned_to === currentUserId;
  });

  const meusAtivos = myConversations.filter((c) => c.status === 'open' || c.status === 'in_progress').length;
  const finalizadosHoje = myConversations.filter((c) => c.status === 'closed').length;

  // Fila geral da empresa
  const canViewCompanyQueue = req.authRole === 'admin';
  const filaGeralEmpresa = canViewCompanyQueue
    ? (allConvs || []).filter((c) => c.company_id === companyId && c.status === 'open').length
    : null;

  // Cálculo do tempo médio de resposta
  let totalDeltaMinutes = 0;
  let responseCount = 0;

  for (const conv of myConversations) {
    const { data: convMsgs, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    if (msgError || !convMsgs) continue;

    for (let i = 0; i < convMsgs.length - 1; i++) {
      const current = convMsgs[i];
      const next = convMsgs[i + 1];
      if (current.sender_type === 'customer' && next.sender_type === 'agent') {
        const t1 = new Date(current.created_at).getTime();
        const t2 = new Date(next.created_at).getTime();
        if (t2 >= t1) {
          totalDeltaMinutes += (t2 - t1) / 60000;
          responseCount++;
        }
      }
    }
  }

  let tempoMedioResposta: string | null = null;
  if (responseCount > 0) {
    const avgMinutes = totalDeltaMinutes / responseCount;
    if (avgMinutes < 1) {
      tempoMedioResposta = `${Math.max(15, Math.round(avgMinutes * 60))}s`;
    } else {
      const mins = Math.floor(avgMinutes);
      const secs = Math.round((avgMinutes - mins) * 60);
      tempoMedioResposta = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
  }

  const { data: cfg } = await supabase
    .from('whatsapp_configs')
    .select('is_verified, phone_number, last_health_check')
    .limit(1)
    .single();

  res.json({
    attendantName: currentUserName,
    meusAtivos,
    finalizadosHoje,
    tempoMedioResposta,
    filaGeralEmpresa,
    conversas: myConversations,
    whatsappStatus: {
      connected: cfg?.is_verified || false,
      phoneNumber: cfg?.phone_number || null,
      lastChecked: cfg?.last_health_check || null,
    },
  });
});

// ============================================================================
// ROTAS DE AUTENTICAÇÃO (Supabase Auth)
// ============================================================================

app.post('/api/auth/login', async (req, res) => {
  if (!supabase || !supabaseAuth) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.user) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }

  // Busca perfil do usuário na tabela users
  const { data: dbUser, error: userError } = await supabase
    .from('users')
    .select('id, company_id, name, email, role, status')
    .eq('id', data.user.id)
    .single();

  if (userError || !dbUser) {
    return res.status(401).json({ error: 'Usuário não encontrado no sistema.' });
  }

  res.json({
    token: data.session?.access_token,
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      companyId: dbUser.company_id,
      status: dbUser.status,
    },
  });
});

app.post('/api/auth/logout', async (req, res) => {
  if (!supabase || !supabaseAuth) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  await supabaseAuth.auth.signOut();

  res.json({ success: true, message: 'Logout realizado com sucesso.' });
});

app.post('/api/auth/register', async (req, res) => {
  if (!supabase || !supabaseAuth) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { name, email, password, companyId } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
  }

  // Empresa informada precisa ser um UUID válido ('' quebrava a coluna UUID)
  let targetCompanyId: string | null =
    typeof companyId === 'string' && companyId.trim() ? companyId.trim() : null;

  if (targetCompanyId && !UUID_REGEX.test(targetCompanyId)) {
    return res.status(400).json({ error: 'Empresa inválida.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { data: existingProfile, error: existingError } = await supabase
    .from('users')
    .select('id')
    .ilike('email', normalizedEmail)
    .limit(1);

  if (existingError) {
    return res.status(500).json({ error: 'Erro ao verificar e-mail.' });
  }

  if (existingProfile && existingProfile.length > 0) {
    return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login ou recupere a senha.' });
  }

  // Cadastro público cria apenas usuário com role 'user', nunca 'admin'
  const { data, error } = await supabaseAuth.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        name: name.trim(),
        company_id: targetCompanyId || '',
      },
    },
  });

  if (error || !data.user) {
    return res.status(400).json({ error: error?.message || 'Erro ao cadastrar usuário.' });
  }

  // O Supabase pode responder sem erro para e-mail já existente, retornando
  // um usuário "ofuscado" sem identidades. Nunca apagar essa conta.
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return res.status(409).json({ error: 'Este e-mail já possui cadastro. Faça login ou recupere a senha.' });
  }

  let createdCompanyId: string | null = null;

  // Sem empresa informada, cria automaticamente a unidade do usuário.
  // Nunca gravar '' em coluna UUID (era a causa do erro no banco).
  if (!targetCompanyId) {
    const { data: newCompany, error: companyError } = await supabase
      .from('companies')
      .insert({ name: `${name.trim()} — Unidade` })
      .select('id')
      .single();

    if (companyError || !newCompany) {
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
      return res.status(500).json({ error: 'Erro ao criar unidade do usuário.' });
    }

    targetCompanyId = newCompany.id;
    createdCompanyId = newCompany.id;
  }

  // Cria registro na tabela users
  const finalCompanyId = targetCompanyId;
  if (!finalCompanyId) {
    return res.status(500).json({ error: 'Erro ao criar unidade do usuário.' });
  }

  const { error: insertError } = await supabase.from('users').insert({
    id: data.user.id,
    company_id: finalCompanyId,
    name: name.trim(),
    email: normalizedEmail,
    role: 'user',
    status: 'offline',
  });

  if (insertError) {
    // Desfaz auth e empresa criada para não deixar usuário provisório órfão
    if (insertError.code !== '23505') {
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
      if (createdCompanyId) {
        await supabase.from('companies').delete().eq('id', createdCompanyId);
      }
    }
    const duplicate = insertError.code === '23505';
    return res.status(duplicate ? 409 : 500).json({
      error: duplicate
        ? 'Este e-mail já está cadastrado. Faça login ou recupere a senha.'
        : 'Erro ao criar perfil de usuário.',
    });
  }

  res.status(201).json({
    success: true,
    message: 'Usuário cadastrado com sucesso. Faça login para acessar.',
    userId: data.user.id,
  });
});

// Reset de senha por e-mail (Supabase Auth)
app.post('/api/auth/reset-password', async (req, res) => {
  if (!supabase || !supabaseAuth) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'E-mail é obrigatório.' });
  }

  const { error } = await supabaseAuth.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/reset-password`,
  });

  if (error) {
    return res.status(400).json({ error: error.message || 'Erro ao solicitar recuperação de senha.' });
  }

  res.json({
    success: true,
    message: 'Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.',
  });
});

// Confirmar a nova senha após o fluxo de recuperação (token da sessão de recuperação).
// Reutiliza o cliente service_role já existente; não cria tabelas nem variáveis.
app.post('/api/auth/reset-password/confirm', async (req, res) => {
  if (!supabase || !supabaseAuth) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { accessToken, password } = req.body;
  const cleanToken = typeof accessToken === 'string' ? accessToken.trim() : '';
  const cleanPassword = typeof password === 'string' ? password : '';

  if (!cleanToken) {
    return res.status(400).json({ error: 'Link de recuperação inválido ou expirado. Solicite um novo link.' });
  }

  if (!cleanPassword || cleanPassword.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
  }

  // Valida o token de recuperação recebido no link do e-mail.
  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(cleanToken);

  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: 'Link de recuperação inválido ou expirado. Solicite um novo link.' });
  }

  const { error: updateError } = await supabaseAuth.auth.admin.updateUserById(authData.user.id, {
    password: cleanPassword,
  });

  if (updateError) {
    return res.status(400).json({ error: updateError.message || 'Falha ao redefinir a senha.' });
  }

  return res.json({
    success: true,
    message: 'Senha redefinida com sucesso.',
  });
});


// ============================================================================
// DIAGNÓSTICO TEMPORÁRIO (removido após a validação)
// ============================================================================
app.get('/api/diag', async (req, res) => {
  const expected = process.env.DIAG_TOKEN || '';
  const provided = req.header('x-diag-token') || '';
  const ok =
    expected.length > 0 &&
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!ok) {
    return res.status(404).json({ error: 'Rota da API não encontrada.' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado (SUPABASE_URL/SERVICE_ROLE ausentes).' });
  }

  const supaUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const rest = await fetch(`${supaUrl}/rest/v1/`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
  });
  const body: any = await rest.json().catch(() => ({}));
  const schemas = body?.components?.schemas || body?.definitions || {};
  const tables: string[] = Object.keys(schemas).sort();

  const counts: Record<string, number | null> = {};
  for (const t of tables) {
    const cr = await fetch(`${supaUrl}/rest/v1/${t}?select=id`, {
      headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, Prefer: 'count=exact', Range: '0-0' },
    });
    const range = cr.headers.get('content-range') || '';
    const total = range.split('/')[1];
    // '*/*' => contagem desconhecida no PostgREST; reportamos null, não 0.
    counts[t] = /^\d+$/.test(total) ? Number(total) : null;
  }

  return res.json({
    host: supaUrl.replace(/^https?:\/\//, ''),
    restStatus: rest.status,
    restError: rest.ok ? null : body?.message || body?.hint || body?.error || null,
    tables,
    counts,
    hasCompanies: tables.includes('companies'),
  });
});

// Cria o ADM real (temporário, protegido pelo mesmo token)
app.post('/api/diag/create-admin', async (req, res) => {
  const expected = process.env.DIAG_TOKEN || '';
  const provided = req.header('x-diag-token') || '';
  const ok =
    expected.length > 0 &&
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!ok) {
    return res.status(404).json({ error: 'Rota da API não encontrada.' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { email, password, name, companyName } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Informe email, password e name.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'A senha precisa ter no mínimo 8 caracteres.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: String(password),
    email_confirm: true,
    user_metadata: { name: String(name).trim(), role: 'admin' },
  });

  if (authError || !authData.user) {
    return res.status(400).json({ error: authError?.message || 'Erro ao criar login.' });
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({ name: String(companyName || 'Reobote').trim() })
    .select('id, name')
    .single();

  if (companyError || !company) {
    await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
    return res.status(500).json({ error: companyError?.message || 'Erro ao criar empresa.' });
  }

  const { error: profileError } = await supabase.from('users').insert({
    id: authData.user.id,
    company_id: company.id,
    name: String(name).trim(),
    email: normalizedEmail,
    role: 'admin',
    status: 'offline',
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
    await supabase.from('companies').delete().eq('id', company.id);
    return res.status(500).json({ error: profileError.message || 'Erro ao criar perfil ADM.' });
  }

  return res.status(201).json({
    ok: true,
    email: normalizedEmail,
    userId: authData.user.id,
    companyId: company.id,
    companyName: company.name,
    role: 'admin',
  });
});

// Rotas /api não encontradas devem responder JSON (nunca o HTML do SPA)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota da API não encontrada.' });
});

// Handler global de erros: captura exceções rejeitadas em rotas assíncronas
// (ex.: falha de rede no Supabase) e devolve JSON 500 — sem isso a promessa
// fica não tratada e a função serverless da Vercel encerra com
// FUNCTION_INVOCATION_FAILED em vez de responder 500.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] erro não tratado:', err);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// Exportado para uso local (dev-server.ts) e como função serverless na Vercel.
export default app;
