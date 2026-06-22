"""Segmented error monitoring for the impact model (Phase 6.2 — bias hardening).

Pure functions (numpy only) that bucket held-out LOTO predictions by a
"community-type" feature and report, per bucket, both error magnitude and the
*direction* of the error. This makes systematic under-prediction for a
vulnerable group visible — the fairness guard the privacy/bias hardening phase
calls for, and the monitoring substrate the Phase 6.3 fairness framework builds on.

Why direction matters
----------------------
A model can have an acceptable overall MAE while consistently *under*-predicting
impact for the most vulnerable communities — which, in a relief-allocation
system, means under-serving exactly the people most at risk. Plain MAE hides
this because it is unsigned. So for every bucket we also report:

    mean_signed_error = mean(pred - true)
        < 0  -> predicts LOWER than reality = under-prediction  (the equity risk)
        > 0  -> predicts higher than reality = over-prediction
        ~ 0  -> unbiased

The "community-type" features are the social-vulnerability proxies already in
the training table — ``structural_vuln_frac`` (share of structurally weak
housing) and ``unimproved_water_frac`` (share without improved water access).
Bucketing each into terciles (low / medium / high vulnerability) and checking
the high bucket for negative bias directly answers "does the model systematically
under-predict for vulnerable communities?".

All functions are pure: no I/O, no torch, no globals. They run in the default
test lane and reuse the same (true, pred) arrays the LOTO harness already
produced — no extra model inference.
"""
from __future__ import annotations

import numpy as np

from scripts.eval.metrics import mae, rmse


TERCILE_LABELS: tuple[str, str, str] = ("low", "medium", "high")


def _arr(x) -> np.ndarray:
    return np.asarray(x, dtype=float)


# ---------------------------------------------------------------------------
# Bucketing
# ---------------------------------------------------------------------------

def tercile_edges(values) -> tuple[float, float]:
    """Return the (33.3rd, 66.6th) percentile cut points over *values*.

    For a constant feature both edges collapse to the constant, so every row
    lands in a single bucket (a degenerate-but-valid segmentation).
    """
    v = _arr(values)
    lo = float(np.percentile(v, 100.0 / 3.0))
    hi = float(np.percentile(v, 200.0 / 3.0))
    return lo, hi


def bucketize(values, edges, labels=TERCILE_LABELS) -> list[str]:
    """Assign each value to a labeled bucket using the ``(lo, hi)`` *edges*.

    Lower-inclusive boundaries:
        value <= lo            -> labels[0]
        lo  < value <= hi      -> labels[1]
        value >  hi            -> labels[2]
    """
    lo, hi = edges
    out: list[str] = []
    for v in _arr(values):
        if v <= lo:
            out.append(labels[0])
        elif v <= hi:
            out.append(labels[1])
        else:
            out.append(labels[2])
    return out


# ---------------------------------------------------------------------------
# Directional error
# ---------------------------------------------------------------------------

def mean_signed_error(y_true, y_pred) -> float:
    """Mean of (pred - true). Negative ⇒ systematic under-prediction."""
    return float(np.mean(_arr(y_pred) - _arr(y_true)))


# ---------------------------------------------------------------------------
# Per-feature segmentation
# ---------------------------------------------------------------------------

def segment_errors(y_true, y_pred, segment_values, *, edges=None, labels=TERCILE_LABELS) -> dict:
    """Per-bucket error + bias report for ONE segmentation feature.

    Parameters
    ----------
    y_true, y_pred : array-like
        Held-out truth and predictions, row-aligned with *segment_values*.
    segment_values : array-like
        The community-type feature value for each row.
    edges : tuple[float, float] | None
        Bucket cut points. If None, terciles are derived from *segment_values*.
    labels : tuple[str, str, str]
        Bucket labels, ascending.

    Returns
    -------
    dict with:
        edges            : [lo, hi]
        buckets          : list of {label, n, mae, rmse, mean_signed_error,
                                     under_predicting}
        max_gap_mae      : worst-bucket MAE minus best-bucket MAE (disparity);
                           0.0 when fewer than two non-empty buckets.
    """
    yt, yp, sv = _arr(y_true), _arr(y_pred), _arr(segment_values)
    if edges is None:
        edges = tercile_edges(sv)
    assigned = bucketize(sv, edges, labels)
    assigned_arr = np.array(assigned, dtype=object)

    buckets: list[dict] = []
    bucket_maes: list[float] = []
    for label in labels:
        mask = assigned_arr == label
        n = int(mask.sum())
        if n == 0:
            buckets.append({
                "label": label, "n": 0,
                "mae": None, "rmse": None,
                "mean_signed_error": None, "under_predicting": False,
            })
            continue
        bt, bp = yt[mask], yp[mask]
        b_mae = mae(bt, bp)
        bias = mean_signed_error(bt, bp)
        bucket_maes.append(b_mae)
        buckets.append({
            "label": label,
            "n": n,
            "mae": b_mae,
            "rmse": rmse(bt, bp),
            "mean_signed_error": bias,
            "under_predicting": bool(bias < 0.0),
        })

    max_gap = float(max(bucket_maes) - min(bucket_maes)) if len(bucket_maes) >= 2 else 0.0

    return {
        "edges": [float(edges[0]), float(edges[1])],
        "buckets": buckets,
        "max_gap_mae": max_gap,
    }


