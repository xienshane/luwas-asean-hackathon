"""Impact predictor: TabPFN in-context prediction with a deterministic fallback.

`affected` is always regressed. The severity head follows `model_framing`:
regressor -> continuous `damage_rate`; classifier -> a severity class.
The heuristic path is pure (no model, no network) and is used when TabPFN is
disabled or fails to load/predict.
"""
import logging

import numpy as np

from app.core.config import Settings
from app.models.impact import BarangayFeatures, ImpactPrediction

logger = logging.getLogger("luwas.impact")

# Model input columns, in the order TabPFN was fit on (must match BarangayFeatures).
FEATURE_COLUMNS = [
    "category_ordinal", "total_houses", "province_housing_units",
    "province_households", "structural_vuln_frac", "unimproved_water_frac",
]

# --- heuristic constants (documented, tunable) ------------------------------
AVG_HOUSEHOLD_SIZE = 4.1  # PSA national average persons per household
# affected    = houses * household_size * (0.2 + 0.8 * intensity)   [population x exposure]
# damage_rate = structural_vuln_frac * (0.3 + 0.7 * intensity)      [vulnerability x intensity]
_AFFECTED_BASE, _AFFECTED_SLOPE = 0.2, 0.8
_DAMAGE_BASE, _DAMAGE_SLOPE = 0.3, 0.7
_MAX_CATEGORY = 5.0  # category_ordinal range is 0..5


def severity_class(damage_rate: float) -> str:
    """Bin a continuous damage_rate into an ordinal severity class."""
    if damage_rate < 0.05:
        return "low"
    if damage_rate < 0.20:
        return "moderate"
    if damage_rate < 0.50:
        return "high"
    return "severe"


def _clip01(x: float) -> float:
    return max(0.0, min(1.0, x))


