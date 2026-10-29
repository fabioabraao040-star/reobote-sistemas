import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import {
  ConversationStatusIndicator,
  ConversationStatusLegend,
} from '../components/ConversationStatusIndicator';
import { ConversationEventTimes } from '../components/ConversationEventTimes';
import {
  normalizeConversationVisualStatus,
  resolveConversationVisualStatus,
  type ConversationVisualStatus,
} from '../utils/conversationStatus';

interface Conversation {
  id: string;
  contactName: string;
  contactPhone: string;
  assignedName?: string | null;
  status: 'open' | 'in_progress' | 'closed';
  lastMessage: string;
  lastMessageAt: string;
  lastCustomerAt?: string | null;
  openedAt?: string | null;
  lastAgentAt?: string | null;
  unreadCount: number;
  visualStatus: ConversationVisualStatus;
}

interface Message {
  id: string;
  conversationId: string;
  senderType: 'customer' | 'agent' | 'internal_note' | 'system';
  senderName: string;
  content: string;
  createdAt: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

interface QuickReply {
  id: string;
  title: string;
  shortcut: string;
  content: string;
}

function formatDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AtendimentoWhatsApp() {
  const [searchParams] = useSearchParams();
  const urlConvId = searchParams.get('id');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'in_progress' | 'closed'>('all');
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth < 1024);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
    loadQuickReplies();
  }, []);

  // Ao abrir uma conversa: marca como lida otimisticamente (visual amarelo) e
  // sincroniza com o servidor, que registra unread_count = 0 no banco.
  useEffect(() => {
    if (!selectedConvId) return;

    setConversations((prev) =>
      prev.map((c: Conversation) =>
        c.id === selectedConvId && c.unreadCount > 0
          ? {
              ...c,
              unreadCount: 0,
              openedAt: new Date().toISOString(),
              // A resposta anterior não responde à mensagem que acabou de chegar.
              lastAgentAt: null,
              visualStatus: 'awaiting_reply' as ConversationVisualStatus,
            }
          : c
      )
    );

    void (async () => {
      await loadMessages(selectedConvId);
      await loadConversations(true);
    })();
  }, [selectedConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mantém os estados sincronizados com o banco: novas mensagens do cliente
  // voltam a fila para vermelho; se a conversa estiver aberta, o GET de
  // mensagens registra a leitura e a lista volta a ficar amarela/verde.
  const pollingRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (pollingRef.current || document.visibilityState !== 'visible') return;
      pollingRef.current = true;
      try {
        if (selectedConvId) {
          await loadMessages(selectedConvId, true);
        }
        await loadConversations(true);
      } catch (e) {
        console.error(e);
      } finally {
        pollingRef.current = false;
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [selectedConvId]);

  useEffect(() => {
    if (urlConvId && conversations.some((c: Conversation) => c.id === urlConvId)) {
      setSelectedConvId(urlConvId);
    } else if (!isMobileView && conversations.length > 0 && !selectedConvId) {
      setSelectedConvId(conversations[0].id);
    }
  }, [urlConvId, conversations, isMobileView, selectedConvId]);

  // Em telas menores que o sidebar do app (lg), alterna entre lista e chat.
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const loadConversations = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const data: Conversation[] = (await api.getConversations()).map((c: any) => ({
        ...c,
        // Garante estado válido mesmo se o campo vier faltando do servidor.
        visualStatus: normalizeConversationVisualStatus(c.visualStatus, c.unreadCount),
      }));
      setConversations(data);
      if (!silent) {
        if (urlConvId && data.some((c: Conversation) => c.id === urlConvId)) {
          setSelectedConvId(urlConvId);
        } else if (!isMobileView && data.length > 0 && !selectedConvId) {
          setSelectedConvId(data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadQuickReplies = async () => {
    try {
      const qrs = await api.getQuickReplies();
      setQuickReplies(qrs);
    } catch (e) {
      console.error(e);
    }
  };

  const loadMessages = async (convId: string, silent = false) => {
    try {
      const msgs = await api.getMessages(convId);
      // Em sincronização silenciosa só troca o estado se houver mensagem nova,
      // para não disparar auto-scroll enquanto o atendente lê escrevendo.
      setMessages((prev) => {
        if (silent && prev.length > 0 && msgs.length > 0) {
          return prev[prev.length - 1].id === msgs[msgs.length - 1].id ? prev : msgs;
        }
        return msgs;
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConvId || !newMessage.trim() || sending) return;

    const isAgentReply = !isInternalNote;

    try {
      setSending(true);
      const sent = await api.sendMessage(
        selectedConvId,
        newMessage,
        isInternalNote ? 'internal_note' : 'agent'
      );
      setMessages((prev) => [...prev, sent]);

      if (isAgentReply) {
        const sentAt = sent.createdAt || new Date().toISOString();
        const lastCustomerAt = messages.filter((m) => m.senderType === 'customer').pop()?.createdAt ?? null;

        setConversations((prev) =>
          prev.map((c: Conversation) => {
            if (c.id !== selectedConvId) return c;

            // Se havia mensagem pendente, a resposta também registra a
            // abertura; se a conversa já estava aberta, preserva esse horário.
            const openedAt = c.unreadCount > 0 || !c.openedAt ? sentAt : c.openedAt;

            return {
              ...c,
              unreadCount: 0,
              openedAt,
              lastAgentAt: sentAt,
              // Verde só se houver mensagem do cliente respondida por ela;
              // a lista é recalculada pelo servidor logo em seguida.
              visualStatus: resolveConversationVisualStatus({
                unreadCount: 0,
                lastCustomerAt,
                lastAgentAt: sentAt,
                openedAt,
              }),
            };
          })
        );
      }

      setNewMessage('');
      setIsInternalNote(false);
      await loadConversations(true);
    } catch (err: any) {
      alert(`Erro ao enviar mensagem: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: 'open' | 'in_progress' | 'closed') => {
    if (!selectedConvId) return;
    try {
      await api.updateConversationStatus(selectedConvId, newStatus);
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConvId ? { ...c, status: newStatus } : c))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const selectedConversation = conversations.find((c) => c.id === selectedConvId);

  const filteredConversations = conversations.filter((c) => {
    if (filterStatus === 'all') return true;
    return c.status === filterStatus;
  });

  // Em telas compactas, a lista e o chat ocupam a tela inteira, um por vez.
  const showList = !isMobileView || !selectedConvId;
  const showChat = Boolean(selectedConversation);

  return (
    <div className="h-full min-h-[480px] flex flex-col bg-[#263744] rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden">
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* Coluna 1: Fila de Atendimento */}
        {showList && (
          <div className="w-full lg:w-80 lg:border-r border-[#526673] flex flex-col bg-[#263744]/60 flex-shrink-0">

            {/* Cabeçalho da Fila e Filtro */}
            <div className="p-3.5 border-b border-[#526673] bg-[#344956]">
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-bold text-xs uppercase tracking-wider text-[#E1E8EC]">
                  Fila de Atendimento
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#263744] text-[#D0B783] font-bold">
                  {conversations.length} {conversations.length === 1 ? 'conversa' : 'conversas'}
                </span>
              </div>

              {/* Abas de Filtro de Status */}
              <div className="overflow-x-auto space-x-1 p-1 bg-[#263744] rounded-lg text-[10px] font-semibold text-center">
                <button
                  type="button"
                  onClick={() => setFilterStatus('all')}
                  className={`whitespace-nowrap py-1 px-2 rounded cursor-pointer transition-colors ${
                    filterStatus === 'all' ? 'bg-[#527D91] text-white shadow-xs' : 'text-[#B4C5CE]'
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('open')}
                  className={`whitespace-nowrap py-1 px-2 rounded cursor-pointer transition-colors ${
                    filterStatus === 'open' ? 'bg-[#527D91] text-white shadow-xs' : 'text-[#B4C5CE]'
                  }`}
                >
                  Abertas
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('in_progress')}
                  className={`whitespace-nowrap py-1 px-2 rounded cursor-pointer transition-colors ${
                    filterStatus === 'in_progress' ? 'bg-[#527D91] text-white shadow-xs' : 'text-[#B4C5CE]'
                  }`}
                >
                  Em curso
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus('closed')}
                  className={`whitespace-nowrap py-1 px-2 rounded cursor-pointer transition-colors ${
                    filterStatus === 'closed' ? 'bg-[#527D91] text-white shadow-xs' : 'text-[#B4C5CE]'
                  }`}
                >
                  Resolvidas
                </button>
              </div>

              {/* Legenda do status visual das conversas */}
              <ConversationStatusLegend className="mt-2 px-1" />
            </div>

            {/* Lista de Conversas */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#526673]">
              {loading ? (
                <div className="p-6 text-center text-xs text-[#B4C5CE]">Carregando conversas...</div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#B4C5CE]">
                  <div className="w-10 h-10 rounded-full bg-[#263744] flex items-center justify-center text-[#B4C5CE] mx-auto mb-2">
                    <span className="material-symbols-outlined text-[20px]">chat_bubble_outline</span>
                  </div>
                  <p className="font-semibold text-[#E1E8EC] mb-1">Fila vazia</p>
                  <p className="text-[11px] text-[#B4C5CE]">Nenhum atendimento aberto no momento.</p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = conv.id === selectedConvId;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      data-conversation-id={conv.id}
                      data-visual-status={conv.visualStatus}
                      onClick={() => setSelectedConvId(conv.id)}
                      className={`w-full p-3.5 text-left transition-colors flex items-start gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-[#344956] border-l-4 border-[#527D91] shadow-xs'
                          : 'hover:bg-[#344956]/80'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-[#263744] text-[#E1E8EC] font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {conv.contactName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <ConversationStatusIndicator status={conv.visualStatus} />
                            <span className="text-xs font-bold text-[#E1E8EC] truncate">{conv.contactName}</span>
                          </div>
                          <span className="text-[10px] text-[#B4C5CE] flex-shrink-0">{formatDateTime(conv.lastMessageAt)}</span>
                        </div>
                        <p className="text-[11px] text-[#B4C5CE] truncate leading-tight">{conv.lastMessage}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-[#B4C5CE] truncate">Resp.: {conv.assignedName || 'Não atribuído'}</span>
                          {conv.unreadCount > 0 && (
                            <span
                              className="min-w-4 px-1 h-4 rounded-full bg-[#B53A3A] text-white text-[9px] font-bold flex items-center justify-center"
                              title={`${conv.unreadCount} mensagem(ns) não lida(s)`}
                            >
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Coluna 2: Chat Viewport Principal */}
        {showChat ? (
          <div className="flex-1 flex flex-col bg-[#263744] min-w-0">
            {/* Voltar para a fila em telas compactas */}
            {isMobileView && (
              <div className="lg:hidden px-3 py-2 border-b border-[#526673] bg-[#344956] flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedConvId(null)}
                  className="inline-flex items-center gap-2 text-[#D0B783] text-xs font-semibold hover:text-[#E1E8EC]"
                >
                  <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                  <span>Voltar à fila</span>
                </button>
              </div>
            )}

            {/* Header do Chat Selecionado */}
            <div className="min-h-14 px-3 sm:px-4 py-2 bg-[#344956] border-b border-[#526673] flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-full bg-[#263744] text-[#D0B783] font-bold text-sm flex items-center justify-center flex-shrink-0">
                  {selectedConversation?.contactName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#E1E8EC] truncate">{selectedConversation?.contactName}</h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#B4C5CE] min-w-0">
                    <span className="font-mono truncate">{selectedConversation?.contactPhone}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="hidden sm:inline text-[#8FE3AC] font-medium whitespace-nowrap">WhatsApp Oficial</span>
                    <span className="hidden sm:inline">•</span>
                    <ConversationStatusIndicator
                      status={selectedConversation?.visualStatus}
                      unreadCount={selectedConversation?.unreadCount}
                      withLabel
                      className="hidden sm:inline-flex"
                    />
                  </div>
                  <ConversationEventTimes
                    receivedAt={selectedConversation?.lastCustomerAt}
                    openedAt={selectedConversation?.openedAt}
                    repliedAt={selectedConversation?.lastAgentAt}
                    className="mt-0.5"
                  />
                </div>
              </div>

              {/* Seletor de Status da Conversa */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-[#B4C5CE] font-medium hidden xl:inline">Status:</span>
                <select
                  value={selectedConversation?.status}
                  onChange={(e) => handleStatusChange(e.target.value as any)}
                  className="w-[142px] sm:w-[160px] px-2 py-1.5 rounded-lg border border-[#526673] bg-[#2D404D] text-[11px] sm:text-xs font-semibold text-[#E1E8EC] outline-none cursor-pointer focus:border-[#527D91]"
                >
                  <option value="open">Aguardando</option>
                  <option value="in_progress">Em Atendimento</option>
                  <option value="closed">Resolvida</option>
                </select>
              </div>
            </div>

            {/* Timeline de Mensagens */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
              {messages.map((msg) => {
                if (msg.senderType === 'internal_note') {
                  return (
                    <div key={msg.id} className="max-w-md mx-auto p-3 rounded-lg bg-[#263744] border border-dashed border-[#D0B783] text-xs text-[#D0B783]">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <span className="material-symbols-outlined text-[14px]">lock</span>
                        <span>Nota Interna • {msg.senderName} ({formatDateTime(msg.createdAt)})</span>
                      </div>
                      <p className="leading-relaxed">{msg.content}</p>
                    </div>
                  );
                }

                const isAgent = msg.senderType === 'agent';
                return (
                  <div key={msg.id} className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-xs md:max-w-md p-3 rounded-xl shadow-xs text-xs leading-relaxed transition-all ${isAgent ? 'bg-[#527D91]/25 text-[#E1E8EC] border border-[#527D91]/60 rounded-br-xs' : 'bg-[#344956] text-[#E1E8EC] border border-[#526673] rounded-bl-xs'}`}>
                      <p className="whitespace-pre-wrap select-text">{msg.content}</p>
                      <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-[#B4C5CE] select-none">
                        <span>{formatDateTime(msg.createdAt)}</span>
                        {isAgent && (
                          msg.status === 'failed' ? (
                            <span className="flex items-center gap-1 text-[#FFA8A8]" title="Falha no envio pelo WhatsApp">
                              <span className="material-symbols-outlined text-[13px]">error</span>
                              <span>Falhou</span>
                            </span>
                          ) : (
                            <span className={`material-symbols-outlined text-[13px] ${msg.status === 'read' ? 'text-[#8FE3AC]' : 'text-[#B4C5CE]'}`} title={msg.status === 'read' ? 'Lida' : 'Entregue'}>
                              {msg.status === 'read' ? 'done_all' : 'done'}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Barra de Ações e Mensagens Prontas */}
            <div className="px-4 py-2 bg-[#344956] border-t border-[#526673] flex items-center justify-between text-xs text-[#B4C5CE]">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsInternalNote(!isInternalNote)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${isInternalNote ? 'bg-[#527D91] text-white' : 'hover:bg-[#263744] text-[#B4C5CE]'}`}>
                  <span className="material-symbols-outlined text-[14px]">{isInternalNote ? 'lock' : 'lock_open'}</span>
                  <span>Nota Interna</span>
                </button>

                <div className="relative">
                  <button type="button" onClick={() => setShowQuickMenu(!showQuickMenu)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded hover:bg-[#263744] text-[#B4C5CE] text-xs font-semibold cursor-pointer">
                    <span className="material-symbols-outlined text-[14px]">quickreply</span>
                    <span>Respostas Rápidas ({quickReplies.length})</span>
                  </button>

                  {/* Menu Popover de Respostas Rápidas */}
                  {showQuickMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#344956] rounded-lg shadow-xl border border-[#526673] py-1 z-20">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-[#B4C5CE] border-b border-[#526673]">Inserir Resposta Pronta</div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-[#526673]">
                        {quickReplies.map((qr) => (
                          <button key={qr.id} type="button" onClick={() => { setNewMessage((prev) => `${prev} ${qr.content}`.trim()); setShowQuickMenu(false); }} className="w-full text-left p-2 hover:bg-[#263744] text-xs transition-colors cursor-pointer">
                            <span className="font-bold text-[#D0B783] block">{qr.shortcut}</span>
                            <span className="text-[#E1E8EC] truncate block">{qr.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <span className="hidden sm:inline text-[11px] text-[#B4C5CE]">Pressione <strong>Enter</strong> para enviar</span>
            </div>

            {/* Composer de Envio */}
            <form onSubmit={handleSendMessage} className="p-3 sm:p-4 bg-[#344956] border-t border-[#526673] flex items-center gap-2 sm:gap-3">
              <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={isInternalNote ? 'Escreva uma nota interna (visível apenas para sua equipe)...' : 'Digite sua mensagem no WhatsApp...'} className={`flex-1 min-w-0 px-3 sm:px-4 py-2.5 rounded-lg border text-xs outline-none transition-all ${isInternalNote ? 'border-[#D0B783] bg-[#2D404D] text-[#D0B783] placeholder-[#D0B783]/80' : 'border-[#526673] bg-[#2D404D] text-[#E1E8EC] focus:border-[#527D91] focus:bg-[#2D404D]'}`} />
              <button type="submit" disabled={sending || !newMessage.trim()} className={`px-3 sm:px-4 py-2.5 rounded-lg font-semibold text-xs text-white flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${isInternalNote ? 'bg-[#527D91]' : 'bg-[#527D91] hover:brightness-95'} disabled:opacity-50`}>
                <span>{isInternalNote ? 'Salvar Nota' : 'Enviar'}</span>
                <span className="material-symbols-outlined text-[16px]">{isInternalNote ? 'note_add' : 'send'}</span>
              </button>
            </form>
          </div>
        ) : !isMobileView ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#B4C5CE] text-xs p-8 bg-[#263744]/30">
            <div className="w-14 h-14 rounded-full bg-[#263744] flex items-center justify-center text-[#B4C5CE] mb-3">
              <span className="material-symbols-outlined text-[28px]">chat</span>
            </div>
            <h3 className="text-sm font-semibold text-[#E1E8EC] mb-1">Central de Atendimento WhatsApp</h3>
            <p className="text-xs text-[#B4C5CE] max-w-sm text-center mb-4 leading-relaxed">Selecione uma conversa na fila ao lado para começar o atendimento.</p>
            <Link to="/contatos" className="px-4 py-2 rounded-lg bg-[#527D91] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">contacts</span>
              <span>Ver Lista de Contatos</span>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
