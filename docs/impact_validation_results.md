# LUWAS Impact-Model Validation Report

*Generated:* 2026-08-06T07:36:35.237764+00:00  |  *Commit:* `7b086ff`

## Headline Numbers (Slide 11)

Key figures for the executive summary / slide deck.

| Metric | TabPFN | population_only | heuristic |
| --- | --- | --- | --- |
| damage_rate MAE | **0.1056** | 0.4232 | 0.4084 |
| severity macro-F1 | **0.4654** | — | — |
| affected 80 % coverage | **0.8588** | — | — |
| damage_rate 80 % coverage | **0.9040** | — | — |

- **Latency (deployed config):** p50 = 587.0 ms, p95 = 634.6 ms
- **Latency (capability config):** p50 = 24512.8 ms, p95 = 36357.0 ms

## Overall Metrics

Metrics computed on pooled held-out predictions across all folds.

| Method | DR MAE | DR RMSE | Aff log-MAE | Aff log-RMSE | Aff sMAPE | Sev Acc | Sev macro-F1 | Aff 80% cov | DR 80% cov |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tabpfn | 0.1056 | 0.2000 | 2.6285 | 3.7388 | 0.6179 | 0.8850 | 0.4654 | 0.8588 | 0.9040 |
| population_only | 0.4232 | 0.4368 | 4.6534 | 5.4895 | 0.8605 | 0.0309 | 0.0150 | n/a | n/a |
| heuristic | 0.4084 | 0.4757 | 4.1699 | 5.2488 | 0.7623 | 0.0730 | 0.0670 | n/a | n/a |

### Deltas (TabPFN − baseline; negative = TabPFN better)

| Comparison | DR MAE Δ | DR RMSE Δ | Aff log-MAE Δ | Aff sMAPE Δ |
| --- | --- | --- | --- | --- |
| vs population_only | -0.3176 | -0.2367 | -2.0250 | -0.2426 |
| vs heuristic | -0.3028 | -0.2757 | -1.5414 | -0.1444 |

### TabPFN Severity — Per-Class Breakdown

The headline macro-F1 averages over all four classes, so it is dragged down by minority classes. The per-class view shows where the model actually performs.

| Class | Precision | Recall | F1 | Support |
| --- | --- | --- | --- | --- |
| low | 1.0000 | 0.9176 | 0.9570 | 607 |
| moderate | 0.0000 | 0.0000 | 0.0000 | 13 |
| high | 0.0000 | 0.0000 | 0.0000 | 39 |
| severe | 0.8817 | 0.9286 | 0.9045 | 602 |

## Per-Storm Results

