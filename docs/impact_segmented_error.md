# LUWAS Impact-Model — Segmented Error Report (Fairness Monitor)

Target: **damage_rate** · pooled held-out rows: **1261**

Per **community-type** bucket we report error magnitude (MAE/RMSE) and the
*direction* of error (mean signed error = pred − true). A negative bias in a
**high**-vulnerability bucket means the model **under-predicts** impact there —
the equity risk this monitor exists to catch.

## `structural_vuln_frac`

Tercile edges: low ≤ 0.2809 < medium ≤ 0.4780 < high

| Bucket | n | MAE | RMSE | Mean signed error | Under-predicting? |
|--------|---|-----|------|-------------------|-------------------|
| low | 440 | 0.0922 | 0.1841 | -0.0104 | ⚠️ yes |
| medium | 404 | 0.0950 | 0.1819 | -0.0100 | ⚠️ yes |
| high | 417 | 0.1300 | 0.2306 | -0.0041 | ⚠️ yes |

Disparity (worst − best bucket MAE): **0.0378**

## `unimproved_water_frac`

Tercile edges: low ≤ 0.0763 < medium ≤ 0.1199 < high

| Bucket | n | MAE | RMSE | Mean signed error | Under-predicting? |
|--------|---|-----|------|-------------------|-------------------|
| low | 422 | 0.0924 | 0.1899 | -0.0080 | ⚠️ yes |
| medium | 421 | 0.1180 | 0.2110 | -0.0141 | ⚠️ yes |
| high | 418 | 0.1065 | 0.1987 | -0.0023 | ⚠️ yes |

Disparity (worst − best bucket MAE): **0.0256**

## How to read this

- **Under-predicting = ⚠️ yes** on a high-vulnerability bucket is the flag to act on:
  the model systematically guesses lower than reality for that group, which would
  under-allocate relief. Pair with the coordinator's always-on override (all AI
  outputs are assistive) and feed it into the Phase 6.3 fairness framework.
- **Disparity** quantifies how uneven accuracy is across buckets; smaller is fairer.
- Province-level training data is sparse, so treat single-bucket swings as signals to
  watch, not verdicts. The monitor is designed to be re-run as data grows.
