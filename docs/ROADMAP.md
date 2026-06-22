# LUWAS — Post-Hackathon Roadmap

This document answers the CIT-U Shane-nanigans expert review items that are **out of scope
for the hackathon window but on the credible path** — as a plan, not silence. Each deferred
reviewer issue maps to a roadmap entry with a foundation, a near-term slice, the full build,
and rough sequencing.

It is deliberately honest about three things: what is **already in the codebase**, what is
**committed near-term** (the feedback sprint, not yet merged), and what is **genuinely
deferred** because it is data-, compute-, or field-gated. A judge who can tell the three
apart trusts all three.

> Companion docs: validation numbers live in `docs/MODEL_CARD.md`, the vulnerability/fairness
> framework in `docs/FAIRNESS.md`, the human-in-the-loop model in `docs/ETHICS.md`, and the
> running system in `docs/DEPLOY.md`.

---

## How to read this

**Status labels**

- **Built** — in the repository today (file/migration cited).
- **Near-term** — committed for the post-hackathon feedback sprint (dev-plan tasks 4.3–4.7,
  5.1); surfaces latent capability, no new data dependency. Not yet merged.
- **Roadmap** — the full version below; data-, compute-, or field-gated.

**Horizons** (rough sequencing — calendar is indicative, gates are real)

| Horizon | Window | Theme |
| --- | --- | --- |
| **H1 — Near term** | 0–3 months | Surface latent capability; finish the feedback sprint; ship the simulated tabletop exercise. No new data dependency. |
| **H2 — Mid term** | 3–9 months | Funded pilot with Cebu partners; ingest free high-res + live feeds; collect labels and a disaster-comms corpus; scope the first ASEAN pack. |
| **H3 — Long term** | 9–18 months | Train the barangay-level model; multi-sensor fusion + retraining cadence; fine-tune SEA-LION; ASEAN country packs in production. |

---

## Snapshot — reviewer issue → status

The full-resolution versions of these five issues are this roadmap. The cheap slices that
correct the record or surface existing capability are tracked in the dev plan and noted here
so the deferral is honest, not evasive.

| Issue | In the codebase today | Near-term slice (committed) | Full build (this roadmap) | Horizon |
| --- | --- | --- | --- | --- |
| **1 — Granularity** | Province/municipality TabPFN (`impact_model.py`); per-barangay NOAH hazard exposure; barangay-level operational priority via `silent_area_score()` | Expose 80% intervals (4.3); enrich composite priority (4.4) = hierarchical *refinement* at inference | **R1** — *trained* barangay-level model + hierarchical training pipeline | H1→H3 |
| **3 — Historical-only data** | Model trained on 2010–2020 impact (`training_table.csv`); `max_wind_kmh` ingestion hook stubbed in `build_training_table.py` | One free live rainfall/wind signal via the hook or as a map overlay (4.7, stretch) | **R2** — multi-sensor real-time fusion + retraining cadence | H1→H3 |
| **4 — NLP misinterpretation** | SEA-LION parser with per-field confidence, low-confidence review flag, Gemini fallback, rate limiter (`parser.py`) | Few-shot disaster lexicon + ~20-item gold-set eval + confirm low-confidence gating (4.6) | **R3** — fine-tune on a curated disaster-comms corpus | H1→H3 |
| **9 — No field validation** | End-to-end pipeline runs on real Cebu City data; demo reframed as a simulated exercise | Tabletop simulated exercise scripted for the demo | **R4** — staged pilot with named Cebu partners | H1→H2 |
| **10 — ASEAN expansion** | Modular by design: 3 liftable FastAPI routers, parameterized SQL, SEA-LION multilingual across ASEAN, Cebu-scoped data | Document the per-country pack model (this doc) | **R5** — per-country dataset/hazard/routing/language/policy packs | H2→H3 |

**Dependency spine:** the pilot (**R4**) is also the *data engine* — partner incident logs
become the barangay-level labels that **R1** needs, and a live activation is where **R2**'s
feeds and **R3**'s corpus get collected. So R4 is sequenced first among the heavy items;
R1/R2/R3 deepen as R4 produces data.

