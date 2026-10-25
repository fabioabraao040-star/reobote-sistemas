import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  notes: string;
  createdAt: string;
}

export default function Contatos() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const data = await api.getContacts();
      setContacts(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingContact(null);
    setName('');
    setPhone('');
    setEmail('');
    setTagsInput('');
    setNotes('');
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setName(contact.name);
    setPhone(contact.phone);
    setEmail(contact.email || '');
    setTagsInput((contact.tags || []).join(', '));
    setNotes(contact.notes || '');
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Por favor, informe seu nome completo.');
      return;
    }

    if (!phone.trim()) {
      setFormError('Por favor, informe o telefone WhatsApp do contato.');
      return;
    }

    try {
      setSubmitting(true);
      const parsedTags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);

      if (editingContact) {
        const updated = await api.updateContact(editingContact.id, { name, phone, email, tags: parsedTags, notes });
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSuccessMessage('Contato atualizado com sucesso!');
      } else {
        const created = await api.createContact({ name, phone, email, tags: parsedTags, notes });
        setContacts((prev) => [created, ...prev]);
        setSuccessMessage('Novo contato cadastrado com sucesso!');
      }

      setShowModal(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar contato.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await api.deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setDeletingId(null);
      setSuccessMessage('Contato excluído com sucesso.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir contato.');
    }
  };

  const handleStartChat = async (c: Contact) => {
    try {
      const conv = await api.createConversation({
        contactId: c.id,
        contactName: c.name,
        contactPhone: c.phone,
        initialMessage: `Atendimento iniciado com ${c.name}`,
      });
      navigate(`/atendimento?id=${conv.id}`);
    } catch (err: any) {
      alert(err.message || 'Erro ao iniciar atendimento.');
    }
  };

  const filteredContacts = contacts.filter((c) => {
    const q = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#E1E8EC] tracking-tight">Gestão de Contatos</h1>
          <p className="text-sm text-[#B4C5CE]">Base de clientes e leads cadastrados para atendimento no WhatsApp</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-xs font-semibold text-[#D0B783] hover:text-[#E1E8EC] flex items-center gap-1 transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Voltar ao Dashboard</span>
          </Link>
          <button type="button" onClick={handleOpenCreateModal} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#527D91] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Cadastrar Novo Contato</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-3.5 rounded-lg bg-[#39AC6B]/10 border border-[#39AC6B]/30 text-[#8FE3AC] text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#8FE3AC]">check_circle</span>
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage(null)} className="text-[#8FE3AC] hover:text-[#8FE3AC] font-bold">✕</button>
        </div>
      )}

      <div className="bg-[#344956] rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden">
        <div className="p-4 border-b border-[#526673] bg-[#263744]/50 flex items-center justify-between">
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#B4C5CE]">search</span>
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail..." className="w-full pl-9 pr-4 py-2 rounded-lg border border-[#526673] bg-[#2D404D] text-xs text-[#E1E8EC] outline-none focus:border-[#527D91]" />
          </div>
          <span className="text-xs text-[#B4C5CE] mt-2 text-center">Exibindo <strong>{filteredContacts.length}</strong> contatos</span>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="p-8 text-center text-xs text-[#B4C5CE]">Carregando contatos cadastrados...</div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#B4C5CE]">
              <div className="w-10 h-10 rounded-full bg-[#263744] flex items-center justify-center text-[#B4C5CE] mx-auto mb-2"><span className="material-symbols-outlined text-[20px]">chat_bubble_outline</span></div>
              <p className="font-semibold text-[#E1E8EC] mb-1">Nenhum contato encontrado</p>
              <p className="text-xs text-[#B4C5CE]">Cadastre um novo cliente no botão acima.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#526673]">
              {filteredContacts.map((c) => (
                <div key={c.id} className="p-4 hover:bg-[#263744]/60 transition-colors border-b border-[#526673] last:border-0 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#263744] text-[#E1E8EC] font-bold text-xs flex items-center justify-center flex-shrink-0">{c.name.charAt(0)}</div>
                    <div className="min-w-0"><div className="flex items-center gap-2"><p className="text-sm font-bold text-[#E1E8EC]">{c.name}</p><p className="text-xs text-[#B4C5CE] font-mono font-normal">{c.phone}</p></div></div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 justify-between sm:justify-end">
                    <div className="flex items-center gap-2">
                      {c.tags && c.tags.length > 0 ? (
                        c.tags.map((tag, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#263744] text-[#E1E8EC]">{tag}</span>
                        ))
                      ) : (
                        <span className="text-xs text-[#B4C5CE]">—</span>
                      )}
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleStartChat(c)} className="p-1.5 rounded hover:bg-[#39AC6B]/10 text-[#B4C5CE] hover:text-[#8FE3AC] transition-colors cursor-pointer" title="Iniciar conversa no WhatsApp"><span className="material-symbols-outlined text-[18px]">chat</span></button>
                        <button type="button" onClick={() => handleOpenEditModal(c)} className="p-1.5 rounded hover:bg-[#263744] text-[#B4C5CE] hover:text-[#E1E8EC] transition-colors cursor-pointer" title="Editar contato"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                        <button type="button" onClick={() => setDeletingId(c.id)} className="p-1.5 rounded hover:bg-[#D14747]/10 text-[#B4C5CE] hover:text-[#FFA8A8] transition-colors cursor-pointer" title="Excluir contato"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-[#263744]/75 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#344956] rounded-xl shadow-2xl border border-[#526673] max-w-md w-full p-6 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#526673] mb-4">
              <h3 className="font-bold text-base text-[#E1E8EC]">{editingContact ? 'Editar Contato' : 'Cadastrar Novo Contato'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-[#B4C5CE] hover:text-[#E1E8EC] cursor-pointer"><span className="material-symbols-outlined text-[20px]">close</span></button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-[#D14747]/10 border border-[#D14747]/30 text-[#FFA8A8] text-xs">{formError}</div>
            )}

            <form onSubmit={handleSaveContact} className="space-y-3.5 text-xs text-left">
              <div>
                <label className="font-semibold text-[#E1E8EC] block mb-1">Nome Completo *</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nome do Cliente ou Empresa" className="w-full px-3 py-2 rounded-lg border border-[#526673] text-[#E1E8EC] outline-none focus:border-[#527D91]" />
              </div>
              <div>
                <label className="font-semibold text-[#E1E8EC] block mb-1">Telefone WhatsApp *</label>
                <input type="text" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ex.: +55 (11) 99999-0000" className="w-full px-3 py-2 rounded-lg border border-[#526673] text-[#E1E8EC] outline-none focus:border-[#527D91]" />
              </div>
              <div>
                <label className="font-semibold text-[#E1E8EC] block mb-1">E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@empresa.com" className="w-full px-3 py-2 rounded-lg border border-[#526673] text-[#E1E8EC] outline-none focus:border-[#527D91]" />
              </div>
              <div>
                <label className="font-semibold text-[#E1E8EC] block mb-1">Etiquetas / Tags (separadas por vírgula)</label>
                <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="Ex.: Cliente VIP, Financeiro, Proposta" className="w-full px-3 py-2 rounded-lg border border-[#526673] text-[#E1E8EC] outline-none focus:border-[#527D91]" />
              </div>
              <div>
                <label className="font-semibold text-[#E1E8EC] block mb-1">Observações de Atendimento</label>
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Histórico ou detalhes importantes deste cliente..." className="w-full px-3 py-2 rounded-lg border border-[#526673] text-[#E1E8EC] outline-none focus:border-[#527D91]" />
              </div>
              <div className="pt-3 border-t border-[#526673] flex items-center justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-[#526673] text-[#E1E8EC] hover:bg-[#263744] font-semibold cursor-pointer">Cancelar</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg bg-[#527D91] text-white font-semibold hover:brightness-95 transition-all cursor-pointer disabled:opacity-50">{submitting ? 'Salvando...' : editingContact ? 'Atualizar Contato' : 'Salvar Contato'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 z-50 bg-[#263744]/75 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#344956] rounded-xl shadow-2xl border border-[#D14747]/30 max-w-sm w-full p-6 text-center animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-[#D14747]/10 text-[#FFA8A8] flex items-center justify-center mx-auto mb-3"><span className="material-symbols-outlined text-[24px]">delete</span></div>
            <h3 className="font-bold text-base text-[#E1E8EC] mb-2">Confirmar Exclusão de Contato</h3>
            <p className="text-xs text-[#B4C5CE] mb-6">Tem certeza de que deseja remover este contato? Esta ação não poderá ser desfeita.</p>
            <div className="flex items-center justify-center gap-3 text-xs">
              <button type="button" onClick={() => setDeletingId(null)} className="px-4 py-2 rounded-lg border border-[#526673] text-[#E1E8EC] font-semibold hover:bg-[#263744] cursor-pointer">Cancelar</button>
              <button type="button" onClick={() => handleDeleteContact(deletingId)} className="px-4 py-2 rounded-lg bg-[#B53A3A] text-white font-semibold hover:bg-[#9E3030] transition-colors cursor-pointer">Sim, Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
