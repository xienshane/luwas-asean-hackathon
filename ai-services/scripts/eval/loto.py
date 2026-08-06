"""Leave-One-Typhoon-Out (LOTO) cross-validation utilities.

Public API
----------
iter_loto_folds(df)
    Yields (storm_name, train_df, test_df) for each distinct cyclone_name,
    in sorted order. One fold per storm (test = that storm; train = all others).

fit_predict_tabpfn(X_train, y_train, X_test, *, n_estimators, device, seed=0)
    Fits a TabPFNRegressor on (X_train, y_train) with NO row-cap
    (full per-fold context — fair capability read for eval, unlike the 128-row
    deployed config) and returns (mean, lo, hi) arrays over X_test.
    Mirrors app.services.impact_model._predict_tabpfn exactly.

features_matrix(df)
    Converts a DataFrame to a float64 ndarray using FEATURE_COLUMNS imported
    from app.services.impact_model (canonical column order, no hardcoding).

predicted_severity(damage_rate_array)
    Bins a numpy array of damage_rate values (clipped to [0,1]) into severity
    class strings using severity_class from app.services.impact_model.

Decomposition choice
--------------------
loto.py is intentionally primitive:
  (a) fold iteration
  (b) single fit_predict_tabpfn primitive (one call per target variable)
  (c) feature matrix + severity helper
B2 will call fit_predict_tabpfn twice (once for `affected`, once for
`damage_rate`) and assemble per-fold result rows. This keeps loto.py
unit-testable without any multi-target orchestration in it.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.services.impact_model import FEATURE_COLUMNS, severity_class


# ---------------------------------------------------------------------------
# Fold iteration
# ---------------------------------------------------------------------------

def iter_loto_folds(df: pd.DataFrame):
    """Yield (storm_name, train_df, test_df) for each distinct cyclone_name.

    Order is deterministic: sorted alphabetically by storm name.
    test_df  = all rows whose cyclone_name == storm_name
    train_df = all other rows
    """
    for storm in sorted(df["cyclone_name"].unique()):
        mask = df["cyclone_name"] == storm
        yield storm, df[~mask].reset_index(drop=True), df[mask].reset_index(drop=True)


# ---------------------------------------------------------------------------
# Feature matrix helper
# ---------------------------------------------------------------------------

def features_matrix(df: pd.DataFrame) -> np.ndarray:
    """Return float64 ndarray of shape (n_rows, len(FEATURE_COLUMNS)).

    Uses FEATURE_COLUMNS imported from app.services.impact_model — canonical
    column order, not hardcoded here.
    """
    return df[FEATURE_COLUMNS].to_numpy(dtype=float)


# ---------------------------------------------------------------------------
# Severity helper
# ---------------------------------------------------------------------------

def predicted_severity(damage_rate_array: np.ndarray) -> list[str]:
    """Bin an array of damage_rate values into severity class strings.

    Values are clipped to [0, 1] before binning to guard against out-of-range
    predictions. Uses severity_class from app.services.impact_model.
    """
    clipped = np.clip(np.asarray(damage_rate_array, dtype=float), 0.0, 1.0)
    return [severity_class(float(v)) for v in clipped]


# ---------------------------------------------------------------------------
# TabPFN fold runner (mirrors _predict_tabpfn exactly, no row cap)
# ---------------------------------------------------------------------------

def fit_predict_tabpfn(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    *,
    n_estimators: int,
    device: str,
    seed: int = 0,
    context_cap: int | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Fit a TabPFNRegressor and return (mean, lo, hi) predictions over X_test.

    ``context_cap=None`` (default) uses the full per-fold context — a fair
    capability read. Passing a cap replicates the deployed subsample exactly:
    the same seeded ``default_rng(0).choice`` call as
    ``ImpactPredictor.warmup`` (`app/services/impact_model.py`), so a capped run
    measures the config the service actually serves rather than a new one.

    ignore_pretraining_limits=True is required: with ~1.26k context rows the
    table exceeds TabPFN's default 1k CPU guard.

    Returns
    -------
    mean : ndarray, shape (n_test,)
    lo   : ndarray, shape (n_test,)   — 10th-percentile quantile (lower 80% bound)
    hi   : ndarray, shape (n_test,)   — 90th-percentile quantile (upper 80% bound)
    """
    from tabpfn import TabPFNRegressor

    if context_cap is not None and len(X_train) > context_cap:
        # Same call shape and seed as the deployed subsample; a different draw
        # would be a different experiment.
        idx = np.random.default_rng(0).choice(len(X_train), context_cap, replace=False)
        X_train, y_train = X_train[idx], y_train[idx]

    m = TabPFNRegressor(
        device=device,
        n_estimators=n_estimators,
        ignore_pretraining_limits=True,
        random_state=seed,
    )
    m.fit(X_train, y_train)
    out = m.predict(X_test, output_type="main")
    mean = np.asarray(out["mean"], float)
    q = out["quantiles"]                      # per-quantile arrays, 0.1 .. 0.9
    if len(q) < 2:
        raise ValueError("expected >=2 quantile levels from TabPFN predict")
    lo = np.asarray(q[0], float)             # 10th percentile  (lower 80% bound)
    hi = np.asarray(q[-1], float)            # 90th percentile  (upper 80% bound)
    return mean, lo, hi