| Storm | N | TabPFN DR MAE | pop_only DR MAE | heuristic DR MAE |
| --- | --- | --- | --- | --- |
| Aere | 16 | 0.1142 | 0.4805 | 0.4672 |
| Amang | 5 | 0.0001 | 0.4294 | 0.1922 |
| Auring | 6 | 0.1729 | 0.4526 | 0.2846 |
| Banyan | 12 | 0.1344 | 0.3593 | 0.2594 |
| Bising | 6 | 0.0000 | 0.4297 | 0.1936 |
| Bolaven | 21 | 0.1664 | 0.4547 | 0.3901 |
| Bopha | 37 | 0.0861 | 0.3632 | 0.4018 |
| Caloy | 5 | 0.0001 | 0.4294 | 0.1691 |
| Chedeng | 3 | 0.0551 | 0.4059 | 0.3246 |
| Conson | 15 | 0.1323 | 0.4755 | 0.5346 |
| Crising | 14 | 0.0003 | 0.4325 | 0.2559 |
| Crising_2 | 2 | 0.0703 | 0.4667 | 0.4872 |
| Damrey | 8 | 0.0001 | 0.4304 | 0.2834 |
| Danas | 5 | 0.1500 | 0.3856 | 0.3210 |
| Dodong | 5 | 0.0131 | 0.4358 | 0.2446 |
| Doksuri | 11 | 0.0402 | 0.3806 | 0.3345 |
| Egay | 2 | 0.1843 | 0.5000 | 0.4909 |
| Ferdie | 8 | 0.0001 | 0.4304 | 0.1549 |
| Fung-Wong | 28 | 0.1141 | 0.4008 | 0.4203 |
| Gaemi | 2 | 0.0002 | 0.4284 | 0.1851 |
| Goni | 33 | 0.0970 | 0.4449 | 0.3797 |
| Hagupit | 39 | 0.0854 | 0.4507 | 0.4107 |
| Haikui | 9 | 0.0408 | 0.4455 | 0.2518 |
| Haima | 26 | 0.0756 | 0.4486 | 0.4783 |
| Haiyan | 45 | 0.1434 | 0.3466 | 0.3403 |
| Helen | 1 | 0.0001 | 0.4280 | 0.0801 |
| Igme | 5 | 0.1984 | 0.5003 | 0.6173 |
| Ineng | 22 | 0.0721 | 0.4562 | 0.5379 |
| Jangmi | 24 | 0.1575 | 0.3797 | 0.4090 |
| Jelawat | 2 | 0.0001 | 0.4284 | 0.6663 |
| Juaning | 29 | 0.1291 | 0.4499 | 0.4172 |
| Kai-Tak | 24 | 0.0482 | 0.4449 | 0.3645 |
| Kajiki | 9 | 0.1174 | 0.4323 | 0.3630 |
| Kalmaegi | 9 | 0.1100 | 0.3874 | 0.2359 |
| Kammuri | 29 | 0.1943 | 0.4364 | 0.3466 |
| Khanun | 8 | 0.0856 | 0.4304 | 0.2258 |
| Kirogi | 2 | 0.1077 | 0.3333 | 0.2787 |
| Kong-Rey | 3 | 0.1331 | 0.4760 | 0.2427 |
| Koppu | 29 | 0.0691 | 0.4452 | 0.5654 |
| Krosa | 5 | 0.0257 | 0.4664 | 0.4977 |
| Krovanh | 12 | 0.2296 | 0.4010 | 0.3029 |
| Linfa | 9 | 0.2011 | 0.4490 | 0.5999 |
| Lingling | 19 | 0.2457 | 0.3686 | 0.3728 |
| Luis | 20 | 0.1133 | 0.4492 | 0.4356 |
| Mangkhut | 33 | 0.0633 | 0.4809 | 0.5534 |
| Marilyn | 10 | 0.0112 | 0.4119 | 0.2260 |
| Matmo | 3 | 0.0923 | 0.4308 | 0.4553 |
| Maysak | 2 | 0.0002 | 0.4284 | 0.3070 |
| Meari | 15 | 0.1426 | 0.3604 | 0.4241 |
| Megi | 24 | 0.0772 | 0.4617 | 0.5571 |
| Mekkhala | 10 | 0.1904 | 0.4429 | 0.4262 |
| Melor | 31 | 0.1282 | 0.3883 | 0.3120 |
| Meranti | 3 | 0.0279 | 0.4155 | 0.3649 |
| Molave | 32 | 0.1001 | 0.4394 | 0.4192 |
| Mujigae | 7 | 0.0685 | 0.4571 | 0.4296 |
| Nalgae | 19 | 0.1148 | 0.3912 | 0.5200 |
| Nanmadol | 22 | 0.0994 | 0.4438 | 0.5242 |
| Nesat | 39 | 0.1391 | 0.4402 | 0.5588 |
| Nida | 5 | 0.1820 | 0.4856 | 0.4817 |
| Nock-Ten | 15 | 0.0438 | 0.4005 | 0.3885 |
| Noul | 3 | 0.0003 | 0.4287 | 0.2064 |
| Odette | 17 | 0.1186 | 0.4181 | 0.3861 |
| Ofel | 5 | 0.1146 | 0.4294 | 0.1107 |
| Onyok | 5 | 0.1262 | 0.2906 | 0.1970 |
| Pakhar | 14 | 0.0004 | 0.4325 | 0.1532 |
| Phanfone | 16 | 0.0936 | 0.3872 | 0.4078 |
| Rammasun | 30 | 0.0647 | 0.4201 | 0.5012 |
| Rumbia | 7 | 0.0001 | 0.4301 | 0.2667 |
| Sanba | 17 | 0.1570 | 0.3573 | 0.3003 |
| Sarika | 27 | 0.0877 | 0.4592 | 0.4237 |
| Saudel | 11 | 0.0760 | 0.4102 | 0.2401 |
| Sinlaku | 11 | 0.1319 | 0.4633 | 0.5009 |
| Son-Tinh | 17 | 0.0755 | 0.4274 | 0.4722 |
| Sonamu | 5 | 0.0911 | 0.3936 | 0.3098 |
| Songda | 13 | 0.1049 | 0.4087 | 0.3884 |
| Tembin | 25 | 0.1901 | 0.3647 | 0.3694 |
| Tokage | 12 | 0.2116 | 0.4647 | 0.4024 |
| Usagi | 8 | 0.0128 | 0.4218 | 0.3632 |
| Usman | 17 | 0.1355 | 0.3951 | 0.3885 |
| Utor | 18 | 0.0961 | 0.4273 | 0.4660 |
| Vamco | 35 | 0.1121 | 0.4534 | 0.5779 |
| Vongfong | 9 | 0.0569 | 0.4018 | 0.2695 |
| Washi | 14 | 0.1821 | 0.3623 | 0.3363 |
| Wukong | 11 | 0.0963 | 0.4150 | 0.4404 |
| Yutu | 20 | 0.0830 | 0.4608 | 0.4611 |

## Evaluation Configuration

- **Folds:** 85  |  **Rows:** 1261  |  **Storms:** 85
- **Year range:** 2010–2020
- **Headline target:** damage_rate  |  **Framing:** regressor
- **This run (capability config):** context = full, n_estimators = 8.
- **Deployed config (production latency):** context = 128, n_estimators = 1.
  The two configs are intentionally different: the deployed one trades accuracy for CPU inference under the ~2 s interactive budget on free-tier hardware. Accuracy at *both* configs, with the delta, is published in MODEL_CARD §1 ("Accuracy & Error Rates"); the run above reports whichever config its own header names.

## How to Read This Report

- **Granularity:** metrics are computed at *province level* (barangay predictions aggregated to province before scoring).
- **Prediction intervals** (80 % coverage columns) are decision-support tools, not guarantees — coordinators should treat them as plausible ranges rather than precise bounds.  See MODEL_CARD §1 ("Interval Calibration") and §2 ("Known Limitations & Mitigations") for calibration assumptions and limitations.
- **Baselines:** `population_only` regresses on population density only; `heuristic` applies fixed damage fractions per wind-speed bucket.  Both are deterministic and produce no prediction intervals.
- **TabPFN** is the primary model; a negative delta (Δ < 0) means TabPFN is better than the baseline on that metric.
- **Severity macro-F1 is held down by class imbalance:** the minority `moderate` and `high` classes have very low support and are nearly *unpredicted* (per-class F1 ≈ 0), so the model effectively distinguishes `low` vs `severe`. See the per-class breakdown above — read macro-F1 with that limitation in mind rather than as uniform 4-class skill.
- All AI outputs are *assistive*: the coordinator can override every prediction and manifest in the dashboard.
