import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchUserRole } from '@/lib/auth/roles';
import SitRepView from '@/components/sitrep/SitRepView';

export const metadata = { title: 'LUWAS — Situation report' };

export default async function SitRepPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectedFrom=/coordinator/sitrep');

  const role = await fetchUserRole(supabase, user.id);
  if (role !== 'coordinator') redirect('/volunteer');

  return <SitRepView />;
}
