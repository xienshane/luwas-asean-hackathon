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
inference endpoints. Phase 2.2 ships the **impact predictor**; routing (OR-Tools) and
parsing (SEA-LION) mount alongside it in later phases.

## Endpoints

| Method | Path              | Purpose                                            |
|--------|-------------------|----------------------------------------------------|
| GET    | `/health`         | Liveness + active model framing + TabPFN status.   |
| POST   | `/predict-impact` | Per-barangay affected-population + damage severity. |

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

# serve
.venv/bin/uvicorn app.main:app --reload --port 7860
```

## Docker

```bash
docker build -t luwas-ai .
docker run -p 7860:7860 luwas-ai
```

First request triggers a one-time TabPFN weight download; Spaces sleep after ~48h, so
warm the Space before a demo.
