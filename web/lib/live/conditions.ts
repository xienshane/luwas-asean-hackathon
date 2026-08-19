// Phase 4.7 — convert a live weather reading into the storm-intensity ordinal the
// impact model was trained on. Pure + unit-tested (no network here).
//
// category_ordinal MUST match data-pipeline/build_training_table.py CATEGORY_ORDER:
//   0 tropical depression · 1 tropical storm · 2 severe tropical storm
//   3 strong typhoon · 4 very strong typhoon · 5 violent typhoon
// Display labels mirror the dashboard's existing PAGASA picker (Typhoon / Super
// Typhoon for ordinals 3/4) so the UI text is unchanged.
export const PAGASA_CATEGORY_LABELS = [
  'Tropical Depression', // 0
  'Tropical Storm',      // 1
  'Severe Tropical Storm', // 2
  'Typhoon',             // 3  (training: "strong typhoon")
  'Super Typhoon',       // 4  (training: "very strong typhoon")
  'Violent Typhoon',     // 5
] as const;

// Lower bound of max-sustained wind (km/h) for each ordinal; index = ordinal.
// Approximate, tunable — derived from PAGASA TCWS thresholds + JMA typhoon sub-classes
// to fill the 6-class scale the training table uses.
const WIND_FLOOR_KMH = [0, 62, 89, 118, 157, 194] as const;

export function windToCategoryOrdinal(windKmh: number): number {
  const w = Number.isFinite(windKmh) ? windKmh : 0;
  let ordinal = 0;
  for (let i = WIND_FLOOR_KMH.length - 1; i >= 0; i--) {
    if (w >= WIND_FLOOR_KMH[i]) { ordinal = i; break; }
  }
  return ordinal;
}

export function categoryLabel(ordinal: number): string {
  const i = Math.max(0, Math.min(PAGASA_CATEGORY_LABELS.length - 1, Math.round(ordinal)));
  return PAGASA_CATEGORY_LABELS[i];
}

export interface LiveConditions {
  wind_kmh: number;
  gust_kmh: number | null;
  precip_mm: number | null;
  category_ordinal: number;
  category_label: string;
  observed_at: string; // ISO time from the feed
  source: 'open-meteo';
  stale: boolean; // true when served from cache after a failed refresh
}

interface Reading {
  wind_kmh: number;
  gust_kmh: number | null;
  precip_mm: number | null;
  observed_at: string;
}

// Build the keyless Open-Meteo current-weather query for one coordinate.
export function openMeteoUrl(lat: number, lng: number, baseUrl: string): string {
  const u = new URL(`${baseUrl.replace(/\/$/, '')}/forecast`);
  u.searchParams.set('latitude', String(lat));
  u.searchParams.set('longitude', String(lng));
  u.searchParams.set('current', 'wind_speed_10m,wind_gusts_10m,precipitation');
  u.searchParams.set('wind_speed_unit', 'kmh');
  return u.toString();
}

// Open-Meteo `current` block -> typed reading. Pure; throws on a malformed payload.
export function parseOpenMeteo(json: unknown): Reading {
  const cur = (json as { current?: Record<string, unknown> } | null)?.current;
  if (!cur || typeof cur.wind_speed_10m !== 'number') {
    throw new Error('open-meteo: missing current.wind_speed_10m');
  }
  return {
    wind_kmh: cur.wind_speed_10m,
    gust_kmh: typeof cur.wind_gusts_10m === 'number' ? cur.wind_gusts_10m : null,
    precip_mm: typeof cur.precipitation === 'number' ? cur.precipitation : null,
    observed_at: typeof cur.time === 'string' ? cur.time : new Date().toISOString(),
  };
}

export interface SamplePoint {
  name: string;
  lat: number;
  lng: number;
}

// Storm intensity for the Day-0 forecast is driven by the WORST conditions across the
// whole operating area, not just its capital — TCWS-style worst-case framing. The points
// themselves are country-specific, so they live on the region (`lib/regions.ts`); this
// module stays region-agnostic and just reduces whatever points it is handed.

// Collapse several point readings to the single worst-case (highest sustained wind).
// Gust/precip/observed_at follow that worst-wind point so the displayed values are
// internally consistent. Throws on an empty list (caller treats as feed failure).
export function pickWorstReading(readings: Reading[]): Reading {
  if (readings.length === 0) throw new Error('pickWorstReading: no readings');
  return readings.reduce((worst, r) => (r.wind_kmh > worst.wind_kmh ? r : worst));
}

export function toLiveConditions(reading: Reading, opts: { stale?: boolean } = {}): LiveConditions {
  const ordinal = windToCategoryOrdinal(reading.wind_kmh);
  return {
    ...reading,
    category_ordinal: ordinal,
    category_label: categoryLabel(ordinal),
    source: 'open-meteo',
    stale: opts.stale ?? false,
  };
}
