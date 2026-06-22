"""Cycle 3: the real TabPFN path, its <2s acceptance, and load-failure fallback.

The TabPFN test is marked `tabpfn` and skips when torch/tabpfn aren't installed or the
model weights can't be fetched. The fallback test is unmarked — it must pass everywhere.
"""
import time

import pytest

from app.core.config import Settings
from app.models.impact import BarangayFeatures
from app.services.impact_model import ImpactPredictor

# A small "test barangay set" spanning the feature ranges (Phase 2.2 acceptance).
TEST_ROWS = [
    BarangayFeatures(category_ordinal=c, total_houses=th, province_housing_units=phu,
                     province_households=phh, structural_vuln_frac=sv, unimproved_water_frac=uw,
                     id=f"brgy-{i}")
    for i, (c, th, phu, phh, sv, uw) in enumerate([
        (1, 300, 40000, 41000, 0.10, 0.05),
        (2, 800, 50000, 51000, 0.18, 0.08),
        (3, 1500, 60000, 61000, 0.25, 0.12),
        (3, 2200, 70000, 71000, 0.30, 0.20),
        (4, 3000, 80000, 82000, 0.42, 0.25),
        (5, 4200, 90000, 92000, 0.55, 0.30),
        (4, 1200, 55000, 56000, 0.33, 0.15),
        (2, 500, 45000, 46000, 0.14, 0.06),
    ])
]


def test_fallback_when_model_load_fails():
    """A missing training table (or any load error) drops to the heuristic, never crashes."""
    p = ImpactPredictor(Settings(disable_tabpfn=False, training_table_path="data/does-not-exist.csv"))
    p.warmup()
    assert p.tabpfn_active is False
    preds = p.predict(TEST_ROWS[:2])
    assert all(pr.source == "heuristic" for pr in preds)


@pytest.mark.tabpfn
def test_tabpfn_prediction_under_2s():
    pytest.importorskip("tabpfn")
    p = ImpactPredictor(Settings(disable_tabpfn=False))
    p.warmup()
    assert p.tabpfn_active is True, "TabPFN context failed to load (weights/network?)"

    t0 = time.perf_counter()
    preds = p.predict(TEST_ROWS)
    elapsed = time.perf_counter() - t0
    print(f"\nTabPFN predict latency for {len(TEST_ROWS)} rows: {elapsed*1000:.1f} ms")

    assert elapsed < 2.0, f"prediction took {elapsed:.3f}s (>2s)"
    assert len(preds) == len(TEST_ROWS)
    for pr in preds:
        assert pr.source == "tabpfn"
        assert pr.affected >= 0
        assert 0.0 <= pr.damage_rate <= 1.0
        assert 0.0 <= pr.confidence <= 1.0


@pytest.mark.tabpfn
def test_tabpfn_classifier_framing_returns_severity_class():
    pytest.importorskip("tabpfn")
    p = ImpactPredictor(Settings(disable_tabpfn=False, model_framing="classifier"))
    p.warmup()
    assert p.tabpfn_active is True
    [pred] = p.predict(TEST_ROWS[:1])
    assert pred.source == "tabpfn"
    assert pred.severity_class in ("low", "moderate", "high", "severe")
    assert pred.damage_rate is None
