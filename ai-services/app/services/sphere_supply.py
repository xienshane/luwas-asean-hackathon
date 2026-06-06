"""Deterministic Sphere supply engine — a relief manifest from a predicted affected count.

Pure function, no model and no network: given an affected-population estimate, a
provisioning horizon (`days`), and an `access_modifier`, it returns a fully itemized,
auditable supply manifest built from published humanitarian standards (Sphere Handbook +
IFRC NFI ratios). Every line records the exact inputs and formula behind its quantity, so
a coordinator can trace any number to its basis and override it (CLAUDE.md > Rules:
derived outputs are assistive).

Consumed downstream by OR-Tools routing (Phase 2.4) as per-stop cargo demand, which is
why each line also carries a logistics weight.
"""
import math

from app.models.supply import SupplyLine, SupplyManifest

# --- published standards (Sphere Handbook 2018 minimums; IFRC NFI ratios) ---
WATER_L_PER_PERSON_DAY = 15.0     # Sphere: basic survival water (drink + cook + hygiene)
KCAL_PER_PERSON_DAY = 2100.0      # Sphere: minimum dietary energy per person per day
KCAL_PER_RATION_PACK = 2100.0     # one adult-equivalent daily ration = one person-day
PERSONS_PER_HOUSEHOLD = 5.0       # relief planning household size (Sphere/IFRC figure)
TARPS_PER_HOUSEHOLD = 2.0         # Sphere emergency shelter: 2 tarpaulins per household
BLANKETS_PER_PERSON = 1.0         # IFRC NFI minimum: one blanket per person
HYGIENE_KITS_PER_HOUSEHOLD = 1.0  # IFRC NFI: one hygiene kit per household

# --- logistics weights (planning estimates, tunable; NOT Sphere standards) --
# Used by OR-Tools (2.4) as cargo demand. Clearly approximate, not normative.
UNIT_WEIGHT_KG = {
    "water": 1.0,        # potable water ~ 1 kg/L
    "ration_pack": 0.6,  # dry daily ration pack
    "tarpaulin": 5.0,    # 4x6 m heavy-duty tarpaulin
    "blanket": 1.5,
    "hygiene_kit": 3.0,
}

STANDARDS = {
    "water_l_per_person_day": WATER_L_PER_PERSON_DAY,
    "kcal_per_person_day": KCAL_PER_PERSON_DAY,
    "kcal_per_ration_pack": KCAL_PER_RATION_PACK,
    "persons_per_household": PERSONS_PER_HOUSEHOLD,
    "tarps_per_household": TARPS_PER_HOUSEHOLD,
    "blankets_per_person": BLANKETS_PER_PERSON,
    "hygiene_kits_per_household": HYGIENE_KITS_PER_HOUSEHOLD,
}


def _num(x: float) -> str:
    """Format a number for the basis string: ints stay plain (no 4.5e+04 / trailing .0)."""
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


def sphere_supply(
    predicted_affected: int,
    days: int,
    access_modifier: float = 1.0,
    *,
    id: str | None = None,
) -> SupplyManifest:
    """Build a Sphere-standard relief manifest. Pure & offline — no model, no network.

    Args:
        predicted_affected: people needing relief (e.g. TabPFN `affected`). Must be >= 0.
        days: provisioning horizon in days. Must be >= 1.
        access_modifier: scales every supplied quantity for access constraints
            (1.0 = full provision; 0.5 = half deliverable; 1.2 = +20% buffer). Must be >= 0.
        id: optional caller key, echoed back on the manifest.

    Returns:
        A SupplyManifest whose every line is itemized and traceable to its inputs.

    Raises:
        ValueError: if any input is out of range.
    """
    if predicted_affected < 0:
        raise ValueError("predicted_affected must be >= 0")
    if days < 1:
        raise ValueError("days must be >= 1")
    if access_modifier < 0:
        raise ValueError("access_modifier must be >= 0")

    affected = int(predicted_affected)
    # Households are structural (population-derived) — the access modifier scales the
    # supplies derived from them, not the count itself.
    households = math.ceil(affected / PERSONS_PER_HOUSEHOLD)

    def make_line(
        item: str,
        category: str,
        unit: str,
        base_qty: float,
        weight_key: str,
        inputs: dict[str, float],
        human: str,
    ) -> SupplyLine:
        qty = math.ceil(base_qty * access_modifier)
        unit_weight = UNIT_WEIGHT_KG[weight_key]
        return SupplyLine(
            item=item,
            category=category,
            unit=unit,
            quantity=qty,
            unit_weight_kg=unit_weight,
            weight_kg=round(qty * unit_weight, 2),
            basis=f"{human} x access={_num(access_modifier)} -> ceil = {qty} {unit}",
            inputs={**inputs, "access_modifier": float(access_modifier)},
        )

    lines = [
        make_line(
            "Drinking water", "water", "L",
            affected * WATER_L_PER_PERSON_DAY * days, "water",
            {"affected": float(affected), "l_per_person_day": WATER_L_PER_PERSON_DAY,
             "days": float(days)},
            f"{_num(affected)} affected x {_num(WATER_L_PER_PERSON_DAY)} L/person/day "
            f"x {_num(days)} days",
        ),
        make_line(
            "Food ration packs", "food", "ration packs",
            (affected * KCAL_PER_PERSON_DAY * days) / KCAL_PER_RATION_PACK, "ration_pack",
            {"affected": float(affected), "kcal_per_person_day": KCAL_PER_PERSON_DAY,
             "days": float(days), "kcal_per_ration_pack": KCAL_PER_RATION_PACK},
            f"{_num(affected)} affected x {_num(KCAL_PER_PERSON_DAY)} kcal/person/day "
            f"x {_num(days)} days / {_num(KCAL_PER_RATION_PACK)} kcal/pack",
        ),
        make_line(
            "Tarpaulins", "shelter", "tarpaulins",
            households * TARPS_PER_HOUSEHOLD, "tarpaulin",
            {"households": float(households), "tarps_per_household": TARPS_PER_HOUSEHOLD},
            f"{_num(households)} households x {_num(TARPS_PER_HOUSEHOLD)} tarpaulins/household",
        ),
        make_line(
            "Blankets", "nfi", "blankets",
            affected * BLANKETS_PER_PERSON, "blanket",
            {"affected": float(affected), "blankets_per_person": BLANKETS_PER_PERSON},
            f"{_num(affected)} affected x {_num(BLANKETS_PER_PERSON)} blanket/person",
        ),
        make_line(
            "Hygiene kits", "nfi", "hygiene kits",
            households * HYGIENE_KITS_PER_HOUSEHOLD, "hygiene_kit",
            {"households": float(households),
             "hygiene_kits_per_household": HYGIENE_KITS_PER_HOUSEHOLD},
            f"{_num(households)} households x {_num(HYGIENE_KITS_PER_HOUSEHOLD)} kit/household",
        ),
    ]

    return SupplyManifest(
        predicted_affected=affected,
        days=days,
        access_modifier=float(access_modifier),
        households=households,
        lines=lines,
        total_weight_kg=round(sum(line.weight_kg for line in lines), 2),
        standards=dict(STANDARDS),
        id=id,
    )
