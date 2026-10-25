import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type LoginRole = 'master_admin' | 'admin' | 'user';

const roleLabels: Record<LoginRole, string> = {
  master_admin: 'ADM MASTER',
  admin: 'ADM',
  user: 'USUÁRIO / ATENDENTE',
};

const roleColors: Record<LoginRole, string> = {
  master_admin: '#D0B783',
  admin: '#527D91',
  user: '#39AC6B',
};

// Helper para ajustar brilho da cor (positivo = mais claro, negativo = mais escuro)
function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<LoginRole>('user');

  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam && ['master_admin', 'admin', 'user'].includes(roleParam)) {
      setSelectedRole(roleParam as LoginRole);
    }
  }, [searchParams]);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setErrorMessage('Por favor, informe seu endereço de e-mail.');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setErrorMessage('Por favor, insira um e-mail válido (exemplo: seu.nome@empresa.com).');
      return;
    }

    if (!password) {
      setErrorMessage('Por favor, informe sua senha para acessar o sistema.');
      return;
    }

    setSubmitting(true);

    try {
      await login(trimmedEmail, password);
      // Redireciona baseado no perfil salvo na sessão
      try {
        const raw = sessionStorage.getItem('reobote_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.role === 'master_admin') {
            navigate('/master-admin');
          } else if (parsed.role === 'admin') {
            navigate('/dashboard');
          } else {
            navigate('/atendimento');
          }
        } else {
          navigate('/dashboard');
        }
      } catch {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao fazer login. Verifique suas credenciais.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    navigate('/forgot-password');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#263744]">
      <div className="w-full max-w-[460px] bg-[#344956] rounded-xl shadow-xl p-6 sm:p-9 flex flex-col items-center relative overflow-hidden transition-all duration-300">

        {/* Identidade Visual / Cabeçalho */}
        <div className="w-full flex items-center justify-center gap-3 mb-5 select-none">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#263744] shadow-sm flex-shrink-0 bg-[#D0B783]"
            aria-hidden="true"
          >
            <span className="material-symbols-outlined text-[24px]">headset_mic</span>
          </div>
          <div className="flex flex-col text-left">
            <span className="font-display-md text-headline-md tracking-wider uppercase font-bold text-[#E1E8EC] leading-tight">
              REOBOTE
            </span>
            <span className="font-label-sm text-[10px] tracking-widest uppercase font-semibold text-[#E1E8EC]/75 leading-tight">
              SISTEMAS
            </span>
          </div>
        </div>

        {/* Badge do Perfil Selecionado */}
        <div className="w-full mb-6">
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: `${roleColors[selectedRole]}15`,
              border: `1px solid ${roleColors[selectedRole]}66`,
              color: roleColors[selectedRole],
            }}
          >
            <span className="relative flex h-4 w-4 items-center justify-center" style={{ backgroundColor: roleColors[selectedRole] }}>
              <span className="absolute h-1.5 w-1.5 rounded-full" style={{ backgroundColor: roleColors[selectedRole], boxShadow: `0 0 6px ${roleColors[selectedRole]}` }} />
            </span>
            {roleLabels[selectedRole]}
          </span>
        </div>

        {/* Título e Subtítulo */}
        <div className="w-full text-center mb-6">
          <h1 className="font-headline-lg text-headline-lg font-bold mb-1 text-[#E1E8EC] tracking-tight">
            Plataforma Inteligente
          </h1>
          <p className="font-body-md text-body-md text-[#E1E8EC]/80 leading-snug">
            Acesso seguro à plataforma institucional.
          </p>
        </div>

        {/* Notificação Informativa */}
        {infoMessage && (
          <div
            role="status"
            className="w-full mb-4 p-3 rounded-lg bg-[#EFA339]/10 border border-[#EFA339]/30 text-[#F5C26B] text-xs sm:text-sm flex items-start gap-2"
          >
            <span className="material-symbols-outlined text-[18px] text-[#F5C26B] flex-shrink-0 mt-0.5" aria-hidden="true">
              info
            </span>
            <div className="flex-1 leading-snug">
              <span className="font-medium">{infoMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setInfoMessage(null)}
              className="text-[#F5C26B] hover:text-[#F5C26B] text-xs font-semibold underline ml-1 cursor-pointer"
              aria-label="Fechar mensagem informativa"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Alerta de Erro */}
        {errorMessage && (
          <div
            role="alert"
            className="w-full mb-4 p-3 rounded-lg bg-[#D14747]/10 border border-[#D14747]/30 text-[#FFA8A8] text-xs sm:text-sm flex items-start gap-2"
          >
            <span className="material-symbols-outlined text-[18px] text-[#FFA8A8] flex-shrink-0 mt-0.5" aria-hidden="true">
              error
            </span>
            <span className="leading-snug flex-1 font-medium">{errorMessage}</span>
          </div>
        )}

        <form className="w-full flex flex-col gap-3.5" onSubmit={handleSubmit} noValidate>
          {/* Campo E-mail */}
          <div className="flex flex-col gap-1 w-full text-left">
            <label
              className="font-label-md text-label-md font-semibold text-[#E1E8EC]"
              htmlFor="email"
            >
              E-mail
            </label>
            <div className="relative w-full">
              <span
                className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#E1E8EC]/50 pointer-events-none select-none"
                aria-hidden="true"
              >
                mail
              </span>
              <input
                className="w-full pl-10 pr-4 py-2.5 rounded-lg font-body-md text-body-md bg-[#2D404D] border border-[#526673] outline-none transition-all duration-200 focus:border-[#527D91] focus:ring-2 focus:ring-[#527D91]/20 text-[#E1E8EC] placeholder-[#B4C5CE]/80"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="seu.email@empresa.com"
                required
              />
            </div>
          </div>

          {/* Campo Senha */}
          <div className="flex flex-col gap-1 w-full text-left">
            <div className="flex items-center justify-between w-full">
              <label
                className="font-label-md text-label-md font-semibold text-[#E1E8EC]"
                htmlFor="password"
              >
                Senha
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="font-label-sm text-label-sm hover:underline transition-opacity duration-150 text-[#D0B783] font-semibold bg-transparent border-0 p-0 cursor-pointer"
                title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? 'Ocultar senha' : 'Exibir senha'}
              </button>
            </div>
            <div className="relative w-full">
              <span
                className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#E1E8EC]/50 pointer-events-none select-none"
                aria-hidden="true"
              >
                lock
              </span>
              <input
                className="w-full pl-10 pr-11 py-2.5 rounded-lg font-body-md text-body-md bg-[#2D404D] border border-[#526673] outline-none transition-all duration-200 focus:border-[#527D91] focus:ring-2 focus:ring-[#527D91]/20 text-[#E1E8EC] placeholder-[#B4C5CE]/80"
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {/* Botão de Envio (Entrar) — Neon Espelhado Premium com cor do perfil */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-1 py-3 rounded-xl font-label-md text-label-md text-white font-semibold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
            style={{
              // Base metálica espelhada com gradiente neon na cor do perfil
              background: `linear-gradient(135deg, ${roleColors[selectedRole]} 0%, ${adjustColor(roleColors[selectedRole], -20)} 25%, ${roleColors[selectedRole]} 50%, ${adjustColor(roleColors[selectedRole], 20)} 75%, ${roleColors[selectedRole]} 100%)`,
              backgroundSize: '200% 200%',
              backgroundPosition: submitting ? '50% 50%' : '0% 50%',
              // Brilho metálico nas bordas + reflexo neon
              boxShadow: submitting
                ? `0 0 0 1px ${roleColors[selectedRole]}80, 0 2px 8px -4px ${roleColors[selectedRole]}66, inset 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)`
                : `0 0 0 1px ${roleColors[selectedRole]}99, 0 4px 16px -4px ${roleColors[selectedRole]}80, 0 0 20px -8px ${roleColors[selectedRole]}99, inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.1)`,
              // Animação sutil do gradiente
              animation: submitting ? 'none' : 'neon-shimmer 3s ease-in-out infinite',
            }}
            onMouseEnter={(e) => {
              if (!submitting) {
                const btn = e.currentTarget;
                btn.style.backgroundPosition = '100% 50%';
                btn.style.boxShadow = `0 0 0 1px ${roleColors[selectedRole]}CC, 0 6px 24px -4px ${roleColors[selectedRole]}99, 0 0 32px -6px ${roleColors[selectedRole]}CC, inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.1)`;
                btn.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!submitting) {
                const btn = e.currentTarget;
                btn.style.backgroundPosition = '0% 50%';
                btn.style.boxShadow = `0 0 0 1px ${roleColors[selectedRole]}99, 0 4px 16px -4px ${roleColors[selectedRole]}80, 0 0 20px -8px ${roleColors[selectedRole]}99, inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.1)`;
                btn.style.transform = 'translateY(0)';
              }
            }}
            onMouseDown={(e) => {
              if (!submitting) {
                const btn = e.currentTarget;
                btn.style.boxShadow = `0 0 0 1px ${roleColors[selectedRole]}80, 0 2px 8px -4px ${roleColors[selectedRole]}66, inset 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)`;
                btn.style.transform = 'translateY(0) scale(0.99)';
              }
            }}
            onMouseUp={(e) => {
              if (!submitting) {
                const btn = e.currentTarget;
                btn.style.boxShadow = `0 0 0 1px ${roleColors[selectedRole]}CC, 0 6px 24px -4px ${roleColors[selectedRole]}99, 0 0 32px -6px ${roleColors[selectedRole]}CC, inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.1)`;
                btn.style.transform = 'translateY(-1px)';
              }
            }}
            aria-busy={submitting}
            aria-label={submitting ? 'Autenticando, aguarde...' : 'Entrar no sistema'}
          >
            {submitting ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin" aria-hidden="true">hourglass_empty</span>
                <span>Entrando...</span>
              </>
            ) : (
              <>
                <span style={{ letterSpacing: '0.02em' }}>ENTRAR NO SISTEMA</span>
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>
              </>
            )}
            {/* Reflexo de luz sutil na superfície (overlay) */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 40%, rgba(255,255,255,0.04) 100%)',
                pointerEvents: 'none',
                borderRadius: 'inherit',
              }}
            />
          </button>

          {/* Link Esqueci minha senha */}
          <div className="flex justify-end mt-1">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-xs sm:text-sm text-[#B4C5CE] hover:text-[#E1E8EC] underline transition-colors cursor-pointer"
              title="Recuperar acesso à conta"
            >
              Esqueci minha senha
            </button>
          </div>
        </form>

        {/* Rodapé / Link de Cadastro */}
        <div className="mt-6 pt-4 w-full flex items-center justify-center text-center border-t border-[#526673]">
          <p className="font-body-md text-body-sm text-[#E1E8EC]">
            Não tem uma conta cadastrada?{' '}
            <Link
              to="/cadastro"
              className="font-semibold hover:underline ml-1 text-[#D0B783] transition-colors"
            >
              Crie sua conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
