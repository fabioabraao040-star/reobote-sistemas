import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Cadastro() {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const { register } = useAuth();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Por favor, informe seu nome completo.');
      return;
    }

    if (!companyName.trim()) {
      setErrorMessage('Por favor, informe o nome da sua empresa.');
      return;
    }

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Por favor, insira um e-mail corporativo válido.');
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
        navigate('/');
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao cadastrar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#E8EDF3]">
      <div className="w-full max-w-[480px] bg-white rounded-xl shadow-xl p-6 sm:p-9 flex flex-col items-center relative overflow-hidden transition-all duration-300">
        
        {/* Identidade Visual */}
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

        {/* Título */}
        <div className="w-full text-center mb-5">
          <h1 className="font-headline-lg text-headline-lg font-bold mb-1 text-[#34445C] tracking-tight">
            Criar Conta Corporativa
          </h1>
          <p className="font-body-md text-body-md text-[#34445C]/80 leading-snug">
            Configure seu ambiente de atendimento oficial no WhatsApp
          </p>
        </div>

        {/* Feedback de Sucesso */}
        {success ? (
          <div className="w-full p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-center animate-fadeIn">
            <span className="material-symbols-outlined text-[36px] text-emerald-600 mb-2">
              check_circle
            </span>
            <h3 className="font-bold text-sm text-emerald-900 mb-1">Conta criada com sucesso!</h3>
            <p className="text-xs text-emerald-700">
              Redirecionando para o seu novo painel de controle...
            </p>
          </div>
        ) : (
          <>
            {/* Erro de Validação */}
            {errorMessage && (
              <div 
                role="alert"
                className="w-full mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2"
              >
                <span className="material-symbols-outlined text-[18px] text-red-600 flex-shrink-0 mt-0.5">
                  error
                </span>
                <span className="leading-snug flex-1 font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Formulário */}
            <form onSubmit={handleRegister} className="w-full flex flex-col gap-3 text-left">
              <div>
                <label className="font-label-md text-xs font-semibold text-[#34445C] block mb-1">
                  Seu Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Lucas Nogueira"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8E0EA] text-xs text-[#34445C] outline-none focus:border-[#C5A15B] focus:ring-2 focus:ring-[#C5A15B]/20"
                />
              </div>

              <div>
                <label className="font-label-md text-xs font-semibold text-[#34445C] block mb-1">
                  Nome da Empresa / Unidade *
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex.: Distribuidora Central Ltda."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8E0EA] text-xs text-[#34445C] outline-none focus:border-[#C5A15B] focus:ring-2 focus:ring-[#C5A15B]/20"
                />
              </div>

              <div>
                <label className="font-label-md text-xs font-semibold text-[#34445C] block mb-1">
                  E-mail Corporativo *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.nome@empresa.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8E0EA] text-xs text-[#34445C] outline-none focus:border-[#C5A15B] focus:ring-2 focus:ring-[#C5A15B]/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-label-md text-xs font-semibold text-[#34445C] block mb-1">
                    Senha (mínimo 6 dígitos) *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8E0EA] text-xs text-[#34445C] outline-none focus:border-[#C5A15B] focus:ring-2 focus:ring-[#C5A15B]/20"
                  />
                </div>

                <div>
                  <label className="font-label-md text-xs font-semibold text-[#34445C] block mb-1">
                    Confirmar Senha *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8E0EA] text-xs text-[#34445C] outline-none focus:border-[#C5A15B] focus:ring-2 focus:ring-[#C5A15B]/20"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="showPasswordCheck"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="rounded text-[#C5A15B] focus:ring-[#C5A15B] cursor-pointer"
                />
                <label htmlFor="showPasswordCheck" className="text-xs text-[#5B6E87] cursor-pointer">
                  Visualizar caracteres da senha
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 rounded-lg font-semibold text-xs text-white bg-[#C5A15B] hover:brightness-95 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Cadastrando...' : 'Concluir Cadastro e Acessar'}
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </form>
          </>
        )}

        {/* Rodapé */}
        <div className="mt-6 pt-4 w-full flex items-center justify-center text-center border-t border-[#D8E0EA]">
          <p className="font-body-md text-xs text-[#34445C]">
            Já tem uma conta cadastrada?{' '}
            <Link to="/" className="font-semibold text-[#C5A15B] hover:underline">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
