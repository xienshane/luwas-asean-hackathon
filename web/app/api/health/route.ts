// Liveness/reachability probe for the connectivity hook (Phase 6.1).
// No auth, no DB — it only confirms the app server is reachable from the client,
// which is what distinguishes "online" from "intermittent". force-dynamic so it
// is never statically cached (a cached 200 would mask an outage).
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true });
}
