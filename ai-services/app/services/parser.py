"""NLP field-report parser: SEA-LION primary, Gemini fallback, deterministic normalization.

Unstructured Bisaya/Tagalog/English text -> a normalized field_reports payload with a
per-field + overall confidence. SEA-LION (an OpenAI-compatible endpoint) is the primary
backend, rate-limited to the free tier; on any error (or unparseable output) it falls back
to Gemini (also via the OpenAI-compatible endpoint). Extractions below the confidence
threshold are flagged ('flagged' status, needs_review=True) and not auto-committed.

LLM calls go through an injected backend, so the logic here is unit-testable offline.
"""
import json
import logging
import re
import time
from typing import Optional, Protocol

from app.core.config import Settings
from app.core.rate_limiter import RateLimiter
from app.models.parse import (
    Extraction,
    NormalizedFieldReport,
    ParseResponse,
)

logger = logging.getLogger("luwas.parse")


class LLMError(RuntimeError):
    """Raised when every configured LLM backend fails."""


# --- prompt -----------------------------------------------------------------
SYSTEM_PROMPT = (
    "You extract structured disaster field-report data from Filipino, Bisaya (Cebuano), or "
    "Tagalog text for an NGO relief coordinator in Cebu, Philippines.\n"
    "Return ONLY a JSON object (no prose) with EXACTLY these keys:\n"
    '{"location": string|null, "population_estimate": integer|null, '
    '"needs_severity": "low"|"moderate"|"high"|"critical"|null, '
    '"road_status": "passable"|"impassable"|"unknown", '
    '"confidence": {"location": 0..1, "population_estimate": 0..1, '
    '"needs_severity": 0..1, "road_status": 0..1}, "overall_confidence": 0..1}\n'
    "location: the barangay/city/place named (null if none). "
    "population_estimate: number of PEOPLE affected; treat 'families'/'pamilya' as ~5 people each; "
    "null if unstated. "
    "road_status: 'impassable' if roads are blocked/flooded/'dili maagian'; 'passable' if clear; "
    "else 'unknown'. "
    "Set each confidence by how explicitly the field is stated; do not invent values."
)
USER_TEMPLATE = 'Field report:\n"""\n{text}\n"""\nReturn the JSON now.'


# --- backends ---------------------------------------------------------------
class LLMBackend(Protocol):
    name: str

    def complete(self, system: str, user: str) -> str: ...


class OpenAICompatBackend:
    """Calls any OpenAI-compatible chat endpoint (SEA-LION or Gemini's compat layer)."""

    def __init__(self, name: str, base_url: str, api_key: str, model: str, timeout: float = 30.0):
        from openai import OpenAI  # lazy: app boots even if the wheel/keys are absent

        self.name = name
        self.model = model
        self._client = OpenAI(base_url=base_url, api_key=api_key, timeout=timeout)

    def complete(self, system: str, user: str) -> str:
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0,
        )
        return resp.choices[0].message.content or ""


# --- JSON extraction & coercion --------------------------------------------
def extract_json(text: str) -> dict:
    """Pull the JSON object out of an LLM reply (handles reasoning preambles + code fences)."""
    candidates: list[str] = []
    depth = 0
    start: Optional[int] = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}" and depth > 0:
            depth -= 1
            if depth == 0 and start is not None:
                candidates.append(text[start : i + 1])
                start = None
    # The final balanced object is the model's answer (after any <think> preamble).
    for candidate in reversed(candidates):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    raise ValueError("no parseable JSON object in LLM reply")


_SEVERITY_MAP = {
    "low": "low", "mild": "low", "minor": "low", "gamay": "low", "menor": "low",
    "moderate": "moderate", "medium": "moderate", "kasarangan": "moderate",
    "high": "high", "mataas": "high", "grabe": "high", "malala": "high",
    "severe": "critical", "critical": "critical", "very high": "critical",
    "matindi": "critical", "kritikal": "critical", "life-threatening": "critical",
}
_ROAD_MAP = {
    "passable": "passable", "open": "passable", "clear": "passable",
    "maagian": "passable", "maayo": "passable", "ok": "passable",
    "impassable": "impassable", "blocked": "impassable", "closed": "impassable",
    "dili maagian": "impassable", "barado": "impassable", "flooded": "impassable",
    "unknown": "unknown", "unsure": "unknown",
}


def _clamp01(x) -> float:
    try:
        return max(0.0, min(1.0, float(x)))
    except (TypeError, ValueError):
        return 0.0


