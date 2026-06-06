---
title: LUWAS AI Services
emoji: 🌀
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# LUWAS AI Services

One FastAPI app (Hugging Face Space, Docker SDK, free CPU tier) hosting LUWAS's
inference endpoints. Phase 2.2 ships the **impact predictor** and Phase 2.4 the **OR-Tools
routing** solver; parsing (SEA-LION) mounts alongside them in a later phase.

## Endpoints

| Method | Path               | Purpose                                              |
|--------|--------------------|------------------------------------------------------|
| GET    | `/health`          | Liveness + active model framing + TabPFN status.     |
| POST   | `/predict-impact`  | Per-barangay affected-population + damage severity.  |
| POST   | `/optimize-routes` | Multi-team vehicle routing over real (pgRouting) roads. |

### `POST /predict-impact`

Predicts, per barangay feature row, **affected population** (always regressed) and
**damage severity**. The severity head follows the `MODEL_FRAMING` flag: `regressor`
returns a continuous `damage_rate`; `classifier` returns a severity class. Every
prediction carries a confidence and a `source` (`tabpfn` or `heuristic`).

Request body carries the 6 model features from the Phase 1.3 training table:

```json
{
  "features": [
    {
      "category_ordinal": 3,
      "total_houses": 1500,
      "province_housing_units": 60000,
      "province_households": 61000,
      "structural_vuln_frac": 0.25,
      "unimproved_water_frac": 0.12,
      "id": "brgy-123"
    }
  ]
}
```

Response (regressor framing):

```json
{
  "predictions": [
    {
      "affected": 4123,
      "affected_confidence": 0.71,
      "damage_rate": 0.18,
      "damage_rate_confidence": 0.83,
      "severity_class": null,
      "severity_confidence": null,
      "confidence": 0.71,
      "source": "tabpfn",
      "id": "brgy-123"
    }
  ],
  "model_framing": "regressor",
  "latency_ms": 412.7
}
```

The Pydantic models in `app/models/impact.py` are the **canonical contract**;
`web/lib/types/impact.ts` mirrors them.

## Model

- **TabPFN v2** (`tabpfn==2.2.1`, weights pulled tokenless from HuggingFace) does
  in-context prediction over a capped sample of the Phase 1.3 training table.
- **Heuristic fallback** (deterministic, no model/network) engages automatically if
  TabPFN's weights/torch are unavailable or a prediction fails — the service never
  hard-fails. `affected ≈ houses × 4.1 × (0.2 + 0.8·intensity)`,
  `damage_rate ≈ structural_vuln_frac × (0.3 + 0.7·intensity)`, `intensity =
  category_ordinal / 5`.

## Sphere supply engine (module, Phase 2.3)

`app/services/sphere_supply.py` is a **deterministic, offline** function — no model, no
network — that turns a predicted affected-population count into an itemized relief
manifest using published humanitarian standards (Sphere Handbook minimums + IFRC NFI
ratios). It is importable (consumed by OR-Tools routing in 2.4 as per-stop cargo demand);
an HTTP endpoint can mount it later.

```python
from app.services.sphere_supply import sphere_supply

manifest = sphere_supply(predicted_affected=1200, days=3, access_modifier=0.8, id="brgy-007")
```

- **Standards:** water 15 L/person/day, food 2,100 kcal/person/day → ration packs
  (1 pack = 2,100 kcal = one person-day), 2 tarpaulins/household, 1 blanket/person,
  1 hygiene kit/household, planning household size 5.
- **`access_modifier`** scales every *supplied* quantity (1.0 full, 0.5 half deliverable,
  1.2 = +20% buffer); the structural household count is unchanged by it.
- **Auditable:** every line carries the `inputs` it used and a human-readable `basis`
  string, plus a logistics `weight_kg`; the manifest sums `total_weight_kg`.

The Pydantic models in `app/models/supply.py` are the **canonical contract**;
`web/lib/types/supply.ts` mirrors them.

### `POST /optimize-routes`

Solves multi-team dispatch with **OR-Tools** (CVRP). Inputs: a list of stops (depot +
barangays) each with `demand_kg` (from the Sphere manifest) and `priority` (the Silent
Area score), the vehicle fleet (count + `capacity_kg`), and an **N×N `cost_matrix` of
real-road travel seconds** aligned to the stops. Output: per-team routes with ordered
stops, ETAs, and per-vehicle cargo, plus any stops dropped under capacity pressure.

- **Real roads only.** The `cost_matrix` MUST be the pgRouting `pgr_dijkstraCostMatrix`
  output — the solver never computes Euclidean distance (CLAUDE.md > Rules). The pipeline
  (Phase 4.1) builds it per dispatch from `road_edges` and the stops' nearest vertices:

  ```sql
  -- vids = barangay/depot nearest-vertex ids, IN THE SAME ORDER as `stops`
  SELECT * FROM pgr_dijkstraCostMatrix(
    'SELECT id, source, target, cost, reverse_cost FROM road_edges',
    (SELECT array_agg(vid ORDER BY ord) FROM unnest(:vids) WITH ORDINALITY AS t(vid, ord)),
    directed := false);
  -- reshape the (start_vid, end_vid, agg_cost) rows into the N×N matrix
  ```

- **Capacity** is a hard constraint (never exceeded). When total demand exceeds fleet
  capacity, the lowest-`priority` stops are dropped first (priority-weighted penalties);
  set `allow_dropping_stops=false` to force a serve-all solution or `INFEASIBLE`.
- **ETAs** accumulate `travel_seconds` (the matrix legs) plus each stop's `service_seconds`.
- `solve_time_limit_ms` (default 200) bounds the search; 3 teams / 10 barangays solve in
  well under 500 ms.

The Pydantic models in `app/models/routing.py` are the **canonical contract**;
`web/lib/types/routing.ts` mirrors them.

## Configuration (env / `.env`)

| Var                    | Default                  | Meaning                                             |
|------------------------|--------------------------|-----------------------------------------------------|
| `MODEL_FRAMING`        | `regressor`              | `regressor` (damage_rate) or `classifier` (class).  |
| `TRAINING_TABLE_PATH`  | `data/training_table.csv`| In-context training data.                           |
| `TABPFN_DEVICE`        | `cpu`                    | Torch device.                                       |
| `TABPFN_N_ESTIMATORS`  | `1`                      | More = slower, marginally better.                   |
| `TABPFN_CONTEXT_SIZE`  | `128`                    | In-context rows; raise for accuracy where CPU allows.|
| `DISABLE_TABPFN`       | `false`                  | Force the heuristic (skips torch); used by tests.   |

## Local development

```bash
python3.12 -m venv .venv
.venv/bin/pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements-dev.txt

# run tests (heuristic + API always; TabPFN if installed)
.venv/bin/python -m pytest                 # full suite
.venv/bin/python -m pytest -m "not tabpfn"  # skip the heavy model tests

# serve locally on :8000 (matches AI_SERVICE_URL; the Space serves on 7860 via Docker)
.venv/bin/uvicorn app.main:app --reload --port 8000
```

## Docker

```bash
docker build -t luwas-ai .
docker run -p 7860:7860 luwas-ai
```

First request triggers a one-time TabPFN weight download; Spaces sleep after ~48h, so
warm the Space before a demo.
