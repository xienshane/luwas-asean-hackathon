# User Testing — Coordinator Dispatch Flow

**Status:** protocol written and runnable; **results not yet recorded** — the tables below
are unfilled. Do not cite this as completed user testing until they are.

**Goal:** 3–5 testers complete the dispatch golden path unaided; capture friction.

## Setup (facilitator)
- Run the prod app: `npm --prefix web run build && npm --prefix web run start`.
- Sign in at http://localhost:3000/login with the seeded coordinator account
  (credentials are in `supabase/seed/00_demo.sql` — local demo data, not a live account).
- Reset state from the dashboard (Reset → confirm) before each tester.

## Task given to each tester (read aloud, no hints)
"You are an NGO coordinator. Find a high-priority barangay, then dispatch a team to it."

## Success = tester, unaided, can:
1. Read the map and identify a red/critical barangay.
2. Open Teams & Dispatch.
3. Select a destination and dispatch a team.
4. See the route appear.

## Record per tester
| Tester | Completed unaided (Y/N) | Time | Where they hesitated | Quote |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Synthesis (for Slide 11)
- Completion rate: __ / __
- Top friction:
- Quick wins:
