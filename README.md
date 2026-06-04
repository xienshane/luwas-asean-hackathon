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
| Deployment | Vercel, Hugging Face Spaces, Supabase | Free-tier demo deployment |

## Team Members

| Avatar | Name | Role | Program | GitHub |
| --- | --- | --- | --- | --- |
| <img src="https://github.com/xienshane.png" width="40" alt="Lovely Shane P. Ong avatar"> | Lovely Shane P. Ong | Leader | BSCS | [@xienshane](https://github.com/xienshane) |
| <img src="https://github.com/jermochi.png" width="40" alt="Jervin Ryle I. Milleza avatar"> | Jervin Ryle I. Milleza | Member | BSCS | [@jermochi](https://github.com/jermochi) |
| <img src="https://github.com/jewican.png" width="40" alt="James O. Ewican avatar"> | James O. Ewican | Member | BSCS | [@jewican](https://github.com/jewican) |
| <img src="https://github.com/Shizune-23.png" width="40" alt="Sydney B. Galorio avatar"> | Sydney B. Galorio | Member | BSCS | [@Shizune-23](https://github.com/Shizune-23) |
| N/A | Jireh C. Cañedo | Member | BSBA | N/A |


## Repository Structure

```text
luwas-asean-hackathon/
|-- CLAUDE.md          # Project context primer. Read this first.
|-- README.md          # Team onboarding and repo instructions.
|-- .env.example       # Environment variable catalog (copy the block you need).
|-- web/               # Next.js 16 App Router app -> Vercel.
|-- ai-services/       # Python FastAPI AI/optimization services -> Hugging Face Space.
|-- supabase/          # Database as code.
|   |-- migrations/    # Schema, PostGIS, pgRouting edge table, RLS.
|   |-- functions/     # SQL: silent_area_score(), dynamic edge updates.
|   `-- seed/          # Demo Cebu data.
|-- data-pipeline/     # One-off ETL / import / validation scripts (not deployed).
`-- docs/              # PRIVACY.md, DEPLOY.md (added in their phases).
```
## Collaborator Quickstart

We all share **one Supabase project** — it's already set up and loaded with data, so
there's no backend to configure. To get a working app running locally:

1. **Clone** the repo (you also get the committed datasets).
2. **Ask the team for the real `.env` values** and create `web/.env.local` — the
   `.env.example` files are blank templates; secrets are never committed.
3. **Run the web app:**

   ```bash
   npm --prefix web install
   npm --prefix web run dev   # http://localhost:3000
   ```

You now have a working app on the shared database. Building the Python services or
the data pipeline instead? See **Local Setup** below.

## Local Setup

### Prerequisites

- **Node.js 20+** and npm (web app)
- **Python 3.12** (`data-pipeline/` ETL and `ai-services/`)
- A **Supabase project** with `postgis`, `pgrouting`, and `pg_cron` enabled and the
  core tables created


### Environment variables

Each deployable reads its own env file. Copy the matching block from
[`.env.example`](.env.example) and fill in real values only on your machine or the
deployment dashboard — **never commit secrets**.

| File | Block | Used by |
| --- | --- | --- |
| `.env.local` (repo root) | `DATABASE_URL` | `data-pipeline/` scripts, Supabase tooling |
| `web/.env.local` | `web` | Next.js app |
| `ai-services/.env` | `ai-services` | FastAPI services |

For `DATABASE_URL`, use the Supabase **IPv4 session pooler** string
(`aws-0-<region>.pooler.supabase.com:5432`), not the direct `db.<ref>.supabase.co`
host (IPv6-only — the ingestion script will tell you to switch if it can't connect).

### Web app

```bash
npm --prefix web install
npm --prefix web run dev   # http://localhost:3000
```

### Database (Supabase)

Database-as-code lives under `supabase/` (`migrations/`, SQL `functions/`, `seed/`).
The data pipeline below writes into the live Supabase project pointed to by
`DATABASE_URL`.

### Data pipeline — Phase 1.1 static ingestion

`data-pipeline/ingest_static.py` is local-only ETL (not deployed). It loads the
Cebu operational tables and a per-barangay **hazard-exposure** table into Supabase.
The multi-hundred-MB NOAH hazard shapefiles are **rasterized to one exposure value
per barangay per hazard** and never pushed — only ~40 MB of small derived tables
reach Supabase, well under the free tier.

**1. Create the virtualenv and install deps:**

```bash
python3.12 -m venv data-pipeline/.venv
data-pipeline/.venv/bin/pip install -r data-pipeline/requirements.txt
```

**2. Get the raw data.** Cloning already gives you the small inputs (barangay
boundaries `.gpkg`, PSA population, HDX indicator CSVs, `impact_data.csv`). The only
manual download is the large NOAH hazard layers, which are gitignored:

> **Project NOAH hazard layers (Google Drive):**
> https://drive.google.com/drive/folders/1q0L6IJOtweWcUijpakR-SmJgaPNms78y?usp=drive_link

Download/unzip that folder into `data-pipeline/raw/project-noah/` so the tree looks like:

```text
data-pipeline/raw/
├── osm-boundaries/cebu_barangays.gpkg        # committed — OSM admin4 (layer: phl_admin4)
├── barangay_population.csv                    # committed — PSA 2020 (Cebu City)
├── pre-disaster-indicators/                   # committed — HDX vulnerability (national)
│   ├── housing-type.csv
│   ├── water-access.csv
│   └── evacuation-centers.csv
├── impact_data.csv                            # committed — cyclone impact (Phase 1.3 / GATE 1)
└── project-noah/                              # FROM DRIVE — gitignored, ~700 MB
    ├── flood5yr/   PH072200000_FH_5yr.shp     (+ .dbf .shx .prj)
    ├── flood25yr/  PH072200000_FH_25yr.shp
    ├── flood100yr/ PH072200000_FH_100yr.shp
    ├── landslide/  Cebu_LandslideHazards.shp
    └── storm-surge-1..4/ Cebu_StormSurge_SSA1..4.shp
```

**3. Run the ingestion:**

```bash
data-pipeline/.venv/bin/python data-pipeline/ingest_static.py
```

Runs in ~3–4 minutes and ends with `ALL ACCEPTANCE CHECKS PASSED ✓` (8/8). It
upserts `barangays` (boundaries + population), the `hdx_*` indicator tables, and
`barangay_hazard_exposure` across 8 NOAH hazard layers — all geometry at EPSG:4326.
