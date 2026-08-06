# LUWAS Social-Vulnerability & Fairness Framework

This document outlines the theoretical, ethical, and mathematical framework used by the LUWAS Emergency Operating Center (EOC) to ensure relief distributions are prioritized equitably. 

By shifting from a purely hazard-exposure model to an equity-first prioritization model, LUWAS actively guards against the systematic under-prioritization of isolated, structurally vulnerable, and marginalized populations.

---

## 1. Vulnerability & Prioritization Framework

The LUWAS composite priority score (implemented in `silent_area_score()`) determines the ranking of communities awaiting aid. Rather than prioritizing based solely on hazard wind footprints, we define priority as a function of **Hazard Exposure**, **Structural Vulnerability**, and **Resource/Coping Deficits**.

### 1.1 Active Vulnerability Indicators

| Indicator Name | Category | Source | Technical Definition & Fairness Rationale |
| :--- | :--- | :--- | :--- |
| **`structural_vuln_frac`** | Physical / Housing | PSA Housing Census | **Definition:** Fraction of households constructed with salvaged or light materials for roofs/walls (derived from `housing-type.csv`). <br>**Rationale:** Households with light roofing or salvaged walls face near-total structural collapse during Category 4+ typhoons, requiring immediate shelter kits. |
| **`unimproved_water_frac`** | Socio-Economic / WASH | PSA Water Access Census | **Definition:** Fraction of households reliant on unimproved water sources (e.g., dug wells, natural springs, peddlers) (derived from `water-access.csv`).<br>**Rationale:** WASH infrastructure in these areas is immediately contaminated post-landfall, dramatically raising the risk of waterborne disease outbreaks. |
| **`evacuation_deficit_score`** | Coping Capacity / Institutional | DSWD / LGU Registries | **Definition:** Normalized inverse of municipal-level evacuation center density relative to population (derived from `evacuation-centers.csv`).<br>**Rationale:** Communities with fewer safe evacuation facilities per capita suffer higher casualty rates and have a lower baseline capacity to shelter displaced families. |

### 1.2 Deferred Indicators (Data-Gated)

Several vital social-vulnerability indicators have been evaluated but are currently **deferred** from the automated score calculation due to structural data gaps at the **barangay scale**:

1. **Poverty Incidence (Barangay-Level):**
   * *Data Gap:* While municipal and provincial poverty estimates are published by the PSA, barangay-level poverty mappings are highly irregular and rely on outdated census models. Applying municipal poverty averages uniformly to all constituent barangays introduces an *ecological fallacy*, hiding wealthy enclaves and flattening deep-pocket poverty.
   * *Mitigation:* We defer this to the **human-in-the-loop coordinator override** (Issue 4.2), allowing coordinators with direct regional knowledge to adjust prioritizations.
2. **Disability Share (PWD) & Elderly/Child Share:**
   * *Data Gap:* Demographics on age distribution and PWD registration are collected by municipal health offices but are rarely digitized or joined to spatial boundary coordinates in a standardized, queryable format.
   * *Mitigation:* Documented as a critical data gap. If structured PWD registries are provided by local social welfare offices during a crisis, they are manually appended as localized metadata tooltips in the coordinator panel.
3. **Indigenous Status:**
   * *Data Gap:* Registries of Indigenous Cultural Communities (ICCs) are managed by the NCIP but lack high-resolution GIS boundaries matching the PSA's barangay definitions, making automated spatial joins prone to high misclassification rates.
   * *Mitigation:* Addressed via the **volunteer PWA SMS ground-truth feed** (Issue 6.2). Localized field reports can instantly flag remote indigenous settlements that require immediate routing prioritizations.

---

## 2. Mathematical Priority Composition (Phase 4.4 Implementation)

To prevent a single missing data point from zeroing out a community's priority, LUWAS replaces the multiplicative form with an additive weighted blend of standardized signals:

$$\text{Priority Score} = w_1 \cdot \text{Impact} + w_2 \cdot \text{Physical Vuln} + w_3 \cdot \text{WASH Deficit} + w_4 \cdot \text{Evacuation Deficit} + w_5 \cdot \text{Silence Ramp}$$

Where:
- $\sum w_i = 1.0$ (ensuring the final score remains bounded within $[0, 1]$).
- If any indicator is missing, its individual term defaults to a neutral median value or $0.0$ rather than nullifying the entire product, ensuring robust, reproducible evaluations.

---

## 3. Algorithmic Guardrails: Segmented Error Monitoring (Phase 6.2)

To ensure that the predictive models (TabPFN) do not systematically underpredict impact or withhold resources from vulnerable populations, LUWAS implements **segmented error monitoring**.

The model evaluation script (`scripts/evaluate_impact.py`) computes and reports predictive error metrics (MAE and RMSE) sliced across distinct demographic segments rather than reporting overall averages alone.

### 3.1 Auditing for Systematic Bias
We monitor predictive performance across the following segments:
1. **High vs. Low Structural Vulnerability:** Comparing prediction error for municipalities with high fractions of light/salvaged housing. If the model exhibits higher underestimation errors (negative bias) in highly vulnerable areas, it is penalized.
2. **High vs. Low Water Access Deficits:** Auditing if the model systematically underestimates affected counts in remote areas with poor WASH infrastructure.
3. **Rural vs. Urban Centroids:** Guarding against urban bias, where dense urban centers with high-quality training inputs dominate the loss function, leaving sparse rural barangays with larger prediction errors.

### 3.2 What Counts as a Finding (Materiality Threshold)

Signed error is reported for **every** bucket, but a bucket is only *flagged* when its
mean signed error reaches **0.25 × that bucket's own MAE** in the under-predicting
direction (`MATERIALITY_BIAS_RATIO`, `ai-services/scripts/eval/segmented.py`). The
threshold is relative rather than absolute because buckets differ in size and error
scale, and an absolute cut in damage points could not be justified across them.

The threshold governs the flag, never the report — raw signed error stays in every table,
so calibrating the monitor cannot hide a finding.

**Current result** ([`impact_segmented_error.md`](impact_segmented_error.md)): no bucket
in either segmentation exceeds the threshold. The largest directional bias is −0.014
against a bucket MAE of 0.118 (ratio −0.12) — residual under-prediction well inside noise
for this sample size.

### 3.3 Mitigation Loop
If segmented error monitoring detects a systematic underprediction in a highly vulnerable group:
- **Prioritization Calibration:** We adjust the weight weights ($w_i$) in the prioritization engine to over-compensate and ensure these groups are surfaced.
- **Model Recalibration:** TabPFN's in-context training examples are re-balanced to include historically underrepresented storm profiles from marginalized regions.