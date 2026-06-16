"""
Report writers for impact-model validation results.

Two public functions:
  to_json(results, path)     — serialise the assembled results dict to JSON.
  to_markdown(results, path) — render a human-readable Markdown report.

Both functions:
  * Create parent directories as needed (no FileNotFoundError).
  * Stamp ``generated_at`` (ISO 8601 UTC) and ``git_commit`` (short SHA) in
    the output if those keys are absent or None in the input dict.
  * Are pure I/O + formatting — no torch, no model imports.

The ``results`` dict shape is defined in the Task C1 spec and mirrors the
output of B2's ``aggregate()`` wrapped with top-level metadata fields.
"""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_git_commit() -> str:
    """Return the short HEAD SHA, or 'unknown' if git is unavailable."""
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
        return out.decode().strip()
    except Exception:
        return "unknown"


def _stamp(results: dict) -> dict:
    """Return a shallow copy of *results* with generated_at/git_commit filled.

    Fields already present (and non-None) are preserved unchanged.
    """
    out = dict(results)
    if not out.get("generated_at"):
        out["generated_at"] = datetime.now(timezone.utc).isoformat()
    if not out.get("git_commit"):
        out["git_commit"] = _get_git_commit()
    return out


def _fmt(value: Any, digits: int = 4) -> str:
    """Format a numeric value as a fixed-width string, or return 'n/a'."""
    if value is None:
        return "n/a"
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return str(value)


