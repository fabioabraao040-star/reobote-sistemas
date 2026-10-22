import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Cadastro() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const { register } = useAuth();

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Por favor, informe seu nome completo.');
      return;
    }

    if (!email.trim()) {
      setErrorMessage('Por favor, informe seu endereço de e-mail.');
      return;
    }

    if (!validateEmail(email.trim())) {
      setErrorMessage('Por favor, insira um e-mail válido (exemplo: seu.nome@empresa.com).');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('As senhas informadas não coincidem.');
      return;
    }

    setSubmitting(true);

    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        companyId: '',
      });
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao cadastrar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#101D2D]">
      <div className="w-full max-w-[480px] bg-[#17374A] rounded-xl shadow-xl p-6 sm:p-9 flex flex-col items-center relative overflow-hidden transition-all duration-300">

        {/* Identidade Visual */}
        <div className="w-full flex items-center justify-center gap-3 mb-5 select-none">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#F5F2EA] shadow-sm flex-shrink-0 bg-[#C9AE69]"
            aria-hidden="true"
          >
            <span className="material-symbols-outlined text-[24px]">headset_mic</span>
          </div>
          <div className="flex flex-col text-left">
            <span className="font-display-md text-headline-md tracking-wider uppercase font-bold text-[#F5F2EA] leading-tight">
              REOBOTE
            </span>
            <span className="font-label-sm text-[10px] tracking-widest uppercase font-semibold text-[#F5F2EA]/75 leading-tight">
              Sistema de Atendimento
            </span>
          </div>
        </div>

        {/* Título */}
        <div className="w-full text-center mb-5">
          <h1 className="font-headline-lg text-headline-lg font-bold mb-1 text-[#F5F2EA] tracking-tight">
            Criar Conta
          </h1>
          <p className="font-body-md text-body-md text-[#F5F2EA]/80 leading-snug">
            Preencha os dados abaixo para criar sua conta.
          </p>
        </div>

        {/* Feedback de Sucesso */}
        {success ? (
          <div className="w-full p-4 rounded-lg bg-[#39AC6B]/10 border border-[#39AC6B]/30 text-center animate-fadeIn">
            <span className="material-symbols-outlined text-[36px] text-[#39AC6B] mb-2">
              check_circle
            </span>
            <h3 className="font-bold text-sm text-[#39AC6B]/90 mb-1">Conta criada com sucesso!</h3>
            <p className="text-xs text-[#39AC6B]">
              Redirecionando para o login...
            </p>
          </div>
        ) : (
          <>
            {/* Erro de Validação */}
            {errorMessage && (
              <div
                role="alert"
                className="w-full mb-4 p-3 rounded-lg bg-[#D14747]/10 border border-[#D14747]/30 text-[#D14747]/90 text-xs flex items-start gap-2"
              >
                <span className="material-symbols-outlined text-[18px] text-[#D14747] flex-shrink-0 mt-0.5">
                  error
                </span>
                <span className="leading-snug flex-1 font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Formulário */}
            <form onSubmit={handleRegister} className="w-full flex flex-col gap-3 text-left">
              <div>
                <label className="font-label-md text-xs font-semibold text-[#F5F2EA] block mb-1">
                  Seu Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Lucas Nogueira"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#2B3D50] text-xs text-[#F5F2EA] outline-none focus:border-[#C9AE69] focus:ring-2 focus:ring-[#C9AE69]/20"
                />
              </div>

              <div>
                <label className="font-label-md text-xs font-semibold text-[#F5F2EA] block mb-1">
                  E-mail Corporativo *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.nome@empresa.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#2B3D50] text-xs text-[#F5F2EA] outline-none focus:border-[#C9AE69] focus:ring-2 focus:ring-[#C9AE69]/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-label-md text-xs font-semibold text-[#F5F2EA] block mb-1">
                    Senha (mínimo 6 dígitos) *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#2B3D50] text-xs text-[#F5F2EA] outline-none focus:border-[#C9AE69] focus:ring-2 focus:ring-[#C9AE69]/20"
                  />
                </div>

                <div>
                  <label className="font-label-md text-xs font-semibold text-[#F5F2EA] block mb-1">
                    Confirmar Senha *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#2B3D50] text-xs text-[#F5F2EA] outline-none focus:border-[#C9AE69] focus:ring-2 focus:ring-[#C9AE69]/20"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="showPasswordCheck"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="rounded text-[#C9AE69] focus:ring-[#C9AE69] cursor-pointer"
                />
                <label htmlFor="showPasswordCheck" className="text-xs text-[#A0B0BA] cursor-pointer">
                  Visualizar caracteres da senha
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 rounded-lg font-semibold text-xs text-[#F5F2EA] bg-[#C9AE69] hover:brightness-95 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Cadastrando...' : 'Criar Conta'}
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </form>
          </>
        )}

        {/* Rodapé */}
        <div className="mt-6 pt-4 w-full flex items-center justify-center text-center border-t border-[#2B3D50]">
          <p className="font-body-md text-xs text-[#F5F2EA]">
            Já tem uma conta cadastrada?{' '}
            <Link to="/login" className="font-semibold text-[#C9AE69] hover:underline">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
