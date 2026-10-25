import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-background font-body-md text-on-surface selection:bg-primary/30 selection:text-on-surface">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(208,183,131,0.10),_transparent_55%)]" />
        <div className="absolute -top-44 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px] sm:h-[42rem] sm:w-[42rem]" />
        <div className="absolute bottom-0 left-1/2 h-[20rem] w-[42rem] -translate-x-1/2 rounded-full bg-secondary-container/20 blur-[120px]" />

        {/* Subtle structural grid */}
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(208, 183, 131, 0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(208, 183, 131, 0.35) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse at center, black 15%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 15%, transparent 72%)',
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/40 to-background" />
      </div>

      <header className="relative z-20 border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D0B783] text-[#263744] shadow-[0_6px_18px_rgba(208,183,131,0.30)]"
            >
              <span className="material-symbols-outlined text-[24px]">headset_mic</span>
            </div>
            <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-on-surface sm:text-sm">
              REOBOTE SISTEMAS
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-12 sm:px-8 sm:py-16">
        <section aria-labelledby="hero-title" className="relative w-full max-w-xl">
          <div
            aria-hidden="true"
            className="absolute -inset-px rounded-2xl bg-gradient-to-b from-primary/30 via-white/5 to-transparent opacity-70 blur-[1px]"
          />

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface/70 p-6 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] backdrop-blur-2xl sm:p-10">
            <div
              aria-hidden="true"
              className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent"
            />

            <div className="flex flex-col items-center text-center">
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

              <p className="mt-4 max-w-sm text-sm leading-relaxed text-on-surface-variant sm:text-base">
                Acesso seguro à plataforma institucional.
              </p>
            </div>

            <div
              aria-hidden="true"
              className="my-7 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            <button
              className="group flex w-full items-center justify-between gap-3 rounded-xl bg-primary px-3 py-3 text-left text-[13px] font-semibold text-on-primary shadow-[0_12px_32px_-12px_rgba(82,125,145,0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-fixed hover:shadow-[0_16px_36px_-12px_rgba(82,125,145,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0 sm:gap-4 sm:px-5 sm:py-3.5 sm:text-sm"
              onClick={() => navigate('/login')}
              type="button"
            >
              <span className="flex items-center gap-2.5 sm:gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-on-primary/10 sm:h-9 sm:w-9">
                  <span className="material-symbols-outlined text-[20px]">login</span>
                </span>
                <span className="whitespace-nowrap">Entrar no Sistema</span>
              </span>
              <span className="material-symbols-outlined text-[18px] transition-transform duration-300 group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </button>
          </div>
        </section>
      </main>

      <footer className="relative z-20 border-t border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-5 py-5 sm:px-8">
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#D0B783]/70" />
          <p className="text-center text-[11px] text-on-surface-variant sm:text-xs">
            Acesso restrito a usuários autorizados.
          </p>
        </div>
      </footer>
    </div>
  );
}
