import { signup } from '../login/actions'
import Link from 'next/link'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="relative min-h-dvh bg-slate-950 flex items-center justify-center overflow-hidden">

      {/* ── Background grid texture ── */}
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
          background: 'radial-gradient(ellipse 60% 50% at 50% 60%, rgba(13,92,86,0.18) 0%, transparent 70%)',
        }}
      />

      {/* ── Corner brackets ── */}
      <div className="pointer-events-none absolute top-6 left-6 w-8 h-8 border-t border-l border-teal-800/50" />
      <div className="pointer-events-none absolute top-6 right-6 w-8 h-8 border-t border-r border-teal-800/50" />
      <div className="pointer-events-none absolute bottom-6 left-6 w-8 h-8 border-b border-l border-teal-800/50" />
      <div className="pointer-events-none absolute bottom-6 right-6 w-8 h-8 border-b border-r border-teal-800/50" />

      {/* ── Card ── */}
      <div className="relative w-full max-w-[360px] mx-6">

        {/* Top accent bar */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-teal-500/60 to-transparent mb-6" />

        {/* Back + Logo */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 hover:text-teal-400 transition-colors uppercase tracking-widest group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform">
              <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
            </svg>
            Back
          </Link>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LUWAS_logo.png" alt="LUWAS" className="h-6 w-6 object-contain opacity-80" />
            <span className="font-mono font-bold text-sm tracking-[0.2em] text-slate-300">LUWAS</span>
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-[15px] font-semibold tracking-tight text-slate-200 mb-5">
          Create an account
        </h1>

        {/* Form */}
        <form action={signup} className="flex flex-col gap-3">

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase text-slate-500">Full Name</span>
            <input
              name="fullName" type="text" required autoComplete="name"
              placeholder="Juan dela Cruz"
              className="rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-200 font-mono placeholder:text-slate-700 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600/30 transition-colors"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase text-slate-500">Email</span>
            <input
              name="email" type="email" required autoComplete="email"
              placeholder="you@agency.gov.ph"
              className="rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-200 font-mono placeholder:text-slate-700 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600/30 transition-colors"
            />
          </label>

          {/* Password row — side by side */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase text-slate-500">Password</span>
              <input
                name="password" type="password" required autoComplete="new-password"
                placeholder="••••••••"
                className="rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-200 font-mono placeholder:text-slate-700 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600/30 transition-colors"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase text-slate-500">Confirm</span>
              <input
                name="confirmPassword" type="password" required autoComplete="new-password"
                placeholder="••••••••"
                className="rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-200 font-mono placeholder:text-slate-700 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600/30 transition-colors"
              />
            </label>
          </div>

          {error ? (
            <div role="alert" className="flex items-center gap-2 rounded bg-red-950/50 border border-red-900/60 px-3 py-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 shrink-0">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <p className="text-[11px] font-mono text-red-400">{error}</p>
            </div>
          ) : null}

          <button
            type="submit"
            className="mt-1 w-full rounded bg-teal-700 hover:bg-teal-600 border border-teal-600/50 hover:border-teal-500 px-4 py-2.5 text-[12px] font-mono font-semibold tracking-[0.1em] uppercase text-teal-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          >
            Request Access →
          </button>
        </form>

        <p className="mt-4 text-center text-[10px] font-mono text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="text-teal-600 hover:text-teal-400 transition-colors">
            Sign in
          </Link>
        </p>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-teal-900/60 to-transparent mt-5" />
      </div>
    </main>
  )
}