# LUWAS - Team CIT-U Shane-nanigans

ASEAN AI Hackathon 2026

LUWAS is a post-disaster logistics coordination platform for NGO coordinators. The pilot use case is **Cebu, Philippines**, with a focus on faster response after intensifying typhoons.

The goal is to help coordinators:

- collect field reports from volunteers,
- identify silent or high-risk barangays,
- estimate affected population and severity,
- generate transparent supply manifests,
- route teams using real road distances,
- keep every AI recommendation reviewable by a human coordinator.

## Tech Stack

| Area | Technology | Purpose |
| --- | --- | --- |
| Frontend | Next.js 16 App Router, TypeScript, Tailwind CSS | Coordinator dashboard and volunteer app |
| Maps | MapLibre GL JS | Barangay pins, road routes, and team tracking |
| Offline support | Workbox | PWA caching and queued volunteer reports |
| Auth and database | Supabase | Authentication, Postgres database, Realtime updates |
| Geospatial database | PostGIS, pgRouting, pg_cron | Spatial queries, road routing, scheduled scoring |
| Backend services | Python FastAPI | AI and optimization service endpoints |
| Impact prediction | TabPFN v2 | Assistive affected-population and severity prediction |
| Routing | OR-Tools | Multi-team vehicle routing |
| NLP parsing | SEA-LION, Gemini fallback | Parse Filipino, Bisaya, and Tagalog field reports |
| Deployment | Vercel, Render, Supabase | Free-tier demo deployment |

## Team Members

| Avatar | Name | Role | Program | GitHub |
| --- | --- | --- | --- | --- |
| <img src="https://github.com/xienshane.png" width="40" alt="Lovely Shane P. Ong avatar"> | Lovely Shane P. Ong | Leader | BSCS | [@xienshane](https://github.com/xienshane) |
| <img src="https://github.com/jermochi.png" width="40" alt="Jervin Ryle I. Milleza avatar"> | Jervin Ryle I. Milleza | Member | BSCS | [@jermochi](https://github.com/jermochi) |
| <img src="https://github.com/jewican.png" width="40" alt="James O. Ewican avatar"> | James O. Ewican | Member | BSCS | [@jewican](https://github.com/jewican) |
| <img src="https://github.com/Shizune-23.png" width="40" alt="Sydney B. Galorio avatar"> | Sydney B. Galorio | Member | BSCS | [@Shizune-23](https://github.com/Shizune-23) |
| N/A | Jireh C. Cañedo | Member | BSBA | N/A |

## Team Instructions

Before starting any task, read [CLAUDE.md](CLAUDE.md). It contains the project context, stack, core rules, and architecture assumptions.

Work in small branches and keep commits focused. Use Conventional Commits:

```bash
git commit -m "feat: add volunteer report form"
git commit -m "fix: protect volunteer phone access"
git commit -m "docs: update deployment notes"
git commit -m "chore: initialize project skeleton"
```

Do not commit secrets, API keys, downloaded raw datasets, local database dumps, or generated build folders.

## Repository Structure

```text
luwas-asean-hackathon/
|-- CLAUDE.md          # Project context primer. Read this first.
|-- README.md          # Team onboarding and repo instructions.
|-- DEPLOY.md          # Deployment notes for Vercel, Render, and Supabase.
|-- PRIVACY.md         # Privacy, PII, retention, and consent notes.
|-- .env.example       # Environment variable template.
|-- frontend/          # Next.js 16 App Router app.
|-- backend/           # Python FastAPI services.
|-- scripts/           # Ingestion, validation, and test helper scripts.
`-- supabase/
    `-- migrations/    # Database schema, extensions, RLS, cron, and SQL functions.
```

## Work Areas

### Frontend

Use `frontend/` for the Next.js app.

Expected work:

- coordinator dashboard,
- volunteer report form,
- Supabase Auth,
- MapLibre map,
- offline PWA behavior,
- SMS simulation UI if needed for demo.

### Backend

Use `backend/` for Python FastAPI services.

Expected work:

- TabPFN impact prediction,
- deterministic Sphere supply calculation,
- OR-Tools vehicle routing,
- SEA-LION field report parser,
- Gemini fallback for parsing errors.

### Supabase

Use `supabase/migrations/` for database changes.

Expected work:

- enable PostGIS, pgRouting, and pg_cron,
- create core tables,
- add row-level security,
- protect volunteer PII,
- create Silent Area scoring SQL,
- schedule scoring jobs.

### Scripts

Use `scripts/` for one-off or repeatable project scripts.

Expected work:

- data ingestion,
- road-network import,
- model validation,
- Playwright or demo helper scripts.

## Immediate Priorities

1. Scaffold the Next.js app in `frontend/`.
2. Create the first Supabase migration for extensions, tables, roles, and RLS.
3. Confirm the tropical-cyclone impact dataset is usable.
4. Start the FastAPI backend structure in `backend/`.
5. Keep privacy work active from day one in [PRIVACY.md](PRIVACY.md).

## Project Rules

- All AI outputs are assistive. A coordinator must be able to review and override predictions, manifests, and routes.
- Routing must use real-road distances from pgRouting, not straight-line distance.
- Scope the demo to Cebu.
- Keep the build free-tier friendly.
- Write tests for every engine or critical flow.
- Treat volunteer names, phone numbers, and precise GPS as sensitive data.

## Local Setup

Copy the environment template:

```bash
cp .env.example .env
```

Fill in real values only on your local machine or deployment dashboard. Never commit `.env`.

More setup commands will be added after `frontend/` and `backend/` are scaffolded.