def _coerce_int(v) -> Optional[int]:
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return max(0, int(v))
    m = re.search(r"\d[\d,]*", str(v))
    return int(m.group(0).replace(",", "")) if m else None


def _coerce_severity(v) -> Optional[str]:
    if not v:
        return None
    return _SEVERITY_MAP.get(str(v).strip().lower())


def _coerce_road(v) -> str:
    if not v:
        return "unknown"
    return _ROAD_MAP.get(str(v).strip().lower(), "unknown")


# --- parser -----------------------------------------------------------------
class Parser:
    def __init__(
        self,
        settings: Settings,
        *,
        primary: Optional[LLMBackend],
        fallback: Optional[LLMBackend],
        rate_limiter: RateLimiter,
    ) -> None:
        self.settings = settings
        self.primary = primary
        self.fallback = fallback
        self.rate_limiter = rate_limiter

    def parse(self, text: str, id: Optional[str] = None) -> ParseResponse:
        t0 = time.perf_counter()
        data, provider = self._complete(text)
        extraction, overall = self._normalize(data)

        needs_review = overall < self.settings.parse_confidence_threshold
        field_report = NormalizedFieldReport(
            raw_text=text,
            location_text=extraction.location,
            population_estimate=extraction.population_estimate,
            needs_severity=extraction.needs_severity,
            road_status=extraction.road_status,
            road_impassable=extraction.road_status == "impassable",
            confidence=overall,
            status="flagged" if needs_review else "pending",
        )
        return ParseResponse(
            field_report=field_report,
            extraction=extraction,
            provider=provider,
            needs_review=needs_review,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            id=id,
        )

    def _complete(self, text: str) -> tuple[dict, str]:
        user = USER_TEMPLATE.format(text=text)
        errors: list[str] = []

        if self.primary is not None:
            try:
                self.rate_limiter.acquire()  # gates SEA-LION's 10-calls/min free tier
                return extract_json(self.primary.complete(SYSTEM_PROMPT, user)), self.primary.name
            except Exception as exc:  # noqa: BLE001 — any failure should fall back
                errors.append(f"{self.primary.name}: {exc}")
                logger.warning("primary parse failed (%s); trying fallback", exc)

        if self.fallback is not None:
            try:
                return extract_json(self.fallback.complete(SYSTEM_PROMPT, user)), self.fallback.name
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{self.fallback.name}: {exc}")

        raise LLMError("all LLM backends failed: " + "; ".join(errors) if errors
                       else "no LLM backend configured")

    @staticmethod
    def _normalize(data: dict) -> tuple[Extraction, float]:
        conf = data.get("confidence") or {}
        extraction = Extraction(
            location=(str(data["location"]).strip() if data.get("location") else None),
            location_confidence=_clamp01(conf.get("location", 0.0)),
            population_estimate=_coerce_int(data.get("population_estimate")),
            population_confidence=_clamp01(conf.get("population_estimate", 0.0)),
            needs_severity=_coerce_severity(data.get("needs_severity")),
            needs_severity_confidence=_clamp01(conf.get("needs_severity", 0.0)),
            road_status=_coerce_road(data.get("road_status")),
            road_status_confidence=_clamp01(conf.get("road_status", 0.0)),
        )
        if data.get("overall_confidence") is not None:
            overall = _clamp01(data["overall_confidence"])
        else:  # fall back to the mean of the per-field confidences
            per_field = [
                extraction.location_confidence, extraction.population_confidence,
                extraction.needs_severity_confidence, extraction.road_status_confidence,
            ]
            overall = round(sum(per_field) / len(per_field), 3)
        return extraction, overall


def build_parser(settings: Settings) -> Parser:
    """Construct the production parser from settings (SEA-LION primary, Gemini fallback)."""
    primary = (
        OpenAICompatBackend("sea-lion", settings.sea_lion_base_url,
                            settings.sea_lion_api_key, settings.sea_lion_model)
        if settings.sea_lion_api_key else None
    )
    fallback = (
        OpenAICompatBackend("gemini", settings.gemini_base_url,
                            settings.gemini_api_key, settings.gemini_model)
        if settings.gemini_api_key else None
    )
    limiter = RateLimiter(settings.sea_lion_max_calls_per_min, 60.0)
    return Parser(settings, primary=primary, fallback=fallback, rate_limiter=limiter)
