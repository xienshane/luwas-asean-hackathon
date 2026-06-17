# Model Card: LUWAS Day 0 Impact Predictor

This model card details the Day 0 Impact Predictor powering the LUWAS operational platform. The model utilizes TabPFN to predict post-typhoon impact metrics (e.g., affected population, damage rate, and severity) to assist disaster coordinators in pre-positioning supplies and dispatching teams immediately after landfall.

## 1. Performance Metrics

Based on the Leave-One-Typhoon-Out (LOTO) cross-validation over 85 storms (2010–2020), the TabPFN model exhibits the following performance characteristics compared to basic baselines.

### Accuracy & Error Rates
- **Damage Rate MAE:** **0.1056**
- **Damage Rate RMSE:** **0.2000**
- **Severity Classification Accuracy:** **0.8850**
- **Severity Macro-F1:** **0.4654** *(Note: The model exhibits strong performance distinguishing between 'low' [F1: 0.957] and 'severe' [F1: 0.904] impact, but lacks sufficient support in the historical dataset to reliably predict 'moderate' and 'high' intermediate classes).*

### Interval Calibration
The model outputs probabilistic predictions rather than just point estimates.
- **Affected Population 80% Coverage:** **0.8588** (Actual values fall within the predicted 80% confidence interval ~86% of the time).
- **Damage Rate 80% Coverage:** **0.9040**

### Baseline Comparison
TabPFN significantly outperforms simple rules-of-thumb:
- **TabPFN Damage MAE:** 0.1056
- **Population-Only Baseline Damage MAE:** 0.4232 *(TabPFN is better by 0.3176)*
- **Wind-Speed Heuristic Damage MAE:** 0.4084 *(TabPFN is better by 0.3028)*

### Inference Latency
Under the deployed production configuration (context=128, n_estimators=1), inference remains well within interactive thresholds:
- **p50 Latency:** 288.8 ms
- **p95 Latency:** 299.7 ms

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
