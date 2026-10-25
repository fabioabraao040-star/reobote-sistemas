import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface WhatsAppConfig {
  companyId: string;
  phoneNumber: string;
  phoneNumberId: string;
  wabaId: string;
  hasAccessToken: boolean;
  hasVerifyToken: boolean;
  verifiedName: string | null;
  qualityRating: string | null;
  lastChecked: string | null;
  webhookUrl: string;
  isVerified: boolean;
}

interface VerifyConnectionResult {
  connected: boolean;
  verifiedName?: string;
  displayPhoneNumber?: string;
  qualityRating?: string;
  lastChecked?: string;
  error?: string;
  metaError?: { message: string; code: number; type: string };
}

export default function MasterAdminDashboard() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [formData, setFormData] = useState({
    phoneNumber: '',
    phoneNumberId: '',
    wabaId: '',
    accessToken: '',
    verifyToken: '',
  });
  const [showToken, setShowToken] = useState(false);
  const [showVerifyToken, setShowVerifyToken] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await api.getWhatsAppConfig();
      setConfig(data);
      setFormData({
        phoneNumber: data.phoneNumber || '',
        phoneNumberId: data.phoneNumberId || '',
        wabaId: data.wabaId || '',
        accessToken: '',
        verifyToken: '',
      });
    } catch (e: any) {
      if (e.message?.includes('404') || e.message?.includes('não encontrada')) {
        // Configuração ainda não existe
        setConfig(null);
        setFormData({ phoneNumber: '', phoneNumberId: '', wabaId: '', accessToken: '', verifyToken: '' });
      } else {
        setFeedback({ type: 'error', message: e.message || 'Erro ao carregar configuração.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);

    try {
      const res = await api.saveWhatsAppConfig({
        phoneNumber: formData.phoneNumber,
        phoneNumberId: formData.phoneNumberId,
        wabaId: formData.wabaId,
        accessToken: formData.accessToken.trim() || undefined,
        verifyToken: formData.verifyToken.trim() || undefined,
      });

      setFeedback({ type: 'success', message: res.message || 'Configurações salvas com sucesso.' });
      setFormData((prev) => ({ ...prev, accessToken: '', verifyToken: '' }));
      loadConfig();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao salvar configuração.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setFeedback(null);
    setTesting(true);

    try {
      const res = await api.verifyWhatsAppConnection();

      if (res.connected) {
        setFeedback({
          type: 'success',
          message: `Conexão oficial validada com a Meta! Conta: ${res.verifiedName || 'Ativa'}. Qualidade: ${res.qualityRating || 'Verde'}.`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Falha na validação com a Meta.',
        });
      }
      loadConfig();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha na validação com a Meta.' });
    } finally {
      setTesting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusConfig = config
    ? config.isVerified
      ? { label: 'VERIFICADO', color: '#39AC6B', bg: 'bg-[#39AC6B]/10', border: 'border-[#39AC6B]/30', text: 'text-[#8FE3AC]' }
      : { label: 'PENDENTE', color: '#EFA339', bg: 'bg-[#EFA339]/10', border: 'border-[#EFA339]/30', text: 'text-[#F5C26B]' }
    : { label: 'NÃO CONFIGURADO', color: '#B4C5CE', bg: 'bg-[#B4C5CE]/10', border: 'border-[#B4C5CE]/30', text: 'text-[#B4C5CE]' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#D0B783]/10 text-[#D0B783] border border-[#D0B783]/30">
              ADM MASTER
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#E1E8EC] tracking-tight">
            Painel Exclusivo do ADM MASTER
          </h1>
          <p className="text-sm text-[#B4C5CE]">
            Configuração oficial da Meta WhatsApp Business Cloud API e diagnóstico de integração.
          </p>
        </div>
        <Link to="/dashboard" className="text-xs font-semibold text-[#D0B783] hover:text-[#E1E8EC] flex items-center gap-1 transition-colors">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Voltar ao Dashboard</span>
        </Link>
      </div>

      {/* Status Card */}
      <div className={statusConfig.bg + ' p-4 rounded-xl border ' + statusConfig.border + ' shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]'}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: statusConfig.color }}>
            <span className="material-symbols-outlined text-[20px]">
              {config?.isVerified ? 'verified' : config ? 'pending' : 'settings'}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-[#E1E8EC]">Status da Conexão Oficial</h3>
            <span className={statusConfig.text + ' text-sm font-medium'}>{statusConfig.label}</span>
          </div>
          {config?.verifiedName && (
            <div className="flex-1 text-right">
              <p className="text-xs text-[#B4C5CE]">Nome Verificado</p>
              <p className="font-mono text-sm text-[#E1E8EC]">{config.verifiedName}</p>
            </div>
          )}
          {config?.qualityRating && (
            <div className="flex-1 text-right">
              <p className="text-xs text-[#B4C5CE]">Qualidade</p>
              <p className="font-mono text-sm text-[#E1E8EC]">{config.qualityRating}</p>
            </div>
          )}
          {config?.lastChecked && (
            <div className="flex-1 text-right">
              <p className="text-xs text-[#B4C5CE]">Última Verificação</p>
              <p className="font-mono text-sm text-[#E1E8EC]">{formatDate(config.lastChecked)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div className={`p-4 rounded-xl border shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)] ${
          feedback.type === 'success' ? 'bg-[#39AC6B]/10 border-[#39AC6B]/30 text-[#8FE3AC]' :
          feedback.type === 'error' ? 'bg-[#D14747]/10 border-[#D14747]/30 text-[#FFA8A8]' :
          'bg-[#EFA339]/10 border-[#EFA339]/30 text-[#F5C26B]'
        }`}>
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color: feedback.type === 'success' ? '#8FE3AC' : feedback.type === 'error' ? '#FFA8A8' : '#F5C26B' }}>
              {feedback.type === 'success' ? 'check_circle' : feedback.type === 'error' ? 'error' : 'warning'}
            </span>
            <div className="flex-1 leading-relaxed">
              <span className="font-medium">{feedback.message}</span>
            </div>
            <button type="button" onClick={() => setFeedback(null)} className="text-xs font-semibold underline cursor-pointer" style={{ color: feedback.type === 'success' ? '#8FE3AC' : feedback.type === 'error' ? '#FFA8A8' : '#F5C26B' }}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Configuração Oficial do WhatsApp */}
      <div className="bg-[#344956] rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden">
        <div className="p-5 border-b border-[#526673] bg-[#263744]/50">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#E1E8EC]">
            <span className="material-symbols-outlined text-[22px]" style={{ color: '#D0B783' }}>settings</span>
            Configuração Oficial do WhatsApp (Meta Cloud API)
          </h2>
          <p className="text-sm text-[#B4C5CE] mt-1">
            Preencha os dados oficiais fornecidos pela Meta no <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-[#D0B783] hover:underline">Meta for Developers</a>.
            Campos de segredo (Token de Acesso, Verify Token) vazios preservam o valor atual no servidor.
          </p>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5">
          {/* Campos Obrigatórios - Não Secretos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <label className="font-semibold text-[#E1E8EC] block mb-1">Número Oficial da Empresa *</label>
              <input
                type="tel"
                required
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                placeholder="+55 11 99999-0000"
                className="w-full px-3 py-2 rounded-lg border border-[#526673] bg-[#2D404D] text-[#E1E8EC] outline-none focus:border-[#527D91] text-sm"
              />
            </div>
            <div>
              <label className="font-semibold text-[#E1E8EC] block mb-1">Phone Number ID (Meta Graph API) *</label>
              <input
                type="text"
                required
                value={formData.phoneNumberId}
                onChange={(e) => handleInputChange('phoneNumberId', e.target.value)}
                placeholder="123456789012345"
                className="w-full px-3 py-2 rounded-lg border border-[#526673] bg-[#2D404D] text-[#E1E8EC] outline-none focus:border-[#527D91] text-sm font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-[#E1E8EC] block mb-1">WhatsApp Business Account ID (WABA ID) *</label>
              <input
                type="text"
                required
                value={formData.wabaId}
                onChange={(e) => handleInputChange('wabaId', e.target.value)}
                placeholder="987654321098765"
                className="w-full px-3 py-2 rounded-lg border border-[#526673] bg-[#2D404D] text-[#E1E8EC] outline-none focus:border-[#527D91] text-sm font-mono"
              />
            </div>
          </div>

          {/* Campos Secretos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-[#526673]">
            <div>
              <label className="font-semibold text-[#E1E8EC] block mb-1 flex items-center gap-1">
                Token de Acesso do Desenvolvedor Meta (System User Token) *
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-xs text-[#B4C5CE] hover:text-[#D0B783]"
                >
                  {showToken ? 'Ocultar' : 'Mostrar'}
                </button>
              </label>
              <input
                type={showToken ? 'text' : 'password'}
                value={formData.accessToken}
                onChange={(e) => handleInputChange('accessToken', e.target.value)}
                placeholder={config?.hasAccessToken ? 'Já configurado — deixe vazio para manter' : 'EAA... (System User Token)'}
                className="w-full px-3 py-2 rounded-lg border border-[#526673] bg-[#2D404D] text-[#E1E8EC] outline-none focus:border-[#527D91] text-sm font-mono"
                autoComplete="off"
              />
              <p className="text-xs text-[#B4C5CE] mt-1">
                Token de usuário do sistema (System User) com permissões: whatsapp_business_management, whatsapp_business_messaging.
                Nunca é retornado ao navegador. Deixe vazio para manter o atual.
              </p>
            </div>
            <div>
              <label className="font-semibold text-[#E1E8EC] block mb-1 flex items-center gap-1">
                Token de Verificação do Webhook (Verify Token) *
                <button
                  type="button"
                  onClick={() => setShowVerifyToken(!showVerifyToken)}
                  className="text-xs text-[#B4C5CE] hover:text-[#D0B783]"
                >
                  {showVerifyToken ? 'Ocultar' : 'Mostrar'}
                </button>
              </label>
              <input
                type={showVerifyToken ? 'text' : 'password'}
                value={formData.verifyToken}
                onChange={(e) => handleInputChange('verifyToken', e.target.value)}
                placeholder={config?.hasVerifyToken ? 'Já configurado — deixe vazio para manter' : 'Seu token de verificação personalizado'}
                className="w-full px-3 py-2 rounded-lg border border-[#526673] bg-[#2D404D] text-[#E1E8EC] outline-none focus:border-[#527D91] text-sm"
                autoComplete="off"
              />
              <p className="text-xs text-[#B4C5CE] mt-1">
                Token definido por você para validar o webhook na Meta. Deixe vazio para manter o atual.
              </p>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-[#526673]">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 sm:w-auto py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 shadow-sm hover:brightness-95 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #527D91 0%, #3A5F73 25%, #527D91 50%, #6BA3C8 75%, #527D91 100%)',
                backgroundSize: '200% 200%',
                backgroundPosition: saving ? '50% 50%' : '0% 50%',
                boxShadow: saving
                  ? '0 0 0 1px rgba(82,125,145,0.5), 0 2px 8px -4px rgba(82,125,145,0.4), inset 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
                  : '0 0 0 1px rgba(82,125,145,0.6), 0 4px 16px -4px rgba(82,125,145,0.5), 0 0 20px -8px rgba(82,125,145,0.7), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.1)',
                animation: saving ? 'none' : 'neon-shimmer 3s ease-in-out infinite',
              }}
            >
              {saving ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">hourglass_empty</span>
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  <span>Salvar Configuração</span>
                </>
              )}
              <span aria-hidden="true" style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 40%, rgba(255,255,255,0.04) 100%)',
                pointerEvents: 'none', borderRadius: 'inherit'
              }} />
            </button>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !config?.phoneNumberId || !config?.hasAccessToken}
              className="flex-1 sm:w-auto py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 shadow-sm hover:brightness-95 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden bg-[#39AC6B]"
            >
              {testing ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">wifi</span>
                  <span>Testando...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">wifi</span>
                  <span>TESTAR CONEXÃO OFICIAL</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Webhook URL Section */}
      {config && (
        <div className="bg-[#344956] rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]">
          <div className="p-5 border-b border-[#526673] bg-[#263744]/50">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-[#E1E8EC]">
              <span className="material-symbols-outlined text-[22px]" style={{ color: '#D0B783' }}>webhook</span>
              URL Oficial do Webhook
            </h3>
            <p className="text-sm text-[#B4C5CE] mt-1">
              Configure esta URL no painel <strong>Meta for Developers → WhatsApp → Configuração → Webhook</strong>.
            </p>
          </div>
          <div className="p-5">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex-1 relative">
                <input
                  type="text"
                  readOnly
                  value={config.webhookUrl}
                  className="w-full px-4 py-3 rounded-lg border border-[#526673] bg-[#2D404D] text-[#D0B783] outline-none text-sm font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(config.webhookUrl);
                  setFeedback({ type: 'success', message: 'URL do webhook copiada para a área de transferência!' });
                }}
                className="w-full sm:w-auto px-4 py-3 rounded-lg bg-[#527D91] text-white text-sm font-semibold hover:brightness-95 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">content_copy</span>
                <span>Copiar URL</span>
              </button>
            </div>
            <p className="text-xs text-[#B4C5CE] mt-3">
              Verifique se a URL corresponde ao ambiente atual. Em produção, deve ser <code className="text-[#D0B783] font-mono">https://reobote-sistemas.vercel.app/api/webhook/whatsapp</code>.
            </p>
          </div>
        </div>
      )}

      {/* Diagnóstico e Segurança */}
      <div className="bg-[#344956] rounded-xl border border-[#526673] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]">
        <div className="p-5 border-b border-[#526673] bg-[#263744]/50">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[#E1E8EC]">
            <span className="material-symbols-outlined text-[22px]" style={{ color: '#D0B783' }}>security</span>
            Segurança e Diagnóstico
          </h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-[#263744] border border-[#526673]">
            <h4 className="font-semibold text-[#D0B783] mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]">shield</span>
              Proteção de Segredos
            </h4>
            <ul className="text-sm text-[#B4C5CE] space-y-1">
              <li>• Tokens nunca retornados ao frontend</li>
              <li>• Campos vazios preservam valor atual</li>
              <li>• Apenas ADM MASTER pode alterar</li>
              <li>• Logs não expõem credenciais</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg bg-[#263744] border border-[#526673]">
            <h4 className="font-semibold text-[#D0B783] mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]">bug_report</span>
              Códigos de Erro Comuns
            </h4>
            <ul className="text-sm text-[#B4C5CE] space-y-1 font-mono">
              <li>400: Campos obrigatórios ausentes</li>
              <li>401: Token inválido ou expirado</li>
              <li>403: Permissões insuficientes na Meta</li>
              <li>404: Phone Number ID não encontrado</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg bg-[#263744] border border-[#526673]">
            <h4 className="font-semibold text-[#D0B783] mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]">checklist</span>
              Checklist de Validação
            </h4>
            <ul className="text-sm text-[#B4C5CE] space-y-1">
              <li>✓ Phone Number ID correto</li>
              <li>✓ WABA ID corresponde à conta</li>
              <li>✓ System User Token com escopos</li>
              <li>✓ Verify Token idêntico na Meta</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}