import type { SupabaseClient } from '@supabase/supabase-js';

// Role-based routing. profiles.role (app_role enum) is the canonical source of
// truth (see the 0.2 migration); this module turns a role into a landing area
// and decides where to send a user after login.
export type AppRole = 'coordinator' | 'volunteer';

const HOME: Record<AppRole, string> = {
  coordinator: '/coordinator',
  volunteer: '/volunteer',
};

/** Landing area for a role. A missing role defaults to the least-privileged area. */
export function homePathForRole(role: AppRole | null): string {
  return role === 'coordinator' ? HOME.coordinator : HOME.volunteer;
}

// A safe, same-origin relative path: starts with a single "/" (rejects
// "//host" and "https://host" open redirects).
function isSafeInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

// Which area a role may land in. Coordinators may use either area; volunteers
// are confined to the volunteer area — this is what stops a volunteer from being
// routed (or redirected) into /coordinator.
function isAreaAllowed(role: AppRole, path: string): boolean {
  if (role === 'coordinator') return true;
  return path === '/volunteer' || path.startsWith('/volunteer/');
}

/**
 * Post-login destination. Honors redirectedFrom only when it is a safe internal
 * path inside the user's permitted area; otherwise falls back to the role home.
 */
export function resolveDestination(role: AppRole, redirectedFrom?: string | null): string {
  if (redirectedFrom && isSafeInternalPath(redirectedFrom) && isAreaAllowed(role, redirectedFrom)) {
    return redirectedFrom;
  }
  return homePathForRole(role);
}

/** Reads the caller's role from profiles (RLS lets a user read their own row). */
export async function fetchUserRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<AppRole | null> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
  return (data?.role as AppRole | undefined) ?? null;
}