def segmented_report(y_true, y_pred, segment_features: dict, *, target: str = "damage_rate") -> dict:
    """Run :func:`segment_errors` for each feature in *segment_features*.

    Parameters
    ----------
    y_true, y_pred : array-like
        Pooled held-out truth/predictions (row-aligned with each feature array).
    segment_features : dict[str, array-like]
        Maps a community-type feature name to its per-row values.
    target : str
        Name of the predicted quantity (for labeling the report).

    Returns
    -------
    dict with keys: target, n, segments (feature_name -> segment_errors output).
    """
    segments = {
        name: segment_errors(y_true, y_pred, values)
        for name, values in segment_features.items()
    }
    return {
        "target": target,
        "n": int(len(_arr(y_true))),
        "segments": segments,
    }


# ---------------------------------------------------------------------------
# Rendering (pure string; CLI does the file I/O)
# ---------------------------------------------------------------------------

def _fmt(v, digits: int = 4) -> str:
    if v is None:
        return "n/a"
    try:
        return f"{float(v):.{digits}f}"
    except (TypeError, ValueError):
        return str(v)


def render_segmented_markdown(report: dict) -> str:
    """Render a :func:`segmented_report` dict as a human-readable Markdown string."""
    target = report.get("target", "?")
    n = report.get("n", "?")
    lines: list[str] = [
        "# LUWAS Impact-Model — Segmented Error Report (Fairness Monitor)",
        "",
        f"Target: **{target}** · pooled held-out rows: **{n}**",
        "",
        "Per **community-type** bucket we report error magnitude (MAE/RMSE) and the",
        "*direction* of error (mean signed error = pred − true). A negative bias in a",
        "**high**-vulnerability bucket means the model **under-predicts** impact there —",
        "the equity risk this monitor exists to catch.",
        "",
    ]

    for feature, seg in report.get("segments", {}).items():
        edges = seg.get("edges", [None, None])
        lines += [
            f"## `{feature}`",
            "",
            f"Tercile edges: low ≤ {_fmt(edges[0])} < medium ≤ {_fmt(edges[1])} < high",
            "",
            "| Bucket | n | MAE | RMSE | Mean signed error | Under-predicting? |",
            "|--------|---|-----|------|-------------------|-------------------|",
        ]
        for b in seg.get("buckets", []):
            flag = "⚠️ yes" if b.get("under_predicting") else "no"
            lines.append(
                f"| {b['label']} | {b['n']} | {_fmt(b['mae'])} | {_fmt(b['rmse'])} | "
                f"{_fmt(b['mean_signed_error'])} | {flag} |"
            )
        lines += [
            "",
            f"Disparity (worst − best bucket MAE): **{_fmt(seg.get('max_gap_mae'))}**",
            "",
        ]

    lines += [
        "## How to read this",
        "",
        "- **Under-predicting = ⚠️ yes** on a high-vulnerability bucket is the flag to act on:",
        "  the model systematically guesses lower than reality for that group, which would",
        "  under-allocate relief. Pair with the coordinator's always-on override (all AI",
        "  outputs are assistive) and feed it into the Phase 6.3 fairness framework.",
        "- **Disparity** quantifies how uneven accuracy is across buckets; smaller is fairer.",
        "- Province-level training data is sparse, so treat single-bucket swings as signals to",
        "  watch, not verdicts. The monitor is designed to be re-run as data grows.",
        "",
    ]
    return "\n".join(lines)
