# LUWAS — Project Context

Post-disaster logistics coordination platform for NGO coordinators. Climate-adaptation
focus (intensifying typhoons). Pilot region: Cebu, Philippines.

## Stack

- Frontend: Next.js 16 (App Router), MapLibre GL JS, Workbox (PWA offline). Deploy: Vercel.
- Backend/DB: Supabase (Postgres + PostGIS + pgrouting + pg_cron + Realtime).
- AI services: Python FastAPI on Render.
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

## Rules

- All AI outputs are ASSISTIVE: coordinator can override every prediction and manifest.
- Real roads only: OR-Tools must use the pgRouting distance matrix, never Euclidean.
- Free-tier only. Scope road/data to Cebu region.
- PII (volunteer GPS, names, phone) is minimized, access-controlled, and retention-bound.
- Write tests for every engine. State acceptance criteria as passing checks.
