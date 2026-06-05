"""API contracts for the impact predictor — SOURCE OF TRUTH (mirror in web/lib/types).

The request carries the 6 model features the table was trained on (Phase 1.3). Mapping
barangay rows -> these features is Phase 4 (pipeline wiring), not this service.
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class BarangayFeatures(BaseModel):
    """One feature row, matching the Phase 1.3 training table's model inputs."""

    category_ordinal: int = Field(
        ..., ge=0, le=5, description="PAGASA intensity: 0 TD .. 5 violent typhoon"
    )
    total_houses: int = Field(..., ge=0, description="houses in the affected area")
    province_housing_units: int = Field(..., ge=0, description="HDX scale proxy")
    province_households: int = Field(..., ge=0, description="HDX scale proxy")
    structural_vuln_frac: float = Field(
        ..., ge=0.0, le=1.0, description="1 - strong-roof&wall share of housing"
    )
    unimproved_water_frac: float = Field(
        ..., ge=0.0, le=1.0, description="share on natural/peddler water sources"
    )
    id: Optional[str] = Field(None, description="caller key, echoed back; unused by the model")


class PredictImpactRequest(BaseModel):
    features: list[BarangayFeatures] = Field(..., min_length=1)


class ImpactPrediction(BaseModel):
    """One prediction, aligned by order to the request's `features`."""

    affected: int = Field(..., ge=0, description="predicted affected population")
    affected_confidence: float = Field(..., ge=0.0, le=1.0)

    # Reported in regressor framing; None in classifier framing.
    damage_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    damage_rate_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)

    # Reported in classifier framing; None in regressor framing.
    severity_class: Optional[Literal["low", "moderate", "high", "severe"]] = None
    severity_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)

    confidence: float = Field(..., ge=0.0, le=1.0, description="overall = min of reported heads")
    source: Literal["tabpfn", "heuristic"]
    id: Optional[str] = None


class PredictImpactResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    predictions: list[ImpactPrediction]
    model_framing: Literal["regressor", "classifier"]
    latency_ms: float
