import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">LUWAS</h1>
        <p className="mt-2 text-zinc-600">
          Post-disaster logistics coordination for NGO responders. Pilot region:
          Cebu, Philippines.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/coordinator"
          className="rounded-md bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-zinc-800"
        >
          Coordinator area
        </Link>
        <Link
          href="/volunteer/health"
          className="rounded-md border border-zinc-300 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-50"
        >
          Volunteer area
        </Link>
        <Link
          href="/login"
          className="text-center text-sm font-medium text-zinc-600 underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </div>
    </main>
  )
}
