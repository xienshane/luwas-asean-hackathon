# Country Packs

*"You built this for Cebu. What does it take to run it in Da Nang?"*

LUWAS's engines are country-agnostic. What is country-specific is **six data surfaces**,
each of which is a file, a table, or a config value — not a code path. This document names
all six, states what the Philippine pilot uses today (with the repo path), what the
Vietnamese equivalent would be, and what the swap actually costs.

A machine-readable pack for one target region lives at
[`packs/vn-danang.pack.yaml`](../packs/vn-danang.pack.yaml). Every remaining hole in it is
labelled with what would fill it.

**What is true today:** Đà Nẵng is loaded and runs. Eleven post-July-2025 wards with
sourced populations, a 47,921-edge routable graph, and a depot — a Vietnamese report
parses, geocodes, scores, and dispatches through the same functions Cebu uses, with no
model retrained and no threshold retuned.

Three of the six surfaces are genuinely done (1 boundaries/population, 5 language,
6 gazetteer). Three are not, and the demo does not pretend otherwise:

| Surface | State | What it would take |
| --- | --- | --- |
| 2 — storm scale | still the PAGASA ordinal | the VN level → 0–5 lookup |
| 3 — hazard | **geographic proxy**, not measured hazard | VNDMA rasters |
| 4 — impact history | the **Philippine** context table, read in-context | a VN impact CSV + a LOTO re-run |

Surface 4 is the one to be careful about in both directions. Running Vietnamese wards
against Philippine evidence is not a bug — it is what in-context learning *is*, and it is
why there was no training job. But the accuracy figures in `MODEL_CARD.md` are Philippine
figures, and they do not transfer. See surface 4 below.

---

## The six surfaces

| # | Surface | PH pilot today | VN equivalent |
| --- | --- | --- | --- |
| 1 | Admin boundaries + population | `barangays` (PSA 2020 + synthetic HUC estimates) | ward-level GSO |
| 2 | Storm scale | PAGASA categories → `category_ordinal` | VN national storm/disaster risk levels |
| 3 | Hazard rasters | Project NOAH (flood, landslide, storm surge) | VNDMA |
| 4 | Impact history | the CSV that **is** the TabPFN context | VN historical impact table |
| 5 | Language / lexicon | Bisaya, Tagalog | Vietnamese |
| 6 | Intake + gazetteer | SMS + Cebu gazetteer | SMS; Zalo is the local channel |

---

### 1 — Admin boundaries + population

**What LUWAS needs.** One polygon per smallest operational unit, with a population count.
Everything downstream keys off this: Silent Area scoring, the Sphere manifest, the routing
distance matrix, and the map itself.

**PH today.** The `barangays` table
([`supabase/migrations/20260603083354_init_schema_extensions_rbac.sql`](../supabase/migrations/20260603083354_init_schema_extensions_rbac.sql),
boundary geometry added in
[`20260620130000_barangay_boundary.sql`](../supabase/migrations/20260620130000_barangay_boundary.sql)).
Boundaries come from OSM (`data-pipeline/raw/osm-boundaries/cebu_barangays.gpkg`);
population from PSA 2020, name-matched in
[`data-pipeline/ingest_static.py`](../data-pipeline/ingest_static.py) (`ingest_population`).

> **Honesty note.** Barangay populations for the Lapu-Lapu and Mandaue highly-urbanised
> cities in `data-pipeline/raw/barangay_population.csv` are estimates, not PSA figures.
> They are labelled as such wherever they are used.

**VN today — loaded.** Eleven urban-core wards of Đà Nẵng, ingested by
[`data-pipeline/ingest_danang.py`](../data-pipeline/ingest_danang.py) into the same
`barangays` table under `region = 'danang'`.

Boundaries are the **post-July-2025** ones. This matters more than it sounds: on
1 July 2025 Vietnam merged 63 provinces into 34, abolished the district tier outright, and
dissolved roughly two-thirds of all wards and communes. Đà Nẵng absorbed Quảng Nam and its
own 56 wards became 12. Anything holding a pre-reform Vietnamese gazetteer is holding a map
of places that no longer exist — which is exactly the failure a data-surface port is
supposed to make cheap. OSM retagged the survivors from `admin_level=8` to `6`, so that is
what the loader reads.

