"""API contracts for the NLP parser — SOURCE OF TRUTH (mirror in web/lib/types).

Turns unstructured Filipino/Bisaya/Tagalog field-report text into a normalized
field_reports payload. `NormalizedFieldReport` mirrors the public.field_reports insert
columns (Phase 0.2): the parser fills the text-derivable fields; barangay matching and
geocoding the `location_text` happen downstream (pipeline 4.1).
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field

NeedsSeverity = Literal["low", "moderate", "high", "critical"]
RoadStatus = Literal["passable", "impassable", "unknown"]
ReportStatus = Literal["pending", "flagged"]


class ParseRequest(BaseModel):
    text: str = Field(..., min_length=1, description="raw field-report text (Bisaya/Tagalog/EN)")
    id: Optional[str] = Field(None, description="caller key, echoed back")


class Extraction(BaseModel):
    """Per-field values with their individual confidences (for the coordinator UI)."""

    location: Optional[str] = None
    location_confidence: float = Field(0.0, ge=0.0, le=1.0)
    population_estimate: Optional[int] = Field(None, ge=0)
    population_confidence: float = Field(0.0, ge=0.0, le=1.0)
    needs_severity: Optional[NeedsSeverity] = None
    needs_severity_confidence: float = Field(0.0, ge=0.0, le=1.0)
    road_status: RoadStatus = "unknown"
    road_status_confidence: float = Field(0.0, ge=0.0, le=1.0)


class NormalizedFieldReport(BaseModel):
    """A field_reports insert payload (text-derived fields only)."""

    source: Literal["parsed"] = "parsed"
    raw_text: str
    location_text: Optional[str] = Field(None, description="extracted place name; geocoded downstream")
    population_estimate: Optional[int] = Field(None, ge=0)
    needs_severity: Optional[NeedsSeverity] = None
    road_status: RoadStatus = "unknown"
    road_impassable: bool = False
    confidence: float = Field(..., ge=0.0, le=1.0, description="overall extraction confidence")
    status: ReportStatus = Field(
        ..., description="'flagged' (below threshold, needs review) or 'pending'"
    )


class ParseResponse(BaseModel):
    field_report: NormalizedFieldReport
    extraction: Extraction
    provider: Literal["sea-lion", "gemini"]
    needs_review: bool = Field(..., description="True => below threshold, not auto-committed")
    latency_ms: float
    translated_text: Optional[str] = Field(
        None, description="English translation of raw_text; null if already English"
    )
    id: Optional[str] = None


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, description="report text to translate to English")
    id: Optional[str] = Field(None, description="caller key, echoed back")


class TranslateResponse(BaseModel):
    translated_text: Optional[str] = Field(
        None, description="English translation; null if the text is already English"
    )
    provider: Optional[Literal["sea-lion", "gemini"]] = None
    latency_ms: float
    id: Optional[str] = None
