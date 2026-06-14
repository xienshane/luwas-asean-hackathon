// Geocodes a parser-extracted place name to a barangay via barangay_directory.
// Ties are broken by population (descending) to stay deterministic.
export interface BarangayMatch {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export function normalizeBarangayQuery(text: string | null | undefined): string {
  if (!text) return '';
  let q = text.split(',')[0].toLowerCase().trim();
  q = q.replace(/^(brgy\.?|barangay)\s+/i, '');
  return q.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
}

// Minimal structural type so tests/fakes don't need the full SupabaseClient.
interface DirectoryClient {
  from(table: 'barangay_directory'): {
    select(cols: string): {
      ilike(
        col: string,
        pattern: string,
      ): {
        order(
          col: string,
          opts: { ascending: boolean; nullsFirst: boolean },
        ): {
          limit(n: number): { maybeSingle(): Promise<{ data: BarangayMatch | null }> };
        };
      };
    };
  };
}

export async function findBarangayByName(
  client: DirectoryClient,
  locationText: string,
): Promise<BarangayMatch | null> {
  const q = normalizeBarangayQuery(locationText);
  if (!q) return null;

  for (const pattern of [q, `${q}%`, `%${q}%`]) {
    const { data } = await client
      .from('barangay_directory')
      .select('id, name, lat, lng')
      .ilike('name', pattern)
      .order('population', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}
