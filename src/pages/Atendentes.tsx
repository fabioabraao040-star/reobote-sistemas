import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'online' | 'busy' | 'offline';
  activeTickets: number;
  completedToday: number;
}

export default function Atendentes() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [status, setStatus] = useState<'online' | 'busy' | 'offline'>('online');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await api.getUsers();
      setUsers(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setName('');
    setEmail('');
    setRole('user');
    setStatus('online');
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (u: UserItem) => {
    setEditingUser(u);
    setName(u.name);
    setEmail(u.email);
    setRole(u.role);
    setStatus(u.status);
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !email.trim()) {
      setFormError('Nome e e-mail são obrigatórios.');
      return;
    }

    try {
      setSubmitting(true);
      if (editingUser) {
        const updated = await api.updateUser(editingUser.id, { name, email, role, status });
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        setSuccessMessage('Atendente atualizado com sucesso!');
      } else {
        const created = await api.createUser({ name, email, role });
        setUsers((prev) => [...prev, created]);
        setSuccessMessage('Novo atendente cadastrado na equipe!');
      }
      setShowModal(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar atendente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await api.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setDeletingId(null);
      setSuccessMessage('Atendente removido com sucesso.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir usuário.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${isAdmin ? 'bg-[#EFA339]/10 text-[#EFA339] border border-[#EFA339]/30' : 'bg-[#C9AE69]/10 text-[#C9AE69] border border-[#C9AE69]/30'}`}>
              {isAdmin ? 'Gestão Administrativa' : 'Equipe da Unidade'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#F5F2EA] tracking-tight">{isAdmin ? 'Usuários e Atendentes do Sistema' : 'Colegas de Turno e Operadores'}</h1>
          <p className="text-sm text-[#A0B0BA]">{isAdmin ? 'Cadastre, edite perfis e gerencie as permissões de acesso dos operadores.' : 'Consulte o status em tempo real dos atendentes autorizados da sua unidade.'}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-xs font-semibold text-[#C9AE69] hover:text-[#E0C98F] flex items-center gap-1 transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Voltar ao Dashboard</span>
          </Link>
          {isAdmin && (
            <button type="button" onClick={handleOpenCreateModal} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C9AE69] text-[#F5F2EA] text-xs font-semibold hover:brightness-95 transition-all shadow-xs cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              <span>Cadastrar Atendente</span>
            </button>
          )}
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

      <div className="bg-[#17374A] rounded-xl border border-[#2B3D50] shadow-[0_2px_8px_-2px_rgba(52,68,92,0.05)] overflow-hidden">
        <div className="p-4 border-b border-[#2B3D50] bg-[#101D2D]/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#F5F2EA] text-[20px]">badge</span>
            <span className="font-bold text-xs uppercase tracking-wider text-[#F5F2EA]">{isAdmin ? 'Quadro de Operadores Ativos' : `Atendentes — ${user?.companyName}`}</span>
          </div>
          <span className="text-xs text-[#A0B0BA]">Total: <strong>{users.length}</strong> colaboradores</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#F5F2EA]">
            <thead className="bg-[#101D2D] border-b border-[#2B3D50] text-[#A0B0BA] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Nome / Identificação</th>
                <th className="px-5 py-3.5">Perfil de Acesso</th>
                <th className="px-5 py-3.5">Status de Presença</th>
                <th className="px-5 py-3.5 text-center">Atendimentos Ativos</th>
                <th className="px-5 py-3.5 text-center">Concluídos Hoje</th>
                {isAdmin && <th className="px-5 py-3.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2B3D50]">
              {loading ? (
                <tr><td colSpan={isAdmin ? 6 : 5} className="px-5 py-8 text-center text-[#A0B0BA]">Carregando atendentes...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={isAdmin ? 6 : 5} className="px-5 py-8 text-center text-[#A0B0BA]">Nenhum atendente cadastrado.</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#101D2D]/60 transition-colors">
                    <td className="px-5 py-4 font-semibold">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white ${u.role === 'admin' ? 'bg-[#C9AE69]' : 'bg-[#17374A]'}`}>{u.name.charAt(0)}</div>
                        <div>
                          <p className="text-sm font-bold text-[#F5F2EA]">{u.name}</p>
                          <p className="text-xs text-[#A0B0BA] font-normal">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4"><span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-[#EFA339]/10 text-[#EFA339] border border-[#EFA339]/30' : 'bg-[#C9AE69]/10 text-[#C9AE69] border border-[#C9AE69]/30'}`}>{u.role === 'admin' ? 'Administrador' : 'Atendente'}</span></td>
                    <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${u.status === 'online' ? 'bg-[#39AC6B]/10 text-[#39AC6B]/90 border border-[#39AC6B]/30' : u.status === 'busy' ? 'bg-[#EFA339]/10 text-[#EFA339] border border-[#EFA339]/30' : 'bg-[#A0B0BA]/10 text-[#A0B0BA] border border-[#A0B0BA]/30'}`}><span className={`w-1.5 h-1.5 rounded-full ${u.status === 'online' ? 'bg-[#39AC6B]' : u.status === 'busy' ? 'bg-[#EFA339]' : 'bg-[#A0B0BA]'}`} /></span>{u.status === 'online' ? 'Disponível' : u.status === 'busy' ? 'Em atendimento' : 'Ausente'}</td>
                    <td className="px-5 py-4 text-center font-bold text-[#F5F2EA] tabular-nums">{u.activeTickets || 0}</td>
                    <td className="px-5 py-4 text-center font-bold text-[#F5F2EA] tabular-nums">{u.completedToday || 0}</td>
                    {isAdmin && (
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => handleOpenEditModal(u)} className="p-1.5 rounded hover:bg-[#101D2D] text-[#A0B0BA] hover:text-[#F5F2EA] transition-colors cursor-pointer" title="Editar atendente"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                          <button type="button" onClick={() => setDeletingId(u.id)} className="p-1.5 rounded hover:bg-[#D14747]/10 text-[#A0B0BA] hover:text-[#D14747] transition-colors cursor-pointer" title="Remover atendente"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                        </div>
                      </td>
                    )}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden p-4">
            {loading ? (
              <div className="p-8 text-center text-xs text-[#A0B0BA]">Carregando atendentes...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#A0B0BA]"><p className="text-xs text-[#A0B0BA]">Nenhum atendente cadastrado.</p></div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="p-4 hover:bg-[#101D2D]/60 transition-colors border-b border-[#2B3D50] last:border-0 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white ${u.role === 'admin' ? 'bg-[#C9AE69]' : 'bg-[#17374A]'}`}>{u.name.charAt(0)}</div>
                    <div className="min-w-0"><div className="flex items-center gap-2"><p className="text-sm font-bold text-[#F5F2EA]">{u.name}</p><p className="text-xs text-[#A0B0BA] font-normal">{u.email}</p></div></div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 justify-between sm:justify-end">
                    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-[#EFA339]/10 text-[#EFA339] border border-[#EFA339]/30' : 'bg-[#C9AE69]/10 text-[#C9AE69] border border-[#C9AE69]/30'}`}>{u.role === 'admin' ? 'Administrador' : 'Atendente'}</span>
                    <span className={`text-[10px] font-bold text-[#F5F2EA] tabular-nums`}>{u.activeTickets || 0}</span>
                    <span className={`text-[10px] font-bold text-[#F5F2EA] tabular-nums`}>{u.completedToday || 0}</span>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleOpenEditModal(u)} className="p-1.5 rounded hover:bg-[#101D2D] text-[#A0B0BA] hover:text-[#F5F2EA] transition-colors cursor-pointer" title="Editar atendente"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                        <button type="button" onClick={() => setDeletingId(u.id)} className="p-1.5 rounded hover:bg-[#D14747]/10 text-[#A0B0BA] hover:text-[#D14747] transition-colors cursor-pointer" title="Remover atendente"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                      </div>
                    )}
                  </div>
                </div>
              )))}
          </div>
        </div>

      {showModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-[#17374A]/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#17374A] rounded-xl shadow-2xl border border-[#2B3D50] max-w-md w-full p-6 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#2B3D50] mb-4">
              <h3 className="font-bold text-base text-[#F5F2EA]">{editingUser ? 'Editar Atendente' : 'Cadastrar Novo Atendente'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-[#A0B0BA] hover:text-[#F5F2EA] cursor-pointer"><span className="material-symbols-outlined text-[20px]">close</span></button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-[#D14747]/10 border border-[#D14747]/30 text-[#D14747]/90 text-xs">{formError}</div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs text-left">
              <div>
                <label className="font-semibold text-[#F5F2EA] block mb-1">Nome Completo *</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nome do Atendente" className="w-full px-3 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] outline-none focus:border-[#C9AE69]" />
              </div>
              <div>
                <label className="font-semibold text-[#F5F2EA] block mb-1">E-mail Corporativo *</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="carlos@reobote.com.br" className="w-full px-3 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] outline-none focus:border-[#C9AE69]" />
              </div>
              <div>
                <label className="font-semibold text-[#F5F2EA] block mb-1">Perfil de Acesso</label>
                <select value={role} onChange={(e) => setRole(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] outline-none focus:border-[#C9AE69] bg-[#17374A] cursor-pointer">
                  <option value="user">Atendente / Operador da Unidade</option>
                  <option value="admin">Administrador do Sistema</option>
                </select>
              </div>
              {editingUser && (
                <div>
                  <label className="font-semibold text-[#F5F2EA] block mb-1">Status de Presença</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] outline-none focus:border-[#C9AE69] bg-[#17374A] cursor-pointer">
                    <option value="online">Disponível (Online)</option>
                    <option value="busy">Em Atendimento</option>
                    <option value="offline">Ausente / Offline</option>
                  </select>
                </div>
              )}
              <div className="pt-3 border-t border-[#2B3D50] flex items-center justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] hover:bg-[#101D2D] font-semibold cursor-pointer">Cancelar</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg bg-[#C9AE69] text-[#F5F2EA] font-semibold hover:brightness-95 transition-all cursor-pointer disabled:opacity-50">{submitting ? 'Salvando...' : editingUser ? 'Atualizar Atendente' : 'Salvar Atendente'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingId && isAdmin && (
        <div className="fixed inset-0 z-50 bg-[#17374A]/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#17374A] rounded-xl shadow-2xl border border-[#D14747]/30 max-w-sm w-full p-6 text-center animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-[#D14747]/10 text-[#D14747] flex items-center justify-center mx-auto mb-3"><span className="material-symbols-outlined text-[24px]">delete</span></div>
            <h3 className="font-bold text-base text-[#F5F2EA] mb-2">Confirmar Remoção de Atendente</h3>
            <p className="text-xs text-[#A0B0BA] mb-6">Tem certeza de que deseja remover este operador da equipe? O acesso será revogado imediatamente.</p>
            <div className="flex items-center justify-center gap-3 text-xs">
              <button type="button" onClick={() => setDeletingId(null)} className="px-4 py-2 rounded-lg border border-[#2B3D50] text-[#F5F2EA] font-semibold hover:bg-[#101D2D] cursor-pointer">Cancelar</button>
              <button type="button" onClick={() => handleDeleteUser(deletingId)} className="px-4 py-2 rounded-lg bg-[#D14747] text-[#F5F2EA] font-semibold hover:bg-[#B53A3A] transition-colors cursor-pointer">Sim, Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
