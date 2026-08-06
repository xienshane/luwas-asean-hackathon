import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchUserRole } from '@/lib/auth/roles';
import CommandDashboard from '@/components/coordinator/CommandDashboard';


export const metadata = {
  title: 'LUWAS - Coordinator Command Center',
  description: 'AI-assisted post-disaster logistics and priority scoring dashboard.',
};

export default async function CoordinzatorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route security gate: Redirect unauthenticated requests to login
  if (!user) {
    redirect('/login?redirectedFrom=/coordinator');
  }

  // Defense in depth: only coordinators may view the command center. A volunteer
  // who reaches this URL is sent to their own area, never shown the dashboard.
  const role = await fetchUserRole(supabase, user.id);
  if (role !== 'coordinator') {
    redirect('/volunteer');
  }

  // Read the demo-console flag here, on the server, at request time — the same
  // source and the same moment as /api/preflight. Reading it inside the client
  // component would inline it at build time, letting preflight report a green
  // console that was compiled out of the bundle.
  return <CommandDashboard demoConsole={process.env.NEXT_PUBLIC_DEMO_CONSOLE === 'true'} />;
}
