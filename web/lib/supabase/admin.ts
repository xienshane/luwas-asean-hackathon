import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service-role client for server-only intake paths with no user session
// (the SMS webhook — the sender is not an authenticated app user). Bypasses
// RLS, mirroring how ai-services and the data pipeline write (see the 0.2
// migration header). NEVER import from client components.
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient must never run in the browser');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
