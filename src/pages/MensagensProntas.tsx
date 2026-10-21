import { useState, useEffect } from 'react';
import { api } from '../services/api';

interface QuickReply {
  id: string;
  title: string;
  shortcut: string;
  category: string;
  content: string;
  createdAt: string;
}

export default function MensagensProntas() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');

  // Modais
  const [showModal, setShowModal] = useState(false);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Campos
  const [title, setTitle] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [category, setCategory] = useState('Atendimento');
  const [content, setContent] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadReplies();
  }, []);

  const loadReplies = async () => {
    try {
      setLoading(true);
      const data = await api.getQuickReplies();
      setReplies(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingReply(null);
    setTitle('');
    setShortcut('');
    setCategory('Atendimento');
    setContent('');
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (qr: QuickReply) => {
    setEditingReply(qr);
    setTitle(qr.title);
    setShortcut(qr.shortcut);
    setCategory(qr.category || 'Atendimento');
    setContent(qr.content);
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveReply = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || !content.trim()) {
      setFormError('Título e conteúdo são obrigatórios.');
      return;
    }

    try {
      setSubmitting(true);
      if (editingReply) {
        const updated = await api.updateQuickReply(editingReply.id, {
          title,
          shortcut,
          category,
          content,
        });
        setReplies((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
        setSuccessMessage('Mensagem pronta atualizada com sucesso!');
      } else {
        const created = await api.createQuickReply({
          title,
          shortcut,
          category,
          content,
        });
        setReplies((prev) => [created, ...prev]);
        setSuccessMessage('Nova resposta rápida criada com sucesso!');
      }

      setShowModal(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar resposta rápida.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteQuickReply(id);
      setReplies((prev) => prev.filter((q) => q.id !== id));
      setDeletingId(null);
      setSuccessMessage('Mensagem rápida removida.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir mensagem.');
    }
  };

  const handleCopy = (qr: QuickReply) => {
    navigator.clipboard.writeText(qr.content);
    setCopiedId(qr.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const categories = ['Todas', ...Array.from(new Set(replies.map((r) => r.category || 'Geral')))];

  const filteredReplies = replies.filter((r) => {
    if (selectedCategory === 'Todas') return true;
    return r.category === selectedCategory;
  });

  return (
    <div className="space-y-6">
      {/* Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#34445C] tracking-tight">
            Mensagens Prontas e Respostas Rápidas
          </h1>
          <p className="text-sm text-[#5B6E87]">
            Modelos de mensagens com atalhos (ex.: <code className="text-[#C5A15B] font-mono font-bold">/ola</code>) para agilizar os atendimentos no WhatsApp
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C5A15B] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">add_comment</span>
          <span>Nova Mensagem Pronta</span>
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

      {/* Abas de Categorias */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === cat
                ? 'bg-[#34445C] text-white shadow-xs'
                : 'bg-white border border-[#D8E0EA] text-[#5B6E87] hover:bg-[#F6FAFF]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Lista de Mensagens Prontas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 p-8 text-center text-xs text-[#5B6E87] bg-white rounded-xl border border-[#D8E0EA]">
            Carregando respostas rápidas...
          </div>
        ) : filteredReplies.length === 0 ? (
          <div className="col-span-3 p-8 text-center text-xs text-[#5B6E87] bg-white rounded-xl border border-[#D8E0EA]">
            Nenhuma mensagem pronta encontrada nesta categoria.
          </div>
        ) : (
          filteredReplies.map((qr) => (
            <div
              key={qr.id}
              className="p-5 rounded-xl border border-[#D8E0EA] bg-white shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)] flex flex-col justify-between transition-all hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-[#C5A15B]/15 text-[#775a1b]">
                    {qr.shortcut}
                  </span>
                  <span className="text-[10px] font-semibold text-[#5B6E87] uppercase">
                    {qr.category}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-[#34445C] mb-2">{qr.title}</h3>

                <p className="text-xs text-[#5B6E87] leading-relaxed line-clamp-4 bg-[#F6FAFF] p-3 rounded-lg border border-[#D8E0EA] font-sans">
                  {qr.content}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-[#D8E0EA] text-xs">
                <button
                  type="button"
                  onClick={() => handleCopy(qr)}
                  className={`inline-flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                    copiedId === qr.id ? 'text-emerald-700' : 'text-[#C5A15B] hover:underline'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {copiedId === qr.id ? 'check' : 'content_copy'}
                  </span>
                  <span>{copiedId === qr.id ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>

                <div className="flex items-center gap-1 text-[#5B6E87]">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(qr)}
                    className="p-1.5 hover:text-[#34445C] cursor-pointer rounded hover:bg-[#F6FAFF]"
                    title="Editar"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(qr.id)}
                    className="p-1.5 hover:text-red-700 cursor-pointer rounded hover:bg-red-50"
                    title="Excluir"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Criação / Edição */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-[#34445C]/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D8E0EA] max-w-md w-full p-6 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E0EA] mb-4">
              <h3 className="font-bold text-base text-[#34445C]">
                {editingReply ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}
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

            <form onSubmit={handleSaveReply} className="space-y-3.5 text-xs text-left">
              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Título da Mensagem *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Chave Pix para Pagamento"
                  className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#34445C] block mb-1">
                    Atalho de Teclado
                  </label>
                  <input
                    type="text"
                    value={shortcut}
                    onChange={(e) => setShortcut(e.target.value)}
                    placeholder="Ex.: /pix"
                    className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] font-mono outline-none focus:border-[#C5A15B]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#34445C] block mb-1">
                    Categoria
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Ex.: Financeiro"
                    className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B]"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Conteúdo da Mensagem *
                </label>
                <textarea
                  rows={5}
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Digite o texto que será enviado automaticamente ao cliente..."
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
                  {submitting ? 'Salvando...' : editingReply ? 'Atualizar Mensagem' : 'Salvar Mensagem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-[#34445C]/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-red-200 max-w-sm w-full p-6 text-center animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[24px]">delete</span>
            </div>
            <h3 className="font-bold text-base text-[#34445C] mb-2">
              Confirmar Exclusão
            </h3>
            <p className="text-xs text-[#5B6E87] mb-6">
              Tem certeza de que deseja excluir esta resposta rápida?
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
                onClick={() => handleDelete(deletingId)}
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
