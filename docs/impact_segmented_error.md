# LUWAS Impact-Model — Segmented Error Report (Fairness Monitor)

Target: **damage_rate** · pooled held-out rows: **1261**

Per **community-type** bucket we report error magnitude (MAE/RMSE) and the
*direction* of error (mean signed error = pred − true). A negative bias in a
**high**-vulnerability bucket means the model **under-predicts** impact there —
the equity risk this monitor exists to catch.

## `structural_vuln_frac`

Tercile edges: low ≤ 0.2809 < medium ≤ 0.4780 < high

| Bucket | n | MAE | RMSE | Mean signed error | Bias ÷ MAE | Material under-prediction? |
|--------|---|-----|------|-------------------|------------|----------------------------|
| low | 440 | 0.0922 | 0.1841 | -0.0104 | -0.11 | no |
| medium | 404 | 0.0950 | 0.1819 | -0.0100 | -0.10 | no |
| high | 417 | 0.1300 | 0.2306 | -0.0041 | -0.03 | no |

Disparity (worst − best bucket MAE): **0.0378**

**Reading:** no bucket exceeds the materiality threshold (|bias| ≥ 0.25 × that bucket's MAE); the residual signed bias is within noise for this sample size. Nothing here is actionable.

## `unimproved_water_frac`

Tercile edges: low ≤ 0.0763 < medium ≤ 0.1199 < high

| Bucket | n | MAE | RMSE | Mean signed error | Bias ÷ MAE | Material under-prediction? |
|--------|---|-----|------|-------------------|------------|----------------------------|
| low | 422 | 0.0924 | 0.1899 | -0.0080 | -0.09 | no |
| medium | 421 | 0.1180 | 0.2110 | -0.0141 | -0.12 | no |
| high | 418 | 0.1065 | 0.1987 | -0.0023 | -0.02 | no |

Disparity (worst − best bucket MAE): **0.0256**

**Reading:** no bucket exceeds the materiality threshold (|bias| ≥ 0.25 × that bucket's MAE); the residual signed bias is within noise for this sample size. Nothing here is actionable.

## How to read this

- **Materiality threshold.** A bucket is flagged only when its signed bias reaches
  **0.25 × that bucket's own MAE** in the under-predicting
  direction. The threshold is relative rather than absolute because buckets differ in
  size and error scale, and an absolute cut (in damage points or people) could not be
  justified across them. MAE is the bucket's own typical error, so the ratio asks the
  operational question: is the error directional enough to shift an allocation, or is
  it a small signed residue inside ordinary noise?
- **Nothing is hidden.** The threshold changes what gets *flagged*, never what gets
  *reported*. Raw `mean signed error` is printed for every bucket, in every table,
  regardless of the flag — this calibrates the monitor, it does not suppress a finding.
- **⚠️ yes** on a high-vulnerability bucket is the flag to act on: the model
  systematically guesses lower than reality for that group by an amount large enough to
  matter, which would under-allocate relief. Pair with the coordinator's always-on
  override (all AI outputs are assistive) and feed it into the fairness framework
  (`docs/FAIRNESS.md`).
- **Disparity** quantifies how uneven accuracy is across buckets; smaller is fairer.
- Province-level training data is sparse, so treat single-bucket swings as signals to
  watch, not verdicts. The monitor is designed to be re-run as data grows.
