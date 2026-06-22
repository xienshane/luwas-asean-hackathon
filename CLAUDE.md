# LUWAS — Project Context

Post-disaster logistics coordination platform for NGO coordinators. Climate-adaptation
focus (intensifying typhoons). Pilot region: Cebu, Philippines.

## Stack

- Frontend: Next.js 16 (App Router), MapLibre GL JS, Workbox (PWA offline). Deploy: Vercel.
- Database: Supabase (Postgres + PostGIS + pgrouting + pg_cron + Realtime).
- AI services: Python FastAPI on Hugging Face Spaces (free CPU tier, 16GB RAM).
  - TabPFN v2 (pip `tabpfn`) — impact prediction.
  - OR-Tools (pip `ortools`) — vehicle routing.
  - SEA-LION (OpenAI-compatible, base_url https://api.sea-lion.ai/v1, FREE tier = 10 calls/min)
    — NLP parsing. Fallback: Gemini 2.5 Flash.
- Deterministic Sphere supply formula (no model): 15 L water/person/day, 2,100 kcal/person/day.

## Architecture (data flow)

field report -> Supabase -> Silent Area score (PostGIS, pg_cron 15-min)
-> TabPFN impact -> Sphere manifest -> OR-Tools route (uses pgRouting distance matrix)
-> MapLibre map.

## Core tables

barangays, field_reports, volunteers, teams, routes, impact_predictions,
supply_manifests, road_edges.

## Repo Structure

Organized by deploy target. No monorepo tooling (no Turborepo/Nx/pnpm workspaces) —
one JS app, the rest is Python and SQL, so plain folders are cleaner.

```text
luwas/
  CLAUDE.md  README.md  .env.example
  web/                       -> Vercel (Next.js 16, App Router)
    app/(coordinator)/       coordinator dashboard (auth-gated)
    app/(volunteer)/         volunteer PWA (auth-gated)
    app/api/sms/             Semaphore inbound webhook
    components/
    lib/supabase/            client + typed queries
    lib/ai/                  thin fetch wrappers calling ai-services
    lib/types/               TS types MIRRORING the Pydantic contracts
    public/                  PWA manifest, service worker
  ai-services/               -> ONE Hugging Face Space (Docker)
    app/main.py              FastAPI entry; mounts the 3 routers
    app/routers/impact.py    TabPFN    -> POST /predict-impact
    app/routers/routing.py   OR-Tools  -> POST /optimize-routes
    app/routers/parse.py     SEA-LION (+Gemini fallback) -> POST /parse
    app/core/                shared: config, supabase client, logging, rate-limiter
    app/models/              Pydantic schemas = SOURCE OF TRUTH for all API contracts
    app/services/            the actual logic (importable, unit-testable)
    tests/  Dockerfile  requirements.txt  README.md (HF Space SDK header)
  supabase/                  -> Supabase (database as code)
    migrations/              schema, PostGIS, pgRouting edge table, RLS
    functions/               SQL: silent_area_score(), dynamic edge updates
    seed/                    demo Cebu data
  data-pipeline/             one-off ETL, NOT deployed
    ingest_static.py  build_road_graph.py  build_training_table.py
  docs/                      PRIVACY.md  DEPLOY.md  
```

Key structural decisions:

- AI services are ONE FastAPI app with three routers, deployed as ONE HF Space (each Space
  is its own git repo, so three Spaces = three sync points). The routers/ + services/ split
  lets any one service lift out into its own Space later if needed.
- Database logic (Silent Area scoring, dynamic edge weights) lives in supabase/functions/ as
  versioned SQL, not in a server — keeps the deterministic core visible and reviewable.
- data-pipeline/ scripts run locally to populate Supabase; they are not part of any deploy.

## Rules

- All AI outputs are ASSISTIVE: coordinator can override every prediction and manifest.
- Real roads only: OR-Tools must use the pgRouting distance matrix, never Euclidean.
- API contracts: Pydantic models in `ai-services/app/models/` are canonical. `web/lib/types/`
  mirrors them — any change to one updates the other in the same commit.
- Free-tier only. Scope road/data to Cebu region.
- PII (volunteer GPS, names, phone) is minimized, access-controlled, and retention-bound.
- Write tests for every engine. State acceptance criteria as passing checks.
