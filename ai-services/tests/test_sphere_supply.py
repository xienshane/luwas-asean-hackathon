"""Unit tests for the deterministic Sphere supply engine (Phase 2.3).

Known inputs -> exact, hand-checkable manifests. Every line must be itemized and
traceable to its inputs (auditable), and the module must never touch the network.
"""
import socket

import pytest

from app.models.supply import SupplyManifest
from app.services.sphere_supply import sphere_supply


def lines_by_category(m: SupplyManifest) -> dict[str, list]:
    out: dict[str, list] = {}
    for line in m.lines:
        out.setdefault(line.category, []).append(line)
    return out


def get_line(m: SupplyManifest, item: str):
    return next(line for line in m.lines if line.item == item)


# --- known-input quantities (affected=1000, days=3, access=1.0) -------------
# households   = ceil(1000 / 5)                 = 200
# water        = ceil(1000 * 15 * 3 * 1.0)      = 45000 L
# food packs   = ceil(1000 * 2100 * 3 / 2100)   = 3000 packs
# tarpaulins   = ceil(200 * 2 * 1.0)            = 400
# blankets     = ceil(1000 * 1 * 1.0)           = 1000
# hygiene kits = ceil(200 * 1 * 1.0)            = 200

def test_water_quantity_known_input():
    m = sphere_supply(1000, 3, 1.0)
    water = get_line(m, "Drinking water")
    assert water.category == "water"
    assert water.unit == "L"
    assert water.quantity == 45000


def test_food_ration_packs_known_input():
    m = sphere_supply(1000, 3, 1.0)
    food = get_line(m, "Food ration packs")
    assert food.category == "food"
    assert food.quantity == 3000


def test_nfi_quantities_known_input():
    m = sphere_supply(1000, 3, 1.0)
    assert m.households == 200
    assert get_line(m, "Tarpaulins").quantity == 400
    assert get_line(m, "Blankets").quantity == 1000
    assert get_line(m, "Hygiene kits").quantity == 200


def test_total_weight_known_input():
    # 45000*1.0 + 3000*0.6 + 400*5 + 1000*1.5 + 200*3
    # = 45000 + 1800 + 2000 + 1500 + 600 = 50900 kg
    m = sphere_supply(1000, 3, 1.0)
    assert m.total_weight_kg == 50900.0
    assert m.total_weight_kg == round(sum(line.weight_kg for line in m.lines), 2)


def test_all_sphere_categories_present():
    m = sphere_supply(1000, 3, 1.0)
    cats = lines_by_category(m)
    assert {"water", "food", "shelter", "nfi"} <= set(cats)


# --- access modifier scaling ------------------------------------------------

def test_access_modifier_scales_supply_lines():
    m = sphere_supply(1000, 3, 0.5)
    assert get_line(m, "Drinking water").quantity == 22500
    assert get_line(m, "Food ration packs").quantity == 1500
    assert get_line(m, "Tarpaulins").quantity == 200
    assert get_line(m, "Blankets").quantity == 500
    assert get_line(m, "Hygiene kits").quantity == 100


def test_household_count_is_structural_not_access_scaled():
    """Households reflect the population, so the count is unchanged by access; only the
    supplies derived from it scale."""
    assert sphere_supply(1000, 3, 1.0).households == 200
    assert sphere_supply(1000, 3, 0.5).households == 200


def test_access_buffer_above_one_increases_quantities():
    base = get_line(sphere_supply(1000, 3, 1.0), "Drinking water").quantity
    buffered = get_line(sphere_supply(1000, 3, 1.2), "Drinking water").quantity
    assert buffered > base
    assert buffered == 54000  # ceil(45000 * 1.2)


# --- auditability -----------------------------------------------------------

def test_every_line_is_traceable():
    m = sphere_supply(1000, 3, 1.0)
    assert m.lines, "manifest must itemize at least one line"
    for line in m.lines:
        assert line.basis, f"{line.item} has no human-readable basis"
        assert line.inputs, f"{line.item} records no inputs"
        # access modifier is applied to every line, so it must appear in the audit trail
        assert "access_modifier" in line.inputs
        assert line.quantity >= 0
        assert line.weight_kg == round(line.quantity * line.unit_weight_kg, 2)


def test_standards_block_records_constants_used():
    m = sphere_supply(1000, 3, 1.0)
    assert m.standards["water_l_per_person_day"] == 15.0
    assert m.standards["kcal_per_person_day"] == 2100.0


def test_id_is_echoed():
    m = sphere_supply(1000, 3, 1.0, id="brgy-42")
    assert m.id == "brgy-42"


# --- edge cases & determinism ----------------------------------------------

def test_zero_affected_yields_zero_manifest():
    m = sphere_supply(0, 5, 1.0)
    assert m.households == 0
    assert all(line.quantity == 0 for line in m.lines)
    assert m.total_weight_kg == 0.0


def test_deterministic_across_calls():
    a = sphere_supply(1234, 4, 0.8)
    b = sphere_supply(1234, 4, 0.8)
    assert a.model_dump() == b.model_dump()


@pytest.mark.parametrize(
    "affected,days,access",
    [(-1, 3, 1.0), (1000, 0, 1.0), (1000, 3, -0.1)],
)
def test_rejects_invalid_inputs(affected, days, access):
    with pytest.raises(ValueError):
        sphere_supply(affected, days, access)


# --- no external calls ------------------------------------------------------

def test_runs_fully_offline(monkeypatch):
    """Opening any socket must be unnecessary; the engine is pure and offline."""
    def boom(*args, **kwargs):
        raise AssertionError("sphere_supply attempted a network call")

    monkeypatch.setattr(socket, "socket", boom)
    m = sphere_supply(1000, 3, 1.0)
    assert m.total_weight_kg > 0
