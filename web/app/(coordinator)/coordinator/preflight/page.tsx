import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchUserRole } from '@/lib/auth/roles';
import PreflightPanel from '@/components/preflight/PreflightPanel';

export const metadata = { title: 'LUWAS — Stage preflight' };

export default async function PreflightPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectedFrom=/coordinator/preflight');

  const role = await fetchUserRole(supabase, user.id);
  if (role !== 'coordinator') redirect('/volunteer');

  return <PreflightPanel />;
}
