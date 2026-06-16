"""
Pure metric functions for impact-model validation.

All functions are pure (no I/O, no globals, no side effects).
Dependencies: numpy, scikit-learn only.
"""
from __future__ import annotations

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_recall_fscore_support,
)

_SEVERITY_LABELS = ["low", "moderate", "high", "severe"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _arr(x) -> np.ndarray:
    """Convert array-like to float64 numpy array."""
    return np.asarray(x, dtype=float)


# ---------------------------------------------------------------------------
# damage_rate metrics (plain scale)
# ---------------------------------------------------------------------------

def mae(y_true, y_pred) -> float:
    """Mean Absolute Error."""
    y_true, y_pred = _arr(y_true), _arr(y_pred)
    return float(np.mean(np.abs(y_true - y_pred)))


def rmse(y_true, y_pred) -> float:
    """Root Mean Squared Error."""
    y_true, y_pred = _arr(y_true), _arr(y_pred)
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


# ---------------------------------------------------------------------------
# affected metrics (log scale)
# ---------------------------------------------------------------------------

def _log1p_clip(x: np.ndarray) -> np.ndarray:
    """Apply log1p after clipping negatives to 0."""
    return np.log1p(np.clip(x, 0, None))


def log_mae(y_true, y_pred) -> float:
    """MAE computed on log1p(clip(x, 0, None)) transformed values."""
    y_true, y_pred = _arr(y_true), _arr(y_pred)
    return float(np.mean(np.abs(_log1p_clip(y_true) - _log1p_clip(y_pred))))


def log_rmse(y_true, y_pred) -> float:
    """RMSE computed on log1p(clip(x, 0, None)) transformed values."""
    y_true, y_pred = _arr(y_true), _arr(y_pred)
    return float(np.sqrt(np.mean((_log1p_clip(y_true) - _log1p_clip(y_pred)) ** 2)))


# ---------------------------------------------------------------------------
# Symmetric MAPE (result in [0, 1])
# ---------------------------------------------------------------------------

def smape(y_true, y_pred) -> float:
    """
    Symmetric MAPE scaled to [0, 1].

    Per-element: |y_true - y_pred| / ((|y_true| + |y_pred|) / 2) / 2
    When both are 0 the term is defined as 0 (0/0 → 0).
    """
    y_true, y_pred = _arr(y_true), _arr(y_pred)
    numerator = np.abs(y_true - y_pred)
    denominator = (np.abs(y_true) + np.abs(y_pred)) / 2.0
    # Per-element term; where denominator == 0, both values are 0 → term is 0.
    # Use out + where to avoid divide-by-zero RuntimeWarning from np.where.
    per_element = np.zeros_like(numerator)
    nonzero = denominator != 0.0
    per_element[nonzero] = numerator[nonzero] / denominator[nonzero] / 2.0
    return float(np.mean(per_element))


# ---------------------------------------------------------------------------
# Prediction interval metrics
# ---------------------------------------------------------------------------

def interval_coverage(y_true, lo, hi) -> float:
    """Fraction of y_true values within [lo, hi] (inclusive)."""
    y_true, lo, hi = _arr(y_true), _arr(lo), _arr(hi)
    inside = (y_true >= lo) & (y_true <= hi)
    return float(np.mean(inside))


def mean_interval_width(lo, hi) -> float:
    """Mean width of prediction intervals."""
    lo, hi = _arr(lo), _arr(hi)
    return float(np.mean(hi - lo))


# ---------------------------------------------------------------------------
# Severity classification metrics
# ---------------------------------------------------------------------------

def severity_metrics(true_classes, pred_classes) -> dict:
    """
    Compute classification metrics for severity levels.

    Parameters
    ----------
    true_classes : array-like of str
        True severity labels (subset of ["low","moderate","high","severe"]).
    pred_classes : array-like of str
        Predicted severity labels.

    Returns
    -------
    dict with keys:
        accuracy  : float
        macro_f1  : float
        per_class : dict[str, dict[str, float|int]]
            Each label maps to {precision, recall, f1, support}.
    """
    labels = _SEVERITY_LABELS

    accuracy = float(accuracy_score(true_classes, pred_classes))
    macro_f1 = float(
        f1_score(true_classes, pred_classes, labels=labels, average="macro", zero_division=0)
    )

    precisions, recalls, f1s, supports = precision_recall_fscore_support(
        true_classes,
        pred_classes,
        labels=labels,
        zero_division=0,
    )

    per_class = {
        label: {
            "precision": float(precisions[i]),
            "recall": float(recalls[i]),
            "f1": float(f1s[i]),
            "support": int(supports[i]),
        }
        for i, label in enumerate(labels)
    }

    return {
        "accuracy": accuracy,
        "macro_f1": macro_f1,
        "per_class": per_class,
    }
