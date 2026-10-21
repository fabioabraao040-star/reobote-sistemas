import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

  // Estados de Modais
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Estados do Formulário
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
      setFormError('Por favor, informe o nome completo do contato.');
      return;
    }

    if (!phone.trim()) {
      setFormError('Por favor, informe o telefone WhatsApp do contato.');
      return;
    }

    try {
      setSubmitting(true);
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (editingContact) {
        const updated = await api.updateContact(editingContact.id, {
          name,
          phone,
          email,
          tags: parsedTags,
          notes,
        });
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSuccessMessage('Contato atualizado com sucesso!');
      } else {
        const created = await api.createContact({
          name,
          phone,
          email,
          tags: parsedTags,
          notes,
        });
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
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#34445C] tracking-tight">
            Gestão de Contatos
          </h1>
          <p className="text-sm text-[#5B6E87]">
            Base de clientes e leads cadastrados para atendimento no WhatsApp
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C5A15B] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>Cadastrar Novo Contato</span>
        </button>
      </div>

      {/* Alerta de Sucesso */}
      {successMessage && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-700">check_circle</span>
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-950 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Tabela de Contatos e Barra de Busca */}
      <div className="bg-white rounded-xl border border-[#D8E0EA] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)] overflow-hidden">
        
        {/* Barra de Busca e Filtro */}
        <div className="p-4 border-b border-[#D8E0EA] bg-[#F6FAFF]/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#5B6E87]">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, telefone ou e-mail..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-[#D8E0EA] bg-white text-xs text-[#34445C] outline-none focus:border-[#C5A15B]"
            />
          </div>

          <span className="text-xs text-[#5B6E87]">
            Exibindo <strong>{filteredContacts.length}</strong> contatos
          </span>
        </div>

        {/* Tabela de Dados */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#34445C]">
            <thead className="bg-[#F6FAFF] border-b border-[#D8E0EA] text-[#5B6E87] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Nome / Telefone</th>
                <th className="px-5 py-3.5">E-mail</th>
                <th className="px-5 py-3.5">Etiquetas / Tags</th>
                <th className="px-5 py-3.5">Observações</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8E0EA]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[#5B6E87]">
                    Carregando contatos cadastrados...
                  </td>
                </tr>
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[#5B6E87]">
                    Nenhum contato encontrado. Cadastre um novo cliente no botão acima.
                  </td>
                </tr>
              ) : (
                filteredContacts.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F6FAFF]/60 transition-colors">
                    <td className="px-5 py-4 font-semibold">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#E8EDF3] text-[#34445C] font-bold text-xs flex items-center justify-center flex-shrink-0">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#34445C]">{c.name}</p>
                          <p className="text-xs text-[#5B6E87] font-mono font-normal">{c.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#5B6E87]">
                      {c.email || '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {c.tags && c.tags.length > 0 ? (
                          c.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E8EDF3] text-[#34445C]"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-[#5B6E87] text-[11px]">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#5B6E87] max-w-xs truncate">
                      {c.notes || '—'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartChat(c)}
                          className="p-1.5 rounded hover:bg-emerald-50 text-[#5B6E87] hover:text-[#25D366] transition-colors cursor-pointer"
                          title="Iniciar conversa no WhatsApp"
                        >
                          <span className="material-symbols-outlined text-[18px]">chat</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(c)}
                          className="p-1.5 rounded hover:bg-[#F6FAFF] text-[#5B6E87] hover:text-[#34445C] transition-colors cursor-pointer"
                          title="Editar contato"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(c.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-[#5B6E87] hover:text-red-700 transition-colors cursor-pointer"
                          title="Excluir contato"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Cadastro / Edição de Contato */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-[#34445C]/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D8E0EA] max-w-md w-full p-6 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E0EA] mb-4">
              <h3 className="font-bold text-base text-[#34445C]">
                {editingContact ? 'Editar Contato' : 'Cadastrar Novo Contato'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-[#5B6E87] hover:text-[#34445C] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveContact} className="space-y-3.5 text-xs text-left">
              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Nome do Cliente ou Empresa"
                  className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Telefone WhatsApp *
                </label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex.: +55 (11) 99999-0000"
                  className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@empresa.com"
                  className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Etiquetas / Tags (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Ex.: Cliente VIP, Financeiro, Proposta"
                  className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Observações de Atendimento
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Histórico ou detalhes importantes deste cliente..."
                  className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B]"
                />
              </div>

              <div className="pt-3 border-t border-[#D8E0EA] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] hover:bg-[#F6FAFF] font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[#C5A15B] text-white font-semibold hover:brightness-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : editingContact ? 'Atualizar Contato' : 'Salvar Contato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-[#34445C]/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-red-200 max-w-sm w-full p-6 text-center animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[24px]">delete</span>
            </div>
            <h3 className="font-bold text-base text-[#34445C] mb-2">
              Confirmar Exclusão de Contato
            </h3>
            <p className="text-xs text-[#5B6E87] mb-6">
              Tem certeza de que deseja remover este contato? Esta ação não poderá ser desfeita.
            </p>
            <div className="flex items-center justify-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] font-semibold hover:bg-[#F6FAFF] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteContact(deletingId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
