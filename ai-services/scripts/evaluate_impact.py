"""Impact model evaluation harness.

Public API
----------
run_loto(df, *, n_estimators, limit_storms=None, seed=0)
    Leave-One-Typhoon-Out evaluation of TabPFN vs two baselines.
    Returns a results dict ready for serialisation (C1).

aggregate(pooled_by_method, per_storm_raw)
    Pure aggregation step: compute metrics dicts from pre-collected raw
    (true, pred) arrays.  Separated so it can be unit-tested without torch.

Decomposition
-------------
  _collect_fold(storm, train_df, test_df, *, n_estimators, seed)
      Per-fold runner.  Calls TabPFN (requires torch), population_only,
      and heuristic.  Returns a "fold_raw" dict of raw arrays.

  aggregate(pooled_by_method, per_storm_raw)
      Pure function (no I/O, no torch).  Computes overall + per-storm metrics
      from flat pooled arrays and per-storm raw dicts.

run_loto() = loop over iter_loto_folds → _collect_fold → pool → aggregate.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Keep sys.path shim so 'from app.*' and 'from scripts.*' resolve when this
# file is executed directly (python scripts/evaluate_impact.py) as well as
# when imported from tests that already set up sys.path.
_ai_services_root = str(Path(__file__).resolve().parents[1])
if _ai_services_root not in sys.path:
    sys.path.insert(0, _ai_services_root)

from typing import Any

import numpy as np

from scripts.eval.metrics import (
    mae,
    rmse,
    log_mae,
    log_rmse,
    smape,
    interval_coverage,
    mean_interval_width,
    severity_metrics,
)
from scripts.eval.loto import predicted_severity


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _method_metrics(
    true_affected: np.ndarray,
    true_damage_rate: np.ndarray,
    pred_affected: np.ndarray,
    pred_damage_rate: np.ndarray,
) -> dict:
    """Compute damage_rate + affected + severity metric dicts for one method."""
    true_sev = predicted_severity(true_damage_rate)
    pred_sev = predicted_severity(pred_damage_rate)
    return {
        "damage_rate": {
            "mae":  mae(true_damage_rate, pred_damage_rate),
            "rmse": rmse(true_damage_rate, pred_damage_rate),
        },
        "affected": {
            "log_mae":  log_mae(true_affected, pred_affected),
            "log_rmse": log_rmse(true_affected, pred_affected),
            "smape":    smape(true_affected, pred_affected),
        },
        "severity": severity_metrics(true_sev, pred_sev),
    }


def _tabpfn_calibration(
    true_affected: np.ndarray,
    true_damage_rate: np.ndarray,
    pred_affected_lo: np.ndarray,
    pred_affected_hi: np.ndarray,
    pred_damage_rate_lo: np.ndarray,
    pred_damage_rate_hi: np.ndarray,
) -> dict:
    return {
        "affected_80_coverage":    interval_coverage(
            true_affected, pred_affected_lo, pred_affected_hi
        ),
        "damage_rate_80_coverage": interval_coverage(
            true_damage_rate, pred_damage_rate_lo, pred_damage_rate_hi
        ),
        "mean_width_affected":     mean_interval_width(
            pred_affected_lo, pred_affected_hi
        ),
        "mean_width_damage_rate":  mean_interval_width(
            pred_damage_rate_lo, pred_damage_rate_hi
        ),
    }


def _delta_pair(tabpfn_m: dict, baseline_m: dict) -> dict:
    """Return delta dict: tabpfn metric - baseline metric (negative = tabpfn better)."""
    return {
        "damage_rate": {
            "mae":  tabpfn_m["damage_rate"]["mae"]  - baseline_m["damage_rate"]["mae"],
            "rmse": tabpfn_m["damage_rate"]["rmse"] - baseline_m["damage_rate"]["rmse"],
        },
        "affected": {
            "log_mae":  tabpfn_m["affected"]["log_mae"]  - baseline_m["affected"]["log_mae"],
            "log_rmse": tabpfn_m["affected"]["log_rmse"] - baseline_m["affected"]["log_rmse"],
            "smape":    tabpfn_m["affected"]["smape"]    - baseline_m["affected"]["smape"],
        },
    }


# ---------------------------------------------------------------------------
# Public: aggregate
# ---------------------------------------------------------------------------

def aggregate(
    pooled_by_method: dict,
    per_storm_raw: list[dict],
) -> dict:
    """Compute the full results dict from pre-collected raw arrays.

    Parameters
    ----------
    pooled_by_method : dict
        Keys: "tabpfn", "population_only", "heuristic".
        Each value is a dict of flat numpy arrays across ALL folds:

        tabpfn         → true_affected, true_damage_rate,
                         pred_affected_mean, pred_affected_lo, pred_affected_hi,
                         pred_damage_rate_mean, pred_damage_rate_lo, pred_damage_rate_hi
        population_only → true_affected, true_damage_rate,
                          pred_affected, pred_damage_rate
        heuristic       → true_affected, true_damage_rate,
                          pred_affected, pred_damage_rate

    per_storm_raw : list[dict]
        One entry per storm, each with keys:
            "storm", and per-method sub-dicts (same layout as pooled_by_method).
        Rows within each storm's dict must correspond to that storm's held-out rows.

    Returns
    -------
    dict with "overall" and "per_storm" keys ready for C1 serialisation.
    """
    # --- Overall metrics ---
    t = pooled_by_method["tabpfn"]
    p = pooled_by_method["population_only"]
    h = pooled_by_method["heuristic"]

    tabpfn_overall = _method_metrics(
        t["true_affected"], t["true_damage_rate"],
        t["pred_affected_mean"], t["pred_damage_rate_mean"],
    )
    tabpfn_overall["calibration"] = _tabpfn_calibration(
        t["true_affected"],    t["true_damage_rate"],
        t["pred_affected_lo"], t["pred_affected_hi"],
        t["pred_damage_rate_lo"], t["pred_damage_rate_hi"],
    )

    pop_overall  = _method_metrics(
        p["true_affected"], p["true_damage_rate"],
        p["pred_affected"], p["pred_damage_rate"],
    )
    heur_overall = _method_metrics(
        h["true_affected"], h["true_damage_rate"],
        h["pred_affected"], h["pred_damage_rate"],
    )

    overall = {
        "tabpfn":         tabpfn_overall,
        "population_only": pop_overall,
        "heuristic":       heur_overall,
        "deltas": {
            "tabpfn_vs_population": _delta_pair(tabpfn_overall, pop_overall),
            "tabpfn_vs_heuristic":  _delta_pair(tabpfn_overall, heur_overall),
        },
    }

    # --- Per-storm metrics ---
    per_storm_out: list[dict] = []
    for storm_raw in per_storm_raw:
        storm_name = storm_raw["storm"]
        st = storm_raw["tabpfn"]
        sp = storm_raw["population_only"]
        sh = storm_raw["heuristic"]

        n = len(st["true_affected"])

        storm_tabpfn = _method_metrics(
            st["true_affected"], st["true_damage_rate"],
            st["pred_affected_mean"], st["pred_damage_rate_mean"],
        )
        storm_tabpfn["calibration"] = _tabpfn_calibration(
            st["true_affected"],    st["true_damage_rate"],
            st["pred_affected_lo"], st["pred_affected_hi"],
            st["pred_damage_rate_lo"], st["pred_damage_rate_hi"],
        )

        per_storm_out.append({
            "storm": storm_name,
            "n":     n,
            "tabpfn":          storm_tabpfn,
            "population_only": _method_metrics(
                sp["true_affected"], sp["true_damage_rate"],
                sp["pred_affected"], sp["pred_damage_rate"],
            ),
            "heuristic": _method_metrics(
                sh["true_affected"], sh["true_damage_rate"],
                sh["pred_affected"], sh["pred_damage_rate"],
            ),
        })

    return {
        "overall":   overall,
        "per_storm": per_storm_out,
    }


# ---------------------------------------------------------------------------
# Public: run_loto
# ---------------------------------------------------------------------------

def _collect_fold(
    storm: str,
    train_df,
    test_df,
    *,
    n_estimators: int,
    seed: int,
) -> dict:
    """Run all three methods on one LOTO fold; return raw arrays.

    Requires torch (TabPFN).  Covered by the C-phase smoke + B1 @tabpfn tests.
    """
    from scripts.eval.loto import fit_predict_tabpfn, features_matrix
    from scripts.eval.baselines import population_only_fit, heuristic_predict

    X_train = features_matrix(train_df)
    X_test  = features_matrix(test_df)
    true_affected    = test_df["affected"].to_numpy(dtype=float)
    true_damage_rate = test_df["damage_rate"].to_numpy(dtype=float)

    # --- TabPFN: two separate fits (affected, damage_rate) ---
    aff_mean, aff_lo, aff_hi = fit_predict_tabpfn(
        X_train, train_df["affected"].to_numpy(dtype=float), X_test,
        n_estimators=n_estimators, device="cpu", seed=seed,
    )
    dr_mean, dr_lo, dr_hi = fit_predict_tabpfn(
        X_train, train_df["damage_rate"].to_numpy(dtype=float), X_test,
        n_estimators=n_estimators, device="cpu", seed=seed,
    )

    tabpfn = {
        "true_affected":    true_affected,
        "true_damage_rate": true_damage_rate,
        "pred_affected_mean": aff_mean,
        "pred_affected_lo":   aff_lo,
        "pred_affected_hi":   aff_hi,
        "pred_damage_rate_mean": dr_mean,
        "pred_damage_rate_lo":   dr_lo,
        "pred_damage_rate_hi":   dr_hi,
    }

    # --- population_only baseline ---
    pop_model = population_only_fit(train_df)
    pop_aff_list, pop_dr_list = pop_model.predict(test_df)
    pop = {
        "true_affected":    true_affected,
        "true_damage_rate": true_damage_rate,
        "pred_affected":    np.array(pop_aff_list, dtype=float),
        "pred_damage_rate": np.array(pop_dr_list, dtype=float),
    }

    # --- heuristic baseline ---
    heur_aff_list  = []
    heur_dr_list   = []
    for _, row in test_df.iterrows():
        h_aff, h_dr = heuristic_predict(row)
        heur_aff_list.append(float(h_aff))
        heur_dr_list.append(float(h_dr))

    heur = {
        "true_affected":    true_affected,
        "true_damage_rate": true_damage_rate,
        "pred_affected":    np.array(heur_aff_list, dtype=float),
        "pred_damage_rate": np.array(heur_dr_list, dtype=float),
    }

    return {
        "storm":          storm,
        "tabpfn":         tabpfn,
        "population_only": pop,
        "heuristic":       heur,
    }


def _concat_pooled(fold_results: list[dict]) -> dict:
    """Concatenate per-fold raw arrays into flat pooled_by_method dicts."""

    def _cat(key: str, method: str) -> np.ndarray:
        return np.concatenate([f[method][key] for f in fold_results])

    pooled: dict[str, Any] = {
        "tabpfn": {
            "true_affected":      _cat("true_affected",    "tabpfn"),
            "true_damage_rate":   _cat("true_damage_rate", "tabpfn"),
            "pred_affected_mean": _cat("pred_affected_mean", "tabpfn"),
            "pred_affected_lo":   _cat("pred_affected_lo",   "tabpfn"),
            "pred_affected_hi":   _cat("pred_affected_hi",   "tabpfn"),
            "pred_damage_rate_mean": _cat("pred_damage_rate_mean", "tabpfn"),
            "pred_damage_rate_lo":   _cat("pred_damage_rate_lo",   "tabpfn"),
            "pred_damage_rate_hi":   _cat("pred_damage_rate_hi",   "tabpfn"),
        },
        "population_only": {
            "true_affected":    _cat("true_affected",    "population_only"),
            "true_damage_rate": _cat("true_damage_rate", "population_only"),
            "pred_affected":    _cat("pred_affected",    "population_only"),
            "pred_damage_rate": _cat("pred_damage_rate", "population_only"),
        },
        "heuristic": {
            "true_affected":    _cat("true_affected",    "heuristic"),
            "true_damage_rate": _cat("true_damage_rate", "heuristic"),
            "pred_affected":    _cat("pred_affected",    "heuristic"),
            "pred_damage_rate": _cat("pred_damage_rate", "heuristic"),
        },
    }
    return pooled


def run_loto(
    df,
    *,
    n_estimators: int,
    limit_storms: int | None = None,
    seed: int = 0,
) -> dict:
    """Leave-One-Typhoon-Out evaluation: TabPFN vs population_only vs heuristic.

    Parameters
    ----------
    df : pd.DataFrame
        Training DataFrame with columns: cyclone_name, affected, damage_rate,
        and all FEATURE_COLUMNS.
    n_estimators : int
        TabPFN n_estimators (typically 4–32 for full run, 1 for smoke).
    limit_storms : int | None
        If set, only run that many folds (for smoke/dev runs).
    seed : int
        Random seed passed to TabPFN for reproducibility.

    Returns
    -------
    dict
        Keys: "overall", "per_storm".  (C1 adds generated_at/git_commit/config.)
    """
    from scripts.eval.loto import iter_loto_folds

    fold_results: list[dict] = []

    for i, (storm, train_df, test_df) in enumerate(iter_loto_folds(df)):
        if limit_storms is not None and i >= limit_storms:
            break
        fold_raw = _collect_fold(storm, train_df, test_df, n_estimators=n_estimators, seed=seed)
        fold_results.append(fold_raw)

    pooled = _concat_pooled(fold_results)
    return aggregate(pooled, fold_results)


# ---------------------------------------------------------------------------
# __main__ (CLI stub — C2 finishes this)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("TODO: CLI not yet implemented. See task C2.")
