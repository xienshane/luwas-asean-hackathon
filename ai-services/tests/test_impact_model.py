"""Unit tests for the impact predictor — heuristic path + contract (no torch needed).

These exercise the deterministic fallback (DISABLE_TABPFN=true), the severity binning,
and output bounds. The TabPFN path + <2s acceptance live in test_acceptance.py (marked).
"""
from app.core.config import Settings
from app.models.impact import BarangayFeatures
from app.services.impact_model import ImpactPredictor, severity_class


def heuristic_predictor(framing: str = "regressor") -> ImpactPredictor:
    """A predictor forced onto the deterministic heuristic path (no model load)."""
    return ImpactPredictor(Settings(disable_tabpfn=True, model_framing=framing))


# --- severity binning -------------------------------------------------------

def test_severity_class_boundaries():
    # bins: low [0,.05) / moderate [.05,.20) / high [.20,.50) / severe [.50,1]
    assert severity_class(0.0) == "low"
    assert severity_class(0.049) == "low"
    assert severity_class(0.05) == "moderate"
    assert severity_class(0.199) == "moderate"
    assert severity_class(0.20) == "high"
    assert severity_class(0.499) == "high"
    assert severity_class(0.50) == "severe"
    assert severity_class(1.0) == "severe"


# --- heuristic determinism --------------------------------------------------

def test_heuristic_deterministic_values():
    """Known features reproduce the documented heuristic formula exactly."""
    feats = BarangayFeatures(
        category_ordinal=3,
        total_houses=1000,
        province_housing_units=50000,
        province_households=51000,
        structural_vuln_frac=0.20,
        unimproved_water_frac=0.10,
        id="brgy-A",
    )
    [pred] = heuristic_predictor().predict([feats])

    # intensity = 3/5 = 0.6
    # affected   = round(1000 * 4.1 * (0.2 + 0.8*0.6)) = round(2788.0) = 2788
    # damage_rate = clip(0.20 * (0.3 + 0.7*0.6), 0, 1) = 0.144
    assert pred.source == "heuristic"
    assert pred.affected == 2788
    assert pred.damage_rate == 0.144
    assert pred.id == "brgy-A"


def test_heuristic_is_deterministic_across_calls():
    feats = BarangayFeatures(
        category_ordinal=5, total_houses=4200, province_housing_units=80000,
        province_households=82000, structural_vuln_frac=0.55, unimproved_water_frac=0.30,
    )
    a = heuristic_predictor().predict([feats])[0]
    b = heuristic_predictor().predict([feats])[0]
    assert a.affected == b.affected
    assert a.damage_rate == b.damage_rate


# --- output bounds & shape --------------------------------------------------

def test_prediction_bounds_and_alignment():
    rows = [
        BarangayFeatures(category_ordinal=0, total_houses=0, province_housing_units=10,
                         province_households=10, structural_vuln_frac=0.0, unimproved_water_frac=0.0),
        BarangayFeatures(category_ordinal=5, total_houses=99999, province_housing_units=999999,
                         province_households=999999, structural_vuln_frac=1.0, unimproved_water_frac=1.0),
    ]
    preds = heuristic_predictor().predict(rows)
    assert len(preds) == len(rows)  # aligned 1:1
    for p in preds:
        assert p.affected >= 0
        assert 0.0 <= p.damage_rate <= 1.0
        assert 0.0 <= p.confidence <= 1.0
        assert 0.0 <= p.affected_confidence <= 1.0
        assert 0.0 <= p.damage_rate_confidence <= 1.0


def test_zero_houses_zero_affected():
    feats = BarangayFeatures(category_ordinal=5, total_houses=0, province_housing_units=10,
                             province_households=10, structural_vuln_frac=0.5, unimproved_water_frac=0.0)
    [pred] = heuristic_predictor().predict([feats])
    assert pred.affected == 0


# --- framing controls which severity head is reported -----------------------

def test_regressor_framing_reports_damage_rate_not_class():
    feats = BarangayFeatures(category_ordinal=3, total_houses=1000, province_housing_units=50000,
                             province_households=51000, structural_vuln_frac=0.20, unimproved_water_frac=0.10)
    [pred] = heuristic_predictor("regressor").predict([feats])
    assert pred.damage_rate is not None
    assert pred.severity_class is None


def test_classifier_framing_reports_class_not_damage_rate():
    feats = BarangayFeatures(category_ordinal=3, total_houses=1000, province_housing_units=50000,
                             province_households=51000, structural_vuln_frac=0.20, unimproved_water_frac=0.10)
    [pred] = heuristic_predictor("classifier").predict([feats])
    # damage_rate 0.144 -> "moderate"
    assert pred.severity_class == "moderate"
    assert pred.damage_rate is None


def test_overall_confidence_is_min_of_reported_heads():
    feats = BarangayFeatures(category_ordinal=3, total_houses=1000, province_housing_units=50000,
                             province_households=51000, structural_vuln_frac=0.20, unimproved_water_frac=0.10)
    [pred] = heuristic_predictor().predict([feats])
    assert pred.confidence == min(pred.affected_confidence, pred.damage_rate_confidence)
