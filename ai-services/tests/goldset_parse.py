"""Phase 4.6 gold-set: real-style disaster field texts + expected extractions.

A 20-item corpus that deliberately stresses the disaster-specific language the 4.6
few-shot block hardens: Bisaya/Cebuano flood slang ("baha", "lubog", "naa mi sa atop"),
SMS abbreviations ("Brgy", "ka tawo", "fam", "2k"), misspellings ("bah a", "gwadalupe"),
and vague quantities ("gatosan", "libo-libo") that must NOT be coerced into a fake number.

Shared by `test_parse_goldset.py` (live, hits the real API). Kept as plain data + a pure
scorer so it can also be exercised offline against a fake backend.

Each item: (text, expected). Expected fields:
  loc  — substring expected in location_text (lowercased), or None to skip.
  pop  — expected people count, matched within +/-50%; None when the source is vague
         (e.g. "gatosan"/"libo-libo") so the parser is NOT scored on inventing a number.
  sev  — set of acceptable needs_severity values.
  road — expected road_status, or None to skip.

A sample is "correct" when it matches >= 3 of its applicable fields (the Phase 2.5 bar);
the suite passes when >= 80% of samples are correct (the 2.5 bar was 8/10 = 80%).
"""

PASS_RATIO = 0.8  # matches the Phase 2.5 acceptance bar (8/10)
MIN_FIELDS_PER_SAMPLE = 3  # a sample counts as correct at >= 3 matched applicable fields

# (text, {loc, pop, sev, road})
GOLD_SET = [
    ("Naa mi sa atop sa amoang balay sa Brgy Tisa, lubog na ang tibuok dalan. ~8 ka pamilya "
     "ang na-stranded.",
     {"loc": "tisa", "pop": 40, "sev": {"critical", "high"}, "road": "impassable"}),
    ("Baha grabe dinhi sa Inayawan, gatosan ka tawo apektado, naputol ang tulay padulong sa "
     "highway.",
     {"loc": "inayawan", "pop": None, "sev": {"high", "critical"}, "road": "impassable"}),
    ("Walay tubig ug kuryente sa Brgy Bulacao mga 3 ka adlaw na. Mga 250 ka residente. Maagian "
     "pa ang dalan.",
     {"loc": "bulacao", "pop": 250, "sev": {"moderate", "high"}, "road": "passable"}),
    ("Tabang! Imposible na maagian ang dalan sa Sirao tungod sa landslide. Mga 120 ka tawo ang "
     "nalit-ag.",
     {"loc": "sirao", "pop": 120, "sev": {"high", "critical"}, "road": "impassable"}),
    ("Gamay ra ang baha sa Mabolo, mga 40 ka tawo, naa pa silay supply. Klaro ang dalan.",
     {"loc": "mabolo", "pop": 40, "sev": {"low"}, "road": "passable"}),
    ("Sa Lapu-Lapu, libo-libo ang walay balay human sa bagyo. Grabe gyud, nanginahanglan dayon "
     "og pagkaon ug tubig. Dili na maagian ang dalan.",
     {"loc": "lapu", "pop": None, "sev": {"high", "critical"}, "road": "impassable"}),
    ("Hindi madaanan ang kalsada sa Brgy Pardo dahil sa pagbaha, mga 300 katao ang apektado.",
     {"loc": "pardo", "pop": 300, "sev": {"moderate", "high", "critical"}, "road": "impassable"}),
    ("Lawom na kaayo ang baha dinhi sa Talisay, abot na sa abaga. Mga 500 ka tawo, dili na "
     "maagian ang dalan.",
     {"loc": "talisay", "pop": 500, "sev": {"high", "critical"}, "road": "impassable"}),
    ("Kalma ra sa Brgy Lahug, gamay ra nga kakulangan, mga 25 ka tawo. Open ang dalan.",
     {"loc": "lahug", "pop": 25, "sev": {"low"}, "road": "passable"}),
    ("Naputol ang kuryente sa Cordova, mga 600 ka residente ang apektado. Maagian pa ang main "
     "road.",
     {"loc": "cordova", "pop": 600, "sev": {"moderate", "high"}, "road": "passable"}),
    ("Bah a grabe sa Gwadalupe, naglutaw na ang mga balay. Mga 80 ka pamilya. Dili maagian ang "
     "dalan.",
     {"loc": "guadalupe", "pop": 400, "sev": {"high", "critical"}, "road": "impassable"}),
    ("Sa Mandaue, mga 400 ka tawo ang nanginahanglan og blanket ug tambal. Maayo ra ang dalan.",
     {"loc": "mandaue", "pop": 400, "sev": {"moderate", "high"}, "road": "passable"}),
    ("Critical! Daghang samaron sa Brgy Carreta, mga 150 ka tawo, naputol ang tulay.",
     {"loc": "carreta", "pop": 150, "sev": {"critical", "high"}, "road": "impassable"}),
    ("Kusog kaayo ang hangin sa Pasil, daghang nadaot nga atop. Mga 200 ka tawo. Maagian pa "
     "ang dalan.",
     {"loc": "pasil", "pop": 200, "sev": {"moderate", "high"}, "road": "passable"}),
    ("Wala pa'y tabang nakaabot sa Brgy Sambag, 3 ka adlaw na. Mga 350 ka tawo, walay pagkaon.",
     {"loc": "sambag", "pop": 350, "sev": {"high", "critical"}, "road": None}),
    ("Storm surge sa baybayon sa Cordova, lubog ang baybay. Mga 1000 ka residente ang gibalhin. "
     "Barado ang dalan.",
     {"loc": "cordova", "pop": 1000, "sev": {"high", "critical"}, "road": "impassable"}),
    ("Minor flooding ra sa Banilad, naa pa'y access sa dalan. Mga 60 ka tawo.",
     {"loc": "banilad", "pop": 60, "sev": {"low", "moderate"}, "road": "passable"}),
    ("Brgy Apas: ~500 katao apektado, dili maagian ang dalan, grabe ang baha.",
     {"loc": "apas", "pop": 500, "sev": {"high", "critical"}, "road": "impassable"}),
    ("Stranded mi sa rooftop, naa mi sa atop, taas na kaayo ang tubig sa Brgy Ermita. Mga 30 "
     "ka tawo.",
     {"loc": "ermita", "pop": 30, "sev": {"critical", "high"}, "road": "impassable"}),
    ("Maayo ra ang kahimtang sa Capitol Site, gamay ra nga baha, klaro ang dalan. Mga 45 ka tawo.",
     {"loc": "capitol", "pop": 45, "sev": {"low"}, "road": "passable"}),
]


def score_sample(fr, exp) -> tuple[int, int]:
    """Return (matched, applicable) field counts for one normalized field report `fr`."""
    matched = applicable = 0

    if exp["loc"] is not None:
        applicable += 1
        if fr.location_text and exp["loc"] in fr.location_text.lower():
            matched += 1

    if exp["pop"] is not None:
        applicable += 1
        if fr.population_estimate and 0.5 * exp["pop"] <= fr.population_estimate <= 1.5 * exp["pop"]:
            matched += 1

    if exp["sev"] is not None:
        applicable += 1
        if fr.needs_severity in exp["sev"]:
            matched += 1

    if exp["road"] is not None:
        applicable += 1
        if fr.road_status == exp["road"]:
            matched += 1

    return matched, applicable
