"""
Tests for pure metric functions in scripts/eval/metrics.py.
Tests for baselines in scripts/eval/baselines.py.
These tests are written FIRST (TDD). They will fail until the modules are implemented.

Run from ai-services/ directory:
    pytest tests/test_impact_validation.py
"""
import math
import sys
from pathlib import Path

# Ensure ai-services/ is on sys.path so `from scripts.eval.metrics import ...` resolves.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
import pandas as pd
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
from scripts.eval.baselines import population_only_fit, heuristic_predict


# ---------------------------------------------------------------------------
# mae
# ---------------------------------------------------------------------------

def test_mae_known_value():
    assert mae([0.0, 1.0], [0.0, 0.0]) == 0.5


def test_mae_perfect_prediction():
    assert mae([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]) == 0.0


def test_mae_symmetric():
    assert mae([0.0, 1.0], [1.0, 0.0]) == mae([1.0, 0.0], [0.0, 1.0])


# ---------------------------------------------------------------------------
# rmse
# ---------------------------------------------------------------------------

def test_rmse_known_value():
    assert rmse([0.0, 1.0], [1.0, 0.0]) == pytest.approx(1.0)


def test_rmse_perfect_prediction():
    assert rmse([1.0, 2.0], [1.0, 2.0]) == 0.0


# ---------------------------------------------------------------------------
# log_mae / log_rmse
# ---------------------------------------------------------------------------

def test_log_mae_zeros():
    assert log_mae([0.0], [0.0]) == 0.0


def test_log_mae_known():
    # log1p(0) == 0, log1p(1) == ln(2) ~ 0.6931; mae = 0.6931 / 1
    assert log_mae([0.0], [1.0]) == pytest.approx(math.log(2), rel=1e-5)


def test_log_rmse_zeros():
    assert log_rmse([0.0], [0.0]) == 0.0


def test_log_rmse_clips_negatives():
    # Negative values should be clipped to 0 before log1p.
    assert log_rmse([-5.0], [0.0]) == 0.0


# ---------------------------------------------------------------------------
# smape
# ---------------------------------------------------------------------------

def test_smape_both_zero():
    assert smape([0.0], [0.0]) == 0.0


def test_smape_perfect():
    assert smape([1.0, 2.0], [1.0, 2.0]) == 0.0


def test_smape_result_in_unit_interval():
    val = smape([0.0, 100.0], [100.0, 0.0])
    assert 0.0 <= val <= 1.0


def test_smape_known_value():
    # y_true=0, y_pred=1: numerator=1, denominator=|0|+|1|=1, ratio=1.0.
    # The ratio equals 1.0 regardless of pred magnitude whenever y_true==0
    # and y_pred!=0, because numerator == denominator after simplification.
    assert smape([0.0], [1.0]) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# Empty-input contract
# ---------------------------------------------------------------------------

def test_mae_empty_returns_nan():
    # Empty inputs return nan — no special-casing; documents the chosen contract.
    assert math.isnan(mae([], []))


# ---------------------------------------------------------------------------
# interval_coverage
# ---------------------------------------------------------------------------

def test_interval_coverage_known_value():
    # 5 in [0,10] yes; 50 in [0,10] no; 500 in [0,10] no  => 1/3
    assert interval_coverage([5, 50, 500], [0, 0, 0], [10, 10, 10]) == pytest.approx(1 / 3)


def test_interval_coverage_all_inside():
    assert interval_coverage([5, 5, 5], [0, 0, 0], [10, 10, 10]) == pytest.approx(1.0)


def test_interval_coverage_none_inside():
    assert interval_coverage([100, 200], [0, 0], [10, 10]) == pytest.approx(0.0)


def test_interval_coverage_inclusive_boundary():
    # Boundary values are IN the interval (inclusive).
    assert interval_coverage([0, 10], [0, 0], [10, 10]) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# mean_interval_width
# ---------------------------------------------------------------------------

