import { useState, useEffect } from 'react';
import { api } from '../services/api';

interface Automation {
  id: string;
  name: string;
  triggerType: 'welcome' | 'out_of_hours' | 'keyword' | 'auto_close';
  triggerValue: string;
  actionType: 'send_message' | 'assign_queue' | 'add_tag';
  actionPayload: string;
  isActive: boolean;
  createdAt: string;
}

export default function Automacoes() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);

  // Modais
  const [showModal, setShowModal] = useState(false);
  const [editingAuto, setEditingAuto] = useState<Automation | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Campos
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<'welcome' | 'out_of_hours' | 'keyword' | 'auto_close'>('welcome');
  const [triggerValue, setTriggerValue] = useState('');
  const [actionType, setActionType] = useState<'send_message' | 'assign_queue' | 'add_tag'>('send_message');
  const [actionPayload, setActionPayload] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAutomations();
  }, []);

  const loadAutomations = async () => {
    try {
      setLoading(true);
      const data = await api.getAutomations();
      setAutomations(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingAuto(null);
    setName('');
    setTriggerType('welcome');
    setTriggerValue('');
    setActionType('send_message');
    setActionPayload('');
    setIsActive(true);
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (a: Automation) => {
    setEditingAuto(a);
    setName(a.name);
    setTriggerType(a.triggerType);
    setTriggerValue(a.triggerValue || '');
    setActionType(a.actionType);
    setActionPayload(a.actionPayload);
    setIsActive(a.isActive);
    setFormError(null);
    setShowModal(true);
  };

  const handleToggleActive = async (auto: Automation) => {
    try {
      const updated = await api.updateAutomation(auto.id, { isActive: !auto.isActive });
      setAutomations((prev) => prev.map((a) => (a.id === auto.id ? updated : a)));
    } catch (e: any) {
      alert(e.message || 'Erro ao alterar status da automação.');
    }
  };

  const handleSaveAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Por favor, informe o nome da automação.');
      return;
    }

    if (!actionPayload.trim()) {
      setFormError('Por favor, preencha o conteúdo da ação/mensagem.');
      return;
    }

    try {
      setSubmitting(true);
      if (editingAuto) {
        const updated = await api.updateAutomation(editingAuto.id, {
          name,
          triggerType,
          triggerValue,
          actionType,
          actionPayload,
          isActive,
        });
        setAutomations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setSuccessMessage('Fluxo de automação atualizado com sucesso!');
      } else {
        const created = await api.createAutomation({
          name,
          triggerType,
          triggerValue,
          actionType,
          actionPayload,
          isActive,
        });
        setAutomations((prev) => [created, ...prev]);
        setSuccessMessage('Nova automação criada com sucesso!');
      }

      setShowModal(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar automação.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteAutomation(id);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      setDeletingId(null);
      setSuccessMessage('Automação removida.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir automação.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#34445C] tracking-tight">
            Automações e Fluxos de Atendimento
          </h1>
          <p className="text-sm text-[#5B6E87]">
            Configure respostas automáticas, triagens e mensagens fora do expediente no WhatsApp
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C5A15B] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <span>Criar Nova Automação</span>
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

      {/* Grid de Cards de Automação */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {loading ? (
          <div className="col-span-2 p-8 text-center text-xs text-[#5B6E87] bg-white rounded-xl border border-[#D8E0EA]">
            Carregando fluxos automáticos...
          </div>
        ) : automations.length === 0 ? (
          <div className="col-span-2 p-8 text-center text-xs text-[#5B6E87] bg-white rounded-xl border border-[#D8E0EA]">
            Nenhuma automação cadastrada. Crie seu primeiro fluxo no botão acima.
          </div>
        ) : (
          automations.map((auto) => (
            <div
              key={auto.id}
              className={`p-5 rounded-xl border bg-white shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)] flex flex-col justify-between transition-all ${
                auto.isActive ? 'border-[#D8E0EA]' : 'border-[#D8E0EA]/60 opacity-70'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div 
                      className={`w-9 h-9 rounded-lg flex items-center justify-center text-white ${
                        auto.isActive ? 'bg-[#C5A15B]' : 'bg-[#5B6E87]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {auto.triggerType === 'welcome'
                          ? 'waving_hand'
                          : auto.triggerType === 'out_of_hours'
                          ? 'schedule'
                          : 'smart_toy'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-[#34445C]">{auto.name}</h3>
                      <span className="text-[11px] text-[#5B6E87]">
                        Gatilho: {auto.triggerType === 'welcome' ? 'Primeiro Contato' : auto.triggerType === 'out_of_hours' ? 'Fora de Horário' : 'Palavra-chave'}
                      </span>
                    </div>
                  </div>

                  {/* Toggle Ativo / Inativo */}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(auto)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      auto.isActive ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                    title={auto.isActive ? 'Desativar automação' : 'Ativar automação'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        auto.isActive ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 bg-[#F6FAFF] rounded-lg border border-[#D8E0EA] text-xs text-[#34445C] mb-4">
                  <p className="font-semibold text-[#5B6E87] text-[10px] uppercase mb-1">
                    Mensagem Automática:
                  </p>
                  <p className="line-clamp-3 italic">"{auto.actionPayload}"</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#D8E0EA] text-xs text-[#5B6E87]">
                <span className="text-[11px]">
                  Status: <strong>{auto.isActive ? 'Operacional' : 'Pausada'}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(auto)}
                    className="p-1 hover:text-[#34445C] cursor-pointer"
                    title="Editar"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(auto.id)}
                    className="p-1 hover:text-red-700 cursor-pointer"
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
                {editingAuto ? 'Editar Automação' : 'Criar Nova Automação'}
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

            <form onSubmit={handleSaveAutomation} className="space-y-3.5 text-xs text-left">
              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Nome da Automação *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Boas-vindas Inicial WhatsApp"
                  className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Tipo de Gatilho
                </label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B] bg-white cursor-pointer"
                >
                  <option value="welcome">Primeiro contato do cliente (Boas-vindas)</option>
                  <option value="out_of_hours">Mensagem recebida fora de expediente</option>
                  <option value="keyword">Contém palavra-chave específica</option>
                  <option value="auto_close">Encerramento automático por inatividade</option>
                </select>
              </div>

              {triggerType === 'keyword' && (
                <div>
                  <label className="font-semibold text-[#34445C] block mb-1">
                    Palavra-chave
                  </label>
                  <input
                    type="text"
                    value={triggerValue}
                    onChange={(e) => setTriggerValue(e.target.value)}
                    placeholder="Ex.: suporte, tabela, orcamento"
                    className="w-full px-3 py-2 rounded-lg border border-[#D8E0EA] text-[#34445C] outline-none focus:border-[#C5A15B]"
                  />
                </div>
              )}

              <div>
                <label className="font-semibold text-[#34445C] block mb-1">
                  Texto da Resposta Automática *
                </label>
                <textarea
                  rows={4}
                  required
                  value={actionPayload}
                  onChange={(e) => setActionPayload(e.target.value)}
                  placeholder="Mensagem disparada automaticamente para o cliente no WhatsApp..."
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
                  {submitting ? 'Salvando...' : editingAuto ? 'Atualizar Automação' : 'Salvar Automação'}
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
              Confirmar Exclusão de Automação
            </h3>
            <p className="text-xs text-[#5B6E87] mb-6">
              Tem certeza de que deseja remover este fluxo automático?
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
