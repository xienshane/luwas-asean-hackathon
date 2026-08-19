// Geocodes a parser-extracted place name to a barangay via barangay_directory.
// Ties are broken by population (descending) to stay deterministic.
import { DEFAULT_REGION, type RegionId } from '@/lib/regions';

export interface BarangayMatch {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

// Administrative prefixes people type but gazetteers do not store. PH writes
// "Barangay X"; VN writes "Phường X" (ward) and "Xã X" (commune). Matched after the
// diacritics are folded, so the accented spellings are already ASCII by this point.
const AREA_PREFIX = /^(brgy\.?|barangay|phuong|xa)\s+/i;

// ...and the English nouns a translating model appends. SEA-LION returns the Vietnamese
// preset's location as "An Hai Ward, Da Nang", so the suffix has to come off or nothing
// matches "Phường An Hải".
const AREA_SUFFIX = /\s+(ward|commune|district|city|municipality|barangay|village)$/i;

/**
 * Folds a parser-extracted place name to the same shape as
 * `barangays.name_normalized`: lowercase, no diacritics, no administrative affixes.
 * NFD splits an accented letter into base + combining mark, and the mark is dropped —
 * so "Hải" becomes "hai" and meets the stored "phuong an hai".
 */
export function normalizeBarangayQuery(text: string | null | undefined): string {
  if (!text) return '';
  let q = text.split(',')[0].toLowerCase().trim();
  q = q.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  // đ/Đ is a distinct letter, not a base+mark pair, so NFD leaves it alone.
  q = q.replace(/đ/g, 'd');
  q = q.replace(AREA_PREFIX, '');
  q = q.replace(AREA_SUFFIX, '');
  return q.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
}

// Minimal structural type so tests/fakes don't need the full SupabaseClient.
// Each link in the chain is a NAMED interface: inlining them nests deeply enough that
// checking a real SupabaseClient against it trips TS2589 ("type instantiation is
// excessively deep").
interface DirectoryLimit {
  maybeSingle(): PromiseLike<{ data: BarangayMatch | null }>;
}
interface DirectoryOrder {
  limit(n: number): DirectoryLimit;
}
interface DirectoryIlike {
  order(col: string, opts: { ascending: boolean; nullsFirst: boolean }): DirectoryOrder;
}
interface DirectoryEq {
  ilike(col: string, pattern: string): DirectoryIlike;
}
interface DirectorySelect {
  eq(col: string, value: string): DirectoryEq;
}
interface DirectoryTable {
  select(cols: string): DirectorySelect;
}
export interface DirectoryClient {
  from(table: 'barangay_directory'): DirectoryTable;
}

// Scoped to one region: names are only unique within a country pack, and an unscoped
// `%...%` match could land a Da Nang ward on a Cebu barangay that happens to share a
// substring. A report is geocoded against the region it was sent from.
export async function findBarangayByName(
  client: DirectoryClient,
  locationText: string,
  region: RegionId = DEFAULT_REGION,
): Promise<BarangayMatch | null> {
  const q = normalizeBarangayQuery(locationText);
  if (!q) return null;

  for (const pattern of [q, `${q}%`, `%${q}%`]) {
    const { data } = await client
      .from('barangay_directory')
      .select('id, name, lat, lng')
      .eq('region', region)
      // Matched against the folded column, never `name` — the query has already had its
      // diacritics stripped, so comparing to the accented original would never hit.
      .ilike('name_normalized', pattern)
      .order('population', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}
