# Decision Governance & Human-in-the-Loop — LUWAS

How LUWAS places human judgment in the loop, and — just as deliberately — where it
keeps humans *out* of the loop so the system stays fast enough to be useful in the first
hours after a typhoon.

This document resolves a specific piece of expert review (CIT-U, 2026-06-16, "Feedback 1"):

> *Human-in-the-loop should be reserved for ethical decisions, not every step.*

We agree. A blanket "a human must approve everything" rule sounds responsible but is the
opposite of responsible in a disaster: it adds friction to compute-only steps that have no
ethical content, slows the coordinator down, and trains people to rubber-stamp. LUWAS uses a
**two-tier model** instead.

---

## 1. The two tiers

| Tier | What it means | Friction | Where it applies |
|------|---------------|----------|------------------|
| **Override — everywhere** | Every AI output is *assistive*. The coordinator can edit or replace any prediction, manifest line, or route at any time, with no special mode and no approval needed to make a change. | Zero. Always available, never required. | All AI outputs. |
| **Confirm — only at ethical gates** | A small number of *ethically-loaded* actions require an explicit human sign-off before they take effect. These are the points where the system commits scarce relief resources or commits unverified data as if it were ground truth. | Deliberate. Required at these points and nowhere else. | 4 gates (Section 3). |

The distinction is the whole design. **Override** answers *"can a human always be in
control?"* — yes, everywhere. **Confirm** answers *"where must a human take responsibility
before the system acts?"* — only where an action allocates real-world resources or treats a
machine guess as fact. Everything in between runs automatically.

