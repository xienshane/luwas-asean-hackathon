import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Coordinator dispatch: build a real-road route from the supply hub to the barangay for the
// chosen team and promote it to active. Block-aware (pgRouting). Service-role writes; only a
// signed-in coordinator may dispatch.
export async function POST(request: Request) {
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: isCoord } = await ssr.rpc('is_coordinator');
  if (!isCoord) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const teamId: string | undefined = body?.teamId;
  const barangayId: string | undefined = body?.barangayId;
  if (!teamId || !barangayId) {
    return Response.json({ error: 'teamId and barangayId are required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: routeId, error } = await admin.rpc('dispatch_route', {
    p_team_id: teamId, p_barangay_id: barangayId,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, routeId });
}
