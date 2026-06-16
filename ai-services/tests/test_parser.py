"""Unit tests for the SEA-LION/Gemini field-report parser (Phase 2.5).

All offline: LLM backends are faked, so these test JSON extraction, enum coercion,
confidence-based review flagging, the normalization to a field_reports payload, and the
SEA-LION -> Gemini fallback. The real-API 8/10 acceptance lives in test_parse_live.py.
"""
import pytest

from app.core.config import Settings
from app.core.rate_limiter import RateLimiter
from app.services.parser import LLMError, Parser, extract_json


class FakeBackend:
    """An LLM backend that returns a canned string (or raises) and records call count."""

    def __init__(self, name: str, reply: str | None = None, error: Exception | None = None):
        self.name = name
        self._reply = reply
        self._error = error
        self.calls = 0

    def complete(self, system: str, user: str) -> str:
        self.calls += 1
        if self._error is not None:
            raise self._error
        return self._reply


def no_wait_limiter() -> RateLimiter:
    # never blocks in tests
    return RateLimiter(max_calls=10, period_s=60, now=lambda: 0.0, sleep=lambda dt: None)


def make_parser(primary: FakeBackend, fallback: FakeBackend | None = None, **settings) -> Parser:
    return Parser(
        Settings(**settings),
        primary=primary,
        fallback=fallback or FakeBackend("gemini", reply="{}"),
        rate_limiter=no_wait_limiter(),
    )


HIGH_CONF = """{
  "location": "Barangay Apas, Cebu City",
  "population_estimate": 500,
  "needs_severity": "high",
  "road_status": "impassable",
  "confidence": {"location": 0.95, "population_estimate": 0.7,
                 "needs_severity": 0.85, "road_status": 0.9},
  "overall_confidence": 0.82
}"""


# --- JSON extraction --------------------------------------------------------

def test_extract_json_from_plain_object():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_from_reasoning_preamble():
    raw = 'Let me think... the report mentions flooding.\n{"location": "Talisay", "x": 2}'
    assert extract_json(raw)["location"] == "Talisay"


def test_extract_json_from_code_fence():
    raw = "```json\n{\"road_status\": \"passable\"}\n```"
    assert extract_json(raw)["road_status"] == "passable"


def test_extract_json_raises_when_absent():
    with pytest.raises(ValueError):
        extract_json("no json here at all")


# --- normalization to a field_reports payload -------------------------------

def test_high_confidence_parses_and_is_not_flagged():
    parser = make_parser(FakeBackend("sea-lion", reply=HIGH_CONF), parse_confidence_threshold=0.6)
    resp = parser.parse("Grabe ang baha sa Apas, mga 500 katawo, dili maagian ang dalan", id="r1")

    fr = resp.field_report
    assert resp.provider == "sea-lion"
    assert fr.source == "parsed"
    assert fr.location_text == "Barangay Apas, Cebu City"
    assert fr.population_estimate == 500
    assert fr.needs_severity == "high"
    assert fr.road_status == "impassable"
    assert fr.road_impassable is True          # derived from road_status
    assert fr.confidence == pytest.approx(0.82)
    assert resp.needs_review is False
    assert fr.status == "pending"
    assert resp.id == "r1"
    assert fr.raw_text.startswith("Grabe")


def test_low_confidence_is_flagged_for_review():
    low = HIGH_CONF.replace('"overall_confidence": 0.82', '"overall_confidence": 0.4')
    parser = make_parser(FakeBackend("sea-lion", reply=low), parse_confidence_threshold=0.6)
    resp = parser.parse("vague text")
    assert resp.needs_review is True
    assert resp.field_report.status == "flagged"   # not auto-committed


def test_severity_synonyms_are_coerced():
    reply = HIGH_CONF.replace('"needs_severity": "high"', '"needs_severity": "severe"')
    resp = make_parser(FakeBackend("sea-lion", reply=reply)).parse("x")
    assert resp.field_report.needs_severity == "critical"


def test_unknown_road_status_is_not_impassable():
    reply = HIGH_CONF.replace('"road_status": "impassable"', '"road_status": "wala kahibalo"')
    resp = make_parser(FakeBackend("sea-lion", reply=reply)).parse("x")
    assert resp.field_report.road_status == "unknown"
    assert resp.field_report.road_impassable is False


