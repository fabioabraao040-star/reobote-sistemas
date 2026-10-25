import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const handleSendReset = async (e: React.FormEvent) => {
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

    setSubmitting(true);

    try {
      await resetPassword(trimmedEmail);
      setInfoMessage(
        'Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.'
      );
      setEmail('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao solicitar recuperação de senha.');
    } finally {
      setSubmitting(false);
    }
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
            <span className="material-symbols-outlined text-[24px]">lock</span>
          </div>
          <div className="flex flex-col text-left">
            <span className="font-display-md text-headline-md tracking-wider uppercase font-bold text-[#E1E8EC] leading-tight">
              REOBOTE
            </span>
            <span className="font-label-sm text-[10px] tracking-widest uppercase font-semibold text-[#E1E8EC]/75 leading-tight">
              Sistema de Atendimento
            </span>
          </div>
        </div>

        {/* Título e Subtítulo */}
        <div className="w-full text-center mb-6">
          <h1 className="font-headline-lg text-headline-lg font-bold mb-1 text-[#E1E8EC] tracking-tight">
            Recuperar Senha
          </h1>
          <p className="font-body-md text-body-md text-[#E1E8EC]/80 leading-snug">
            Informe seu e-mail para receber instruções de redefinição.
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

        <form className="w-full flex flex-col gap-3.5" onSubmit={handleSendReset} noValidate>
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

          {/* Botão de Envio */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-1 py-3 rounded-xl font-label-md text-label-md text-white font-semibold transition-all duration-200 shadow-sm hover:brightness-95 active:scale-[0.99] flex items-center justify-center gap-2 bg-[#527D91] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <span className="material-symbols-outlined text-[16px]">hourglass_empty</span>
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <span>Enviar Instruções</span>
                <span className="material-symbols-outlined text-[16px]">send</span>
              </>
            )}
          </button>
        </form>

        {/* Rodapé / Link de Login */}
        <div className="mt-6 pt-4 w-full flex items-center justify-center text-center border-t border-[#526673]">
          <p className="font-body-md text-body-sm text-[#E1E8EC]">
            Já tem uma conta?{' '}
            <Link to="/login" className="font-semibold text-[#D0B783] hover:underline">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
