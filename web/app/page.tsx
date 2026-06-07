import Link from 'next/link'

export default function Home() {
  return (
    <main className="relative min-h-dvh bg-slate-950 flex items-center justify-center overflow-hidden">

      {/* ── Background grid ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #2dd4bf 1px, transparent 1px),
            linear-gradient(to bottom, #2dd4bf 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* ── Radial glow ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 70% 55% at 50% 55%, rgba(13,92,86,0.22) 0%, transparent 70%)',
        }}
      />

      {/* ── Scanning line animation ── */}
      <div
        className="pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent"
        style={{ animation: 'scanline 6s linear infinite' }}
      />
      <style>{`
        @keyframes scanline {
          0%   { top: 0%; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>

      {/* ── Corner brackets ── */}
      <div className="pointer-events-none absolute top-6 left-6 w-10 h-10 border-t-2 border-l-2 border-teal-700/40" />
      <div className="pointer-events-none absolute top-6 right-6 w-10 h-10 border-t-2 border-r-2 border-teal-700/40" />
      <div className="pointer-events-none absolute bottom-6 left-6 w-10 h-10 border-b-2 border-l-2 border-teal-700/40" />
      <div className="pointer-events-none absolute bottom-6 right-6 w-10 h-10 border-b-2 border-r-2 border-teal-700/40" />

      {/* ── System status bar ── */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
      </div>

      {/* ── Main card ── */}
      <div className="relative w-full max-w-[380px] mx-6 flex flex-col items-center text-center">

        {/* Top accent */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-teal-500/60 to-transparent mb-10" />

        {/* Logo */}
        <div className="mb-6 relative">
          {/* Outer ring */}
          <div className="absolute inset-[-10px] rounded-full border border-teal-800/30" />
          <div className="absolute inset-[-18px] rounded-full border border-teal-900/20" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/LUWAS_logo.png"
            alt="LUWAS"
            className="h-16 w-16 object-contain relative z-10"
          />
        </div>

        {/* Wordmark */}
        <div className="mb-1">
          <h1 className="font-mono font-black text-4xl tracking-[0.35em] text-slate-100 leading-none">
            LUWAS
          </h1>
        </div>

        {/* Tag */}
        <div className="font-mono text-[9px] tracking-[0.25em] text-teal-600/80 uppercase mb-6">
          Emergency Operations Command
        </div>

        {/* Divider with label */}
        <div className="flex items-center gap-3 w-full mb-6">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">Cebu · Philippines</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Description */}
        <p className="text-[12px] text-slate-500 font-mono leading-relaxed mb-8 px-2">
          Post-disaster logistics coordination for<br />NGO responders and field teams.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col gap-2.5 w-full">

          {/* Coordinator — primary */}
          <Link
            href="/coordinator"
            className="w-full rounded bg-teal-700 hover:bg-teal-600 border border-teal-600/50 hover:border-teal-500 px-4 py-2.5 text-[12px] font-mono font-semibold tracking-[0.1em] uppercase text-teal-50 transition-colors text-center focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          >
            Coordinator Area →
          </Link>

          {/* Volunteer — secondary */}
          <Link
            href="/volunteer/health"
            className="w-full rounded bg-transparent border border-slate-700 hover:border-teal-700 px-4 py-2.5 text-[12px] font-mono font-semibold tracking-[0.1em] uppercase text-slate-400 hover:text-teal-400 transition-colors text-center focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            Volunteer Area
          </Link>

          {/* Divider */}
          <div className="flex items-center gap-3 my-0.5">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[9px] font-mono text-slate-700 uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* Sign in + Sign up row */}
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/login"
              className="rounded border border-slate-800 hover:border-slate-600 px-4 py-2 text-[11px] font-mono font-semibold tracking-[0.08em] uppercase text-slate-500 hover:text-slate-300 transition-colors text-center"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded border border-slate-800 hover:border-slate-600 px-4 py-2 text-[11px] font-mono font-semibold tracking-[0.08em] uppercase text-slate-500 hover:text-slate-300 transition-colors text-center"
            >
              Create account
            </Link>
          </div>
        </div>

        {/* Bottom accent */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-teal-900/60 to-transparent mt-8" />

        {/* Version */}
        <span className="mt-3 font-mono text-[9px] text-slate-700 tracking-wider">CIT-U Shane-nanigans</span>
      </div>
    </main>
  )
}