def test_mean_interval_width_uniform():
    assert mean_interval_width([0, 0, 0], [10, 10, 10]) == pytest.approx(10.0)


def test_mean_interval_width_varying():
    assert mean_interval_width([0, 0], [10, 20]) == pytest.approx(15.0)


# ---------------------------------------------------------------------------
# severity_metrics
# ---------------------------------------------------------------------------

def test_severity_metrics_accuracy():
    result = severity_metrics(["low", "high"], ["low", "low"])
    assert result["accuracy"] == 0.5


def test_severity_metrics_per_class_high_recall():
    result = severity_metrics(["low", "high"], ["low", "low"])
    assert result["per_class"]["high"]["recall"] == 0.0


def test_severity_metrics_perfect():
    classes = ["low", "moderate", "high", "severe"]
    result = severity_metrics(classes, classes)
    assert result["accuracy"] == pytest.approx(1.0)
    assert result["macro_f1"] == pytest.approx(1.0)


def test_severity_metrics_per_class_keys():
    result = severity_metrics(["low"], ["low"])
    for cls in ["low", "moderate", "high", "severe"]:
        assert cls in result["per_class"]
        assert set(result["per_class"][cls].keys()) == {"precision", "recall", "f1", "support"}


def test_severity_metrics_support_is_int():
    result = severity_metrics(["low", "low", "high"], ["low", "moderate", "high"])
    assert isinstance(result["per_class"]["low"]["support"], int)


def test_severity_metrics_zero_support_class():
    # "moderate" has no true samples — should not raise, recall/precision == 0.
    result = severity_metrics(["low", "high"], ["low", "high"])
    assert result["per_class"]["moderate"]["precision"] == 0.0
    assert result["per_class"]["moderate"]["recall"] == 0.0
    assert result["per_class"]["moderate"]["support"] == 0


# ---------------------------------------------------------------------------
# A2 — population_only_fit (D4 baseline)
# ---------------------------------------------------------------------------

def _make_train_df():
    """Small in-memory training DataFrame with known statistics."""
    return pd.DataFrame({
        "affected": [100, 200, 300],         # mean = 200
        "damage_rate": [0.2, 0.3, 0.4],      # mean = 0.3
        "total_houses": [50, 100, 150],       # rates: 2, 2, 2  → mean_rate = 2.0
    })


def _make_test_df():
    """Test DataFrame including a zero-houses row."""
    return pd.DataFrame({
        "affected": [0, 0, 0],               # true values (unused by baseline)
        "damage_rate": [0.0, 0.0, 0.0],
        "total_houses": [200, 50, 0],         # last row: zero-houses fallback
    })


def test_population_only_damage_rate_is_constant_train_mean():
    """damage_rate_pred is the training mean for every test row."""
    train = _make_train_df()
    test = _make_test_df()
    model = population_only_fit(train)
    affected_pred, damage_rate_pred = model.predict(test)
    # train.damage_rate mean = (0.2+0.3+0.4)/3 = 0.3 for all rows
    for dr in damage_rate_pred:
        assert dr == pytest.approx(0.3)


def test_population_only_affected_scales_with_houses():
    """affected_pred = round(rate_per_house * total_houses) for non-zero house rows."""
    train = _make_train_df()
    test = _make_test_df()
    model = population_only_fit(train)
    affected_pred, damage_rate_pred = model.predict(test)
    # rate_per_house = mean([100/50, 200/100, 300/150]) = mean([2, 2, 2]) = 2.0
    # row 0: round(2.0 * 200) = 400
    # row 1: round(2.0 * 50)  = 100
    assert affected_pred[0] == 400
    assert affected_pred[1] == 100


def test_population_only_zero_houses_falls_back_to_mean_affected():
    """When total_houses == 0, affected_pred falls back to round(mean(train.affected))."""
    train = _make_train_df()
    test = _make_test_df()
    model = population_only_fit(train)
    affected_pred, damage_rate_pred = model.predict(test)
    # row 2 has total_houses == 0 → fallback: round(mean([100,200,300])) = round(200.0) = 200
    assert affected_pred[2] == 200


