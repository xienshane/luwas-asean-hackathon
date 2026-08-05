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
    TranslateResponse,
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
    '"needs_severity": 0..1, "road_status": 0..1}, "overall_confidence": 0..1, '
    '"translated_text": string|null}\n'
    "translated_text: a natural English translation of the WHOLE report; null if it is "
    "already in English. Preserve place names and numbers. "
    "location: the barangay/city/place named (null if none). "
    "population_estimate: number of PEOPLE affected; treat 'families'/'pamilya' as ~5 people each; "
    "null if unstated. "
    "road_status: 'impassable' if roads are blocked/flooded/'dili maagian'; 'passable' if clear; "
    "else 'unknown'. "
    "Set each confidence by how explicitly the field is stated; do not invent values."
)

# Phase 4.6 — few-shot disaster lexicon. Field reports arrive in informal Bisaya/Tagalog
# with disaster slang, SMS abbreviations, and misspellings the base model mishandles. This
# block teaches the mapping by glossary + worked examples (no fine-tuning; SEA-LION is a
# free API). It is appended to the system prompt, so it adds prompt tokens but NO extra
# API calls — the 10-calls/min rate limit is unaffected.
FEW_SHOT_BLOCK = (
    "\n\nDISASTER LEXICON (Bisaya/Cebuano + Tagalog field slang — map these to the fields):\n"
    "- 'baha' = flood; 'gibaha'/'nalunopan' = flooded; 'lubog'/'naglutaw' = submerged/houses "
    "underwater (=> road_status often 'impassable', severity high+).\n"
    "- 'lawom'/'taas ang tubig' = deep/high water; 'abot sa abaga/atop' = up to the "
    "shoulder/roof (=> critical).\n"
    "- 'naa mi sa atop' / 'sa atop mi' / 'stranded sa rooftop' = people trapped on the roof by "
    "floodwater (=> severity 'critical', road_status 'impassable').\n"
    "- 'dili maagian' / 'imposible maagian' / 'barado' / 'naputol ang tulay' / 'naputol ang "
    "dalan' = road blocked or bridge cut (=> road_status 'impassable').\n"
    "- 'maagian' / 'klaro ang dalan' / 'open ang dalan' = road passable.\n"
    "- 'walay' = no/without: 'walay tubig' = no water, 'walay kuryente'/'naputol ang kuryente' "
    "= no power, 'walay pagkaon' = no food.\n"
    "- 'tabang' = help; 'tabang dayon' / 'wala pa'y tabang nakaabot' = no aid has arrived yet "
    "(=> urgent, severity high+).\n"
    "- 'kusog ang hangin' = strong wind; 'surge'/'daluyong' = storm surge.\n"
    "- People counts: 'ka tawo'/'katawo'/'katao'/'ka residente'/'pax' = persons; "
    "'k'/'K' after a number = thousand (e.g. '2k' = 2000). "
    "'pamilya'/'ka pamilya'/'fam'/'household' = families => multiply by ~5 for people.\n"
    "- Vague quantities ('gatosan' = hundreds, 'libo-libo'/'liboan' = thousands, 'daghan' = "
    "many): do NOT invent an exact number — set population_estimate null and give it low "
    "confidence.\n"
    "- 'Brgy'/'Bgy'/'Brngy' = Barangay; expect misspellings (e.g. 'bah a', 'gwadalupe').\n"
    "- Severity cues: 'gamay ra'/'minor'/'kalma ra' = low; 'grabe'/'malala' = high; "
    "'kritikal'/'critical'/'daghang samaron' (many injured) = critical.\n"
    "\nEXAMPLES (report => JSON):\n"
    'Report: "Naa mi sa atop sa Brgy Tisa, lubog na ang tibuok dalan, ~8 ka pamilya stranded."\n'
    'JSON: {"location": "Barangay Tisa", "population_estimate": 40, "needs_severity": "critical", '
    '"road_status": "impassable", "confidence": {"location": 0.9, "population_estimate": 0.6, '
    '"needs_severity": 0.85, "road_status": 0.9}, "overall_confidence": 0.81, '
    '"translated_text": "We are on the roof in Barangay Tisa, the whole road is submerged, '
    'about 8 families stranded."}\n'
    'Report: "Gamay ra ang baha sa Mabolo, mga 40 ka tawo, naa pa silay supply, klaro ang dalan."\n'
    'JSON: {"location": "Mabolo", "population_estimate": 40, "needs_severity": "low", '
    '"road_status": "passable", "confidence": {"location": 0.9, "population_estimate": 0.8, '
    '"needs_severity": 0.8, "road_status": 0.85}, "overall_confidence": 0.84, '
    '"translated_text": "Only minor flooding in Mabolo, about 40 people, they still have '
    'supplies, the road is clear."}\n'
    'Report: "Baha sa Inayawan, gatosan ka tawo apektado, naputol ang tulay sa highway."\n'
    'JSON: {"location": "Inayawan", "population_estimate": null, "needs_severity": "high", '
    '"road_status": "impassable", "confidence": {"location": 0.9, "population_estimate": 0.2, '
    '"needs_severity": 0.75, "road_status": 0.85}, "overall_confidence": 0.68, '
    '"translated_text": "Flooding in Inayawan, hundreds of people affected, the bridge to the '
    'highway is cut."}'
)
SYSTEM_PROMPT = SYSTEM_PROMPT + FEW_SHOT_BLOCK

USER_TEMPLATE = 'Field report:\n"""\n{text}\n"""\nReturn the JSON now.'

