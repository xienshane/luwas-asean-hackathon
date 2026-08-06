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


# --- gold-set corpus structure (Phase 4.6) ----------------------------------

def test_goldset_has_about_20_scorable_items():
    """Every gold item must expose >= MIN_FIELDS applicable fields, else the >=3-of-N bar
    is unreachable and the item is silently un-passable. Offline structural guard."""
    from tests.goldset_parse import GOLD_SET, MIN_FIELDS_PER_SAMPLE, score_sample

    assert 18 <= len(GOLD_SET) <= 22, f"gold-set should be ~20 items, got {len(GOLD_SET)}"
    for text, exp in GOLD_SET:
        # applicable count == matched when the field report mirrors the expectation exactly
        sev = next(iter(exp["sev"])) if exp["sev"] else None

        class _FR:
            location_text = exp["loc"]
            population_estimate = exp["pop"]
            needs_severity = sev
            road_status = exp["road"]

        matched, applicable = score_sample(_FR(), exp)
        assert applicable >= MIN_FIELDS_PER_SAMPLE, (
            f"item has only {applicable} applicable fields (need >= "
            f"{MIN_FIELDS_PER_SAMPLE}): {text[:50]!r}"
        )
        assert matched == applicable, "exact-mirror oracle should match every applicable field"


# --- few-shot disaster lexicon (Phase 4.6) ----------------------------------

def test_system_prompt_teaches_disaster_lexicon():
    """The prompt must teach authentic Bisaya/Filipino disaster slang & abbreviations."""
    from app.services.parser import FEW_SHOT_BLOCK, SYSTEM_PROMPT

    assert FEW_SHOT_BLOCK in SYSTEM_PROMPT
    lex = FEW_SHOT_BLOCK.lower()
    for term in ["baha", "lubog", "naa mi sa atop", "brgy", "naputol", "tabang", "walay"]:
        assert term in lex, f"disaster-lexicon term missing from prompt: {term!r}"


def test_few_shot_block_shows_worked_examples():
    """At least two input->JSON examples so the model sees the field mapping."""
    from app.services.parser import FEW_SHOT_BLOCK

    assert FEW_SHOT_BLOCK.count('"road_status"') >= 2


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


def test_few_shot_lexicon_reaches_backend_with_no_extra_calls():
    """Phase 4.6: the lexicon is sent to the model, and one parse still costs exactly one
    primary call — the few-shot block adds prompt tokens, not API calls (rate-limit safe)."""

    class RecordingBackend:
        name = "sea-lion"

        def __init__(self):
            self.systems: list[str] = []

        def complete(self, system: str, user: str) -> str:
            self.systems.append(system)
            return HIGH_CONF

    backend = RecordingBackend()
    parser = make_parser(backend)
    parser.parse("Naa mi sa atop sa Brgy Tisa, lubog ang dalan")

    assert len(backend.systems) == 1  # no extra calls introduced by the few-shot block
    assert "naa mi sa atop" in backend.systems[0].lower()
    assert "lubog" in backend.systems[0].lower()


def test_rate_limiter_gates_sea_lion_calls():
    """The limiter is consulted before each primary (SEA-LION) call."""
    acquired = {"n": 0}

    class CountingLimiter:
        def try_acquire(self) -> bool:
            acquired["n"] += 1
            return True

    primary = FakeBackend("sea-lion", reply=HIGH_CONF)
    parser = Parser(Settings(), primary=primary, fallback=FakeBackend("gemini", reply="{}"),
                    rate_limiter=CountingLimiter())
    parser.parse("a")
    parser.parse("b")
    assert acquired["n"] == 2


# --- bounded generation (Phase 5.2 / B1) ------------------------------------

from types import SimpleNamespace

from app.services.parser import OpenAICompatBackend, build_parser


class _RecordingCompletions:
    def __init__(self):
        self.kwargs = {}

    def create(self, **kwargs):
        self.kwargs = kwargs
        message = SimpleNamespace(content='{"location": "Tisa"}')
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def _stub_client(backend: OpenAICompatBackend) -> _RecordingCompletions:
    completions = _RecordingCompletions()
    backend._client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return completions


def test_backend_forwards_max_tokens_when_set():
    backend = OpenAICompatBackend(
        "sea-lion", "http://example/v1", "k", "some-model", max_tokens=400
    )
    completions = _stub_client(backend)
    backend.complete("sys", "usr")
    assert completions.kwargs["max_tokens"] == 400
    assert completions.kwargs["temperature"] == 0


