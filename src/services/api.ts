// Helper unificado de chamadas para a API backend do Reobote Sistemas

function getAuthHeaders() {
  try {
    const raw = sessionStorage.getItem('reobote_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      const token = parsed.token || parsed.access_token;
      if (token) {
        return {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        } as Record<string, string>;
      }
    }
  } catch {
    // fallback
  }
  return {
    'Content-Type': 'application/json',
  } as Record<string, string>;
}

export const api = {
  // Autenticação
  async login(credentials: { email: string; password: string }) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao fazer login.');
    return data;
  },

  async logout() {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Erro ao fazer logout.');
    return res.json();
  },

  async register(userData: { name: string; email: string; password: string; companyId?: string }) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar usuário.');
    return data;
  },

  // WhatsApp Meta Oficial
  async getWhatsAppConfig() {
    const res = await fetch('/api/whatsapp/config', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Erro ao obter configurações do WhatsApp');
    return res.json();
  },

  async saveWhatsAppConfig(config: {
    phoneNumber: string;
    phoneNumberId: string;
    wabaId: string;
    accessToken?: string;
    verifyToken?: string;
  }) {
    const res = await fetch('/api/whatsapp/config', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar configuração do WhatsApp.');
    return data;
  },

  async verifyWhatsAppConnection() {
    const res = await fetch('/api/whatsapp/verify-connection', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao validar credenciais na Meta.');
    return data;
  },

  async getWhatsAppStatus() {
    const res = await fetch('/api/whatsapp/status', { headers: getAuthHeaders() });
    if (!res.ok) return { connected: false };
    return res.json();
  },

  // Contatos
  async getContacts() {
    const res = await fetch('/api/contacts', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Erro ao listar contatos.');
    return res.json();
  },

  async createContact(contact: { name: string; phone: string; email?: string; tags?: string[]; notes?: string }) {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(contact),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar contato.');
    return data;
  },

  async updateContact(id: string, contact: Partial<{ name: string; phone: string; email?: string; tags?: string[]; notes?: string }>) {
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(contact),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar contato.');
    return data;
  },

  async deleteContact(id: string) {
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir contato.');
    return data;
  },

  // Usuários e Atendentes
  async getUsers() {
    const res = await fetch('/api/users', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Erro ao listar usuários.');
    return res.json();
  },

  async createUser(user: { name: string; email: string; role: 'admin' | 'user'; companyId?: string }) {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(user),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar usuário.');
    return data;
  },

  async updateUser(id: string, user: Partial<{ name: string; email: string; role: 'admin' | 'user'; status: string }>) {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(user),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar usuário.');
    return data;
  },

  async deleteUser(id: string) {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao remover usuário.');
    return data;
  },

  // Automações
  async getAutomations() {
    const res = await fetch('/api/automations', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Erro ao listar automações.');
    return res.json();
  },

  async createAutomation(automation: {
    name: string;
    triggerType: string;
    triggerValue?: string;
    actionType: string;
    actionPayload: string;
    isActive?: boolean;
  }) {
    const res = await fetch('/api/automations', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(automation),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar automação.');
    return data;
  },

  async updateAutomation(id: string, automation: Partial<{
    name: string;
    triggerType: string;
    triggerValue?: string;
    actionType: string;
    actionPayload: string;
    isActive?: boolean;
  }>) {
    const res = await fetch(`/api/automations/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(automation),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar automação.');
    return data;
  },

  async deleteAutomation(id: string) {
    const res = await fetch(`/api/automations/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir automação.');
    return data;
  },

  // Mensagens Prontas
  async getQuickReplies() {
    const res = await fetch('/api/quick-replies', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Erro ao listar mensagens prontas.');
    return res.json();
  },

  async createQuickReply(reply: { title: string; shortcut?: string; category?: string; content: string }) {
    const res = await fetch('/api/quick-replies', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(reply),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar resposta rápida.');
    return data;
  },

  async updateQuickReply(id: string, reply: Partial<{ title: string; shortcut?: string; category?: string; content: string }>) {
    const res = await fetch(`/api/quick-replies/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(reply),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar resposta rápida.');
    return data;
  },

  async deleteQuickReply(id: string) {
    const res = await fetch(`/api/quick-replies/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao remover resposta rápida.');
    return data;
  },

  // Conversas e Mensagens
  async getConversations() {
    const res = await fetch('/api/conversations', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Erro ao listar conversas.');
    return res.json();
  },

  async createConversation(conv: { contactId?: string; contactName: string; contactPhone: string; initialMessage?: string }) {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(conv),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao iniciar conversa.');
    return data;
  },

  async getMessages(conversationId: string) {
    const res = await fetch(`/api/conversations/${conversationId}/messages`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Erro ao obter mensagens.');
    return res.json();
  },

  async sendMessage(conversationId: string, content: string, senderType: 'agent' | 'internal_note' = 'agent') {
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ content, senderType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao enviar mensagem.');
    return data;
  },

  async updateConversationStatus(conversationId: string, status: 'open' | 'in_progress' | 'closed') {
    const res = await fetch(`/api/conversations/${conversationId}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    return res.json();
  },

  // Dashboard de Atendente
  async getAttendantStats() {
    const res = await fetch('/api/dashboard/attendant-stats', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Erro ao carregar indicadores do atendente.');
    return res.json();
  },
};
