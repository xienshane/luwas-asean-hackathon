"""Phase 4.6 acceptance: the few-shot-hardened parser meets/beats the 2.5 bar on a
20-item disaster-language gold-set, AND ambiguous inputs route to review.

Marked `live`: hits SEA-LION (Gemini fallback), skipped without SEA_LION_API_KEY. The
corpus and pure scorer live in `goldset_parse.py` so the bar is reviewable as data.
"""
import pytest

from app.core.config import Settings
from app.services.parser import build_parser
from tests.goldset_parse import GOLD_SET, MIN_FIELDS_PER_SAMPLE, PASS_RATIO, score_sample

pytestmark = pytest.mark.live


def test_goldset_meets_phase_2_5_bar():
    settings = Settings()  # reads ai-services/.env
    if not settings.sea_lion_api_key:
        pytest.skip("SEA_LION_API_KEY not set")

    parser = build_parser(settings)
    correct = 0
    print()
    for i, (text, exp) in enumerate(GOLD_SET, 1):
        resp = parser.parse(text, id=f"gold-{i}")
        fr = resp.field_report
        matched, applicable = score_sample(fr, exp)
        ok = matched >= MIN_FIELDS_PER_SAMPLE
        correct += ok
        print(f"  [{i:2d}] {'OK ' if ok else 'XX '} {matched}/{applicable} "
              f"via {resp.provider:8s} conf={fr.confidence:.2f} "
              f"loc={fr.location_text!r} pop={fr.population_estimate} "
              f"sev={fr.needs_severity} road={fr.road_status}")

    ratio = correct / len(GOLD_SET)
    print(f"\n  gold-set: {correct}/{len(GOLD_SET)} correct ({ratio:.0%}); "
          f"bar = {PASS_RATIO:.0%}")
    assert ratio >= PASS_RATIO, (
        f"only {correct}/{len(GOLD_SET)} ({ratio:.0%}) correct; need >= {PASS_RATIO:.0%}"
    )


def test_ambiguous_report_routes_to_review_not_autocommit():
    """The 'human at points of uncertainty' half of Feedback 1: a vague report the model
    cannot pin down is flagged (status='flagged', needs_review) rather than auto-committed."""
    settings = Settings()
    if not settings.sea_lion_api_key:
        pytest.skip("SEA_LION_API_KEY not set")

    parser = build_parser(settings)
    # No location, no count, no clear severity/road — nothing the model can extract confidently.
    resp = parser.parse("naa", id="ambiguous")
    assert resp.needs_review is True, f"expected review flag; got conf={resp.field_report.confidence}"
    assert resp.field_report.status == "flagged"