def test_backend_omits_generation_kwargs_when_unset():
    backend = OpenAICompatBackend("gemini", "http://example/v1", "k", "some-model")
    completions = _stub_client(backend)
    backend.complete("sys", "usr")
    assert "max_tokens" not in completions.kwargs
    assert "extra_body" not in completions.kwargs


def test_backend_forwards_thinking_mode_extra_body():
    backend = OpenAICompatBackend(
        "sea-lion", "http://example/v1", "k", "some-model",
        extra_body={"chat_template_kwargs": {"thinking_mode": "off"}},
    )
    completions = _stub_client(backend)
    backend.complete("sys", "usr")
    assert completions.kwargs["extra_body"] == {
        "chat_template_kwargs": {"thinking_mode": "off"}
    }


def test_build_parser_applies_bounded_generation_settings():
    parser = build_parser(
        Settings(
            sea_lion_api_key="k",
            gemini_api_key="g",
            sea_lion_model="aisingapore/Gemma-SEA-LION-v4-27B-IT",
            sea_lion_max_tokens=400,
            sea_lion_timeout_s=12.0,
            gemini_max_tokens=400,
            gemini_timeout_s=6.0,
        )
    )
    assert parser.primary.model == "aisingapore/Gemma-SEA-LION-v4-27B-IT"
    assert parser.primary.max_tokens == 400
    assert parser.primary.extra_body == {}
    assert parser.fallback.max_tokens == 400


def test_backends_do_not_retry_internally():
    """A 429 from SEA-LION must raise so the parser can fall back NOW.

    The OpenAI SDK defaults to max_retries=2 and honours the server's `Retry-After: 60`
    — that sleep is not covered by the client `timeout`, so a rate-limited burst blocked
    for 61s and still reported provider='sea-lion'. Observed live before this was pinned.
    """
    backend = OpenAICompatBackend("sea-lion", "http://example/v1", "k", "some-model")
    assert backend._client.max_retries == 0


def test_build_parser_disables_client_retries_on_both_backends():
    parser = build_parser(Settings(sea_lion_api_key="k", gemini_api_key="g"))
    assert parser.primary._client.max_retries == 0
    assert parser.fallback._client.max_retries == 0


def test_build_parser_disables_gemini_thinking_by_default():
    """Gemini 2.5 Flash bills thinking tokens against max_tokens but returns them as
    reasoning, so at 400 the visible JSON is truncated (finish_reason='length') and the
    fallback NEVER parses. Budget 0 keeps the reply whole. Observed live before pinning."""
    parser = build_parser(Settings(sea_lion_api_key="k", gemini_api_key="g"))
    assert parser.fallback.extra_body == {
        "extra_body": {"google": {"thinking_config": {"thinking_budget": 0}}}
    }


def test_build_parser_omits_gemini_thinking_config_when_budget_negative():
    """-1 = hand the budget back to the model (its dynamic default)."""
    parser = build_parser(Settings(gemini_api_key="g", gemini_thinking_budget=-1))
    assert parser.fallback.extra_body == {}


def test_build_parser_sends_thinking_mode_only_when_configured():
    parser = build_parser(
        Settings(
            sea_lion_api_key="k",
            sea_lion_model="aisingapore/Llama-SEA-LION-v3.5-70B-R",
            sea_lion_thinking_mode="off",
        )
    )
    assert parser.primary.extra_body == {
        "chat_template_kwargs": {"thinking_mode": "off"}
    }


# --- fail-fast rate limiting (Phase 5.2 / B2) -------------------------------

def full_limiter() -> RateLimiter:
    limiter = RateLimiter(max_calls=1, period_s=60, now=lambda: 0.0, sleep=lambda dt: None)
    limiter.try_acquire()
    return limiter


def test_rate_limited_primary_falls_back_to_gemini_without_calling_it():
    primary = FakeBackend("sea-lion", reply=HIGH_CONF)
    fallback = FakeBackend("gemini", reply=HIGH_CONF)
    parser = Parser(
        Settings(), primary=primary, fallback=fallback, rate_limiter=full_limiter()
    )
    resp = parser.parse("baha sa Apas")
    assert resp.provider == "gemini"
    assert primary.calls == 0
    assert fallback.calls == 1


def test_rate_limited_with_no_fallback_raises_llm_error():
    primary = FakeBackend("sea-lion", reply=HIGH_CONF)
    parser = Parser(
        Settings(), primary=primary, fallback=None, rate_limiter=full_limiter()
    )
    with pytest.raises(LLMError, match="rate-limited"):
        parser.parse("baha sa Apas")
