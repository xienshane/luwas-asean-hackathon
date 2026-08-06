# Privacy & Data Protection — LUWAS

How LUWAS handles personal data, and how that handling aligns with the
**Data Privacy Act of 2012 (Republic Act No. 10173, "RA 10173")** and the
National Privacy Commission (NPC) implementing rules.

LUWAS is a disaster-response coordination prototype. It deliberately collects as
little personal data as the mission allows, controls access to it by role, and
deletes the most sensitive data on a short clock. This document is the
privacy-by-design record for the system and the audit reference for the Phase 6.2
hardening.

> **Status note.** Several items below are *technical* controls that exist in the
> codebase today (RLS, the retention purge job, the consent gate). Others are
> *organizational* steps a deploying NGO/LGU must complete for a live operation
> (appointing a Data Protection Officer, NPC registration, a signed privacy
> notice). Those are marked **[operational]** so the line between "built" and
> "to-do for production" stays honest.

---

## 1. Data we process (inventory)

| Data | Where | Sensitivity | Why we hold it |
|------|-------|-------------|----------------|
| Volunteer **full name** | `volunteers.full_name` | Personal info | Identify responders to a coordinator. |
| Volunteer **phone** | `volunteers.phone` | Personal info | Contact a responder during dispatch. |
| Volunteer **precise GPS** | `volunteers.last_location` (+ `last_location_at`) | **Sensitive** (location) | Live coordinator map of who is where, to route safely. |
| Reporter identity | `field_reports.reporter_id` → `profiles` | Personal info | Attribute a field report; enforce per-row access. |
| Report **location** | `field_reports.location` | Personal/operational | Place a need on the map (tied to a barangay). |
| Account identity / role | `profiles` (`auth.users`) | Personal info | Authentication and role-based access. |

Each PII column is **tagged in the schema** (`comment on column … is 'PII'`) in
`supabase/migrations/20260603083354_init_schema_extensions_rbac.sql`, so the
sensitive surface is explicit and greppable.

**Not collected:** no demographic profiling of disaster-affected individuals, no
biometrics, no payment data. Impact prediction operates on *aggregate*
province/barangay features (population, housing, hazard exposure), never on
identified persons.

---

## 2. General principles — RA 10173 §11

- **Transparency.** Volunteers see an explicit, plain-language consent disclosure
  before any location is shared (§3 below). All AI outputs are labeled assistive
  and overridable (see `docs/ETHICS.md`).
- **Legitimate purpose.** Every field exists for disaster coordination — the
  inventory above states the purpose for each.
- **Proportionality.** Data is the minimum needed: scope is **Cebu-only**; only a
  volunteer's **latest** position is kept (no GPS trail — the update RPC
  overwrites in place); analytics run on aggregates, not individuals.

---

## 3. Consent and lawful basis — RA 10173 §12–§13

- **Precise location is consent-gated.** Live GPS is **sensitive personal
  information** (§3(l) — specific location). LUWAS requires **affirmative,
  informed consent** before any position is streamed: enabling sharing opens a
  disclosure stating *what* is collected, *who* sees it (coordinators only), *how
  long* it is kept (latest-only, purged after 7 days), and the right to stop
  anytime. Consent is recorded as `volunteers.consent_at` only on the volunteer's
  explicit acceptance.
  - *Implementation:* `web/components/volunteer/LocationSharingCard.tsx`
    (consent disclosure + `acceptConsent`); the timestamp column is
    `volunteers.consent_at`.
