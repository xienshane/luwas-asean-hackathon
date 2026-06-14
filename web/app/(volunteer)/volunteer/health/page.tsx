import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'

export default async function VolunteerHealthPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Secure per-page check (the proxy also redirects optimistically).
  if (!user) {
    redirect('/login?redirectedFrom=/volunteer/health')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-8">
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-active/30 bg-active/15 px-3 py-1 text-[12px] font-mono font-medium uppercase tracking-[0.1em] text-active">
        <span className="h-1.5 w-1.5 rounded-full bg-active" /> Volunteer area — healthy
      </span>
      <h1 className="font-mono text-2xl font-bold tracking-[0.15em] text-fg">LUWAS Volunteer</h1>
      <p className="text-muted">
        Signed in as <span className="font-medium text-fg">{user.email}</span>.
      </p>
      <form action={signOut}>
        <button
          type="submit"
          className="min-h-[44px] w-fit rounded-control border border-line px-4 text-[13px] font-medium text-muted transition-colors hover:text-fg hover:bg-raised"
        >
          Sign out
        </button>
      </form>
    </main>
  )
}
