import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const btnStyle = {
  background:
    'linear-gradient(135deg, rgba(201, 174, 105, 0.12) 0%, rgba(13, 34, 50, 0.88) 25%, rgba(7, 20, 36, 0.95) 70%, rgba(201, 174, 105, 0.08) 100%)',
  backdropFilter: 'blur(16px)',
  border: '1px solid',
  borderColor:
    'rgba(255, 230, 160, 0.5) rgba(201, 174, 105, 0.45) rgba(201, 174, 105, 0.45)',
  boxShadow:
    'rgba(0, 0, 0, 0.7) 0px 12px 35px -8px, rgba(255, 240, 190, 0.35) 0px 1px 1px inset, rgba(0, 0, 0, 0.6) 0px -1px 2px inset, rgba(201, 174, 105, 0.18) 0px 0px 18px',
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleAdminAccess = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login?role=admin');
    }
  };

  const handleAttendantAccess = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login?role=user');
    }
  };

  return (
    <div className="bg-surface min-h-screen relative selection:bg-primary-container selection:text-on-primary-container font-body-md text-on-surface">
      {/* Radial gradient background */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-surface-container-high/20 via-transparent to-transparent" />

      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-16 max-w-7xl mx-auto px-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              alt="REOBOTE SISTEMAS Logo"
              className="h-8 w-auto object-contain"
              src="https://lh3.googleusercontent.com/aida/AEtjO1U7s_STP2A1AY2pPrXnqE3_0NXM4CSlRxJRcdW75h7NsyFbBGYVHvje441laS4i3XGRCc_V-6mADhlmpXZ6mbzhT2bja7kbySTPHMAiBCS5XGwyNd86KVMRuF1R7L3MjEd0fyMdvafkrvGxrYw1TcohSbuOM1ERJHOwH8pEKpZlhHeH-eyDVIrR08WR_Z1885c9l6uJNpW_q9T5-6FNd4yxC2JmC8z6fLfhrVNc_L9sHcQCcIivgvgVm1s"
            />
            <span className="font-headline-lg text-headline-lg text-primary tracking-tight font-semibold">
              REOBOTE SISTEMAS
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low shadow-[0_0_12px_rgba(201,174,105,0.08)]">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
              <span className="font-mono text-xs text-primary-fixed uppercase tracking-wider">
                ONLINE • ENCRIPTADO
              </span>
            </div>
            <nav className="flex items-center gap-4" data-active-classes="text-primary font-bold">
              <a
                aria-current="page"
                className="transition-colors text-primary font-bold"
                data-path="overview"
                href="#"
              >
                Visão Geral
              </a>
              <a
                className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors"
                data-path="security-telemetry"
                href="#"
              >
                Telemetria
              </a>
            </nav>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-[18px]">
                person
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 w-full pt-16 min-h-[calc(100vh-64px)]">
        <div className="flex flex-col w-full relative overflow-hidden py-10 sm:py-24 px-4 sm:px-6 items-center justify-center min-h-[calc(100vh-64px)]">
          {/* Decorative gradients */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[600px] h-[600px] sm:w-[850px] sm:h-[850px] bg-primary/10 rounded-full blur-[140px] opacity-40 mix-blend-screen" />
            <div className="w-[350px] h-[350px] sm:w-[500px] sm:h-[500px] bg-secondary-container/40 rounded-full blur-[90px] opacity-30" />
          </div>

          {/* Grid background */}
          <div className="absolute inset-0 pointer-events-none opacity-25">
            <svg className="w-full h-full" height="100%" width="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern height="64" id="grid-pattern" patternUnits="userSpaceOnUse" width="64">
                  <path className="text-primary-container/20" d="M 64 0 L 0 0 0 64" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  <circle className="text-primary/40" cx="64" cy="64" fill="currentColor" r="1" />
                </pattern>
                <linearGradient id="grid-fade" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="white" stopOpacity="0.8" />
                  <stop offset="60%" stopColor="white" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </linearGradient>
                <mask id="fade-mask">
                  <rect fill="url(#grid-fade)" height="100%" width="100%" />
                </mask>
              </defs>
              <rect fill="url(#grid-pattern)" height="100%" mask="url(#fade-mask)" width="100%" />
            </svg>
          </div>

          {/* Hero eagle image */}
          <div className="absolute inset-0 pointer-events-none flex items-start justify-center overflow-hidden z-0 pt-0 sm:pt-1">
            <img
              alt="Reobote Sistemas Águia Dourada Cyberpunk"
              className="w-full max-w-5xl h-auto object-contain opacity-70 mix-blend-screen pointer-events-none select-none transform scale-105 drop-shadow-[0_0_35px_rgba(201,174,105,0.25)]"
              src="https://lh3.googleusercontent.com/aida/AEtjO1Wf28i4NqGoFAUE1oB7wu_9mq7JOD8H99wntAIbxEcdra1RWcFJ_l6qdzkmX5XZqZBGZy9M0CNg7KhTj93oacN7glFtI_2XltqM6YJ09GrBQJFZeI8UoDXvmd5n3QL8wdaDGyqo7dKkxbMBNYTC2ve_bdFJtTtGrB51y1_fDuhThclmEW34wFteYg2PL5xtUgvm6kv4SduZhMz4TwxBf-RU3wJYzhzzzIjr7cvllsRRR-jepdD6jNXBtpE"
              style={{
                maskImage: 'radial-gradient(ellipse at center 42%, rgba(0,0,0,1) 45%, rgba(0,0,0,0) 80%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center 42%, rgba(0,0,0,1) 45%, rgba(0,0,0,0) 80%)',
                transform: 'translateY(-12%)',
              }}
            />
          </div>

          <div className="relative z-10 w-full max-w-5xl flex flex-col items-center">
            {/* Header content */}
            <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-8 sm:mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high/60 backdrop-blur-md shadow-sm mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-container shadow-[0_0_8px_currentColor]" />
                <span className="font-mono text-xs text-primary uppercase tracking-wider">
                  Terminal de Acesso Corporativo
                </span>
              </div>
              <h1 className="font-headline-xl sm:text-[46px] sm:leading-[52px] text-headline-xl uppercase tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary-fixed via-primary to-primary-container drop-shadow-sm mb-2">
                REOBOTE SISTEMAS
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-lg">
                Selecione o perfil de acesso para inicializar a sessão segura.
              </p>
            </div>

            {/* Access buttons */}
            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* ADMINISTRADOR */}
              <button className="group relative w-full text-left rounded-xl transition-all duration-300 ease-out transform hover:-translate-y-1 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/60 overflow-hidden p-4 sm:p-6 flex flex-col justify-between z-10" style={btnStyle} onClick={handleAdminAccess}>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-b from-[#293647] to-[#0f1c2c] p-[1px] shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_12px_rgba(201,174,105,0.25)] flex items-center justify-center group-hover:shadow-[0_0_20px_rgba(230,201,130,0.5)] transition-all duration-300">
                      <div className="w-full h-full rounded-xl bg-gradient-to-b from-[#17374A] to-[#0d1e2b] flex items-center justify-center border-t border-[#fee096]/50 shadow-inner">
                        <span className="material-symbols-outlined text-primary text-[28px] drop-shadow-[0_0_12px_rgba(230,201,130,0.7)]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          admin_panel_settings
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-primary uppercase px-2 py-0.5 rounded-full bg-[#132030]/90 border border-primary/40 shadow-[0_0_10px_rgba(201,174,105,0.15)] font-medium tracking-wider">
                      Nível Sênior
                    </span>
                  </div>
                  <div className="space-y-1 mb-4">
                    <span className="font-mono text-xs uppercase tracking-widest text-primary-container font-medium block drop-shadow-sm">
                      Privilégio Mestre
                    </span>
                    <h2 className="font-headline-md sm:text-[24px] font-semibold text-on-surface tracking-tight group-hover:text-primary transition-colors duration-200 drop-shadow-sm">
                      ADMINISTRADOR
                    </h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant pt-1 leading-relaxed">
                      Gestão global, parametrizações e controle operacional.
                    </p>
                  </div>
                </div>
                <div className="relative z-10 pt-2 border-t border-primary/20 flex items-center justify-between text-primary">
                  <span className="font-mono text-xs font-semibold tracking-wider uppercase group-hover:text-primary-fixed transition-colors">
                    Inicializar Painel
                  </span>
                  <div className="w-9 h-9 rounded-full bg-surface-container-low border border-primary/30 flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary group-hover:shadow-[0_0_16px_rgba(230,201,130,0.6)] transition-all duration-300 shadow-md">
                    <span className="material-symbols-outlined text-[18px] transform group-hover:translate-x-0.5 transition-transform">
                      arrow_forward
                    </span>
                  </div>
                </div>
              </button>

              {/* USUÁRIO / ATENDENTE */}
              <button className="group relative w-full text-left rounded-xl transition-all duration-300 ease-out transform hover:-translate-y-1 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/60 overflow-hidden p-4 sm:p-6 flex flex-col justify-between z-10" style={btnStyle} onClick={handleAttendantAccess}>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-b from-[#293647] to-[#0f1c2c] p-[1px] shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_12px_rgba(201,174,105,0.2)] flex items-center justify-center group-hover:shadow-[0_0_20px_rgba(230,201,130,0.5)] transition-all duration-300">
                      <div className="w-full h-full rounded-xl bg-gradient-to-b from-[#17374A] to-[#0d1e2b] flex items-center justify-center border-t border-[#fee096]/50 shadow-inner">
                        <span className="material-symbols-outlined text-primary text-[28px] drop-shadow-[0_0_12px_rgba(230,201,130,0.7)]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          headset_mic
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-secondary uppercase px-2 py-0.5 rounded-full bg-[#132030]/90 border border-secondary/40 shadow-[0_0_10px_rgba(171,202,226,0.15)] font-medium tracking-wider">
                      Operacional
                    </span>
                  </div>
                  <div className="space-y-1 mb-4">
                    <span className="font-mono text-xs uppercase tracking-widest text-secondary font-medium block drop-shadow-sm">
                      Fila de Trabalho
                    </span>
                    <h2 className="font-headline-md sm:text-[24px] font-semibold text-on-surface tracking-tight group-hover:text-primary transition-colors duration-200 drop-shadow-sm">
                      USUÁRIO / ATENDENTE
                    </h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant pt-1 leading-relaxed">
                      Acesso rápido ao fluxo de atendimento e operações diárias.
                    </p>
                  </div>
                </div>
                <div className="relative z-10 pt-2 border-t border-primary/20 flex items-center justify-between text-primary">
                  <span className="font-mono text-xs font-semibold tracking-wider uppercase group-hover:text-primary-fixed transition-colors">
                    Acessar Fila
                  </span>
                  <div className="w-9 h-9 rounded-full bg-surface-container-low border border-primary/30 flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary group-hover:shadow-[0_0_16px_rgba(230,201,130,0.6)] transition-all duration-300 shadow-md">
                    <span className="material-symbols-outlined text-[18px] transform group-hover:translate-x-0.5 transition-transform">
                      arrow_forward
                    </span>
                  </div>
                </div>
              </button>
            </div>

            {/* Security badges */}
            <div className="mt-6 sm:mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-center">
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-primary-container text-[18px]">verified_user</span>
                <span className="font-mono text-xs text-on-surface-variant uppercase tracking-wider">
                  Criptografia Ponta a Ponta Ativa
                </span>
              </div>
              <span className="text-outline-variant hidden sm:inline">•</span>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-secondary text-[18px]">lock</span>
                <span className="font-mono text-xs text-on-surface-variant uppercase tracking-wider">
                  Protocolo de Sessão Isolada
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 w-full bg-surface-container-lowest/80 backdrop-blur-md shadow-[0_-1px_8px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-col sm:flex-row items-center justify-between gap-1">
          <p className="font-body-sm text-body-sm text-on-surface-variant text-center sm:text-left">
            REOBOTE SISTEMAS © 2025 • Plataforma Corporativa Segura
          </p>
          <div className="flex items-center gap-4 font-mono text-xs text-on-surface-variant">
            <span className="text-primary-container">AES-256</span>
            <span className="">TLS 1.3</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
