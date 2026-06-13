import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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

  return <CommandDashboard />;
}
