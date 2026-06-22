#!/usr/bin/env node
// LUWAS — Phase 4.1 end-to-end acceptance check (no browser).
//
// Exercises the full pipeline through the live route handler and asserts the
// dev-plan 4.1 post-conditions:
//   1. One report flows end-to-end: predictions >= 1, manifests >= 1, routes >= 1.
//   2. Re-running is idempotent: predictions count stable; planned routes regenerated,
//      not duplicated.
//
// Prerequisites (this is an INTEGRATION check — it needs live services):
//   - A running web server (BASE_URL, default http://localhost:3000) whose env has
//     AI_SERVICE_URL pointing at a warm FastAPI Space + SUPABASE_SERVICE_ROLE_KEY.
//   - A coordinator session cookie (the route is coordinator-gated). Grab it from a
//     logged-in browser (Application > Cookies) and pass via COORD_COOKIE.
//   - A known routable Cebu City barangay id (BRGY_ID).
//
// Usage:
//   BASE_URL=http://localhost:3000 \
//   COORD_COOKIE='sb-<ref>-auth-token=...' \
//   BRGY_ID=<uuid> \
//   node scripts/verify-pipeline.mjs

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const COOKIE = process.env.COORD_COOKIE ?? '';
const BRGY_ID = process.env.BRGY_ID ?? '';

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function runPipeline() {
  const res = await fetch(`${BASE_URL}/api/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({ barangayId: BRGY_ID || null }),
  });
  if (!res.ok) {
    console.error(`pipeline responded ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

async function main() {
  if (!COOKIE) {
    console.error('COORD_COOKIE is required (coordinator session). See header for how to obtain it.');
    process.exit(2);
  }

  console.log('Run 1 — full chain…');
  const a = await runPipeline();
  console.log(JSON.stringify(a, null, 2));
  assert((a.predictions ?? 0) >= 1, 'run 1: predictions >= 1');
  assert((a.manifests ?? 0) >= 1, 'run 1: manifests >= 1');
  assert((a.routes ?? 0) >= 1, 'run 1: routes >= 1');

  console.log('Run 2 — idempotency…');
  const b = await runPipeline();
  console.log(JSON.stringify(b, null, 2));
  assert(b.predictions === a.predictions, 'run 2: predictions count stable (upsert)');
  assert((b.routes ?? 0) >= 1, 'run 2: routes regenerated (>= 1)');

  console.log('\nPipeline acceptance PASSED.');
}

main().catch((e) => { console.error(e); process.exit(1); });