def test_population_only_fit_uses_only_train_data():
    """Fit on train_df; predict on different test_df — no leakage from test."""
    train = _make_train_df()
    # test with very different scales — predictions must still be driven by train stats
    test_large = pd.DataFrame({
        "affected": [99999],
        "damage_rate": [0.99],
        "total_houses": [0],
    })
    model = population_only_fit(train)
    affected_pred, damage_rate_pred = model.predict(test_large)
    # fallback: round(mean(train.affected)) = 200, not influenced by test values
    assert affected_pred[0] == 200
    assert damage_rate_pred[0] == pytest.approx(0.3)


# ---------------------------------------------------------------------------
# A2 — heuristic_predict (thin adapter over ImpactPredictor)
# ---------------------------------------------------------------------------

def test_heuristic_predict_reproduces_documented_values():
    """heuristic_predict reproduces the exact values from test_impact_model.py."""
    # category_ordinal=3, total_houses=1000, structural_vuln_frac=0.20
    # intensity=0.6, affected=round(1000*4.1*(0.2+0.8*0.6))=2788, damage_rate=0.144
    row = {
        "category_ordinal": 3,
        "total_houses": 1000,
        "province_housing_units": 50000,
        "province_households": 51000,
        "structural_vuln_frac": 0.20,
        "unimproved_water_frac": 0.10,
    }
    affected, damage_rate = heuristic_predict(row)
    assert affected == 2788
    assert damage_rate == pytest.approx(0.144)


def test_heuristic_predict_accepts_pandas_series():
    """heuristic_predict accepts a pandas Series (for use in df.apply)."""
    row = pd.Series({
        "category_ordinal": 3,
        "total_houses": 1000,
        "province_housing_units": 50000,
        "province_households": 51000,
        "structural_vuln_frac": 0.20,
        "unimproved_water_frac": 0.10,
    })
    affected, damage_rate = heuristic_predict(row)
    assert affected == 2788
    assert damage_rate == pytest.approx(0.144)


def test_population_only_empty_train_raises():
    """population_only_fit raises ValueError on an empty DataFrame."""
    empty = pd.DataFrame(columns=["affected", "damage_rate", "total_houses"])
    with pytest.raises(ValueError, match="must not be empty"):
        population_only_fit(empty)


def test_population_only_all_zero_houses_uses_fallback():
    """When every training row has total_houses==0, rate_per_house is undefined.

    Predictions for test rows with total_houses>0 must use the fallback
    (round(mean(train.affected))) rather than silently returning 0.
    """
    train = pd.DataFrame({
        "affected": [50, 100, 150],    # mean = 100 → fallback = 100
        "damage_rate": [0.1, 0.2, 0.3],
        "total_houses": [0, 0, 0],     # no house data at all
    })
    test = pd.DataFrame({
        "affected": [0],
        "damage_rate": [0.0],
        "total_houses": [500],         # positive houses, but rate is unknowable
    })
    model = population_only_fit(train)
    affected_pred, _ = model.predict(test)
    # Must equal fallback = round(mean([50, 100, 150])) = 100, NOT 0
    assert affected_pred[0] == 100


def test_heuristic_predict_is_fold_independent():
    """Calling heuristic_predict twice with same features gives same result."""
    row = {
        "category_ordinal": 5,
        "total_houses": 500,
        "province_housing_units": 30000,
        "province_households": 31000,
        "structural_vuln_frac": 0.40,
        "unimproved_water_frac": 0.15,
    }
    r1 = heuristic_predict(row)
    r2 = heuristic_predict(row)
    assert r1 == r2


# ---------------------------------------------------------------------------
# B1 — LOTO fold splitter + TabPFN fold runner (scripts/eval/loto.py)
# ---------------------------------------------------------------------------