---

## R1 — Barangay-level high-resolution impact prediction
*Reviewer Issue 1 (full). Horizon: H1 framing → H3 trained model.*

**The honest gap.** Today the impact model predicts at province/municipality resolution
(~1.26k province-event training rows). That is the right disclosure the reviewer noted — but
disaster decisions are made at the barangay, where flooding and landslides are local.

**Foundation already built.** Operational *priority* is already barangay-resolution: a
province-level impact magnitude is the prior, and it is sharpened to the barangay by local
signals that already exist — `silent_area_score()` (population density × NOAH hazard exposure
× contact-silence, per barangay), live field reports, and per-barangay NOAH flood/landslide/
surge exposure in Supabase. What is coarse is the *magnitude prior*, not the map.

**Near-term (H1).** Formalize this as explicit **hierarchical refinement at inference**:
expose the 80% predictive interval the model already computes (task 4.3, `impact_model.py`
quantiles), and blend the coarse prior with barangay live signals + structural vulnerability
into the priority score (task 4.4). This is the reviewer's "hierarchical framework" delivered
at inference time without new data.

**Roadmap — the full build (H2 → H3).** A *trained* barangay-level model with partial
pooling (province posterior as a prior on barangay random effects), fed by higher-resolution
data that does not exist in the project yet:

| Step | Work | Gate / source | Horizon |
| --- | --- | --- | --- |
| 1 | Keep NOAH hazard at full bin resolution per barangay (currently rasterized to one value/barangay) | Already on disk (`project-noah/`) | H2 |
| 2 | Ingest free high-res layers: Sentinel-1/2 imagery (Copernicus, free), GPM/IMERG rainfall, OSM flood-prone tags | Free APIs; storage budget | H2 |
| 3 | Collect barangay-level disaster-outcome labels via the **R4 pilot** (partner incident logs, post-event damage surveys) | **Blocked on R4** | H2→H3 |
| 4 | Train hierarchical model (province prior → barangay effects); validate leave-one-typhoon-out at barangay grain | Labels from step 3 | H3 |

**Binding constraint:** barangay-level *labels*. No amount of imagery substitutes for ground
truth at that grain — which is exactly why the pilot (R4) is the unlock, not a nice-to-have.

---

## R2 — Multi-sensor real-time environmental fusion
*Reviewer Issue 3 (full). Horizon: H1 single signal → H3 fusion.*

**The honest gap.** The model trains on 2010–2020 cyclone impact. Climate change is shifting
the distribution out from under historical data — stronger, wetter, less predictable storms.

**Foundation already built.** `build_training_table.py` carries a marked deferred hook for a
per-event intensity feature (`max_wind_kmh`), so the model is structurally ready to accept a
live intensity signal rather than only historical category.

**Near-term (H1).** Wire **one** free near-real-time signal — current rainfall/wind for the
active-storm scenario from a free source (e.g. Open-Meteo, no key; PAGASA advisories) — into
the intensity hook, or surface it as a coordinator map overlay that informs triage. Cached
and degrading gracefully so feed failure never breaks the pipeline (task 4.7). This alone
moves LUWAS off purely-historical inputs — the core climate-adaptation answer.

**Roadmap — the full build (H2 → H3).** Fuse multiple live environmental streams and retrain
on a cadence rather than once:

| Step | Signal | Free/low-cost source | Horizon |
| --- | --- | --- | --- |
| 1 | Rainfall + wind (single feed) | Open-Meteo / PAGASA — *near-term 4.7* | H1 |
| 2 | River levels / water-level gauges | PAGASA hydromet, LGU sensors via the pilot | H2 |
| 3 | Soil moisture | NASA SMAP / Sentinel-1 derived | H2 |
| 4 | Satellite flood extent (post-event) | Sentinel-1 SAR, Copernicus EMS | H3 |
| 5 | Fusion + scheduled retraining | feature store + retrain cadence; live signals weighted against historical prior | H3 |

