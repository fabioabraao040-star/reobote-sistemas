import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  const roles = [
    {
      key: 'master_admin',
      label: 'ADM MASTER',
      description: 'Configuração global Meta WhatsApp, diagnóstico de integração e gestão técnica.',
      icon: 'security',
      color: '#D0B783',
      bg: 'bg-[#D0B783]/10',
      border: 'border-[#D0B783]/40',
      hoverBg: 'bg-[#D0B783]/20',
      gradient: 'linear-gradient(135deg, #D0B783 0%, #B8A070 50%, #D0B783 100%)',
      route: '/login?role=master_admin',
    },
    {
      key: 'admin',
      label: 'ADM',
      description: 'Gestão de atendentes, filas, relatórios e operações da empresa.',
      icon: 'admin_panel_settings',
      color: '#527D91',
      bg: 'bg-[#527D91]/10',
      border: 'border-[#527D91]/40',
      hoverBg: 'bg-[#527D91]/20',
      gradient: 'linear-gradient(135deg, #527D91 0%, #3A5F73 50%, #6BA3C8 100%)',
      route: '/login?role=admin',
    },
    {
      key: 'user',
      label: 'USUÁRIO / ATENDENTE',
      description: 'Caixa de entrada, atendimento WhatsApp e funções operacionais.',
      icon: 'headset_mic',
      color: '#39AC6B',
      bg: 'bg-[#39AC6B]/10',
      border: 'border-[#39AC6B]/40',
      hoverBg: 'bg-[#39AC6B]/20',
      gradient: 'linear-gradient(135deg, #39AC6B 0%, #2F8F58 50%, #45C47E 100%)',
      route: '/login?role=user',
    },
  ];

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-[#263744] font-body-md text-[#E1E8EC] selection:bg-[#527D91]/30 selection:text-[#E1E8EC]">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(208,183,131,0.10),_transparent_55%)]" />
        <div className="absolute -top-44 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#527D91]/10 blur-[140px] sm:h-[42rem] sm:w-[42rem]" />
        <div className="absolute bottom-0 left-1/2 h-[20rem] w-[42rem] -translate-x-1/2 rounded-full bg-[#39AC6B]/20 blur-[120px]" />

        {/* Subtle structural grid */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(208, 183, 131, 0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(208, 183, 131, 0.35) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse at center, black 15%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 15%, transparent 72%)',
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-b from-[#263744]/10 via-[#263744]/40 to-[#263744]" />
      </div>

      <header className="relative z-20 border-b border-[#526673]/50 bg-[#263744]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D0B783] text-[#263744] shadow-[0_6px_18px_rgba(208,183,131,0.30)]"
            >
              <span className="material-symbols-outlined text-[24px]">headset_mic</span>
            </div>
            <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#E1E8EC] sm:text-sm">
              REOBOTE SISTEMAS
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-12 sm:px-8 sm:py-16">
        <section aria-labelledby="hero-title" className="relative w-full max-w-5xl">
          <div
            aria-hidden="true"
            className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[#527D91]/30 via-white/5 to-transparent opacity-70 blur-[1px]"
          />

          <div className="relative overflow-hidden rounded-2xl border border-[#526673]/30 bg-[#344956]/70 p-6 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] backdrop-blur-2xl sm:p-10">
            <div
              aria-hidden="true"
              className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#D0B783]/80 to-transparent"
            />

            <div className="flex flex-col items-center text-center mb-8">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#D0B783]/40 bg-[#263744] px-3.5 py-1.5">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[#D0B783] shadow-[0_0_8px_rgba(208,183,131,0.8)]"
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D0B783] sm:text-[11px]">
                  PLATAFORMA INTELIGENTE
                </span>
              </span>

              <h1
                className="mt-6 bg-gradient-to-r from-[#E1E8EC] via-[#E1E8EC] to-[#D0B783] bg-clip-text text-[1.5rem] font-semibold leading-[1.08] tracking-tight text-transparent min-[380px]:text-[1.75rem] sm:text-5xl"
                id="hero-title"
              >
                REOBOTE SISTEMAS
              </h1>

              <p className="mt-3 text-base font-medium text-[#D0B783] sm:text-lg">
                Plataforma Inteligente
              </p>

              <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#B4C5CE] sm:text-base">
                Acesso seguro à plataforma institucional.
              </p>
            </div>

            <div
              aria-hidden="true"
              className="my-7 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            {/* Three Role Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {roles.map((role) => (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => navigate(role.route)}
                  className={`group relative flex flex-col items-stretch h-full rounded-2xl border p-6 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#263744] ${
                    role.border
                  } ${role.bg} ${role.hoverBg}`}
                  style={{
                    background: role.gradient,
                    backgroundSize: '200% 200%',
                    backgroundPosition: '0% 50%',
                    boxShadow: `
                      0 0 0 1px ${role.color}66,
                      0 8px 32px -8px ${role.color}80,
                      inset 0 1px 0 rgba(255,255,255,0.08)
                    `,
                    animation: 'neon-shimmer 4s ease-in-out infinite',
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl text-white"
                      style={{ background: role.gradient, backgroundSize: '200% 200%', backgroundPosition: '0% 50%' }}
                    >
                      <span className="material-symbols-outlined text-[24px]">{role.icon}</span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="absolute top-4 right-4 h-6 w-6 rounded-full opacity-30 transition-opacity duration-300 group-hover:opacity-100"
                      style={{ backgroundColor: role.color }}
                    />
                  </div>

                  <h3 className="text-lg font-bold text-[#E1E8EC] tracking-tight mb-2">
                    {role.label}
                  </h3>

                  <p className="text-sm text-[#B4C5CE] flex-1 mb-6 leading-relaxed">
                    {role.description}
                  </p>

                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-white/90">
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      <span>Acessar</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/10 group-hover:text-white/20 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                    </span>
                  </div>
                </button>
              ))}

              </div>
          </div>
        </section>
      </main>

      <footer className="relative z-20 border-t border-[#526673]/50 bg-[#263744]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-5 py-5 sm:px-8">
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#D0B783]/70" />
          <p className="text-center text-[11px] text-[#B4C5CE] sm:text-xs">
            Acesso restrito a usuários autorizados. Selecione seu perfil para autenticação.
          </p>
        </div>
      </footer>
    </div>
  );
}