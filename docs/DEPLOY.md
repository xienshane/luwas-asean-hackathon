# LUWAS — Deploy & Operations Notes

## Services

| Target | What | Key env |
| --- | --- | --- |
| Vercel | Next.js `web/` | `AI_SERVICE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*`, `SMS_WEBHOOK_SECRET` |
| Hugging Face Space | FastAPI `ai-services/` (TabPFN / OR-Tools / SEA-LION / Sphere) | `SUPABASE_SERVICE_ROLE_KEY`, model keys |
| Supabase | Postgres + PostGIS + pgRouting + Realtime + pg_cron | migrations in `supabase/` |

## The pipeline (`POST /api/pipeline`)

Confirming a field report (or the manual "Generate plan" action) calls the coordinator-gated
route handler `web/app/api/pipeline/route.ts`, which orchestrates, with service-role writes:

1. `silent_area_score()` — rescore Silent Areas (reflects the just-confirmed contact).
2. `pipeline_targets()` — active-need barangays (+ the triggering one), top by score, with
   per-province TabPFN features.
3. `predictImpact()` → `ai-services /predict-impact` (TabPFN, heuristic fallback) → upsert
   `impact_predictions` (one current row per barangay; `override_value` preserved).
4. `buildManifest()` → `ai-services /build-manifest` (deterministic Sphere) → upsert
   `supply_manifests`.
5. `pipeline_cost_matrix()` (real-road N×N, metres→seconds) + `optimizeRoutes()`
   → `ai-services /optimize-routes` (OR-Tools) → `pipeline_save_route()` assembles the
   real-road LineString and inserts a `planned` route. Planned routes are regenerated
   wholesale; active/completed routes are untouched.

Results stream to the coordinator dashboard over Realtime (`impact_predictions`,
`supply_manifests`, `routes`) via `useLivePlan`.

### Pre-warm the HF Space before any demo

`predictImpact` / `buildManifest` / `optimizeRoutes` use a 20s timeout. A cold Space surfaces
as `PIPELINE: failed to run (AI service unreachable)` in the activity log. Hit the Space's
`/health` once before demoing so the first confirm is fast.

## Production hardening

- `app/api/sms/mock` (demo SMS simulator) 404s unless `ENABLE_SMS_MOCK=true`. Leave it unset
  in production; the real inbound webhook is `app/api/sms`.
- No new `NEXT_PUBLIC_*` secrets — the orchestrator is server-only (service-role).

## Verifying the pipeline end-to-end

`scripts/verify-pipeline.mjs` exercises one report through the chain and re-runs it for
idempotency. Prerequisites: a running `web` server with `AI_SERVICE_URL` reachable, and a
coordinator session cookie. See the script header for usage.
