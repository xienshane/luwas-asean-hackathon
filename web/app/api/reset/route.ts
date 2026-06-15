import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Demo "Reset / Clear to scratch": clears all coordinator-/volunteer-generated
// operational data and everything derived from it, then restores blocked roads
// and rescore — without touching seed data or accounts. Coordinator-gated; the
// destructive work runs in a single service-role RPC (reset_operational_state).
export async function POST() {
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: isCoord } = await ssr.rpc('is_coordinator');
  if (!isCoord) return Response.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const { error } = await admin.rpc('reset_operational_state');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
