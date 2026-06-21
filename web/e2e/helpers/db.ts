import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// supabase-js eagerly builds a RealtimeClient that needs a global WebSocket.
// Node 20 ships none, so polyfill it for the test runner. Test-only: these helpers
// only do REST reads/deletes — realtime is never actually opened.
(globalThis as { WebSocket?: unknown }).WebSocket ??= WebSocket;

// Service-role client for TEST-ONLY reads + teardown. Never import this from app
// code — it bypasses RLS. Safe here: tests run in Node, the key never reaches a browser.
let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'E2E: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. ' +
        'Ensure web/.env(.local) is populated.',
    );
  }
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export async function pickBarangay(): Promise<{ id: string; name: string }> {
  const { data, error } = await admin()
    .from('barangay_directory')
    .select('id, name')
    .order('name')
    .limit(1);
  if (error || !data?.length) throw new Error(`pickBarangay failed: ${error?.message ?? 'no rows'}`);
  return data[0] as { id: string; name: string };
}

export async function findReportByMarker(marker: string) {
  const { data } = await admin()
    .from('field_reports')
    .select('id, barangay_id, raw_text, needs_severity, source')
    .ilike('raw_text', `%${marker}%`)
    .limit(1)
    .maybeSingle();
  return data as
    | { id: string; barangay_id: string; raw_text: string; needs_severity: string; source: string }
    | null;
}

export async function deleteReportsByMarker(marker: string): Promise<void> {
  await admin().from('field_reports').delete().ilike('raw_text', `%${marker}%`);
}

export async function getRoute(id: string) {
  const { data } = await admin()
    .from('routes')
    .select('id, team_id, status, total_distance_m')
    .eq('id', id)
    .maybeSingle();
  return data as { id: string; team_id: string | null; status: string; total_distance_m: number | null } | null;
}

export async function deleteRoute(id: string): Promise<void> {
  await admin().from('routes').delete().eq('id', id);
}
