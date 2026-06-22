"""Phase 2.5 acceptance: parse >=8/10 real Bisaya/Tagalog reports via the live API.

Marked `live` and skipped unless SEA_LION_API_KEY is set (it hits SEA-LION, falling back to
Gemini on error). A sample counts as correct when >=3 of its 4 applicable fields match the
ground truth; the suite passes when >=8/10 samples are correct.
"""
import pytest

from app.core.config import Settings
from app.services.parser import build_parser

pytestmark = pytest.mark.live

# (text, expected) — expected fields: loc token (substring), pop (±50%), severity (set), road
SAMPLES = [
    ("Grabe ang baha dinhi sa Barangay Apas, Cebu City. Mga 500 ka tawo ang naapektuhan ug "
     "dili na maagian ang dalan.",
     {"loc": "apas", "pop": 500, "sev": {"high", "critical"}, "road": "impassable"}),
    ("Sa Barangay Guadalupe, mga 200 ka tawo ang nawad-an og balay. Kinahanglan dayon og "
     "tubig ug pagkaon. Maagian pa ang dalan.",
     {"loc": "guadalupe", "pop": 200, "sev": {"moderate", "high"}, "road": "passable"}),
    ("Naghulat mi og tabang sa Lapu-Lapu City, mga 1000 ka residente ang walay kuryente ug "
     "tubig. Barado ang main road tungod sa landslide.",
     {"loc": "lapu", "pop": 1000, "sev": {"high", "critical"}, "road": "impassable"}),
    ("Minor lang ang kadaot sa Talisay, mga 50 ka tawo, naa pa silay suplay. Open ang dalan.",
     {"loc": "talisay", "pop": 50, "sev": {"low"}, "road": "passable"}),
    ("May bahang malala sa Barangay Mabolo. Humigit-kumulang 300 katao ang apektado. Hindi "
     "madaanan ang kalsada.",
     {"loc": "mabolo", "pop": 300, "sev": {"high", "critical"}, "road": "impassable"}),
    ("Critical condition sa Barangay Carreta, daghang samaron, mga 150 ka tawo, nanginahanglan "
     "og medical aid. Dili maagian ang dalan, naputol ang tulay.",
     {"loc": "carreta", "pop": 150, "sev": {"critical", "high"}, "road": "impassable"}),
    ("Kalma ra dinhi sa Barangay Lahug, mga 30 ka tawo lang ang gamay og kakulangan. Klaro "
     "ang dalan.",
     {"loc": "lahug", "pop": 30, "sev": {"low"}, "road": "passable"}),
    ("Sa Cordova, mga 600 ka tawo ang walay balay human sa bagyo. Grabe ang panginahanglan og "
     "pagkaon ug tubig.",
     {"loc": "cordova", "pop": 600, "sev": {"high", "critical"}, "road": None}),
    ("Sa Barangay Pardo, tinatayang 250 katao ang naapektuhan ng pagbaha. Sira ang tulay kaya "
     "hindi madaanan.",
     {"loc": "pardo", "pop": 250, "sev": {"moderate", "high", "critical"}, "road": "impassable"}),
    ("Sa Mandaue City, mga 400 ka tawo ang nanginahanglan og blanket ug gamit medikal human sa "
     "bagyo. Maayo ra ang dalan.",
     {"loc": "mandaue", "pop": 400, "sev": {"moderate", "high"}, "road": "passable"}),
]


def _score(fr, exp) -> tuple[int, int]:
    """Return (matched, applicable) field counts for one sample."""
    matched = applicable = 0

    applicable += 1
    if fr.location_text and exp["loc"] in fr.location_text.lower():
        matched += 1

    if exp["pop"] is not None:
        applicable += 1
        if fr.population_estimate and 0.5 * exp["pop"] <= fr.population_estimate <= 1.5 * exp["pop"]:
            matched += 1

    applicable += 1
    if fr.needs_severity in exp["sev"]:
        matched += 1

    if exp["road"] is not None:
        applicable += 1
        if fr.road_status == exp["road"]:
            matched += 1

    return matched, applicable


def test_parses_8_of_10_samples():
    settings = Settings()  # reads ai-services/.env
    if not settings.sea_lion_api_key:
        pytest.skip("SEA_LION_API_KEY not set")

    parser = build_parser(settings)
    correct = 0
    print()
    for i, (text, exp) in enumerate(SAMPLES, 1):
        resp = parser.parse(text, id=f"sample-{i}")
        fr = resp.field_report
        matched, applicable = _score(fr, exp)
        ok = matched >= 3
        correct += ok
        print(f"  [{i:2d}] {'OK ' if ok else 'XX '} {matched}/{applicable} "
              f"via {resp.provider:8s} conf={fr.confidence:.2f} "
              f"loc={fr.location_text!r} pop={fr.population_estimate} "
              f"sev={fr.needs_severity} road={fr.road_status}")

    print(f"\n  parsed correctly: {correct}/10")
    assert correct >= 8, f"only {correct}/10 samples parsed correctly (need >=8)"
