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

# Materiality threshold: a bucket is *flagged* only when its signed bias reaches
# this fraction of that bucket's own MAE.
#
# Why relative to MAE rather than an absolute number of people or damage points:
# an absolute cut is arbitrary across buckets of different size and error scale,
# and it cannot be justified when asked. MAE is the bucket's own typical error
# magnitude, so `|bias| / MAE` asks the operationally meaningful question — is
# the error *directional enough* to shift an allocation, or is it a small signed
# residue inside ordinary noise? At 0.25, a bucket flags when a quarter or more
# of its typical error points the same way.
#
# The threshold governs only the FLAG. `mean_signed_error` and the raw direction
# are reported for every bucket regardless — this calibrates the monitor, it does
# not suppress a finding.
MATERIALITY_BIAS_RATIO: float = 0.25


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
# Materiality
# ---------------------------------------------------------------------------

def _with_materiality(bucket: dict) -> dict:
    """Add ``bias_ratio`` and ``material_under_prediction`` to a bucket in place.

    ``bias_ratio = mean_signed_error / mae`` — signed, so negative means
    under-prediction and the magnitude says how much of the bucket's typical
    error points that way. A zero-MAE bucket is perfect, so its ratio is 0.
    """
    b_mae = bucket.get("mae")
    bias = bucket.get("mean_signed_error")
    if b_mae is None or bias is None:
        bucket["bias_ratio"] = None
        bucket["material_under_prediction"] = False
        return bucket
    ratio = 0.0 if b_mae == 0 else float(bias) / float(b_mae)
    bucket["bias_ratio"] = ratio
    bucket["material_under_prediction"] = bool(ratio <= -MATERIALITY_BIAS_RATIO)
    return bucket


def apply_materiality(report: dict) -> dict:
    """Recompute materiality flags for a stored :func:`segmented_report` dict.

    Works from the per-bucket stats alone, so a published report can be
    re-flagged without re-running the (expensive) LOTO harness that produced it.
    Mutates and returns *report*.
    """
    for seg in report.get("segments", {}).values():
        for bucket in seg.get("buckets", []):
            _with_materiality(bucket)
    return report


def interpretation_line(seg: dict) -> str:
    """One sentence answering "is anything in this segment actionable?"."""
    flagged = [
        b for b in seg.get("buckets", [])
        if b.get("material_under_prediction")
    ]
    if not flagged:
        return (
            "**Reading:** no bucket exceeds the materiality threshold "
            f"(|bias| ≥ {MATERIALITY_BIAS_RATIO:g} × that bucket's MAE); the residual "
            "signed bias is within noise for this sample size. Nothing here is actionable."
        )
    names = ", ".join(f"`{b['label']}`" for b in flagged)
    detail = "; ".join(
        f"{b['label']}: bias {_fmt(b['mean_signed_error'])} = "
        f"{_fmt(b.get('bias_ratio'), 2)}× its MAE"
        for b in flagged
    )
    return (
        f"**Reading:** {names} exceeds the materiality threshold "
        f"(|bias| ≥ {MATERIALITY_BIAS_RATIO:g} × that bucket's MAE) — {detail}. "
        "Under-prediction of this size would under-allocate relief for that group; "
        "act on it."
    )


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
                "bias_ratio": None, "material_under_prediction": False,
            })
            continue
        bt, bp = yt[mask], yp[mask]
        b_mae = mae(bt, bp)
        bias = mean_signed_error(bt, bp)
        bucket_maes.append(b_mae)
        buckets.append(_with_materiality({
            "label": label,
            "n": n,
            "mae": b_mae,
            "rmse": rmse(bt, bp),
            "mean_signed_error": bias,
            "under_predicting": bool(bias < 0.0),
        }))

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
            "| Bucket | n | MAE | RMSE | Mean signed error | Bias ÷ MAE | Material under-prediction? |",
            "|--------|---|-----|------|-------------------|------------|----------------------------|",
        ]
        for b in seg.get("buckets", []):
            flag = "⚠️ yes" if b.get("material_under_prediction") else "no"
            lines.append(
                f"| {b['label']} | {b['n']} | {_fmt(b['mae'])} | {_fmt(b['rmse'])} | "
                f"{_fmt(b['mean_signed_error'])} | {_fmt(b.get('bias_ratio'), 2)} | {flag} |"
            )
        lines += [
            "",
            f"Disparity (worst − best bucket MAE): **{_fmt(seg.get('max_gap_mae'))}**",
            "",
            interpretation_line(seg),
            "",
        ]

    lines += [
        "## How to read this",
        "",
        "- **Materiality threshold.** A bucket is flagged only when its signed bias reaches",
        f"  **{MATERIALITY_BIAS_RATIO:g} × that bucket's own MAE** in the under-predicting",
        "  direction. The threshold is relative rather than absolute because buckets differ in",
        "  size and error scale, and an absolute cut (in damage points or people) could not be",
        "  justified across them. MAE is the bucket's own typical error, so the ratio asks the",
        "  operational question: is the error directional enough to shift an allocation, or is",
        "  it a small signed residue inside ordinary noise?",
        "- **Nothing is hidden.** The threshold changes what gets *flagged*, never what gets",
        "  *reported*. Raw `mean signed error` is printed for every bucket, in every table,",
        "  regardless of the flag — this calibrates the monitor, it does not suppress a finding.",
        "- **⚠️ yes** on a high-vulnerability bucket is the flag to act on: the model",
        "  systematically guesses lower than reality for that group by an amount large enough to",
        "  matter, which would under-allocate relief. Pair with the coordinator's always-on",
        "  override (all AI outputs are assistive) and feed it into the fairness framework",
        "  (`docs/FAIRNESS.md`).",
        "- **Disparity** quantifies how uneven accuracy is across buckets; smaller is fairer.",
        "- Province-level training data is sparse, so treat single-bucket swings as signals to",
        "  watch, not verdicts. The monitor is designed to be re-run as data grows.",
        "",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI: re-flag and re-render a published report (no model inference)
# ---------------------------------------------------------------------------

def main() -> None:
    """Re-apply the materiality rule to an existing report and re-render it.

    The per-bucket stats in the JSON are sufficient to re-derive the flags, so a
    threshold change does not require re-running the LOTO harness that produced
    them (~1 h on CPU). The underlying numbers are untouched.

        python -m scripts.eval.segmented docs/impact_segmented_error.json
    """
    import argparse
    import json
    from pathlib import Path

    ap = argparse.ArgumentParser(description=main.__doc__)
    ap.add_argument("json_path", type=str,
                    help="Path to an existing impact_segmented_error.json.")
    ap.add_argument("--out-md", type=str, default=None,
                    help="Markdown output path (default: sibling .md of json_path).")
    args = ap.parse_args()

    json_path = Path(args.json_path)
    report = apply_materiality(json.loads(json_path.read_text(encoding="utf-8")))
    md_path = Path(args.out_md) if args.out_md else json_path.with_suffix(".md")

    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    md_path.write_text(render_segmented_markdown(report), encoding="utf-8")

    flagged = [
        f"{name}/{b['label']}"
        for name, seg in report.get("segments", {}).items()
        for b in seg.get("buckets", [])
        if b.get("material_under_prediction")
    ]
    print(f"Re-flagged at threshold {MATERIALITY_BIAS_RATIO:g} x MAE.")
    print(f"  material under-predictions: {', '.join(flagged) if flagged else 'none'}")
    print(f"  written: {json_path}\n           {md_path}")


if __name__ == "__main__":
    main()
