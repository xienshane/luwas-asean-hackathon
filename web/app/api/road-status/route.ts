import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Phase 4.5: coordinator block/restore of a road edge. Blocking raises the edge's
// cost (set_edge_impassable) so the next pipeline cycle reroutes around it; restoring
// puts the original cost back. The action is attributed to the signed-in coordinator
// (p_actor) and logged via road_edges.blocked_by/blocked_at/block_reason. The client
// triggers /api/pipeline afterwards to regenerate routes (reuse decision, DevPlan 4.5).
export async function POST(request: Request) {
  // AuthZ: only a signed-in coordinator may alter the routing graph.
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: isCoord } = await ssr.rpc('is_coordinator');
  if (!isCoord) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const edgeId = Number(body?.edgeId);
  const impassable = body?.impassable === true;
  if (!Number.isInteger(edgeId)) {
    return Response.json({ error: 'edgeId must be an integer' }, { status: 400 });
  }
  const reason: string = typeof body?.reason === 'string' && body.reason.trim()
    ? body.reason.trim()
    : (impassable ? 'coordinator block' : '');

  const admin = createAdminClient();
  const { error } = await admin.rpc('set_edge_impassable', {
    p_edge_id: edgeId,
    p_impassable: impassable,
    p_report_id: null,
    p_actor: user.id,
    p_reason: reason || null,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, edgeId, impassable });
}
