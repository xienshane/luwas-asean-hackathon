# Model Card: LUWAS Day 0 Impact Predictor

This model card details the Day 0 Impact Predictor powering the LUWAS operational platform. The model utilizes TabPFN to predict post-typhoon impact metrics (e.g., affected population, damage rate, and severity) to assist disaster coordinators in pre-positioning supplies and dispatching teams immediately after landfall.

## 1. Performance Metrics

Based on the Leave-One-Typhoon-Out (LOTO) cross-validation over 85 storms (2010–2020), the TabPFN model exhibits the following performance characteristics compared to basic baselines.

### Accuracy & Error Rates

Two configurations are reported, because the service does not run the configuration that
scores best. **Capability** is the strongest setting the model reaches (full in-context
table, `n_estimators=8`). **Deployed** is what `POST /impact` actually serves in
production (`tabpfn_context_size=128`, `tabpfn_n_estimators=1`,
`ai-services/app/core/config.py`). Both rows are the same 85 LOTO folds, same seed, same
held-out rows — only the configuration moves.

| Metric | Capability (context = full, `n_estimators` = 8) | **Deployed** (context = 128, `n_estimators` = 1) | Δ (deployed − capability) |
| --- | --- | --- | --- |
| Damage Rate MAE | 0.1056 | **0.1121** | +0.0065 *(worse)* |
| Damage Rate RMSE | 0.2000 | **0.2078** | +0.0078 *(worse)* |
| Severity Accuracy | 0.8850 | **0.9025** | +0.0175 *(better)* |
| Severity Macro-F1 | 0.4654 | **0.4867** | +0.0213 *(better)* |
| Affected 80% Coverage | 0.8588 | **0.8327** | −0.0261 |
| Damage Rate 80% Coverage | 0.9040 | **0.8739** | −0.0301 |
| Inference latency p50 | 24,512.8 ms | **587.0 ms** | −23,925.8 ms *(better)* |
| Inference latency p95 | 36,357.0 ms | **634.6 ms** | −35,722.4 ms *(better)* |

**Why the deployed configuration is the weaker one.** It is chosen to hold CPU inference
under the ~2 s interactive budget on free-tier hardware
(`ai-services/app/services/impact_model.py`: *"so CPU predict stays under the <2s
budget"*). The capability configuration takes **~24 s per prediction** on the same CPU —
it is not a serving option for a coordinator waiting on a dashboard. The cost of that
choice is **+0.0065 damage-rate MAE** (a ~6% relative increase on a 0.1056 baseline) and
~3 points of interval coverage. Severity classification is marginally *better* deployed.

*Note on macro-F1 (both configurations):* the model distinguishes `low` (F1 ≈ 0.957) and
`severe` (F1 ≈ 0.905–0.917) strongly, but the historical dataset lacks support for the
intermediate `moderate` (n=13) and `high` (n=39) classes, which are nearly unpredicted.
Read macro-F1 with that limitation rather than as uniform 4-class skill.

*Reproduce:* capability is `python -m scripts.evaluate_impact`; deployed is
`python -m scripts.evaluate_impact --n-estimators 1 --context-cap 128`, both from
`ai-services/`. `--context-cap` replicates the deployed seeded subsample exactly.

### Interval Calibration
The model outputs probabilistic predictions rather than just point estimates.

### Damage-severity binning

The model emits `severe | high | moderate | low`. The dashboard bins these into three
display bands so adjacent model classes never read as the same badge:

| Model output | Dashboard badge |
| --- | --- |
| `severe` | Severe damage |
| `high` | Elevated damage |
| `moderate`, `low` | Minor damage |

The binning is display-only; the stored `damage_severity` is the model's own value.
- **Affected Population 80% Coverage:** **0.8327** deployed / 0.8588 capability (actual values fall within the predicted 80% interval ~83% of the time as served).
- **Damage Rate 80% Coverage:** **0.8739** deployed / 0.9040 capability.

### Baseline Comparison
TabPFN significantly outperforms simple rules-of-thumb. The baselines are deterministic
and configuration-independent, so the comparison holds at either TabPFN configuration:
- **TabPFN Damage MAE:** 0.1121 deployed / 0.1056 capability
- **Population-Only Baseline Damage MAE:** 0.4232 *(TabPFN deployed is better by 0.3111)*
- **Wind-Speed Heuristic Damage MAE:** 0.4084 *(TabPFN deployed is better by 0.2963)*

### Inference Latency
Measured over 30 single-barangay `predict()` calls after warmup, on the free-tier CPU
target. Both configurations are timed so the accuracy/latency trade is visible in one
place:

| Configuration | p50 | p95 |
| --- | --- | --- |
| **Deployed** (context = 128, `n_estimators` = 1) | **587.0 ms** | **634.6 ms** |
| Capability (context = full, `n_estimators` = 8) | 24,512.8 ms | 36,357.0 ms |

The deployed configuration is the only one that fits the ~2 s interactive budget; the
capability configuration is an offline evaluation setting, not a serving option.

---

## 2. Known Limitations & Mitigations

We recognize several structural limitations in our current modeling approach. For each, we have designed socio-technical and architectural mitigations within the LUWAS platform.

### Limitation A: Geographic Granularity
**The Constraint:** Due to historical reporting structures, the model is trained and evaluated primarily at the province or municipality level, meaning its "Day 0" predictions lack raw, block-by-block barangay precision.
**The Mitigation:** **Hierarchical Refinement via Live Signals (Issues 1 & 4.4)**. The platform uses these macro-level predictions merely as a starting point. As volunteer networks submit localized ground-truth reports, the LUWAS dashboard hierarchically refines the impact map, pushing high-resolution actionable data down to the barangay level to override the coarse Day 0 estimates.

### Limitation B: Reliance on Historical Data (2010–2020)
**The Constraint:** The model’s training set spans 2010 to 2020. Climate patterns, infrastructure resilience, and demographic distributions have shifted since then, meaning a purely historical model may misjudge novel storm behaviors.
**The Mitigation:** **Live-Signal Mitigation (Issues 3 & 4.7)**. The architecture assumes Day 0 AI predictions decay in relevance. As the storm passes, offline-capable SMS reports from LGUs and volunteers stream in. The system actively relies on this live ground-truth to re-weight or entirely override the historical AI priors.

### Limitation C: Uncertainty and Over-Reliance on AI
**The Constraint:** 80% coverage intervals provide mathematical bounds but can mislead operators into treating probabilistic AI guesses as guaranteed facts, potentially resulting in misallocated relief supplies.
**The Mitigation:** **Decision Support, Not Fact (Issues 7 & 4.3)**. The model outputs are strictly framed as assistive heuristics. The dashboard visually presents these predictions alongside confidence intervals and allows the human Coordinator to manually modify predicted damage rates and adjust Sphere-standard supply manifests before approving dispatch. The human remains the ultimate arbiter.
