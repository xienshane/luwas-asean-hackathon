import { createClient } from '@/lib/supabase/server';
import {
  openMeteoUrl,
  parseOpenMeteo,
  pickWorstReading,
  toLiveConditions,
  type LiveConditions,
} from '@/lib/live/conditions';
import { DEFAULT_REGION, REGIONS, isRegionId, type RegionId } from '@/lib/regions';

// Auth-cookie dependent + a live fetch: never statically cache this handler.
export const dynamic = 'force-dynamic';

const DEFAULT_TTL_SECONDS = 600; // 10 min — comfortably under Open-Meteo free limits

// In-memory cache, per serverless instance. Persists across warm invocations; a cold
// start simply re-fetches. Keeps last-good for graceful degradation. (Optional DB-backed
// cache that survives cold starts: see plan Appendix A.)
//
// Keyed by region: two packs are thousands of kilometres apart, so one shared slot would
// serve Cebu's wind for Đà Nẵng to whichever region asked second.
const cache = new Map<RegionId, { at: number; value: LiveConditions }>();

// Phase 4.7 - one free, keyless live wind/rain reading for the active-storm area.
// The anticipatory forecast maps `category_ordinal` from this into TabPFN's intensity input.
// Always returns HTTP 200 with `{ available }` so the UI degrades without breaking.
export async function GET(request: Request) {
  // AuthZ: only a signed-in coordinator sees the operating picture.
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: isCoord } = await ssr.rpc('is_coordinator');
  if (!isCoord) return Response.json({ error: 'forbidden' }, { status: 403 });

  // An unknown region falls back to the default rather than erroring: a bad query string
  // should degrade the reading, not blank the operating picture.
  const requested = new URL(request.url).searchParams.get('region');
  const region: RegionId = requested && isRegionId(requested) ? requested : DEFAULT_REGION;
  const points = REGIONS[region].samplePoints;

  const ttlMs = Number(process.env.LIVE_CONDITIONS_TTL_SECONDS ?? DEFAULT_TTL_SECONDS) * 1000;
  const now = Date.now();
  const hit = cache.get(region);
  if (hit && now - hit.at < ttlMs) {
    return Response.json({ available: true, conditions: hit.value });
  }

  const base = process.env.OPEN_METEO_BASE_URL ?? 'https://api.open-meteo.com/v1';

  try {
    // Sample the region in parallel; tolerate individual point failures and take the
    // worst-case wind across whatever points responded.
    const settled = await Promise.allSettled(
      points.map(async (p) => {
        const res = await fetch(openMeteoUrl(p.lat, p.lng, base), { signal: AbortSignal.timeout(8_000) });
        if (!res.ok) throw new Error(`open-meteo responded ${res.status}`);
        return parseOpenMeteo(await res.json());
      }),
    );
    const readings = settled
      .filter((r): r is PromiseFulfilledResult<ReturnType<typeof parseOpenMeteo>> => r.status === 'fulfilled')
      .map((r) => r.value);
    if (readings.length === 0) throw new Error('all sample points failed');

    const value = toLiveConditions(pickWorstReading(readings));
    cache.set(region, { at: now, value });
    return Response.json({ available: true, conditions: value });
  } catch {
    // Graceful degradation: last-good (flagged stale), else explicitly unavailable.
    if (hit) {
      return Response.json({ available: true, conditions: { ...hit.value, stale: true } });
    }
    return Response.json({ available: false, error: 'live conditions unavailable' });
  }
}
