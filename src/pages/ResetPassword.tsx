import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface RecoveryState {
  status: 'valid' | 'error' | 'none';
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: string;
  error: string | null;
  error_code: string | null;
  error_description: string | null;
}

function readRecoveryState(): RecoveryState {
  const hash = window.location.hash;
  const hashStr = hash.startsWith('#') ? hash.slice(1) : hash;
  const hashParams = new URLSearchParams(hashStr);
  const access_token = hashParams.get('access_token');
  const error = hashParams.get('error');
  const error_code = hashParams.get('error_code');
  const error_description = hashParams.get('error_description');

  const query = new URLSearchParams(window.location.search);
  const token = query.get('access_token') || query.get('token') || query.get('code');
  const queryError = query.get('error');
  const queryErrorCode = query.get('error_code');
  const queryErrorDescription = query.get('error_description');

  const effectiveToken = access_token || token;
  if (effectiveToken) {
    return {
      status: 'valid',
      access_token: effectiveToken,
      refresh_token: hashParams.get('refresh_token') || query.get('refresh_token') || '',
      token_type: hashParams.get('token_type') || query.get('token_type') || 'bearer',
      expires_in: hashParams.get('expires_in') || query.get('expires_in') || '',
      error: null,
      error_code: null,
      error_description: null,
    };
  }

  const finalError = error || queryError;
  const finalCode = error_code || queryErrorCode;
  const finalDesc = error_description || queryErrorDescription;
  if (finalError) {
    return {
      status: 'error',
      access_token: '',
      refresh_token: '',
      token_type: '',
      expires_in: '',
      error: finalError,
      error_code: finalCode,
      error_description: finalDesc,
    };
  }

  return {
    status: 'none',
    access_token: '',
    refresh_token: '',
    token_type: '',
    expires_in: '',
    error: null,
    error_code: null,
    error_description: null,
  };
}

export default function ResetPassword() {
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [accessToken, setAccessToken] = useState('');
  const [hasRecoveryToken, setHasRecoveryToken] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryErrorCode, setRecoveryErrorCode] = useState<string | null>(null);
  const [recoveryErrorDescription, setRecoveryErrorDescription] = useState<string | null>(null);

  useEffect(() => {
    const state = readRecoveryState();
    setAccessToken(state.access_token);
    setHasRecoveryToken(state.status === 'valid');
    setRecoveryError(state.error);
    setRecoveryErrorCode(state.error_code);
    setRecoveryErrorDescription(state.error_description);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setSuccessMessage(null);

    if (!hasRecoveryToken || !accessToken) {
      setErrorMessage('Link de recuperação inválido ou expirado. Solicite um novo link.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.confirmResetPassword({ accessToken, password: newPassword });
      setSuccessMessage(res.message || 'Senha redefinida com sucesso.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao redefinir a senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#263744]">
      <div className="w-full max-w-[460px] bg-[#344956] rounded-xl shadow-xl p-6 sm:p-9 flex flex-col items-center relative overflow-hidden transition-all duration-300">
        <div className="w-full flex items-center justify-center gap-3 mb-5 select-none">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-[#263744] shadow-sm flex-shrink-0 bg-[#D0B783]" aria-hidden="true">
            <span className="material-symbols-outlined text-[24px]">lock</span>
          </div>
          <div className="flex flex-col text-left">
            <span className="font-display-md text-headline-md tracking-wider uppercase font-bold text-[#E1E8EC] leading-tight">REOBOTE</span>
            <span className="font-label-sm text-[10px] tracking-widest uppercase font-semibold text-[#E1E8EC]/75 leading-tight">Sistema de Atendimento</span>
          </div>
        </div>

        <div className="w-full text-center mb-6">
          <h1 className="font-headline-lg text-headline-lg font-bold mb-1 text-[#E1E8EC] tracking-tight">Redefinir Senha</h1>
          <p className="font-body-md text-body-md text-[#E1E8EC]/80 leading-snug">
            Crie uma nova senha para acessar o sistema.
          </p>
        </div>

        {successMessage && (
          <div className="w-full mb-4 p-3 rounded-lg bg-[#39AC6B]/10 border border-[#39AC6B]/30 text-[#8FE3AC] text-xs sm:text-sm text-center">
            {successMessage}
          </div>
        )}

        {hasRecoveryToken ? (
          <form className="w-full flex flex-col gap-3.5" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1 w-full text-left">
              <label className="font-label-md text-label-md font-semibold text-[#E1E8EC]" htmlFor="new-password">Nova Senha</label>
              <div className="relative w-full">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#E1E8EC]/50 pointer-events-none select-none" aria-hidden="true">lock</span>
                <input
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg font-body-md text-body-md bg-[#2D404D] border border-[#526673] outline-none transition-all duration-200 focus:border-[#527D91] focus:ring-2 focus:ring-[#527D91]/20 text-[#E1E8EC] placeholder-[#B4C5CE]/80"
                  id="new-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1 w-full text-left">
              <label className="font-label-md text-label-md font-semibold text-[#E1E8EC]" htmlFor="confirm-password">Confirmar Nova Senha</label>
              <div className="relative w-full">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#E1E8EC]/50 pointer-events-none select-none" aria-hidden="true">lock</span>
                <input
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg font-body-md text-body-md bg-[#2D404D] border border-[#526673] outline-none transition-all duration-200 focus:border-[#527D91] focus:ring-2 focus:ring-[#527D91]/20 text-[#E1E8EC] placeholder-[#B4C5CE]/80"
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className="w-full mt-1 py-3 rounded-xl font-label-md text-label-md text-white font-semibold transition-all duration-200 shadow-sm hover:brightness-95 active:scale-[0.99] flex items-center justify-center gap-2 bg-[#527D91] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? (
                <>
                  <span className="material-symbols-outlined text-[16px]">hourglass_empty</span>
                  <span>Redefinindo...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  <span>Redefinir Senha</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="w-full mb-6 p-4 rounded-lg bg-[#263744] border border-[#526673] text-center">
            <span className="material-symbols-outlined text-[28px] text-[#B4C5CE]">key</span>
            <p className="text-xs sm:text-sm text-[#E1E8EC]/90 mt-2 mb-1">
              {recoveryError
                ? 'O link de recuperação não é mais válido.'
                : 'Não foi possível localizar o token de recuperação.'}
            </p>
            <p className="text-[11px] sm:text-xs text-[#B4C5CE] mb-4">
              {recoveryErrorDescription
                ? `${recoveryErrorDescription}${recoveryErrorCode ? ` (código: ${recoveryErrorCode})` : ''}`
                : 'Solicite um novo link de recuperação de senha para continuar.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="w-full py-2.5 rounded-lg bg-[#527D91] text-white text-xs font-semibold hover:brightness-95 transition-all shadow-xs cursor-pointer"
            >
              Solicitar Novo Link
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="w-full mb-4 p-3 rounded-lg bg-[#D14747]/10 border border-[#D14747]/30 text-[#FFA8A8] text-xs sm:text-sm text-center">
            {errorMessage}
          </div>
        )}

        {infoMessage && (
          <div className="w-full mb-4 p-3 rounded-lg bg-[#EFA339]/10 border border-[#EFA339]/30 text-[#F5C26B] text-xs sm:text-sm text-center">
            {infoMessage}
          </div>
        )}

        <div className="mt-6 pt-4 w-full flex items-center justify-center text-center border-t border-[#526673]">
          <p className="font-body-md text-body-sm text-[#E1E8EC]/80">
            Já defini a nova senha?{' '}
            <Link to="/login" className="font-semibold text-[#D0B783] hover:underline">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
