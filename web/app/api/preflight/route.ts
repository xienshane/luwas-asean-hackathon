import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseFieldReportText } from '@/lib/ai/parse';
import { evaluatePreflight, type AiHealth, type PreflightFacts } from '@/lib/preflight/checks';

// Stage readiness. Coordinator-gated because it reads operational tables and spends one
// SEA-LION free-tier call; never poll it.
export const dynamic = 'force-dynamic';

const PROBE_TEXT = 'LUWAS: grabe ang baha sa Guadalupe, mga 80 ka pamilya ang apektado';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function GET() {
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: isCoord } = await ssr.rpc('is_coordinator');
  if (!isCoord) return Response.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const base = process.env.AI_SERVICE_URL?.replace(/\/$/, '');

  const [health, probe, barangays, depots, teams] = await Promise.all([
    (async (): Promise<{ data: AiHealth | null; error: string | null }> => {
      if (!base) return { data: null, error: 'AI_SERVICE_URL is not set' };
      try {
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8_000) });
        if (!res.ok) return { data: null, error: `/health responded ${res.status}` };
        return { data: (await res.json()) as AiHealth, error: null };
      } catch (e) { return { data: null, error: message(e) }; }
    })(),
    (async () => {
      try {
        const r = await parseFieldReportText(PROBE_TEXT, 'preflight');
        return { data: { provider: r.provider as string, latencyMs: r.latency_ms }, error: null };
      } catch (e) { return { data: null, error: message(e) }; }
    })(),
    admin.from('barangays').select('id', { count: 'exact', head: true }),
    admin.from('coordinator_facilities').select('id', { count: 'exact', head: true }).eq('is_depot', true),
    admin.from('coordinator_teams').select('id', { count: 'exact', head: true }).not('capacity_kg', 'is', null),
  ]);

  const facts: PreflightFacts = {
    aiHealth: health.data,
    aiError: health.error,
    probe: probe.data,
    probeError: probe.error,
    barangayCount: barangays.count ?? null,
    dbError: barangays.error?.message ?? null,
    depotCount: depots.count ?? null,
    teamsWithCapacity: teams.count ?? null,
    smsMockEnabled: process.env.ENABLE_SMS_MOCK === 'true',
    smsSecretSet: Boolean(process.env.SMS_WEBHOOK_SECRET),
    demoConsoleEnabled: process.env.NEXT_PUBLIC_DEMO_CONSOLE === 'true',
  };

  const checks = evaluatePreflight(facts);
  return Response.json({
    generatedAt: new Date().toISOString(),
    allGreen: checks.every((c) => c.state === 'pass'),
    checks,
  });
}