# Standalone translation (the /translate endpoint, used for app reports that never hit
# /parse). The model self-reports is_english so already-English text is not "translated".
TRANSLATE_SYSTEM_PROMPT = (
    "You translate short disaster field-report messages written in Filipino, Bisaya "
    "(Cebuano), or Tagalog into clear, natural English for an NGO relief coordinator in "
    "Cebu, Philippines.\n"
    'Return ONLY a JSON object (no prose): {"translated_text": string, "is_english": boolean}.\n'
    "If the message is ALREADY in English, set is_english=true and translated_text to the "
    "original text unchanged. Preserve place names, numbers, and the sense of urgency."
)
TRANSLATE_USER_TEMPLATE = 'Message:\n"""\n{text}\n"""\nReturn the JSON now.'


# --- backends ---------------------------------------------------------------
class LLMBackend(Protocol):
    name: str

    def complete(self, system: str, user: str) -> str: ...


class OpenAICompatBackend:
    """Calls any OpenAI-compatible chat endpoint (SEA-LION or Gemini's compat layer)."""

    def __init__(
        self,
        name: str,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 30.0,
        max_tokens: Optional[int] = None,
        extra_body: Optional[dict] = None,
    ):
        from openai import OpenAI  # lazy: app boots even if the wheel/keys are absent

        self.name = name
        self.model = model
        self.max_tokens = max_tokens
        self.extra_body = extra_body or {}
        # max_retries=0: the SDK otherwise retries a 429 after the server's `Retry-After`
        # (SEA-LION sends 60s). That sleep is NOT covered by `timeout`, so a rate-limited
        # burst blocks for a minute and still reports success — the exact stall the
        # fail-fast limiter exists to avoid. Raise instead, and let the fallback answer.
        self._client = OpenAI(
            base_url=base_url, api_key=api_key, timeout=timeout, max_retries=0
        )

    def complete(self, system: str, user: str) -> str:
        kwargs: dict = {}
        if self.max_tokens is not None:
            kwargs["max_tokens"] = self.max_tokens
        if self.extra_body:
            kwargs["extra_body"] = self.extra_body
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0,
            **kwargs,
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


def _clean_translation(v) -> Optional[str]:
    """Normalize a model's translated_text: strip, drop empties -> None."""
    if not v:
        return None
    s = str(v).strip()
    return s or None


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
        data, provider = self._complete_json(SYSTEM_PROMPT, USER_TEMPLATE.format(text=text))
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
            translated_text=_clean_translation(data.get("translated_text")),
            id=id,
        )

    def translate(self, text: str, id: Optional[str] = None) -> TranslateResponse:
        """Translate a report to English. Returns translated_text=None when the model
        reports the input is already English (so callers can skip persistence)."""
        t0 = time.perf_counter()
        data, provider = self._complete_json(
            TRANSLATE_SYSTEM_PROMPT, TRANSLATE_USER_TEMPLATE.format(text=text)
        )
        translated = _clean_translation(data.get("translated_text"))
        if data.get("is_english"):
            translated = None
        return TranslateResponse(
            translated_text=translated,
            provider=provider,  # type: ignore[arg-type]
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            id=id,
        )

    def _complete_json(self, system: str, user: str) -> tuple[dict, str]:
        """Run primary (SEA-LION, rate-limited) then fallback (Gemini); return parsed JSON."""
        errors: list[str] = []

        if self.primary is not None:
            if self.rate_limiter.try_acquire():  # SEA-LION free tier: 10 calls/min
                try:
                    return extract_json(self.primary.complete(system, user)), self.primary.name
                except Exception as exc:  # noqa: BLE001 — any failure should fall back
                    errors.append(f"{self.primary.name}: {exc}")
                    logger.warning("primary call failed (%s); trying fallback", exc)
            else:
                errors.append(
                    f"{self.primary.name}: rate-limited "
                    f"({self.settings.sea_lion_max_calls_per_min}/min free tier)"
                )
                logger.info("primary rate-limited; routing to fallback")

        if self.fallback is not None:
            try:
                return extract_json(self.fallback.complete(system, user)), self.fallback.name
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
    thinking = (
        {"chat_template_kwargs": {"thinking_mode": settings.sea_lion_thinking_mode}}
        if settings.sea_lion_thinking_mode
        else None
    )
    primary = (
        OpenAICompatBackend(
            "sea-lion",
            settings.sea_lion_base_url,
            settings.sea_lion_api_key,
            settings.sea_lion_model,
            timeout=settings.sea_lion_timeout_s,
            max_tokens=settings.sea_lion_max_tokens,
            extra_body=thinking,
        )
        if settings.sea_lion_api_key else None
    )
    # Gemini's OpenAI-compat layer takes the thinking budget nested under `extra_body.google`.
    gemini_thinking = (
        {"extra_body": {"google": {"thinking_config": {
            "thinking_budget": settings.gemini_thinking_budget}}}}
        if settings.gemini_thinking_budget >= 0
        else None
    )
    fallback = (
        OpenAICompatBackend(
            "gemini",
            settings.gemini_base_url,
            settings.gemini_api_key,
            settings.gemini_model,
            timeout=settings.gemini_timeout_s,
            max_tokens=settings.gemini_max_tokens,
            extra_body=gemini_thinking,
        )
        if settings.gemini_api_key else None
    )
    limiter = RateLimiter(settings.sea_lion_max_calls_per_min, 60.0)
    return Parser(settings, primary=primary, fallback=fallback, rate_limiter=limiter)
