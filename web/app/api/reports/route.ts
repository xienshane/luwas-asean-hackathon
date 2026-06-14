import { createClient } from '@/lib/supabase/server';
import { isOfflineSynced } from '@/lib/reports/offline';
import { validateReportSubmission } from '@/lib/reports/validate';

// Volunteer report intake. Same-origin + cookie auth so the service worker can
// queue the POST offline and replay it later with fresh session cookies.
// Upsert on the client-generated id makes replays idempotent (last write wins).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = validateReportSubmission(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const r = parsed.value;

  // No GPS fix -> pin the report at the barangay centroid so it always maps.
  let lat = r.lat;
  let lng = r.lng;
  if (lat === null || lng === null) {
    const { data: brgy } = await supabase
      .from('barangay_directory')
      .select('lat, lng')
      .eq('id', r.barangay_id)
      .maybeSingle();
    if (!brgy) {
      return Response.json({ error: 'unknown barangay' }, { status: 400 });
    }
    lat = brgy.lat;
    lng = brgy.lng;
  }

  const offline_synced = isOfflineSynced(r.captured_at, new Date());
  const { error } = await supabase.from('field_reports').upsert(
    {
      id: r.id,
      reporter_id: user.id,
      source: 'app',
      barangay_id: r.barangay_id,
      raw_text: r.raw_text,
      location: `SRID=4326;POINT(${lng} ${lat})`,
      population_estimate: r.population_estimate,
      needs_severity: r.needs_severity,
      road_status: r.road_status,
      road_impassable: r.road_impassable,
      confidence: 1,
      status: 'pending',
      captured_at: r.captured_at,
      offline_synced,
    },
    { onConflict: 'id' },
  );
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ id: r.id, offline_synced }, { status: 201 });
}
