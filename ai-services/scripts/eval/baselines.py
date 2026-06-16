"""
Baseline predictors for impact-model validation.

Two baselines:

D4 — population_only_fit(train_df) → BaselineModel
    A no-hazard-signal baseline trained on the training fold only (no leakage).
    - damage_rate_pred = mean(train.damage_rate)               [constant]
    - affected_pred    = round(rate_per_house * total_houses)  [scales with houses]
    - Zero-house fallback: round(mean(train.affected))

HeuristicBaseline — heuristic_predict(row) → (affected, damage_rate)
    Thin adapter calling the real ImpactPredictor (heuristic path).
    Fold-independent; the predictor is a lazy module-level singleton.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Union

import pandas as pd


# ---------------------------------------------------------------------------
# D4 — population-only baseline
# ---------------------------------------------------------------------------

@dataclass
class _PopulationOnlyModel:
    """Fitted state for the population-only baseline."""
    _mean_damage_rate: float
    _rate_per_house: float | None  # None when no training row had total_houses > 0
    _fallback_affected: int

    def predict(
        self, test_df: pd.DataFrame
    ) -> tuple[list[int], list[float]]:
        """Return (affected_pred, damage_rate_pred) as parallel lists."""
        affected_pred: list[int] = []
        damage_rate_pred: list[float] = []

        for _, row in test_df.iterrows():
            houses = row["total_houses"]
            # Use per-house rate only when it was estimable from training data
            # and the test row has at least one house; otherwise use fallback.
            if houses > 0 and self._rate_per_house is not None:
                aff = round(self._rate_per_house * houses)
            else:
                aff = self._fallback_affected
            affected_pred.append(aff)
            damage_rate_pred.append(self._mean_damage_rate)

        return affected_pred, damage_rate_pred


def population_only_fit(train_df: pd.DataFrame) -> _PopulationOnlyModel:
    """Fit the population-only baseline on the training fold.

    No leakage: only train_df is used to derive statistics.

    Parameters
    ----------
    train_df:
        DataFrame with columns: ``affected``, ``damage_rate``, ``total_houses``.

    Returns
    -------
    A fitted model with a ``.predict(test_df)`` method.
    """
    if train_df.empty:
        raise ValueError("population_only_fit: train_df must not be empty")

    mean_damage_rate = float(train_df["damage_rate"].mean())
    fallback_affected = round(float(train_df["affected"].mean()))

    # Compute per-house rate only from rows where total_houses > 0.
    # If no training row has total_houses > 0, rate_per_house is undefined —
    # store None so _predict() uses the fallback for all test rows instead of
    # silently predicting 0 for every positive-house row.
    mask = train_df["total_houses"] > 0
    if mask.any():
        rates = (
            train_df.loc[mask, "affected"] / train_df.loc[mask, "total_houses"]
        )
        rate_per_house: float | None = float(rates.mean())
    else:
        rate_per_house = None

    return _PopulationOnlyModel(
        _mean_damage_rate=mean_damage_rate,
        _rate_per_house=rate_per_house,
        _fallback_affected=fallback_affected,
    )


# ---------------------------------------------------------------------------
# Heuristic baseline — thin adapter over ImpactPredictor
# ---------------------------------------------------------------------------

# Lazy singleton: instantiated once on first call, reused thereafter.
_heuristic_predictor = None


def _get_heuristic_predictor():
    global _heuristic_predictor
    if _heuristic_predictor is None:
        from app.core.config import Settings
        from app.services.impact_model import ImpactPredictor
        _heuristic_predictor = ImpactPredictor(Settings(disable_tabpfn=True))
    return _heuristic_predictor


def heuristic_predict(
    row: Union[dict, "pd.Series"],
) -> tuple[int, float]:
    """Predict (affected, damage_rate) for one row using the heuristic path.

    Accepts a dict or a pandas Series.  Fold-independent (pure function of
    features).  Reuses the real ``ImpactPredictor`` — does NOT reimplement
    the formula.

    Required keys: category_ordinal, total_houses, province_housing_units,
    province_households, structural_vuln_frac, unimproved_water_frac.
    """
    from app.models.impact import BarangayFeatures

    predictor = _get_heuristic_predictor()

    # Accept both dict and pd.Series
    if isinstance(row, pd.Series):
        row = row.to_dict()

    feat = BarangayFeatures(
        category_ordinal=int(row["category_ordinal"]),
        total_houses=int(row["total_houses"]),
        province_housing_units=int(row["province_housing_units"]),
        province_households=int(row["province_households"]),
        structural_vuln_frac=float(row["structural_vuln_frac"]),
        unimproved_water_frac=float(row["unimproved_water_frac"]),
        id=row.get("id"),
    )

    [pred] = predictor.predict([feat])
    return pred.affected, pred.damage_rate
