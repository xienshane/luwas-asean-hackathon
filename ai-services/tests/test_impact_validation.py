"""
Tests for pure metric functions in scripts/eval/metrics.py.
These tests are written FIRST (TDD). They will fail until metrics.py is implemented.

Run from ai-services/ directory:
    pytest tests/test_impact_validation.py
"""
import sys
from pathlib import Path

# Ensure ai-services/ is on sys.path so `from scripts.eval.metrics import ...` resolves.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
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
    import math
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
    # |0 - 1| / ((0 + 1) / 2) / 2 = 1 / 0.5 / 2 = 1.0; then mean = 1.0
    # but smape is already in [0,1] so value == 1.0
    assert smape([0.0], [1.0]) == pytest.approx(1.0)


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
