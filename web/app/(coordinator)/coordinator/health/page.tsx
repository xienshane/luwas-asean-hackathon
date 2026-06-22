import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'

export default async function CoordinatorHealthPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Secure per-page check (the proxy also redirects optimistically).
  if (!user) {
    redirect('/login?redirectedFrom=/coordinator/health')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-8">
      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
        ● Coordinator area — healthy
      </span>
      <h1 className="text-2xl font-semibold">LUWAS Coordinator</h1>
      <p className="text-zinc-600">
        Signed in as <span className="font-medium">{user.email}</span>.
      </p>
      <form action={signOut}>
        <button
          type="submit"
          className="w-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          Sign out
        </button>
      </form>
    </main>
  )
}
