import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

  const [showModal, setShowModal] = useState(false);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
        const updated = await api.updateQuickReply(editingReply.id, { title, shortcut, category, content });
        setReplies((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
        setSuccessMessage('Mensagem pronta atualizada com sucesso!');
      } else {
        const created = await api.createQuickReply({ title, shortcut, category, content });
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#F5F2EA] tracking-tight">Mensagens Prontas e Respostas Rápidas</h1>
          <p className="text-sm text-[#A0B0BA]">Modelos de mensagens com atalhos (ex.: <code className="text-[#C9AE69] font-mono font-bold">/ola</code>) para agilizar os atendimentos no WhatsApp</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-xs font-semibold text-[#C9AE69] hover:text-[#E0C98F] flex items-center gap-1 transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Voltar ao Dashboard</span>
          </Link>
          <button type="button" onClick={handleOpenCreateModal} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C9AE69] text-[#F5F2EA] text-xs font-semibold hover:brightness-95 transition-all shadow-xs cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">add_comment</span>
            <span>Nova Mensagem Pronta</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-3.5 rounded-lg bg-[#39AC6B]/10 border border-[#39AC6B]/30 text-[#39AC6B]/90 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#39AC6B]">check_circle</span>
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage(null)} className="text-[#39AC6B] hover:text-[#39AC6B] font-bold">✕</button>
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {categories.map((cat) => (
          <button key={cat} type="button" onClick={() => setSelectedCategory(cat)} className={`px-3.5 py-1.5 rounded-full font-semibold transition-all cursor-pointer whitespace-nowrap ${selectedCategory === cat ? 'bg-[#17374A] text-[#F5F2EA] shadow-xs' : 'bg-[#17374A] border border-[#2B3D50] text-[#A0B0BA] hover:bg-[#101D2D]'}`}>
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 p-8 text-center text-xs text-[#A0B0BA] bg-[#17374A] rounded-xl border border-[#2B3D50]">Carregando respostas rápidas...</div>
        ) : filteredReplies.length === 0 ? (
          <div className="col-span-3 p-8 text-center text-xs text-[#A0B0BA] bg-[#17374A] rounded-xl border border-[#2B3D50]">Nenhuma mensagem pronta encontrada nesta categoria.</div>
        ) : (
          filteredReplies.map((qr) => (
            <div key={qr.id} className="p-5 rounded-xl border border-[#2B3D50] bg-[#17374A] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)] flex flex-col justify-between transition-all hover:shadow-md">
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-[#C9AE69]/15 text-[#C9AE69]">{qr.shortcut}</span>
                  <span className="text-[10px] font-semibold text-[#A0B0BA] uppercase">{qr.category}</span>
                </div>
                <h3 className="font-bold text-sm text-[#F5F2EA] mb-2">{qr.title}</h3>
                <p className="text-xs text-[#A0B0BA] leading-relaxed line-clamp-4 bg-[#101D2D] p-3 rounded-lg border border-[#2B3D50] font-sans">{qr.content}</p>
              </div>
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-[#2B3D50] text-xs">
                <button type="button" onClick={() => handleCopy(qr)} className={`inline-flex items-center gap-1 font-semibold transition-colors cursor-pointer ${copiedId === qr.id ? 'text-[#39AC6B]' : 'text-[#C9AE69] hover:underline'}`}>
                  <span className="material-symbols-outlined text-[16px]">{copiedId === qr.id ? 'check' : 'content_copy'}</span>
                  <span>{copiedId === qr.id ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>
                <div className="flex items-center gap-1 text-[#A0B0BA]">
                  <button type="button" onClick={() => handleOpenEditModal(qr)} className="p-1.5 hover:text-[#F5F2EA] cursor-pointer rounded hover:bg-[#101D2D]" title="Editar"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                  <button type="button" onClick={() => setDeletingId(qr.id)} className="p-1.5 hover:text-[#D14747] cursor-pointer rounded hover:bg-[#D14747]/10" title="Excluir"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                </div>
              </div>
            </div>
          )))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-[#17374A]/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#17374A] rounded-xl shadow-2xl border border-[#2B3D50] max-w-md w-full p-6 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#2B3D50] mb-4">
              <h3 className="font-bold text-base text-[#F5F2EA]">{editingReply ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-[#A0B0BA] hover:text-[#F5F2EA] cursor-pointer"><span className="material-symbols-outlined text-[20px]">close</span></button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-[#D14747]/10 border border-[#D14747]/30 text-[#D14747]/90 text-xs">{formError}</div>
            )}

            <form onSubmit={handleSaveReply} className="space-y-3.5 text-xs text-left">
              <div>
                <label className="font-semibold text-[#F5F2EA] block mb-1">Título da Mensagem *</label>
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Chave Pix para Pagamento" className="w-full px-3 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] outline-none focus:border-[#C9AE69]" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#F5F2EA] block mb-1">Atalho de Teclado</label>
                  <input type="text" value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="Ex.: /pix" className="w-full px-3 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] font-mono outline-none focus:border-[#C9AE69]" />
                </div>
                <div>
                  <label className="font-semibold text-[#F5F2EA] block mb-1">Categoria</label>
                  <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: Financeiro" className="w-full px-3 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] outline-none focus:border-[#C9AE69]" />
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#F5F2EA] block mb-1">Conteúdo da Mensagem *</label>
                <textarea rows={5} required value={content} onChange={(e) => setContent(e.target.value)} placeholder="Digite o texto que será enviado automaticamente ao cliente..." className="w-full px-3 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] outline-none focus:border-[#C9AE69]" />
              </div>

              <div className="pt-3 border-t border-[#2B3D50] flex items-center justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] hover:bg-[#101D2D] font-semibold cursor-pointer">Cancelar</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg bg-[#C9AE69] text-[#F5F2EA] font-semibold hover:brightness-95 transition-all cursor-pointer disabled:opacity-50">{submitting ? 'Salvando...' : editingReply ? 'Atualizar Mensagem' : 'Salvar Mensagem'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 z-50 bg-[#17374A]/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#17374A] rounded-xl shadow-2xl border border-[#D14747]/30 max-w-sm w-full p-6 text-center animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-[#D14747]/10 text-[#D14747] flex items-center justify-center mx-auto mb-3"><span className="material-symbols-outlined text-[24px]">delete</span></div>
            <h3 className="font-bold text-base text-[#F5F2EA] mb-2">Confirmar Exclusão</h3>
            <p className="text-xs text-[#A0B0BA] mb-6">Tem certeza de que deseja excluir esta resposta rápida?</p>
            <div className="flex items-center justify-center gap-3 text-xs">
              <button type="button" onClick={() => setDeletingId(null)} className="px-4 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] font-semibold hover:bg-[#101D2D] cursor-pointer">Cancelar</button>
              <button type="button" onClick={() => handleDelete(deletingId)} className="px-4 py-2 rounded-lg bg-[#D14747] text-[#F5F2EA] font-semibold hover:bg-[#B53A3A] transition-colors cursor-pointer">Sim, Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
