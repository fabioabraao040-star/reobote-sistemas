import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

dotenv.config();

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

if (supabaseUrl && supabaseServiceRoleKey) {
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
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

  if (!supabase) {
    return res.status(500).json({ error: 'Serviço de autenticação não configurado no servidor.' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

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

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  try {
    const { data, error: fetchError } = await supabase
      .from('whatsapp_configs')
      .select('verify_token')
      .limit(1)
      .single();

    if (fetchError) {
      return res.status(500).send('Erro interno.');
    }

    const verifyToken = data?.verify_token || 'reobote_webhook_secret_token';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Meta Webhook] Desafio de verificação aceito com sucesso!');
      return res.status(200).send(req.query['hub.challenge']);
    }

    res.status(403).send('Token de verificação inválido.');
  } catch {
    res.status(500).send('Erro interno.');
  }
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

  // Validar assinatura HMAC-SHA256 da Meta
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(req.body);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  const sig = String(signature);
  if (sig.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))) {
    return res.status(401).send('Assinatura inválida.');
  }

  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    try {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      if (messages && messages[0]) {
        const inbound = messages[0];
        const from = inbound.from;
        const text = inbound.text?.body || '[Mensagem de mídia]';

        console.log(`[Meta Webhook] Mensagem recebida de ${from}: ${text}`);
      }
    } catch (e) {
      console.error('[Meta Webhook] Erro ao interpretar payload da Meta:', e);
    }
    return res.status(200).send('EVENT_RECEIVED');
  }

  res.sendStatus(404);
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

  const { data: existing, error: fetchError } = await supabase
    .from('users')
    .select('id')
    .ilike('email', email.trim())
    .limit(1);

  if (existing && existing.length > 0) {
    return res.status(400).json({ error: 'Este e-mail já está cadastrado no sistema.' });
  }

  // Não permite criar admin via cadastro público; apenas admin pode criar admin
  const userRole = role === 'admin' ? 'admin' : 'user';
  const targetCompanyId = companyId || req.authCompanyId;

  const { data, error } = await supabase
    .from('users')
    .insert({
      company_id: targetCompanyId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: userRole,
      status: 'offline',
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Erro ao criar usuário.' });
  }

  res.status(201).json(data);
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

  const { data, error } = await supabase
    .from('users')
    .update({
      name: name ? name.trim() : existing.name,
      email: email ? email.trim().toLowerCase() : existing.email,
      role: role || existing.role,
      status: status || existing.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
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

// 6. Conversas e Mensagens (Atendimento WhatsApp)
app.get('/api/conversations', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  let query = supabase.from('conversations').select('*');

  if (req.authRole !== 'admin') {
    query = query.eq('company_id', req.authCompanyId);
  }

  const { data, error } = await query.order('last_message_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Erro ao listar conversas.' });
  }

  res.json(data || []);
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

  let contactIdFinal = contactId;
  if (!contactIdFinal) {
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

  res.status(201).json(newConv);
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
    .select('*')
    .eq('conversation_id', req.params.id)
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: 'Erro ao obter mensagens.' });
  }

  res.json(data || []);
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
        last_message_at: new Date().toISOString(),
        unread_count: conv.unread_count ? conv.unread_count + 1 : 1,
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

  res.status(201).json(newMsg);
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

  const { status, assignedTo } = req.body;

  const updateData: any = {};
  if (status) updateData.status = status;
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
  let convQuery = supabase.from('conversations').select('*');
  if (req.authRole !== 'admin') {
    convQuery = convQuery.eq('company_id', companyId);
  }
  const { data: allConvs, error: convError } = await convQuery.order('last_message_at', { ascending: false });

  if (convError) {
    return res.status(500).json({ error: 'Erro ao carregar conversas.' });
  }

  // Filtra conversas atribuídas especificamente ao atendente autenticado
  const myConversations = (allConvs || []).filter((c) => {
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
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
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
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  await supabase.auth.signOut();

  res.json({ success: true, message: 'Logout realizado com sucesso.' });
});

app.post('/api/auth/register', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { name, email, password, companyId } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
  }

  // Cadastro público cria apenas usuário com role 'user', nunca 'admin'
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        name: name.trim(),
        company_id: companyId || '',
      },
    },
  });

  if (error || !data.user) {
    return res.status(400).json({ error: error?.message || 'Erro ao cadastrar usuário.' });
  }

  // Cria registro na tabela users
  const { error: insertError } = await supabase.from('users').insert({
    id: data.user.id,
    company_id: companyId || '',
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: 'user',
    status: 'offline',
  });

  if (insertError) {
    // Tenta limpar o usuário do auth se falhar na tabela users
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
    return res.status(500).json({ error: 'Erro ao criar perfil de usuário.' });
  }

  res.status(201).json({
    success: true,
    message: 'Usuário cadastrado com sucesso. Faça login para acessar.',
    userId: data.user.id,
  });
});

// Reset de senha por e-mail (Supabase Auth)
app.post('/api/auth/reset-password', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'E-mail é obrigatório.' });
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
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

// ============================================================================
// INTEGRAÇÃO COM VITE (DEV) E ARQUIVOS ESTÁTICOS (PRODUÇÃO)
// ============================================================================

// Rotas /api não encontradas devem responder JSON (nunca o HTML do SPA)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota da API não encontrada.' });
});

// Exportado para uso local (dev-server.ts) e como função serverless na Vercel.
export default app;
