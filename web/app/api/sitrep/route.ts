import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildSitRep, type ManifestRow, type PredictionRow, type RouteRow, type ScoreRow,
} from '@/lib/sitrep/build';

// One operation as a situation report shaped for the ADINet situation-update fields.
// Nothing is transmitted; this is a read model the coordinator prints.
export const dynamic = 'force-dynamic';

const SILENT_HOURS = 24;
const SILENT_SAMPLE = 20;
// PostgREST OR filter: never contacted counts as maximum silence, so null is included.
const SILENT_FILTER = `hours_since_contact.is.null,hours_since_contact.gt.${SILENT_HOURS}`;

export async function GET() {
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: isCoord } = await ssr.rpc('is_coordinator');
  if (!isCoord) return Response.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();

  // The operation is exactly the set of barangays with a prediction, so that query gates
  // every other one — the score view holds ~1,200 rows and must never be fetched whole here.
  const { data: predictionRows, error: pErr } = await admin
    .from('impact_predictions')
    .select('barangay_id, predicted_affected, reported_affected, override_value, damage_severity');
  if (pErr) return Response.json({ error: `predictions: ${pErr.message}` }, { status: 500 });
  const predictions = (predictionRows ?? []) as PredictionRow[];
  const ids = predictions.map((p) => p.barangay_id);

  const [scores, manifests, routes, teams, silent, silentCount, firstReport] = await Promise.all([
    admin.from('coordinator_barangay_scores')
      .select('id, name, city_municipality, score, hours_since_contact').in('id', ids),
    admin.from('supply_manifests')
      .select('barangay_id, days, water_l, food_packs, shelter_kits, blankets, breakdown, status')
      .in('barangay_id', ids),
    admin.from('routes').select('id, status, team_id, stops, created_at'),
    admin.from('coordinator_teams').select('id, name'),
    admin.from('coordinator_barangay_scores').select('id, name, hours_since_contact')
      .or(SILENT_FILTER).order('score', { ascending: false }).limit(SILENT_SAMPLE),
    admin.from('coordinator_barangay_scores').select('id', { count: 'exact', head: true }).or(SILENT_FILTER),
    admin.from('field_reports').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle(),
  ]);

  const teamNames = Object.fromEntries(
    ((teams.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );

  return Response.json(buildSitRep({
    generatedAt: new Date().toISOString(),
    operationStart: (firstReport.data as { created_at: string } | null)?.created_at ?? null,
    scores: (scores.data ?? []) as ScoreRow[],
    predictions,
    manifests: (manifests.data ?? []) as unknown as ManifestRow[],
    routes: (routes.data ?? []) as unknown as RouteRow[],
    teamNames,
    silent: (silent.data ?? []) as { id: string; name: string; hours_since_contact: number | null }[],
    silentCount: silentCount.count ?? 0,
  }));
}
