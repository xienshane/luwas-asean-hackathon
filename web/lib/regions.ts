// Country packs. A region is the whole of what changes when LUWAS moves to a new
// country: where the map looks, what the areas are called, and which intake channel
// people actually use. No model, threshold, or formula is region-specific — TabPFN
// learns in-context, SEA-LION already speaks the languages, and the Sphere figures are
// international standard.
//
// Adding a country means adding an entry here plus its rows in `barangays` and
// `road_edges`. That is the whole of it.

import type { SamplePoint } from './live/conditions';

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
  /**
   * Where the live wind/rain read samples. Storm intensity is framed worst-case across
   * the whole operating area rather than at its capital, so this spans the region.
   */
  samplePoints: readonly SamplePoint[];
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
    samplePoints: [
      { name: 'Cebu City', lat: 10.3157, lng: 123.8854 }, // central / capital
      { name: 'North Cebu', lat: 11.05, lng: 123.95 }, // Bogo / Daanbantayan
      { name: 'South Cebu', lat: 9.85, lng: 123.5 }, // Santander
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
    // Centred on the loaded ward extent (108.040–108.339 E, 15.943–16.156 N), not on the
    // city centre. The arrival beat has to establish that a whole pack is here, so the
    // home view frames all eleven wards; the coordinator zooms in for the route.
    center: [108.189, 16.049],
    zoom: 11.2,
    // Padded around the loaded ward extent (108.03–108.35 E, 15.93–16.17 N).
    bounds: [
      [107.95, 15.85],
      [108.45, 16.25],
    ],
    // North / central / south across the loaded urban core, mirroring Cebu's spread.
    samplePoints: [
      { name: 'Liên Chiểu', lat: 16.0806, lng: 108.1508 }, // north-west, industrial
      { name: 'Hải Châu', lat: 16.0544, lng: 108.2205 }, // centre, riverfront
      { name: 'Ngũ Hành Sơn', lat: 15.9847, lng: 108.2622 }, // south, seafront
    ],
  },
};

export const DEFAULT_REGION: RegionId = 'cebu';

export const REGION_LIST: readonly Region[] = [REGIONS.cebu, REGIONS.danang];

export function isRegionId(v: string): v is RegionId {
  return v === 'cebu' || v === 'danang';
}