**Degradation contract (kept at every step):** every live feed is optional. If a feed is
down, LUWAS runs on the historical prior. Live intelligence sharpens the estimate; it is
never a single point of failure.

---

## R3 — SEA-LION fine-tuning on a curated disaster corpus
*Reviewer Issue 4 (full). Horizon: H1 prompt hardening → H3 fine-tune.*

**The honest gap.** Field reports are messy — Bisaya/Filipino slang, abbreviations, emotional
language, misspellings ("baha", "lubog", "naa mi sa atop"). Misreads misprioritize relief.

**Foundation already built.** The parser already emits per-field confidence scores, routes
low-confidence extractions to coordinator review instead of auto-committing, falls back to
Gemini on API error, and respects the 10-calls/min free tier (`parser.py`, `models/parse.py`).
Human review *at points of uncertainty* is already the design.

**Near-term (H1).** Harden prompting **without** fine-tuning (SEA-LION's free tier is
API-only): add a curated few-shot disaster-lexicon block to the parse prompt and assert
quality against a ~20-item gold-set of real-style field texts under `ai-services/tests/`
(task 4.6). Confirm the low-confidence → human-review gate holds; no rate-limit regression.

**Roadmap — the full build (H2 → H3).** Fine-tune on an authentic disaster-comms corpus:

| Step | Work | Gate | Horizon |
| --- | --- | --- | --- |
| 1 | Curate a labeled corpus of real field reports (SMS/app/transcribed radio) with gold extractions | Sourced via the **R4 pilot** + partner archives; consent/anonymization (RA 10173) | H2 |
| 2 | Choose the fine-tune surface: an open SEA-LION checkpoint self-hosted, or a provider fine-tune path when available | SEA-LION free API can't be fine-tuned → needs compute budget or a hosted tune | H2→H3 |
| 3 | Fine-tune + eval against the gold-set and the H1 few-shot baseline; ship only on measured improvement | Beat the prompt-only baseline | H3 |

**Note:** the corpus is the asset. Even before fine-tuning, a labeled disaster-comms corpus
improves the few-shot prompt and the gold-set — so step 1 has standalone value.

---

## R4 — Field validation: staged pilot with Cebu partners
*Reviewer Issue 9. Horizon: H1 simulated exercise → H2 supervised live use.*

**The honest gap.** The architecture is sound but unproven in real operations. Humanitarian
environments expose what lab testing cannot.

**Named partners** (the pilot is anchored to real Cebu organizations, not a generic claim):

| Partner | Type | Role in the pilot |
| --- | --- | --- |
| **Cebu City DRRMO** | City LGU | Primary anchor and operational owner for the city pilot; its barangay network and incident logs become the barangay-level labels for **R1**. |
| **Philippine Red Cross – Cebu Chapter** | NGO | Field relief logistics and volunteer network; primary tester of dispatch/routing in the field. |
| **Ramon Aboitiz Foundation Inc. (RAFI)** | NGO / foundation | Local convening, community programs, and resilience-program alignment; supports onboarding and (potential) pilot funding. |
| **Cebu Provincial DRRMO** | Province LGU | Scale-up anchor after the city pilot validates — extends LUWAS province-wide. |

**Staged pilot (each stage is a go/no-go gate):**

| Stage | What | Stakes | Horizon |
| --- | --- | --- | --- |
| 1. **Tabletop simulated exercise** | Replay a real historical event (e.g. Typhoon Odette/Rai, Dec 2021, which severely hit Cebu) on LUWAS with partner coordinators; capture usability, workflow-fit, and trust notes. | None — simulated | H1 |
| 2. **Shadow mode** | Run LUWAS alongside the partner's real SOP during a drill or minor activation; compare recommendations; act on none. | Observational | H2 |
| 3. **Supervised live use** | Coordinators use LUWAS outputs as assistive decision support in a small real activation; override always on; every dispatch human-confirmed. | Real, bounded | H2 |

**Why this ordering:** it de-risks the most ethically loaded step (real allocation) last, and
every stage produces the data that feeds R1/R2/R3. The demo for this hackathon is explicitly
**Stage 1 framed as a simulated exercise** — honest about what it is, and the on-ramp to the
rest.

