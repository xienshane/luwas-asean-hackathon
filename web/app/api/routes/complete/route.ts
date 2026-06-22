import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Mark a dispatched route "reached": complete it and record real contact for the barangays it
// served, then rescore. silent_area_score() measures "time since contact" from confirmed
// field_reports (max(created_at) where status='confirmed') — there is no barangays.last_confirmed_contact
// column — so reaching an area is recorded by inserting a confirmed delivery-contact report,
// which makes the barangay leave its silent/critical state on the next score. Coordinator-gated;
// service-role writes.
export async function POST(request: Request) {
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: isCoord } = await ssr.rpc('is_coordinator');
  if (!isCoord) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const routeId: string | undefined = body?.routeId;
  if (!routeId) return Response.json({ error: 'routeId is required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: route, error: rErr } = await admin.from('routes').select('id, stops').eq('id', routeId).maybeSingle();
  if (rErr) return Response.json({ error: rErr.message }, { status: 500 });
  if (!route) return Response.json({ error: 'route not found' }, { status: 404 });

  const { error: upErr } = await admin.from('routes').update({ status: 'completed' }).eq('id', routeId);
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

  const stops = (route.stops ?? []) as { barangayId?: string }[];
  const barangayIds = [...new Set(stops.map((s) => s.barangayId).filter(Boolean))] as string[];
  if (barangayIds.length > 0) {
    // Confirmed delivery-contact reports = the "contact" silent_area_score() reads.
    await admin.from('field_reports').insert(
      barangayIds.map((id) => ({
        barangay_id: id,
        reporter_id: user.id,
        source: 'app' as const,
        status: 'confirmed' as const,
        raw_text: 'Area reached — relief delivered (coordinator confirmation).',
      })),
    );
    await admin.rpc('silent_area_score'); // reflect the new contact in the scores
  }
  return Response.json({ ok: true, completed: routeId, barangayIds });
}
