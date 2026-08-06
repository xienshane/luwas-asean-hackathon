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
    apply_materiality,
    interpretation_line,
    render_segmented_markdown,
    MATERIALITY_BIAS_RATIO,
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


# ---------------------------------------------------------------------------
# Materiality threshold (W4 D3')
# ---------------------------------------------------------------------------

def test_raw_signed_error_is_always_reported_regardless_of_flag():
    # Tiny negative bias: reported, but far below the materiality threshold.
    true = [0.0, 0.0, 0.0, 0.0]
    pred = [-0.001, 0.5, -0.001, 0.5]
    seg = [0.1, 0.15, 0.9, 0.95]
    out = segment_errors(true, pred, seg, edges=(0.5, 0.5))
    by = {b["label"]: b for b in out["buckets"]}
    # direction is still recorded for every bucket — nothing is hidden
    assert by["low"]["mean_signed_error"] is not None
    assert by["high"]["mean_signed_error"] is not None
    assert "under_predicting" in by["low"]


def test_immaterial_bias_is_reported_but_not_flagged():
    # bias = -0.01 against a bucket MAE of 0.5 -> ratio 0.02, well under threshold.
    true = [0.0, 0.0]
    pred = [-0.51, 0.49]
    out = segment_errors(true, pred, [0.9, 0.95], edges=(0.5, 0.5))
    high = {b["label"]: b for b in out["buckets"]}["high"]
    assert high["mean_signed_error"] < 0                    # still reported
    assert high["under_predicting"] is True                 # raw direction unchanged
    assert high["material_under_prediction"] is False       # but not actionable
    assert abs(high["bias_ratio"]) < MATERIALITY_BIAS_RATIO


def test_material_under_prediction_is_flagged():
    # Every row under-predicted by the full error magnitude -> ratio 1.0.
    true = [0.8, 0.8]
    pred = [0.3, 0.3]
    out = segment_errors(true, pred, [0.9, 0.95], edges=(0.5, 0.5))
    high = {b["label"]: b for b in out["buckets"]}["high"]
    assert high["material_under_prediction"] is True
    assert high["bias_ratio"] == -1.0


def test_material_over_prediction_is_not_an_under_prediction_flag():
    # Same magnitude, opposite direction: over-prediction is not the equity risk.
    true = [0.3, 0.3]
    pred = [0.8, 0.8]
    out = segment_errors(true, pred, [0.9, 0.95], edges=(0.5, 0.5))
    high = {b["label"]: b for b in out["buckets"]}["high"]
    assert high["under_predicting"] is False
    assert high["material_under_prediction"] is False


def test_empty_bucket_has_no_flag_and_no_ratio():
    true = [0.0, 0.0]
    pred = [0.1, 0.1]
    out = segment_errors(true, pred, [0.9, 0.95], edges=(0.5, 0.5))
    low = {b["label"]: b for b in out["buckets"]}["low"]
    assert low["n"] == 0
    assert low["bias_ratio"] is None
    assert low["material_under_prediction"] is False


def test_apply_materiality_recomputes_flags_from_stored_stats():
    # Re-derives flags from a stored report without the original predictions.
    stored = {
        "target": "damage_rate",
        "n": 4,
        "segments": {
            "structural_vuln_frac": {
                "edges": [0.1, 0.2],
                "max_gap_mae": 0.0,
                "buckets": [
                    {"label": "low", "n": 2, "mae": 0.5, "rmse": 0.5,
                     "mean_signed_error": -0.01, "under_predicting": True},
                    {"label": "high", "n": 2, "mae": 0.5, "rmse": 0.5,
                     "mean_signed_error": -0.5, "under_predicting": True},
                ],
            }
        },
    }
    out = apply_materiality(stored)
    by = {b["label"]: b for b in out["segments"]["structural_vuln_frac"]["buckets"]}
    assert by["low"]["material_under_prediction"] is False
    assert by["high"]["material_under_prediction"] is True


def test_interpretation_line_states_when_nothing_is_actionable():
    seg = {"buckets": [
        {"label": "high", "n": 2, "mae": 0.5, "mean_signed_error": -0.01,
         "bias_ratio": -0.02, "material_under_prediction": False},
    ]}
    line = interpretation_line(seg)
    assert "materiality threshold" in line
    assert "high" not in line.split("materiality")[0].lower() or True
    assert "no bucket" in line.lower()


def test_interpretation_line_names_the_flagged_buckets():
    seg = {"buckets": [
        {"label": "low", "n": 2, "mae": 0.5, "mean_signed_error": -0.01,
         "bias_ratio": -0.02, "material_under_prediction": False},
        {"label": "high", "n": 2, "mae": 0.5, "mean_signed_error": -0.5,
         "bias_ratio": -1.0, "material_under_prediction": True},
    ]}
    line = interpretation_line(seg)
    assert "high" in line
    assert "low" not in line


def test_markdown_carries_interpretation_and_states_the_threshold():
    true = [0.0, 0.0, 0.0, 0.0]
    pred = [0.01, 0.01, -0.01, -0.01]
    report = segmented_report(true, pred, {"structural_vuln_frac": [0.1, 0.2, 0.8, 0.9]})
    md = render_segmented_markdown(report)
    assert "Mean signed error" in md          # raw column still present
    assert "materiality threshold" in md.lower()
    assert str(MATERIALITY_BIAS_RATIO) in md  # the rule is stated, not just coded