> **Principle.** LUWAS is decision-*support*, not a decision-*maker*. The AI narrows
> options and quantifies its own uncertainty; a human owns every consequential decision.
> All AI outputs are assistive by construction — this is a project-wide rule
> (see `CLAUDE.md` → Rules: *"All AI outputs are ASSISTIVE: coordinator can override every
> prediction and manifest."*).

---

## 2. The pipeline, step by step — gated vs. auto-flow

The end-to-end pipeline is:

```
field report → Silent Area rescore → TabPFN impact → Sphere manifest → OR-Tools route → map
```

Here is every step, whether it requires a human sign-off, and *why*:

| # | Step | Gate? | Rationale |
|---|------|-------|-----------|
| 1 | **Field report arrives** (app / SMS / parsed text) | **Confirm — if low-confidence** | A *high*-confidence structured report flows in automatically. A *low*-confidence parse is flagged for review rather than auto-committed (Gate D). Committing an unverified machine reading of a human's words *as fact* is ethically loaded. |
| 2 | **Silent Area rescore** | **Auto** | Pure deterministic SQL: `score = pop_density_norm × hazard_norm × time_factor`. No ethical content — it re-ranks who *might* need attention; it commits nothing. Re-runs every 15 min on `pg_cron` regardless. |
| 3 | **TabPFN impact prediction** | **Auto** | A statistical estimate with explicit uncertainty (Section 4). It is an input to a human decision, not a decision. Gating it would gate *thinking*. |
| 4 | **Sphere manifest generation** | **Auto (to compute) / Confirm (to act)** | Computing the recommended manifest from the Sphere standard is deterministic and runs automatically. *Approving* that manifest for dispatch is Gate B. |
| 5 | **OR-Tools route computation** | **Auto (to compute) / Confirm (to act)** | Solving the VRP over the real-road pgRouting matrix is math. *Dispatching* a team onto a route is Gate C. |
| 6 | **Dynamic re-route** on a flagged road | **Auto** | When a road is flagged impassable, the edge cost is raised and routing avoids it automatically — the *human input* is the flag; recomputing the route is mechanical. |
| 7 | **Map / dashboard update** | **Auto** | Showing information to a human is the opposite of a risk. |

**Read this table top-to-bottom and the rule is visible:** the only gates are at steps that
**commit resources** (manifest approval, dispatch) or **commit unverified data as truth**
(low-confidence report). Steps 2, 3, 5-compute, 6, and 7 — the AI's actual "thinking" — are
**not gated**. That is the point of the design, and it is the direct answer to Feedback 1.

---

## 3. The four ethical gates (and only these)

Each gate below is real and implemented. File references are given so the claim is
auditable, not aspirational.

### Gate A — Confirming a field report before it drives the pipeline
A field report (especially a **Day-0 forecast**, generated from a uniform storm scenario
with no per-barangay field confirmation) is shown as **"Predicted — Unconfirmed (Day 0)"**
and stays override-able. The coordinator explicitly confirms a report, which flips its
status to `confirmed` and lets it drive rescoring/prediction as ground truth.
- *Why it's a gate:* treating an unverified estimate as a confirmed fact changes who gets
  prioritized. A human takes responsibility for that promotion.
- *Implementation:* `handleConfirmReport` sets `field_reports.status = 'confirmed'`
  (`web/components/coordinator/CommandDashboard.tsx`); the Day-0 "Unconfirmed" badge is in
  `web/components/coordinator/RightIntelligencePanel.tsx`.

### Gate B — Approving a supply manifest before dispatch
The manifest view states plainly: **"Human approval required before dispatch."** Approve /
Reject runs through an explicit confirmation dialog and is recorded to an action log (with a
snapshot of the exact manifest approved).
- *Why it's a gate:* this commits scarce relief supplies to a specific community. It is the
  canonical "ethically-loaded final allocation" decision.
- *Implementation:* `ConfirmationDialog` + `confirmAction` + the 50-entry action history in
  `web/components/coordinator/ManifestsView.tsx`; the override-and-approve surface is in
  `web/components/coordinator/RightIntelligencePanel.tsx` (Supplies tab).

### Gate C — Confirming a dispatch
Dispatch is never automatic: **"Dispatch requires human confirmation — no automatic
dispatches are executed."** OR-Tools proposes ETAs and ordered stops; a human commits a
team to them.
- *Why it's a gate:* this sends real people into a post-disaster environment. Maximum
  ethical weight.
- *Implementation:* `onDispatchTeam` is wired to an explicit per-team **Dispatch** button in
  `web/components/coordinator/RightIntelligencePanel.tsx` (Dispatch tab).

### Gate D — Committing a low-confidence NLP extraction
SEA-LION (with a Gemini fallback) parses unstructured Bisaya/Filipino/Tagalog field text and
attaches a per-field and overall confidence. Extractions **below the confidence threshold
(`parse_confidence_threshold = 0.6`)** are marked `flagged` / `needs_review` and are **not
auto-committed**; they wait for a coordinator to review.
- *Why it's a gate:* auto-committing a shaky machine reading of a human's words can silently
  corrupt the operating picture. A human verifies before it counts.
- *Implementation:* `parser.py` (`status = "flagged" if needs_review else "pending"`,
  `ai-services/app/services/parser.py`; threshold in `ai-services/app/core/config.py`);
  mirrored on the SMS path in `web/lib/sms/handle.ts` (`status: 'pending' | 'flagged'`).

There are **no other mandatory human gates** in the pipeline. If a future change adds one, it
should clear the same bar: *does this step allocate real resources, or commit unverified data
as truth?* If not, it auto-flows.

---

## 4. Why "override everywhere" is enough for the auto-flow steps

The intermediate AI steps (rescore, predict, route-compute) are safe to auto-flow precisely
*because* override is always available **and** the AI surfaces its own uncertainty, so the
human reviewing the *output* is never misled into trusting a shaky number.

- **Uncertainty is shown, not hidden.** TabPFN produces probabilistic predictions, not bare
  point estimates. Internally it computes an **80% predictive interval** (quantiles 0.1–0.9);
  LUWAS surfaces this as a per-head **confidence** value (tighter interval → higher
  confidence) plus a four-level **severity class** (`low` / `moderate` / `high` / `severe`).
  See `ai-services/app/services/impact_model.py` and the contract in
  `ai-services/app/models/impact.py` (mirrored in `web/lib/types/impact.ts`).
- **The intervals are calibrated.** Leave-one-typhoon-out validation shows the 80% intervals
  empirically cover ~86% (affected population) and ~90% (damage rate) of held-out truth — so
  "80% confident" means roughly what it says. (See `docs/MODEL_CARD.md`.)
- **Low confidence is visible at the point of decision.** The dashboard shows the confidence
  level next to each prediction, and Day-0 estimates carry an explicit
  **"Predicted — Unconfirmed"** badge.

Because a coordinator always sees *how sure* the model is and can **override any value
inline** (prediction `overrideValue`, and per-line manifest overrides via the "Coordinator
override" panel → **Apply overrides**), there is no need to interrupt them at every
intermediate step. The uncertainty display *is* the human-in-the-loop safeguard for the
auto-flow steps; the explicit confirm gates are reserved for the moments that actually commit
resources.

---

## 5. Anti-pattern check — what we deliberately do *not* gate

To make the "not over-gated" claim concrete, here is what a naïve "approve everything" design
would have forced, and why each is intentionally **not** a gate in LUWAS:

- **Recomputing Silent Area scores** — deterministic re-ranking, commits nothing. Gating it
  would add friction to a 15-minute cron job.
- **Running a TabPFN prediction** — an estimate with uncertainty, not an action. Gating it
  gates the coordinator's own situational awareness.
- **Generating the recommended Sphere manifest** — arithmetic from a published standard. The
  *approval* is gated (Gate B); the *calculation* is not.
- **Computing a route** — VRP math over real roads. The *dispatch* is gated (Gate C); the
  *computation* is not.
- **Re-routing around a flagged road** — the human judgment is the road flag itself;
  recomputing the avoidance path is mechanical.

Each of these is an *intermediate AI step* with no independent ethical content. Forcing a
sign-off on them would slow the coordinator without protecting anyone — the failure mode
Feedback 1 warns against. LUWAS keeps them automatic and keeps the human's attention for the
four decisions that genuinely warrant it.

---

## 6. Summary

- **Override is universal and frictionless.** Every AI output is assistive; the coordinator
  can change anything, anytime, with no approval.
- **Confirmation is rare and reserved.** Exactly four gates, each guarding a moment that
  commits relief resources or commits unverified data as truth: confirm a report (A), approve
  a manifest (B), dispatch a team (C), commit a low-confidence parse (D).
- **Intermediate AI steps auto-flow** — and that is a feature. Uncertainty is surfaced and
  overrideable, so speed and human control coexist without a sign-off on every step.

This is the answer to "human-in-the-loop for ethical decisions, not every step": LUWAS puts
the human exactly where the ethics are, and lets the machine do the math everywhere else.
