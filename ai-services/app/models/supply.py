"""API contracts for the Sphere supply engine — SOURCE OF TRUTH (mirror in web/lib/types).

A manifest is an itemized, auditable relief order derived deterministically from a
predicted affected-population count. Every line records the exact inputs that produced
its quantity so a coordinator can trace (and override) any number. Consumed downstream by
OR-Tools routing (Phase 2.4), which is why each line also carries a logistics weight.
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field


class SupplyManifestRequest(BaseModel):
    """Inputs to the Sphere supply engine."""

    predicted_affected: int = Field(
        ..., ge=0, description="people needing relief (e.g. TabPFN `affected`)"
    )
    days: int = Field(..., ge=1, description="provisioning horizon in days")
    access_modifier: float = Field(
        1.0, ge=0.0,
        description="scales every supplied quantity for access constraints "
                    "(1.0 = full; 0.5 = half deliverable; 1.2 = +20% buffer)",
    )
    id: Optional[str] = Field(None, description="caller key, echoed back on the manifest")


class SupplyLine(BaseModel):
    """One supply line, fully traceable to the inputs that produced it."""

    item: str = Field(..., description="human-readable item name")
    category: Literal["water", "food", "shelter", "nfi", "health"]
    unit: str = Field(..., description="unit of `quantity`, e.g. L, ration packs, blankets")
    quantity: int = Field(..., ge=0, description="quantity to deliver (post access modifier)")
    unit_weight_kg: float = Field(..., ge=0.0, description="logistics weight per unit")
    weight_kg: float = Field(..., ge=0.0, description="quantity * unit_weight_kg (cargo demand)")
    basis: str = Field(..., description="human-readable formula behind `quantity`")
    inputs: dict[str, float] = Field(
        ..., description="every multiplicand used (incl. access_modifier) for audit"
    )


class SupplyManifest(BaseModel):
    """A complete, auditable relief manifest for one affected population."""

    predicted_affected: int = Field(..., ge=0)
    days: int = Field(..., ge=1)
    access_modifier: float = Field(..., ge=0.0)
    households: int = Field(..., ge=0, description="ceil(affected / persons_per_household)")
    lines: list[SupplyLine] = Field(..., min_length=1)
    total_weight_kg: float = Field(..., ge=0.0, description="sum of line weights (cargo demand)")
    standards: dict[str, float] = Field(
        ..., description="the Sphere/IFRC constants used, for audit"
    )
    id: Optional[str] = None