---

## R5 — Modular ASEAN expansion
*Reviewer Issue 10. Horizon: H2 first pack → H3 in production.*

**The honest gap.** "Scales across ASEAN" is only credible if each country's different
disaster procedures, languages, hazard profiles, and data standards are designed for — a
PH-tuned system can't be assumed to transplant.

**Foundation already built.** LUWAS is modular by construction: three liftable FastAPI
routers (impact / routing / parse, each extractable to its own Space), parameterized SQL
functions (e.g. `tau_hours`), an OSM+pgRouting graph that is already country-agnostic, and —
critically — **SEA-LION is natively multilingual across ASEAN**, so the language layer that
is usually the hardest part of regional expansion is largely a built-in advantage.

**Roadmap — the per-country pack model.** Expansion = swapping five well-bounded packs, not
rebuilding the platform:

| Pack | What swaps | PH baseline → other countries |
| --- | --- | --- |
| **Dataset pack** | population, admin boundaries, historical impact, vulnerability indicators | PSA + HDX → e.g. Indonesia BPS + BNPB DIBI; Vietnam GSO + VNDMA |
| **Hazard pack** | country hazard layers and dominant hazard mix | NOAH (flood/landslide/surge) → e.g. Indonesia InaRISK (adds seismic/volcanic); Mekong river-flood profiles |
| **Routing pack** | OSM extract + local road-condition norms | already country-agnostic — re-run `osm2pgrouting` per region |
| **Language/locale pack** | few-shot lexicon + report locale | **SEA-LION already covers Bahasa Indonesia, Vietnamese, Thai, etc.** — swap the lexicon, not the model |
| **Policy/governance pack** | DRR authority, dispatch SOPs, data-privacy law | PH RA 10173 → Indonesia PDP Law; Vietnam PDPD; per-country escalation gates |

**First expansion targets (H2):** **Indonesia** and **Vietnam** — both carry a high
typhoon/flood burden, both are within SEA-LION's language coverage, and both have national
disaster databases to seed the dataset pack. Each is a pack-assembly exercise on the existing
engine, sequenced after the Cebu pilot (R4) proves the operational model at home first.

---

## Sequencing overview

| | H1 (0–3 mo) | H2 (3–9 mo) | H3 (9–18 mo) |
| --- | --- | --- | --- |
| **R1 Granularity** | Hierarchical refinement at inference (4.3 + 4.4) | High-res layer ingestion; collect barangay labels (via R4) | Train barangay-level hierarchical model |
| **R2 Live data** | One free rainfall/wind feed (4.7) | River + soil-moisture feeds | Multi-sensor fusion + retraining cadence |
| **R3 NLP** | Few-shot lexicon + gold-set (4.6) | Curate labeled disaster corpus (via R4) | Fine-tune + eval vs baseline |
| **R4 Pilot** | Tabletop simulated exercise | Shadow mode → supervised live use | Province scale-up (Cebu PDRRMO) |
| **R5 ASEAN** | — | Assemble first country pack (ID/VN) | Country packs in production |

**Critical path:** R4 (pilot) gates R1 (labels), R2 (live feeds), and R3 (corpus). Fund and
start the pilot first; the model improvements compound on the data it produces.

---

## Honest boundaries — what we are *not* claiming

- We are **not** claiming a barangay-level trained model by demo day — we ship hierarchical
  *refinement* now and a credible path to the trained model (R1).
- We are **not** claiming a live multi-sensor system — we ship one cached free feed and a
  fusion plan with a strict graceful-degradation contract (R2).
- We are **not** claiming a fine-tuned model — we ship a hardened few-shot prompt with a
  human-review gate and a corpus-then-tune plan (R3).
- We are **not** claiming field-proven operations — we ship a simulated exercise and a named,
  staged pilot that reaches real use only under coordinator supervision with override on (R4).

Every AI output in LUWAS is assistive and overridable; this roadmap deepens the evidence
behind those outputs without ever removing the human from the ethically loaded decisions.