def _get(d: dict, *keys, default="n/a"):
    """Safely traverse nested dict with a fallback default."""
    cur = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k, default)
        if cur == default:
            return default
    return cur


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def to_json(results: dict, path: str | Path) -> None:
    """Serialise *results* to a pretty-printed JSON file at *path*.

    * Fills ``generated_at`` and ``git_commit`` if absent/None.
    * Creates parent directories automatically.
    * Writes with indent=2 for human readability.

    Parameters
    ----------
    results : dict
        Fully-assembled results dict (produced by the eval harness).
    path : str or Path
        Destination file path.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    stamped = _stamp(results)
    path.write_text(json.dumps(stamped, indent=2, default=str), encoding="utf-8")


def to_markdown(results: dict, path: str | Path) -> None:
    """Render *results* as a human-readable Markdown report at *path*.

    Sections:
      1. Headline callout (Slide 11 numbers).
      2. Overall metrics table (methods × metric families).
      3. Per-storm table.
      4. "How to read this" note.

    Missing fields are handled gracefully via .get() — the function never
    raises KeyError even if the input is a minimal smoke-test dict.

    Parameters
    ----------
    results : dict
        Assembled results dict (same shape as to_json input).
    path : str or Path
        Destination file path.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    stamped = _stamp(results)
    lines: list[str] = []

    generated_at = stamped.get("generated_at", "n/a")
    git_commit    = stamped.get("git_commit",    "unknown")
    config        = stamped.get("config",  {})
    dataset       = stamped.get("dataset", {})
    overall       = stamped.get("overall", {})
    per_storm     = stamped.get("per_storm", [])
    latency       = stamped.get("latency_ms_deployed")  # may be None/absent

    tabpfn_o  = overall.get("tabpfn",          {})
    pop_o     = overall.get("population_only",  {})
    heur_o    = overall.get("heuristic",        {})

    # -----------------------------------------------------------------------
    # Header
    # -----------------------------------------------------------------------
    lines += [
        "# LUWAS Impact-Model Validation Report",
        "",
        f"*Generated:* {generated_at}  |  *Commit:* `{git_commit}`",
        "",
    ]

    # -----------------------------------------------------------------------
    # Section 1 — Headline callout (Slide 11)
    # -----------------------------------------------------------------------
    lines += [
        "## Headline Numbers (Slide 11)",
        "",
        "Key figures for the executive summary / slide deck.",
        "",
    ]

    # damage_rate MAE comparison
    tf_dr_mae   = _get(tabpfn_o, "damage_rate", "mae")
    pop_dr_mae  = _get(pop_o,    "damage_rate", "mae")
    heur_dr_mae = _get(heur_o,   "damage_rate", "mae")

    # severity macro-F1
    tf_mf1 = _get(tabpfn_o, "severity", "macro_f1")

    # calibration coverage
    tf_aff_cov = _get(tabpfn_o, "calibration", "affected_80_coverage")
    tf_dr_cov  = _get(tabpfn_o, "calibration", "damage_rate_80_coverage")

    # latency p50/p95 (optional)
    if latency:
        lat_p50 = _fmt(latency.get("p50"), 1)
        lat_p95 = _fmt(latency.get("p95"), 1)
        latency_line = f"- **Latency (deployed config):** p50 = {lat_p50} ms, p95 = {lat_p95} ms"
    else:
        latency_line = "- **Latency (deployed config):** n/a (run without --latency)"

    lines += [
        "| Metric | TabPFN | population_only | heuristic |",
        "| --- | --- | --- | --- |",
        f"| damage_rate MAE | **{_fmt(tf_dr_mae)}** | {_fmt(pop_dr_mae)} | {_fmt(heur_dr_mae)} |",
        f"| severity macro-F1 | **{_fmt(tf_mf1)}** | — | — |",
        f"| affected 80 % coverage | **{_fmt(tf_aff_cov)}** | — | — |",
        f"| damage_rate 80 % coverage | **{_fmt(tf_dr_cov)}** | — | — |",
        "",
        latency_line,
        "",
    ]

    # -----------------------------------------------------------------------
    # Section 2 — Overall metrics table
    # -----------------------------------------------------------------------
    lines += [
        "## Overall Metrics",
        "",
        "Metrics computed on pooled held-out predictions across all folds.",
        "",
    ]

    # Build rows for all three methods
    def _overall_row(method_name: str, m: dict) -> str:
        dr_mae   = _fmt(_get(m, "damage_rate", "mae"))
        dr_rmse  = _fmt(_get(m, "damage_rate", "rmse"))
        aff_lmae = _fmt(_get(m, "affected",    "log_mae"))
        aff_lrms = _fmt(_get(m, "affected",    "log_rmse"))
        aff_smap = _fmt(_get(m, "affected",    "smape"))
        sev_acc  = _fmt(_get(m, "severity",    "accuracy"))
        sev_f1   = _fmt(_get(m, "severity",    "macro_f1"))
        cal_affc = _fmt(_get(m, "calibration", "affected_80_coverage"))
        cal_drc  = _fmt(_get(m, "calibration", "damage_rate_80_coverage"))
        return (
            f"| {method_name} "
            f"| {dr_mae} | {dr_rmse} "
            f"| {aff_lmae} | {aff_lrms} | {aff_smap} "
            f"| {sev_acc} | {sev_f1} "
            f"| {cal_affc} | {cal_drc} |"
        )

    lines += [
        "| Method "
        "| DR MAE | DR RMSE "
        "| Aff log-MAE | Aff log-RMSE | Aff sMAPE "
        "| Sev Acc | Sev macro-F1 "
        "| Aff 80% cov | DR 80% cov |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        _overall_row("tabpfn",          tabpfn_o),
        _overall_row("population_only", pop_o),
        _overall_row("heuristic",       heur_o),
        "",
    ]

    # Deltas sub-table
    deltas = overall.get("deltas", {})
    vs_pop  = deltas.get("tabpfn_vs_population", {})
    vs_heur = deltas.get("tabpfn_vs_heuristic",  {})

    def _delta_row(label: str, d: dict) -> str:
        dr_mae   = _fmt(_get(d, "damage_rate", "mae"))
        dr_rmse  = _fmt(_get(d, "damage_rate", "rmse"))
        aff_lmae = _fmt(_get(d, "affected",    "log_mae"))
        aff_smap = _fmt(_get(d, "affected",    "smape"))
        return f"| {label} | {dr_mae} | {dr_rmse} | {aff_lmae} | {aff_smap} |"

    lines += [
        "### Deltas (TabPFN − baseline; negative = TabPFN better)",
        "",
        "| Comparison | DR MAE Δ | DR RMSE Δ | Aff log-MAE Δ | Aff sMAPE Δ |",
        "| --- | --- | --- | --- | --- |",
        _delta_row("vs population_only", vs_pop),
        _delta_row("vs heuristic",       vs_heur),
        "",
    ]

    # -----------------------------------------------------------------------
    # Section 3 — Per-storm table
    # -----------------------------------------------------------------------
    lines += [
        "## Per-Storm Results",
        "",
        "| Storm | N | TabPFN DR MAE | pop_only DR MAE | heuristic DR MAE |",
        "| --- | --- | --- | --- | --- |",
    ]

    for entry in per_storm:
        storm = entry.get("storm", "?")
        n     = entry.get("n", "?")
        tf_mae   = _fmt(_get(entry, "tabpfn",          "damage_rate", "mae"))
        pop_mae  = _fmt(_get(entry, "population_only", "damage_rate", "mae"))
        heur_mae = _fmt(_get(entry, "heuristic",       "damage_rate", "mae"))
        lines.append(f"| {storm} | {n} | {tf_mae} | {pop_mae} | {heur_mae} |")

    lines += [""]

    # -----------------------------------------------------------------------
    # Section 4 — Config summary
    # -----------------------------------------------------------------------
    folds        = config.get("folds",               "n/a")
    rows         = dataset.get("rows",                "n/a")
    storms       = dataset.get("storms",              "n/a")
    year_range   = dataset.get("year_range",          ["n/a", "n/a"])
    headline_tgt = dataset.get("headline_target",     "n/a")

    lines += [
        "## Evaluation Configuration",
        "",
        f"- **Folds:** {folds}  |  **Rows:** {rows}  |  **Storms:** {storms}",
        f"- **Year range:** {year_range[0]}–{year_range[1] if len(year_range) > 1 else 'n/a'}",
        f"- **Headline target:** {headline_tgt}",
        "",
    ]

    # -----------------------------------------------------------------------
    # Section 5 — How to read this
    # -----------------------------------------------------------------------
    lines += [
        "## How to Read This Report",
        "",
        "- **Granularity:** metrics are computed at *province level* "
        "(barangay predictions aggregated to province before scoring).",
        "- **Prediction intervals** (80 % coverage columns) are decision-support "
        "tools, not guarantees — coordinators should treat them as plausible "
        "ranges rather than precise bounds.  "
        "See MODEL_CARD §5.3 and §4.3 for calibration assumptions and limitations.",
        "- **Baselines:** `population_only` regresses on population density only; "
        "`heuristic` applies fixed damage fractions per wind-speed bucket.  "
        "Both are deterministic and produce no prediction intervals.",
        "- **TabPFN** is the primary model; a negative delta (Δ < 0) means "
        "TabPFN is better than the baseline on that metric.",
        "- All AI outputs are *assistive*: the coordinator can override every "
        "prediction and manifest in the dashboard.",
        "",
    ]

    path.write_text("\n".join(lines), encoding="utf-8")