Population is **sourced, not estimated**: each ward's own OSM `population` tag, carried in
the extract's `other_tags` and tagged `source:population=gis.vn`,
`population:date=2025-07-01`. All eleven are covered — 1,178,687 people — and a ward
without the tag fails the load rather than getting a plausible guess, because population is
the denominator of the Sphere manifest and a component of the Silent Area score.

**Cost of the swap.** One loader script and one boundary file. No schema change —
`barangays` is already generic (name, code, geometry, population); the code column is a
string, and `region` is the only column that had to be added.

---

### 2 — Storm scale

**What LUWAS needs.** A single ordinal 0–5 describing storm intensity. It is the first
feature the impact model reads.

**PH today.** PAGASA's tropical-cyclone categories, ordinal-encoded in
[`data-pipeline/build_training_table.py:59`](../data-pipeline/build_training_table.py)
(`CATEGORY_ORDER`: tropical depression 0 → violent typhoon 5). The live path mirrors the
same ladder in [`web/lib/live/conditions.ts`](../web/lib/live/conditions.ts), which maps
sustained wind from Open-Meteo onto the same ordinal so the running system and the
training table agree.

**VN equivalent.** Vietnam's national storm/disaster risk-level framework. The mapping
target is unchanged — an ordinal 0–5 — so the port is a lookup table, not a model change.

**Cost of the swap.** Two constants (`CATEGORY_ORDER` and the wind thresholds in
`conditions.ts`), plus a note recording which national scale the ordinal now encodes.
They must be changed together — the comment at `conditions.ts:4` says so, and it is the
one place where a mismatch would silently corrupt predictions.

---

### 3 — Hazard rasters

**What LUWAS needs.** Per-unit hazard exposure — how much of this barangay/ward floods,
slides, or takes storm surge. Feeds the pre-disaster vulnerability side of prioritisation.

**PH today.** Project NOAH layers (5/25/100-year flood, landslide, four storm-surge
advisories), listed in [`data-pipeline/ingest_static.py`](../data-pipeline/ingest_static.py)
(`NOAH_LAYERS`). Raw hazard geometry is read **locally and never persisted**; only the
area-weighted per-unit exposure is written to `barangay_hazard_exposure`.

**VN equivalent.** VNDMA hazard mapping (and provincial flood/landslide maps where
published).

**Cost of the swap.** Point `NOAH_LAYERS` at the new shapefiles and name each layer's
intensity attribute. The rasterise-and-aggregate step is source-agnostic. The
local-only-geometry rule carries over unchanged.

---

### 4 — Impact history — **no retraining**

**What LUWAS needs.** A table of historical storm impact: one row per (storm, admin unit)
with the feature columns and the observed outcome.

**PH today.** [`ai-services/data/training_table.csv`](../ai-services/data/training_table.csv)
— 1,261 rows, 85 storms, 2010–2020, built by
[`data-pipeline/build_training_table.py`](../data-pipeline/build_training_table.py).

**This is the strongest scalability property in the system, and it is a property of the
model choice rather than a promise:** TabPFN v2 is an in-context learner. It does not
train on this table — it *reads* it at predict time
([`ai-services/app/services/impact_model.py`](../ai-services/app/services/impact_model.py),
`warmup()`). Swapping country means swapping a CSV. There is no training job, no GPU, no
retraining pipeline, and no fine-tuned weights to version.

**VN equivalent.** A Vietnamese historical impact table with the same columns. Not
sourced — see the `null` in the pack stub.

**Cost of the swap.** Produce a CSV with the canonical feature columns
(`FEATURE_COLUMNS`, `impact_model.py:19`) and the two targets (`affected`, `damage_rate`),
then point `training_table_path` at it. Accuracy at the new context is then measured with
the existing harness (`ai-services/scripts/evaluate_impact.py`) — the LOTO protocol is
country-agnostic. **Do not** publish PH accuracy figures as VN figures; run the harness.

