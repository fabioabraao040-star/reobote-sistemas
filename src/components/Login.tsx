import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type AccessRole = 'admin' | 'user';

export default function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();

  const [selectedRole, setSelectedRole] = useState<AccessRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const handleSelectRole = (role: AccessRole) => {
    setSelectedRole(role);
    setErrorMessage(null);
    setInfoMessage(null);
    setEmail('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (!selectedRole) {
      setErrorMessage('Selecione um tipo de acesso antes de continuar.');
      return;
    }

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
      navigate('/dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao fazer login. Verifique suas credenciais.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    setErrorMessage(null);
    setInfoMessage('Para redefinir sua senha, entre em contato com o administrador do sistema da sua empresa.');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#E8EDF3]">
      <div className="w-full max-w-[460px] bg-white rounded-xl shadow-xl p-6 sm:p-9 flex flex-col items-center relative overflow-hidden transition-all duration-300">

        {/* Identidade Visual / Cabeçalho */}
        <div className="w-full flex items-center justify-center gap-3 mb-5 select-none">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm flex-shrink-0 bg-[#C5A15B]"
            aria-hidden="true"
          >
            <span className="material-symbols-outlined text-[24px]">headset_mic</span>
          </div>
          <div className="flex flex-col text-left">
            <span className="font-display-md text-headline-md tracking-wider uppercase font-bold text-[#34445C] leading-tight">
              REOBOTE
            </span>
            <span className="font-label-sm text-[10px] tracking-widest uppercase font-semibold text-[#34445C]/75 leading-tight">
              Sistema de Atendimento
            </span>
          </div>
        </div>

        {/* Título e Subtítulo */}
        <div className="w-full text-center mb-6">
          <h1 className="font-headline-lg text-headline-lg font-bold mb-1 text-[#34445C] tracking-tight">
            Acesso ao Sistema
          </h1>
          <p className="font-body-md text-body-md text-[#34445C]/80 leading-snug">
            Selecione seu tipo de acesso para continuar
          </p>
        </div>

        {/* Notificação Informativa */}
        {infoMessage && (
          <div
            role="status"
            className="w-full mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-2"
          >
            <span className="material-symbols-outlined text-[18px] text-[#C5A15B] flex-shrink-0 mt-0.5" aria-hidden="true">
              info
            </span>
            <div className="flex-1 leading-snug">
              <span className="font-medium">{infoMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setInfoMessage(null)}
              className="text-amber-700 hover:text-amber-950 text-xs font-semibold underline ml-1 cursor-pointer"
              aria-label="Fechar mensagem informativa"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Alerta de Validação */}
        {errorMessage && (
          <div
            role="alert"
            className="w-full mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-start gap-2"
          >
            <span className="material-symbols-outlined text-[18px] text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true">
              error
            </span>
            <span className="leading-snug flex-1 font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Botões de Seleção de Perfil */}
        {!selectedRole && (
          <div className="w-full flex flex-col gap-3 mb-6">
            <button
              type="button"
              onClick={() => handleSelectRole('admin')}
              className="w-full py-4 rounded-xl border-2 border-[#C5A15B] hover:bg-[#C5A15B] hover:text-white text-[#775a1b] font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 shadow-xs active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
              <span>ADM — Administrador</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectRole('user')}
              className="w-full py-4 rounded-xl border-2 border-[#34445C] hover:bg-[#34445C] hover:text-white text-[#34445C] font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 shadow-xs active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[20px]">support_agent</span>
              <span>Usuário / Atendente</span>
            </button>
          </div>
        )}

        {/* Formulário de Login (após selecionar o perfil) */}
        {selectedRole && (
          <div className="w-full flex flex-col gap-3.5">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => setSelectedRole(null)}
                className="text-xs sm:text-sm text-[#5B6E87] hover:text-[#34445C] flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                <span>Escolher outro perfil</span>
              </button>
            </div>

            <form className="w-full flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
              {/* Campo E-mail */}
              <div className="flex flex-col gap-1 w-full text-left">
                <label
                  className="font-label-md text-label-md font-semibold text-[#34445C]"
                  htmlFor="email"
                >
                  E-mail
                </label>
                <div className="relative w-full">
                  <span
                    className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#34445C]/50 pointer-events-none select-none"
                    aria-hidden="true"
                  >
                    mail
                  </span>
                  <input
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg font-body-md text-body-md bg-white border border-[#D8E0EA] outline-none transition-all duration-200 focus:border-[#C5A15B] focus:ring-2 focus:ring-[#C5A15B]/20 text-[#34445C] placeholder-[#5B6E87]/60"
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
                    className="font-label-md text-label-md font-semibold text-[#34445C]"
                    htmlFor="password"
                  >
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="font-label-sm text-label-sm hover:underline transition-opacity duration-150 text-[#C5A15B] font-semibold bg-transparent border-0 p-0 cursor-pointer"
                    title="Recuperar acesso à conta"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative w-full">
                  <span
                    className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#34445C]/50 pointer-events-none select-none"
                    aria-hidden="true"
                  >
                    lock
                  </span>
                  <input
                    className="w-full pl-10 pr-11 py-2.5 rounded-lg font-body-md text-body-md bg-white border border-[#D8E0EA] outline-none transition-all duration-200 focus:border-[#C5A15B] focus:ring-2 focus:ring-[#C5A15B]/20 text-[#34445C] placeholder-[#5B6E87]/60"
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
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                    title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded flex items-center justify-center text-[#34445C]/60 hover:text-[#34445C] hover:bg-[#34445C]/5 transition-colors cursor-pointer"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Botão de Envio (Entrar) */}
              <button
                type="submit"
                disabled={submitting || loading}
                className="w-full mt-1 py-3 rounded-xl font-label-md text-label-md text-white font-semibold transition-all duration-200 shadow-sm hover:brightness-95 active:scale-[0.99] flex items-center justify-center gap-2 bg-[#C5A15B] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting || loading ? (
                  <>
                    <span className="material-symbols-outlined text-[16px]">hourglass_empty</span>
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            {/* Rodapé / Link de Cadastro */}
            <div className="mt-4 pt-4 w-full flex items-center justify-center text-center border-t border-[#D8E0EA]">
              <p className="font-body-md text-body-md text-[#34445C]">
                Não tem uma conta?
                {' '}
                <Link
                  to="/cadastro"
                  className="font-semibold hover:underline ml-1 text-[#C5A15B] transition-colors"
                >
                  Cadastre-se
                </Link>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
