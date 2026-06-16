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
  const impassable = body?.impassable === true;
  const reason: string = typeof body?.reason === 'string' && body.reason.trim()
    ? body.reason.trim()
    : (impassable ? 'coordinator block' : '');

  const admin = createAdminClient();

  // Resolve the target edge: an explicit id, or snap a clicked {lat,lng} to the nearest
  // road edge (coordinator "Block road" map mode).
  let edgeId = Number(body?.edgeId);
  if (!Number.isInteger(edgeId)) {
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: 'provide edgeId or lat/lng' }, { status: 400 });
    }
    const { data: snapped, error: snapErr } = await admin.rpc('nearest_road_edge_at', { p_lat: lat, p_lng: lng });
    if (snapErr) return Response.json({ error: snapErr.message }, { status: 500 });
    if (snapped == null) return Response.json({ error: 'no road edge near that point' }, { status: 404 });
    edgeId = Number(snapped);
  }

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