class ImpactPredictor:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        self.tabpfn_active = False  # True once TabPFN context is loaded
        self._affected_model = None
        self._damage_model = None
        self._severity_model = None
        self._affected_scale = 1.0  # training 80% spread of `affected`, for confidence

    # --- startup -----------------------------------------------------------
    def warmup(self) -> None:
        """Load the training table and fit TabPFN in-context. No-op when disabled;
        any failure (no torch, missing table, no weights) drops to the heuristic."""
        if self.settings.disable_tabpfn:
            return
        try:
            import pandas as pd
            from tabpfn import TabPFNClassifier, TabPFNRegressor

            df = pd.read_csv(self.settings.training_table_path)
            X = df[FEATURE_COLUMNS].to_numpy(dtype=float)
            y_affected = df["affected"].to_numpy(dtype=float)
            y_damage = df["damage_rate"].to_numpy(dtype=float)

            # Cap the in-context set (seeded) so CPU predict stays under the <2s budget.
            cap = self.settings.tabpfn_context_size
            if len(X) > cap:
                idx = np.random.default_rng(0).choice(len(X), cap, replace=False)
                X, y_affected, y_damage = X[idx], y_affected[idx], y_damage[idx]

            # ignore_pretraining_limits: the table has ~1.26k context rows, just over
            # TabPFN's default 1k CPU guard; the model handles it fine for our query sizes.
            def regressor():
                return TabPFNRegressor(
                    device=self.settings.tabpfn_device,
                    n_estimators=self.settings.tabpfn_n_estimators,
                    ignore_pretraining_limits=True,
                    random_state=0,
                )

            self._affected_model = regressor()
            self._affected_model.fit(X, y_affected)
            spread = float(np.percentile(y_affected, 90) - np.percentile(y_affected, 10))
            self._affected_scale = spread if spread > 0 else 1.0

            if self.settings.model_framing == "classifier":
                y_sev = np.array([severity_class(v) for v in y_damage])
                self._severity_model = TabPFNClassifier(
                    device=self.settings.tabpfn_device,
                    n_estimators=self.settings.tabpfn_n_estimators,
                    ignore_pretraining_limits=True,
                    random_state=0,
                )
                self._severity_model.fit(X, y_sev)
            else:
                self._damage_model = regressor()
                self._damage_model.fit(X, y_damage)

            # Prime the forward path once so the first real request isn't penalized.
            self._affected_model.predict(X[:1], output_type="main")
            if self._damage_model is not None:
                self._damage_model.predict(X[:1], output_type="main")
            if self._severity_model is not None:
                self._severity_model.predict_proba(X[:1])

            self.tabpfn_active = True
            logger.info(
                "TabPFN warmed up (framing=%s, context=%d)",
                self.settings.model_framing, len(X),
            )
        except Exception as exc:  # noqa: BLE001 — any failure means fall back
            self.tabpfn_active = False
            logger.warning("TabPFN unavailable, using heuristic fallback: %s", exc)

    # --- inference ---------------------------------------------------------
    def predict(self, features: list[BarangayFeatures]) -> list[ImpactPrediction]:
        if self.tabpfn_active:
            try:
                return self._predict_tabpfn(features)
            except Exception as exc:  # noqa: BLE001
                logger.warning("TabPFN predict failed, using heuristic: %s", exc)
        return [self._heuristic(f) for f in features]

    def _predict_tabpfn(self, features: list[BarangayFeatures]) -> list[ImpactPrediction]:
        X = np.array(
            [[f.category_ordinal, f.total_houses, f.province_housing_units,
              f.province_households, f.structural_vuln_frac, f.unimproved_water_frac]
             for f in features],
            dtype=float,
        )
        aff = self._affected_model.predict(X, output_type="main")
        aff_mean = np.asarray(aff["mean"], dtype=float)
        aff_q = aff["quantiles"]  # list of per-quantile arrays for [0.1 .. 0.9]
        aff_lo, aff_hi = np.asarray(aff_q[0], dtype=float), np.asarray(aff_q[-1], dtype=float)

        if self.settings.model_framing == "classifier":
            proba = self._severity_model.predict_proba(X)
            classes = self._severity_model.classes_
            sev_idx = proba.argmax(axis=1)
            sev_conf = proba.max(axis=1)
            return [
                self._build(
                    affected=round(float(aff_mean[i])),
                    aff_conf=self._interval_conf(aff_lo[i], aff_hi[i], self._affected_scale),
                    severity=str(classes[sev_idx[i]]),
                    sev_conf=float(sev_conf[i]),
                    source="tabpfn",
                    id=f.id,
                )
                for i, f in enumerate(features)
            ]

        dmg = self._damage_model.predict(X, output_type="main")
        dmg_mean = np.asarray(dmg["mean"], dtype=float)
        dmg_q = dmg["quantiles"]
        dmg_lo, dmg_hi = np.asarray(dmg_q[0], dtype=float), np.asarray(dmg_q[-1], dtype=float)
        return [
            self._build(
                affected=round(float(aff_mean[i])),
                aff_conf=self._interval_conf(aff_lo[i], aff_hi[i], self._affected_scale),
                damage_rate=round(_clip01(float(dmg_mean[i])), 4),
                dmg_conf=self._interval_conf(dmg_lo[i], dmg_hi[i], 1.0),
                source="tabpfn",
                id=f.id,
            )
            for i, f in enumerate(features)
        ]

    # --- deterministic fallback --------------------------------------------
    def _heuristic(self, f: BarangayFeatures) -> ImpactPrediction:
        conf = self.settings.heuristic_confidence
        intensity = f.category_ordinal / _MAX_CATEGORY
        affected = round(
            f.total_houses * AVG_HOUSEHOLD_SIZE * (_AFFECTED_BASE + _AFFECTED_SLOPE * intensity)
        )
        damage_rate = round(
            _clip01(f.structural_vuln_frac * (_DAMAGE_BASE + _DAMAGE_SLOPE * intensity)), 4
        )
        return self._build(
            affected=affected,
            aff_conf=conf,
            damage_rate=damage_rate,
            dmg_conf=conf,
            severity=severity_class(damage_rate),
            sev_conf=conf,
            source="heuristic",
            id=f.id,
        )

    # --- helpers -----------------------------------------------------------
    @staticmethod
    def _interval_conf(lo: float, hi: float, scale: float) -> float:
        """Confidence from an 80% predictive interval: tighter interval -> higher confidence."""
        width = max(0.0, float(hi) - float(lo))
        return _clip01(1.0 - width / scale) if scale > 0 else 0.0

    def _build(
        self,
        *,
        affected: int,
        aff_conf: float,
        source: str,
        id: str | None,
        damage_rate: float | None = None,
        dmg_conf: float | None = None,
        severity: str | None = None,
        sev_conf: float | None = None,
    ) -> ImpactPrediction:
        """Assemble a prediction reporting only the severity head for the active framing."""
        affected = max(0, affected)
        if self.settings.model_framing == "classifier":
            return ImpactPrediction(
                affected=affected, affected_confidence=aff_conf,
                severity_class=severity, severity_confidence=sev_conf,
                confidence=min(aff_conf, sev_conf), source=source, id=id,
            )
        return ImpactPrediction(
            affected=affected, affected_confidence=aff_conf,
            damage_rate=damage_rate, damage_rate_confidence=dmg_conf,
            confidence=min(aff_conf, dmg_conf), source=source, id=id,
        )
