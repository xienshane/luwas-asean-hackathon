import { createClient } from '@/lib/supabase/server';

// Roads near a barangay for the volunteer blocked-road picker. Auth-gated (any signed-in user);
// returns a GeoJSON FeatureCollection with each feature id = road_edges.id (for feature-state
// highlight). Short cache — geometry is static within a session.
export async function GET(request: Request) {
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const barangayId = new URL(request.url).searchParams.get('barangayId');
  if (!barangayId) return Response.json({ error: 'barangayId is required' }, { status: 400 });

  const { data, error } = await ssr.rpc('barangay_road_edges', { p_barangay_id: barangayId });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const features = (data ?? []).map((e: { id: number; name: string | null; impassable: boolean; geometry: unknown }) => ({
    type: 'Feature' as const, id: e.id,
    properties: { id: e.id, name: e.name, impassable: e.impassable },
    geometry: e.geometry,
  }));
  return Response.json({ type: 'FeatureCollection', features }, {
    headers: { 'Cache-Control': 'private, max-age=120' },
  });
}
