"""Stage acceptance for the two demo presets, against the real SEA-LION path.

The Vietnamese ward geocodes against the Da Nang country pack (S10), so the report lands
like any other. This suite covers extraction only — geocoding is asserted on the web side.
"""
import sys

import pytest

from app.core.config import Settings
from app.services.parser import build_parser

# These tests print Vietnamese under `-s`; a Windows console defaults to cp1252 and would
# raise UnicodeEncodeError before any assertion runs. Degrade the console, not the test.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

pytestmark = pytest.mark.live

BISAYA_PRESET = (
    "LUWAS: grabe ang baha sa Guadalupe, mga 80 ka pamilya ang apektado"
)
VIETNAMESE_PRESET = (
    "LUWAS: Ngập lụt nặng ở phường An Hải, Đà Nẵng. "
    "Khoảng 80 hộ dân bị cô lập, cần nước sạch."
)

# 80 families x ~5 people = ~400; allow the model's own rounding.
EXPECTED_PEOPLE = (300, 500)


def _parser():
    settings = Settings()
    if not settings.sea_lion_api_key:
        pytest.skip("SEA_LION_API_KEY not set")
    return build_parser(settings)


def test_bisaya_preset_extracts_location_severity_and_population():
    resp = _parser().parse(BISAYA_PRESET, id="preset-bisaya")
    fr = resp.field_report
    print(f"\n  provider={resp.provider} latency={resp.latency_ms}ms conf={fr.confidence:.2f}")
    assert "guadalupe" in (fr.location_text or "").lower()
    assert fr.needs_severity in ("high", "critical")
    assert fr.population_estimate is not None
    assert EXPECTED_PEOPLE[0] <= fr.population_estimate <= EXPECTED_PEOPLE[1]
    assert resp.translated_text


def test_vietnamese_preset_extracts_and_translates():
    resp = _parser().parse(VIETNAMESE_PRESET, id="preset-vietnamese")
    fr = resp.field_report
    print(f"\n  provider={resp.provider} latency={resp.latency_ms}ms conf={fr.confidence:.2f} "
          f"loc={fr.location_text!r} translated={resp.translated_text!r}")
    assert fr.needs_severity in ("high", "critical")
    assert fr.population_estimate is not None
    assert EXPECTED_PEOPLE[0] <= fr.population_estimate <= EXPECTED_PEOPLE[1]
    assert resp.translated_text and "flood" in resp.translated_text.lower()


def test_presets_answer_within_the_web_abort_window():
    parser = _parser()
    for label, text in (("bisaya", BISAYA_PRESET), ("vietnamese", VIETNAMESE_PRESET)):
        resp = parser.parse(text, id=f"preset-{label}")
        print(f"\n  {label}: {resp.latency_ms}ms via {resp.provider}")
        assert resp.latency_ms < 12_000, f"{label} took {resp.latency_ms}ms"