def test_missing_fields_become_null():
    reply = """{"road_status": "passable",
                "confidence": {"road_status": 0.8}, "overall_confidence": 0.7}"""
    resp = make_parser(FakeBackend("sea-lion", reply=reply)).parse("dalan ok ra")
    fr = resp.field_report
    assert fr.location_text is None
    assert fr.population_estimate is None
    assert fr.needs_severity is None
    assert fr.road_status == "passable"


def test_per_field_confidences_are_exposed():
    resp = make_parser(FakeBackend("sea-lion", reply=HIGH_CONF)).parse("x")
    assert resp.extraction.location_confidence == pytest.approx(0.95)
    assert resp.extraction.road_status_confidence == pytest.approx(0.9)


# --- translation ------------------------------------------------------------

def test_parse_surfaces_translated_text_when_present():
    reply = HIGH_CONF.replace(
        '"overall_confidence": 0.82',
        '"overall_confidence": 0.82, "translated_text": "Severe flooding in Apas"',
    )
    resp = make_parser(FakeBackend("sea-lion", reply=reply)).parse("Grabe ang baha sa Apas")
    assert resp.translated_text == "Severe flooding in Apas"


def test_parse_translated_text_null_when_absent_or_blank():
    assert make_parser(FakeBackend("sea-lion", reply=HIGH_CONF)).parse("x").translated_text is None
    reply = HIGH_CONF.replace('"overall_confidence": 0.82',
                              '"overall_confidence": 0.82, "translated_text": "  "')
    assert make_parser(FakeBackend("sea-lion", reply=reply)).parse("x").translated_text is None


def test_translate_returns_english():
    reply = '{"translated_text": "Severe flooding in Apas", "is_english": false}'
    resp = make_parser(FakeBackend("sea-lion", reply=reply)).translate("Grabe ang baha sa Apas", id="t1")
    assert resp.translated_text == "Severe flooding in Apas"
    assert resp.provider == "sea-lion"
    assert resp.id == "t1"


def test_translate_returns_none_for_already_english():
    reply = '{"translated_text": "Flooding in Apas", "is_english": true}'
    resp = make_parser(FakeBackend("sea-lion", reply=reply)).translate("Flooding in Apas")
    assert resp.translated_text is None


def test_translate_falls_back_to_gemini():
    primary = FakeBackend("sea-lion", error=RuntimeError("down"))
    fallback = FakeBackend("gemini", reply='{"translated_text": "Help in Pasil", "is_english": false}')
    resp = make_parser(primary, fallback).translate("Tabang sa Pasil")
    assert resp.provider == "gemini"
    assert resp.translated_text == "Help in Pasil"


# --- fallback ---------------------------------------------------------------

def test_falls_back_to_gemini_on_sea_lion_error():
    primary = FakeBackend("sea-lion", error=RuntimeError("503 from sea-lion"))
    fallback = FakeBackend("gemini", reply=HIGH_CONF)
    parser = make_parser(primary, fallback)

    resp = parser.parse("Grabe ang baha sa Apas")
    assert primary.calls == 1
    assert fallback.calls == 1
    assert resp.provider == "gemini"
    assert resp.field_report.location_text == "Barangay Apas, Cebu City"


def test_raises_when_both_providers_fail():
    primary = FakeBackend("sea-lion", error=RuntimeError("down"))
    fallback = FakeBackend("gemini", error=RuntimeError("also down"))
    parser = make_parser(primary, fallback)
    with pytest.raises(LLMError):
        parser.parse("anything")


def test_rate_limiter_gates_sea_lion_calls():
    """The limiter is consulted before each primary (SEA-LION) call."""
    acquired = {"n": 0}

    class CountingLimiter:
        def acquire(self):
            acquired["n"] += 1

    primary = FakeBackend("sea-lion", reply=HIGH_CONF)
    parser = Parser(Settings(), primary=primary, fallback=FakeBackend("gemini", reply="{}"),
                    rate_limiter=CountingLimiter())
    parser.parse("a")
    parser.parse("b")
    assert acquired["n"] == 2