from scripts.eval.loto import iter_loto_folds, fit_predict_tabpfn, features_matrix, predicted_severity
from app.core.config import Settings


def _load_training_df():
    """Load the real training CSV (fast — just pandas, no model)."""
    return pd.read_csv(Settings().training_table_path)


# --- Structural / fast tests (no @pytest.mark.tabpfn) ---

def test_loto_fold_count():
    """iter_loto_folds yields exactly 85 folds (one per distinct cyclone_name)."""
    df = _load_training_df()
    folds = list(iter_loto_folds(df))
    assert len(folds) == 85


def test_loto_folds_are_sorted_by_storm_name():
    """Folds are yielded in sorted order of cyclone_name."""
    df = _load_training_df()
    names = [name for name, _, _ in iter_loto_folds(df)]
    assert names == sorted(names)


def test_loto_fold_train_test_disjoint():
    """For each fold, test rows share no cyclone_name with train rows."""
    df = _load_training_df()
    for storm, train_df, test_df in iter_loto_folds(df):
        assert storm not in train_df["cyclone_name"].values
        assert set(test_df["cyclone_name"].unique()) == {storm}


def test_loto_fold_union_covers_all_rows():
    """Train + test for every fold together account for all rows."""
    df = _load_training_df()
    for _, train_df, test_df in iter_loto_folds(df):
        assert len(train_df) + len(test_df) == len(df)


def test_features_matrix_shape_and_dtype():
    """features_matrix returns float64 array with shape (n, len(FEATURE_COLUMNS))."""
    df = _load_training_df()
    X = features_matrix(df)
    from app.services.impact_model import FEATURE_COLUMNS
    assert X.shape == (len(df), len(FEATURE_COLUMNS))
    assert X.dtype == float


def test_predicted_severity_known_values():
    """predicted_severity bins damage_rate using severity_class thresholds."""
    import numpy as np
    rates = np.array([0.0, 0.049, 0.05, 0.19, 0.20, 0.49, 0.50, 1.0])
    result = predicted_severity(rates)
    assert result == ["low", "low", "moderate", "moderate", "high", "high", "severe", "severe"]


def test_predicted_severity_clips_to_01():
    """Values outside [0,1] are clipped before binning (no crash, sensible class)."""
    import numpy as np
    result = predicted_severity(np.array([-0.5, 1.5]))
    assert result == ["low", "severe"]


# --- Heavy test: actually runs TabPFN (@pytest.mark.tabpfn) ---

@pytest.mark.tabpfn
def test_tabpfn_fold_runner_first_two_storms():
    """fit_predict_tabpfn runs correctly on the first 2 LOTO folds.

    Assertions per fold:
    - mean.shape == (len(test_df),)
    - lo <= hi elementwise
    - all outputs are finite
    """
    import numpy as np

    df = _load_training_df()
    settings = Settings()
    folds = list(iter_loto_folds(df))

    for storm, train_df, test_df in folds[:2]:
        X_train = features_matrix(train_df)
        y_train = train_df["affected"].to_numpy(dtype=float)
        X_test = features_matrix(test_df)

        mean, lo, hi = fit_predict_tabpfn(
            X_train, y_train, X_test,
            n_estimators=settings.tabpfn_n_estimators,
            device=settings.tabpfn_device,
            seed=0,
        )

        n = len(test_df)
        assert mean.shape == (n,), f"storm={storm}: mean shape {mean.shape} != ({n},)"
        assert lo.shape == (n,)
        assert hi.shape == (n,)
        assert np.all(lo <= hi), f"storm={storm}: lo > hi for some predictions"
        assert np.all(np.isfinite(mean)), f"storm={storm}: non-finite mean"
        assert np.all(np.isfinite(lo)), f"storm={storm}: non-finite lo"
        assert np.all(np.isfinite(hi)), f"storm={storm}: non-finite hi"