- **Other processing** (a volunteer's own name/phone, their own field reports)
  rests on the volunteer's account relationship and the legitimate interest of
  coordinating relief — and is access-restricted by RLS regardless.
- **[operational]** A deploying organization should attach a written privacy
  notice at volunteer onboarding and, where applicable, register with the NPC.

---

## 4. Access control — RA 10173 §20 (security / authorized access)

Access is enforced in the database with **Row-Level Security**, not just in the
app, so the control holds even if a client is bypassed.

- **Profiles** are the canonical role source (`coordinator` | `volunteer`); a
  volunteer cannot escalate their own role (guarded trigger).
- **Volunteer PII** (`volunteers`): readable only by **the owning volunteer** or a
  **coordinator** — a volunteer cannot read another volunteer's name, phone, or
  **precise GPS**.
- **Field reports**: a reporter reads their own; coordinators read all.
- **Planning tables** (predictions, manifests, routes): coordinator-only.
- **Reference data** (barangays, roads): readable by any authenticated user;
  writable only by coordinators.
- **Service role** (AI services, data pipeline, cron) bypasses RLS by design and
  is never exposed to the browser.

*Proven by tests:* `supabase/tests/database/rls_test.sql` asserts a volunteer is
blocked from reading another volunteer's **phone and precise GPS**, can read their
own, and a coordinator can read aggregates.

---

## 5. Retention and disposal — RA 10173 §11(e)

Personal data is kept "no longer than necessary."

- **Precise volunteer GPS** is the most sensitive field, so it is purged on the
  shortest clock: a daily `pg_cron` job nulls `last_location` /
  `last_location_at` once a volunteer's last fix is **older than 7 days**
  (configurable). Each run writes an audit row.
  - *Implementation:* `purge_stale_volunteer_gps(retention_days int default 7)`
    + the `purge-stale-volunteer-gps-daily` cron job, in
    `supabase/migrations/20260617160000_pii_retention_purge.sql`.
  - *Audit:* every purge appends to `public.pii_retention_runs`
    (timestamp, window, rows purged) — coordinator-readable — for accountability.
  - *Proven by tests:* `supabase/tests/database/pii_retention_test.sql` (stale GPS
    is nulled, a recent fix is preserved, only GPS is cleared, the run is audited,
    re-running is a no-op).
- **No location trail.** Because only the latest position is stored, there is no
  movement history to retain or leak in the first place.
- **Field reports** are retained as the operational record of a need (linked to a
  barangay); they are **not** purged by the GPS job. **[operational]** a live
  deployment should set an operation-end retention/anonymization policy for them.

---

## 6. Data-subject rights — RA 10173 §16

- **Access / correction.** A volunteer can read and update their own
  `volunteers` and `profiles` rows under RLS (self-service).
- **Erasure / "right to be forgotten."** Deleting the `auth.users` row cascades
  to `profiles` and `volunteers` (`on delete cascade`), removing the person's PII;
  precise GPS additionally expires on the retention clock.
- **Object / withdraw consent.** Turning location sharing off stops streaming
  immediately; the stored position then ages out within the retention window.
- **[operational]** A production deployment should publish a contactable channel
  (the DPO) for rights requests and a response SLA.

---

## 7. Fairness and non-discrimination

Privacy hardening includes guarding against *biased* processing of the people
LUWAS serves:

- **Segmented error monitoring.** The impact model's error is broken down by
  **community type** — the social-vulnerability proxies already in the model
  (`structural_vuln_frac`, `unimproved_water_frac`) — to flag **systematic
  under-prediction** for more-vulnerable communities, which would otherwise
  silently under-allocate relief. The monitor reports per-bucket error *and
  direction* (a negative bias on a high-vulnerability bucket is the flag).
  - *Implementation:* `ai-services/scripts/eval/segmented.py`
    (tested in `ai-services/tests/test_segmented_error.py`); wired into the LOTO
    harness, output at `docs/impact_segmented_error.md` / `.json`.
  - This is the monitoring substrate the **fairness framework**
    (`docs/FAIRNESS.md`) builds on. A bucket is *flagged* only above a stated
    materiality threshold (`docs/FAIRNESS.md` §3.2); raw signed error is
    reported for every bucket regardless.
- **Assistive AI.** Every prediction and manifest is overridable by a human
  coordinator; confirmation is required at the ethically-loaded gates. See
  `docs/ETHICS.md`.

---

## 8. Security measures — RA 10173 §20

- **Authorization** at the data layer via RLS (Section 4), not only the app.
- **Least privilege**: SECURITY DEFINER helpers are revoked from `public` and
  granted only to the roles that need them; the service-role key is server-side
  only.
- **Transport encryption** via Supabase/Vercel HTTPS; secrets in environment
  configuration, never in the client bundle.
- **Auditability**: role changes are guarded; PII purges are logged.
- **[operational]** breach assessment & NPC/▁data-subject notification within 72
  hours (§20(f) / NPC Circular 16-03), a named DPO (§21), and periodic access
  review are organizational controls for a live operation.

---

## 9. Accountability — RA 10173 §21

- This document is the privacy-by-design record; `docs/ETHICS.md` covers the
  human-in-the-loop governance model.
- Technical controls are versioned as code (migrations + tests cited above), so
  the privacy posture is reviewable and reproducible.
- **[operational]** the deploying organization is the Personal Information
  Controller and must appoint a Data Protection Officer and maintain its records
  of processing.

---

## 10. Summary

LUWAS minimizes what it collects (Cebu-only, latest-position-only, aggregates for
analytics), restricts access by role at the database layer, gates precise GPS
behind explicit consent, deletes that GPS on a 7-day clock with an audit trail,
and monitors the model for biased under-prediction of vulnerable communities.
The remaining items to reach full RA 10173 operating compliance are
organizational (DPO, NPC registration, written notice, breach SLA) and are marked
**[operational]** above.