---

### 5 — Language / lexicon — **already covered**

**What LUWAS needs.** Free-text field reports parsed into structured fields, in whatever
language the reporter actually writes.

**PH today.** Bisaya and Tagalog, parsed by
`aisingapore/Gemma-SEA-LION-v4-27B-IT` ([`ai-services/app/core/config.py:39`](../ai-services/app/core/config.py)),
with Gemini 2.5 Flash as fallback.

**VN.** The same model is post-trained on Vietnamese. This is not future work — it ships,
and there is live acceptance for it:
[`ai-services/tests/test_parse_presets.py`](../ai-services/tests/test_parse_presets.py)
(`test_vietnamese_preset_extracts_and_translates`) asserts a Vietnamese report is parsed,
severity-classified, population-estimated, and translated.

**Cost of the swap.** None for parsing. A country pack may still add local lexicon terms
(local words for *flooded*, *cut off*, *evacuation centre*) to raise extraction confidence.

---

### 6 — Intake channel + gazetteer

**What LUWAS needs.** A way for a phone with no data connection to deliver a report, and a
place-name table that resolves what the reporter wrote to a unit on the map.

**PH today.** Inbound SMS via a Semaphore-style webhook
([`web/app/api/sms/route.ts`](../web/app/api/sms/route.ts)); name resolution through
`findBarangayByName` ([`web/lib/sms/barangay.ts`](../web/lib/sms/barangay.ts)) against the
Cebu `barangays` table, with unresolved names flagged for coordinator review rather than
guessed ([`web/lib/sms/handle.ts`](../web/lib/sms/handle.ts)).

**VN equivalent.** SMS through a local aggregator; Zalo is the messaging channel with real
reach in Vietnam and is the obvious second intake. The gazetteer becomes the ward table
from surface 1.

**Cost of the swap.** One webhook adapter per channel (the inbound payload is normalised
in [`web/lib/sms/normalize.ts`](../web/lib/sms/normalize.ts), so the parse-and-store path
is already channel-agnostic), and the gazetteer follows surface 1 for free.

**This port is visible in the demo.** The Vietnamese preset
([`web/lib/demo/presets.ts`](../web/lib/demo/presets.ts)) parses and geocodes to
`phường An Hải` against the Đà Nẵng gazetteer, then scores and dispatches like any other
report.

Getting there took one thing worth recording: SEA-LION returns the location romanized
("An Hai Ward, Da Nang"), which matched nothing against the stored "Phường An Hải". A
correctly parsed report was landing flagged for want of five accents. The fix
([`20260810002000_barangay_name_normalized.sql`](../supabase/migrations/20260810002000_barangay_name_normalized.sql))
stores a diacritic-folded name and folds the query the same way, so both sides meet as
ASCII. That is the shape of most country-pack work: not models, but the boring seam
between how a name is written and how it is said.

Intake is still SMS. **Zalo — the channel with real reach in Vietnam — is not
implemented**; it needs one webhook adapter against the already channel-agnostic
[`normalize.ts`](../web/lib/sms/normalize.ts).

---

## Say / don't say

| Say | Don't say |
| --- | --- |
| "Đà Nẵng is loaded and routes; three of six surfaces are done and we name the other three." | "LUWAS supports Vietnam." |
| "The ward boundaries are the post-July-2025 ones, and the populations are tagged to gis.vn." | "We have Vietnamese government data." |
| "The hazard layer is a geographic proxy — distance to mapped water and coastline." | *(letting a hazard-shaded map imply VNDMA)* |
| "The parser model is post-trained on Vietnamese and a Vietnamese report is covered by an acceptance test." | "The system is validated in Vietnam." |
| "Swapping the impact history is swapping a CSV — TabPFN is in-context, so there is no retraining step." | "Accuracy will hold in Vietnam." |
| "Accuracy at a new context must be re-measured with the LOTO harness." | *(quoting PH accuracy as if it were VN accuracy)* |
