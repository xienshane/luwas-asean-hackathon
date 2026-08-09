// Country packs. A region is the whole of what changes when LUWAS moves to a new
// country: where the map looks, what the areas are called, and which intake channel
// people actually use. No model, threshold, or formula is region-specific — TabPFN
// learns in-context, SEA-LION already speaks the languages, and the Sphere figures are
// international standard.
//
// Adding a country means adding an entry here plus its rows in `barangays` and
// `road_edges`. That is the whole of it.

export type RegionId = 'cebu' | 'danang';

export interface Region {
  id: RegionId;
  /** Shown on the region switch. */
  label: string;
  country: string;
  /** What this country calls its smallest administrative unit. */
  areaNoun: string;
  /** Where SMS intake arrives — SMS in PH, Zalo in VN. */
  intakeChannel: string;
  center: [number, number];
  zoom: number;
  /** Hard pan limit, so the coordinator cannot drift into empty ocean. */
  bounds: [[number, number], [number, number]];
}

export const REGIONS: Record<RegionId, Region> = {
  cebu: {
    id: 'cebu',
    label: 'Cebu',
    country: 'Philippines',
    areaNoun: 'barangay',
    intakeChannel: 'SMS',
    center: [123.905, 10.33],
    zoom: 11.5,
    bounds: [
      [123.15, 9.3],
      [124.6, 11.5],
    ],
  },
  danang: {
    id: 'danang',
    label: 'Đà Nẵng',
    country: 'Vietnam',
    // Post-July-2025 reform: the district tier was abolished and wards were merged,
    // so these are `phường`, mapped from OSM admin_level=6.
    areaNoun: 'ward',
    intakeChannel: 'Zalo',
    center: [108.21, 16.04],
    zoom: 12.2,
    // Padded around the loaded ward extent (108.03–108.35 E, 15.93–16.17 N).
    bounds: [
      [107.95, 15.85],
      [108.45, 16.25],
    ],
  },
};

export const DEFAULT_REGION: RegionId = 'cebu';

export const REGION_LIST: readonly Region[] = [REGIONS.cebu, REGIONS.danang];

export function isRegionId(v: string): v is RegionId {
  return v === 'cebu' || v === 'danang';
}
