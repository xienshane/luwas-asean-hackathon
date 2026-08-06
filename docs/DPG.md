# Digital Public Good (DPG) Standard — Mapping

LUWAS mapped against the **9 indicators of the DPG Standard**, each pointing at the repo
artifact that satisfies it. Where an indicator is only partly met, this document says
**what is missing** rather than claiming it is met — the registry review reads the repo,
and a mapping that overstates is worse than one that is honest about a gap.

**Registry status:** `not yet filed` — see [Submission](#submission) at the end.

> **Language discipline.** "Submitted to the DPG Registry" becomes true the moment the
> submission is filed. **"A recognised Digital Public Good" is not true until the DPGA
> says so.** These are different claims and must not be blurred.

---

## The nine indicators

| # | Indicator | Status | Evidence in this repo |
| --- | --- | --- | --- |
| 1 | Relevance to SDGs | met | [SDG relevance](#1--relevance-to-sdgs) below; [`README.md`](../README.md) |
| 2 | Use of approved open license | met | [`LICENSE`](../LICENSE) — MIT |
| 3 | Clear ownership | **partial** | [`LICENSE`](../LICENSE) copyright line; see gap |
| 4 | Platform independence | met | [`ai-services/Dockerfile`](../ai-services/Dockerfile), [`supabase/migrations/`](../supabase/migrations), [`docs/DEPLOY.md`](DEPLOY.md) |
| 5 | Documentation | met | [`README.md`](../README.md), [`CLAUDE.md`](../CLAUDE.md), [`docs/DEPLOY.md`](DEPLOY.md), [`docs/MODEL_CARD.md`](MODEL_CARD.md), [`docs/COUNTRY_PACKS.md`](COUNTRY_PACKS.md) |
| 6 | Mechanism for extracting data | met | [`web/app/api/sitrep/route.ts`](../web/app/api/sitrep/route.ts); open Postgres schema in [`supabase/migrations/`](../supabase/migrations) |
| 7 | Adherence to privacy & applicable laws | met | [`docs/PRIVACY.md`](PRIVACY.md) — mapped to RA 10173 section by section |
| 8 | Adherence to standards & best practices | **partial** | Sphere, PSGC, OSM, pgRouting, PSA; see gap |
| 9 | Do no harm by design | met | [`docs/ETHICS.md`](ETHICS.md), [`docs/FAIRNESS.md`](FAIRNESS.md), [`docs/PRIVACY.md`](PRIVACY.md), [`docs/MODEL_CARD.md`](MODEL_CARD.md) §2 |

---

### 1 — Relevance to SDGs

**Primary: SDG 13.1** — *strengthen resilience and adaptive capacity to climate-related
hazards and natural disasters.* LUWAS is post-disaster logistics coordination for
intensifying typhoons; the pilot region is Cebu, Philippines.

**Also:** SDG 11.5 (reduce deaths and people affected by disasters), SDG 6.1 (the Sphere
water standard, 15 L/person/day, drives the supply manifest), SDG 2.1 (2,100 kcal/person/day).

**Evidence:** [`README.md`](../README.md), [`CLAUDE.md`](../CLAUDE.md); the deterministic
Sphere formula in `web/lib/` and the Silent Area scoring in
[`supabase/functions/`](../supabase/functions).

### 2 — Use of approved open license

MIT, in [`LICENSE`](../LICENSE) — an OSI-approved license on the DPGA's approved list.
Badged in [`README.md`](../README.md).

### 3 — Clear ownership — **partial**

**Met:** [`LICENSE`](../LICENSE) carries an explicit copyright holder.

**Missing:** no `CONTRIBUTING.md` and no governance/maintainer statement naming who
accepts contributions and how ownership transfers. There is no trademark to declare. This
is a documentation gap, not a licensing ambiguity — the MIT grant is unqualified.

### 4 — Platform independence

No proprietary lock-in in the core:

- **Database:** plain Postgres + PostGIS + pgRouting, as versioned SQL in
  [`supabase/migrations/`](../supabase/migrations). It runs on any Postgres with those
  extensions; Supabase is a hosting choice, not a dependency of the schema.
- **AI services:** one FastAPI app in a [`Dockerfile`](../ai-services/Dockerfile) — runs
  anywhere Docker runs; Hugging Face Spaces is a free-tier deploy target.
- **Web:** Next.js, deployable to any Node host; Vercel is a choice.
- **Models:** TabPFN and OR-Tools are open-source pip packages. SEA-LION is reached over
  an OpenAI-compatible API, so the provider is swappable (a Gemini fallback already
  exercises that seam).

Deploy targets and their alternatives: [`docs/DEPLOY.md`](DEPLOY.md).

### 5 — Documentation

- **Users/operators:** [`README.md`](../README.md) — setup, the judge's guide, the
  operating flow.
- **Architecture:** [`CLAUDE.md`](../CLAUDE.md), [`docs/DEPLOY.md`](DEPLOY.md).
- **Model:** [`docs/MODEL_CARD.md`](MODEL_CARD.md) — intended use, validation at both
  configurations, limitations and mitigations; raw results in
  [`docs/impact_validation_results.md`](impact_validation_results.md).
- **Adaptation to another country:** [`docs/COUNTRY_PACKS.md`](COUNTRY_PACKS.md).
- **User testing:** [`docs/USER_TESTING.md`](USER_TESTING.md) — protocol for the coordinator
  dispatch flow. Results are not yet recorded, and the document says so.

### 6 — Mechanism for extracting data

- **Situation report:** [`web/app/api/sitrep/route.ts`](../web/app/api/sitrep/route.ts) —
  the whole operation as a structured read model, shaped for ADINet situation-update
  fields, coordinator-authenticated.
- **Schema:** every table is defined in open SQL under
  [`supabase/migrations/`](../supabase/migrations), so any Postgres client can export
  directly. No proprietary format anywhere in the pipeline.
- **Evaluation artifacts:** JSON alongside every published Markdown report
  (`docs/impact_validation_results.json`, `docs/impact_segmented_error.json`).

Note that PII extraction is deliberately *constrained* rather than open — see indicator 7.

### 7 — Adherence to privacy and applicable laws

[`docs/PRIVACY.md`](PRIVACY.md) maps the system to the Philippine Data Privacy Act
(RA 10173) section by section: inventory (§11), consent and lawful basis (§12–13), access
control (§20), retention and disposal (§11(e), enforced by
[`supabase/migrations/20260617160000_pii_retention_purge.sql`](../supabase/migrations/20260617160000_pii_retention_purge.sql)),
data-subject rights (§16), security (§20), accountability (§21).

Volunteer GPS, names, and phone numbers are minimized, access-controlled by RLS, and
retention-bound.

### 8 — Adherence to standards & best practices — **partial**

**Met:**
- **Sphere Handbook** minimum standards drive the supply manifest (15 L water and
  2,100 kcal per person per day) — deterministic, no model.
- **PSGC** administrative codes; **PSA 2020** population; **OSM** boundaries and road
  network; **pgRouting** for real road distances (never Euclidean).
- **ADINet** situation-update field shape for the SitRep export.
- Model reporting follows the **model card** convention, with segmented error monitoring
  ([`docs/FAIRNESS.md`](FAIRNESS.md)).

**Missing:** no formal **WCAG accessibility audit** has been performed on the coordinator
dashboard or the volunteer PWA. Contrast and keyboard affordances were designed for, but
designed-for is not audited, and this document will not claim otherwise. No formal
interoperability certification (e.g. HXL tagging on exports) either.

### 9 — Do no harm by design

- **Every AI output is assistive.** The coordinator can override every prediction and
  every manifest. The gate structure is specified in [`docs/ETHICS.md`](ETHICS.md)
  (four explicit human gates, and an argued list of what is deliberately *not* gated).
- **Fairness monitoring:** [`docs/FAIRNESS.md`](FAIRNESS.md) plus a published segmented
  error report with a stated materiality threshold
  ([`docs/impact_segmented_error.md`](impact_segmented_error.md)).
- **Stated limitations:** [`docs/MODEL_CARD.md`](MODEL_CARD.md) §2 names geographic
  granularity, historical-data drift, and over-reliance on AI, each with its mitigation.
- **Data minimization and retention limits:** [`docs/PRIVACY.md`](PRIVACY.md).
- **No dark patterns, no collection beyond the operational need**, and the deterministic
  core (Sphere formula, routing) is visible and reviewable rather than model-hidden.

---

## Submission

The DPG Registry submission is filed at <https://app.digitalpublicgoods.net/>. It requires
an account and an authorised submitter, so it is filed by a project owner, not generated
from this repo.

**Status:** `not yet filed`
**Date filed:** —
**Nominee URL:** —

Before filing, confirm each indicator row above still resolves on the submitted branch.
When filed, update the three fields above and change the registry status at the top of
this document to `submitted`. Do not change it to `recognised` unless and until the DPGA
issues that determination.
