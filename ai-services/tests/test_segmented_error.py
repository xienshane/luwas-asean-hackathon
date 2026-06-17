"""Tests for segmented error monitoring (Phase 6.2 — privacy & bias hardening).

These cover the PURE functions in scripts/eval/segmented.py: they need no torch,
no TabPFN, and no I/O, so they run in the default (non-@tabpfn) test lane.

The engine answers one fairness question: *does the model systematically
under-predict impact for more-vulnerable communities?* It buckets held-out
predictions by a community-type feature and reports, per bucket, both the error
magnitude (MAE/RMSE) and the directional bias (mean signed error, pred - true).
A negative bias means the model predicts LOWER than reality — under-prediction —
which for a high-vulnerability bucket is the equity risk we must surface.
"""
from __future__ import annotations

import math

from scripts.eval.segmented import (
    tercile_edges,
    bucketize,
    mean_signed_error,
    segment_errors,
    segmented_report,
    TERCILE_LABELS,
)


# ---------------------------------------------------------------------------
# tercile_edges
# ---------------------------------------------------------------------------

def test_tercile_edges_returns_33_66_percentiles():
    lo, hi = tercile_edges([0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0])
    # 33.3rd and 66.6th percentiles of 0..9
    assert lo == math.isclose(lo, 2.997, abs_tol=0.05) or 2.5 < lo < 3.5
    assert 5.5 < hi < 6.5


def test_tercile_edges_constant_feature_degenerate():
    # All identical -> both edges equal the constant; everything lands in one bucket.
    lo, hi = tercile_edges([0.4, 0.4, 0.4, 0.4])
    assert lo == 0.4 and hi == 0.4


# ---------------------------------------------------------------------------
# bucketize
# ---------------------------------------------------------------------------

def test_bucketize_assigns_three_labels():
    labels = bucketize([0.1, 0.5, 0.9], edges=(0.3, 0.7))
    assert labels == ["low", "medium", "high"]


def test_bucketize_boundaries_are_lower_inclusive():
    # value <= lo -> low ; lo < value <= hi -> medium ; value > hi -> high
    labels = bucketize([0.3, 0.7, 0.71], edges=(0.3, 0.7))
    assert labels == ["low", "medium", "high"]


def test_bucketize_custom_labels():
    labels = bucketize([0.0, 1.0], edges=(0.5, 0.5), labels=("a", "b", "c"))
    assert labels == ["a", "c"]


# ---------------------------------------------------------------------------
# mean_signed_error (bias / direction)
# ---------------------------------------------------------------------------

def test_mean_signed_error_under_prediction_is_negative():
    # pred consistently below truth -> negative bias.
    assert mean_signed_error([10.0, 10.0], [4.0, 6.0]) == -5.0


def test_mean_signed_error_over_prediction_is_positive():
    assert mean_signed_error([2.0, 2.0], [5.0, 5.0]) == 3.0


def test_mean_signed_error_unbiased_is_zero():
    assert mean_signed_error([5.0, 5.0], [3.0, 7.0]) == 0.0


# ---------------------------------------------------------------------------
# segment_errors
# ---------------------------------------------------------------------------

def test_segment_errors_groups_and_counts():
    # Three buckets, two rows each, via explicit edges on the segment values.
    true = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    pred = [0.1, 0.1, 0.2, 0.2, 0.3, 0.3]
    seg = [0.1, 0.2, 0.5, 0.6, 0.9, 0.95]
    out = segment_errors(true, pred, seg, edges=(0.3, 0.7))
    counts = {b["label"]: b["n"] for b in out["buckets"]}
    assert counts == {"low": 2, "medium": 2, "high": 2}


def test_segment_errors_flags_under_prediction_in_high_bucket():
    # High-vulnerability bucket is under-predicted (pred < true); low bucket is exact.
    true = [0.2, 0.2, 0.8, 0.8]
    pred = [0.2, 0.2, 0.3, 0.3]   # high bucket predicts way under
    seg = [0.1, 0.15, 0.9, 0.95]
    out = segment_errors(true, pred, seg, edges=(0.5, 0.5))
    by = {b["label"]: b for b in out["buckets"]}
    assert by["high"]["mean_signed_error"] < 0
    assert by["high"]["under_predicting"] is True
    assert by["low"]["under_predicting"] is False
    assert by["high"]["mae"] == 0.5


def test_segment_errors_reports_disparity_gap():
    true = [0.0, 0.0, 0.0, 0.0]
    pred = [0.0, 0.0, 0.4, 0.4]   # low bucket perfect, high bucket MAE 0.4
    seg = [0.1, 0.2, 0.8, 0.9]
    out = segment_errors(true, pred, seg, edges=(0.5, 0.5))
    assert math.isclose(out["max_gap_mae"], 0.4, abs_tol=1e-9)


def test_segment_errors_auto_edges_when_none_given():
    # With edges=None it derives terciles from the segment values themselves.
    true = list(range(9))
    pred = list(range(9))
    seg = [float(i) for i in range(9)]
    out = segment_errors(true, pred, seg, edges=None)
    assert [b["label"] for b in out["buckets"]] == list(TERCILE_LABELS)
    assert sum(b["n"] for b in out["buckets"]) == 9


# ---------------------------------------------------------------------------
# segmented_report (multi-feature)
# ---------------------------------------------------------------------------

def test_segmented_report_covers_each_feature():
    true = [0.0, 0.0, 0.0, 0.0]
    pred = [0.0, 0.1, 0.0, 0.1]
    features = {
        "structural_vuln_frac": [0.1, 0.9, 0.1, 0.9],
        "unimproved_water_frac": [0.2, 0.2, 0.8, 0.8],
    }
    report = segmented_report(true, pred, features, target="damage_rate")
    assert report["target"] == "damage_rate"
    assert set(report["segments"].keys()) == set(features.keys())
    for seg in report["segments"].values():
        assert "buckets" in seg and "max_gap_mae" in seg
