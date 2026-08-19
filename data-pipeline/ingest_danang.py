#!/usr/bin/env python3
"""
LUWAS — S10 Da Nang country pack: ingest ward boundaries into public.barangays.

This is the "a country is a data pack, not an ML project" claim made concrete. Nothing
here trains or tunes anything: it loads boundaries + population for a second region and
tags them `region = 'danang'`. The scoring SQL, TabPFN impact model, Sphere formula, and
OR-Tools solver are all untouched and region-agnostic.

Source: OpenStreetMap via Overpass, relation 3601891418 (Thành phố Đà Nẵng), filtered to
admin_level=6. Vietnam retagged wards from level 8 to level 6 after the July 2025 reform
abolished the district tier, so these are the CURRENT post-merger ward boundaries — e.g.
Phường Hòa Cường, which absorbed Bình Thuận, Hòa Thuận Tây, Hòa Cường Bắc and Nam.

Population is SOURCED, not estimated: it comes from each relation's own OSM `population`
tag, carried in the extract's `other_tags`, and every urban-core ward is tagged
`source:population=gis.vn` with `population:date=2025-07-01` — the date the merger took
effect. This matters beyond tidiness: population is the denominator of the Sphere manifest
and a component of the Silent Area score, so an invented number would propagate into every
figure on screen. A ward without the tag is a hard failure here rather than a guess.

Run (deps live in data-pipeline/.venv):
    data-pipeline/.venv/bin/python data-pipeline/ingest_danang.py

Reads DATABASE_URL from the repo-root .env.local (falls back to .env). Local-only ETL.
Idempotent: deletes and reloads only region='danang' rows. Cebu is never touched.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import geopandas as gpd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
WARDS_GPKG = SCRIPT_DIR / "raw" / "osm-boundaries" / "danang_wards.gpkg"

REGION = "danang"
CITY = "Đà Nẵng"
PROVINCE = "Thành phố Đà Nẵng"

# Urban core only. Every ward here has its centroid inside the road extract's bbox
# (15.96–16.12 N, 108.08–108.30 E), so every one is routable. Phường Hải Vân and the
# Hội An / Điện Bàn / Quảng Nam rural communes are deliberately out of scope: they sit
# outside the road graph, and an area you cannot route to is worse than an absent one.
#
# Names only — population is read from each ward's own OSM tag (see load_wards).
URBAN_CORE: frozenset[str] = frozenset({
    "Phường Hải Châu",
    "Phường Thanh Khê",
    "Phường An Hải",
    "Phường Hòa Cường",
    "Phường Hòa Khánh",
    "Phường Liên Chiểu",
    "Phường Ngũ Hành Sơn",
    "Phường Sơn Trà",
    "Phường Cẩm Lệ",
    "Phường An Khê",
    "Phường Hòa Xuân",
})

WGS84 = 4326


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        sys.exit(1)


def get_engine():
    for fn in (".env.local", ".env"):
        p = REPO_ROOT / fn
        if p.exists():
            load_dotenv(p)
            break
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ERROR: DATABASE_URL not set (looked in .env.local, .env).")
    return create_engine(url, future=True)


def osm_tag(other_tags: str | None, key: str) -> str | None:
    """Pull one value out of an ogr `other_tags` hstore: '"k"=>"v","k2"=>"v2"'.

    Values here are plain integers and ISO dates, so the naive split is safe; a tag
    whose value contained an escaped quote would need a real hstore parser.
    """
    if not other_tags:
        return None
    m = re.search(rf'"{re.escape(key)}"=>"([^"]*)"', other_tags)
    return m.group(1) if m else None


def load_wards() -> gpd.GeoDataFrame:
    print(f"\n== reading {WARDS_GPKG.name}")
    if not WARDS_GPKG.exists():
        sys.exit(f"ERROR: ward boundaries not found at {WARDS_GPKG}")

    g = gpd.read_file(WARDS_GPKG)
    g = g[g["name"].notna()].copy()
    if g.crs is None or g.crs.to_epsg() != WGS84:
        g = g.to_crs(epsg=WGS84)

    g = g[g["name"].isin(URBAN_CORE)].copy()
    print(f"  matched {len(g)} of {len(URBAN_CORE)} urban-core wards")
    missing = URBAN_CORE - set(g["name"])
    check("every urban-core ward found in the extract", not missing, f"missing: {missing}")

    # Population comes from the data, never from this file. An untagged ward stops the
    # load rather than being filled in — see the module docstring on why a guessed
    # population is worse here than a missing region.
    g["population"] = g["other_tags"].map(lambda t: osm_tag(t, "population"))
    untagged = sorted(g.loc[g["population"].isna(), "name"])
    check("every urban-core ward carries an OSM population tag", not untagged,
          f"untagged: {untagged}")
    g["population"] = g["population"].astype(int)

    sources = {osm_tag(t, "source:population") for t in g["other_tags"]}
    dates = {osm_tag(t, "population:date") for t in g["other_tags"]}
    print(f"  population: {g['population'].sum():,} across {len(g)} wards"
          f" | source={sorted(s for s in sources if s)} date={sorted(d for d in dates if d)}")

    return g[["name", "population", "geometry"]]


def write_barangays(engine, g: gpd.GeoDataFrame) -> None:
    print("\n== writing public.barangays (region='danang')")
    with engine.begin() as c:
        removed = c.execute(
            text("delete from public.barangays where region = :r"), {"r": REGION}
        ).rowcount
        if removed:
            print(f"  cleared {removed} existing danang rows (idempotent reload)")

        for _, r in g.iterrows():
            c.execute(text("""
                insert into public.barangays
                    (name, city_municipality, province, population, region, geom, centroid)
                values
                    (:name, :city, :province, :pop, :region,
                     st_multi(st_geomfromtext(:wkt, 4326))::geometry(MultiPolygon, 4326),
                     st_pointonsurface(st_geomfromtext(:wkt, 4326))::geometry(Point, 4326))
            """), {
                "name": r["name"], "city": CITY, "province": PROVINCE,
                "pop": int(r["population"]), "region": REGION, "wkt": r.geometry.wkt,
            })

    with engine.connect() as c:
        n = c.execute(text(
            "select count(*) from public.barangays where region = :r"), {"r": REGION}
        ).scalar()
        n_cebu = c.execute(text(
            "select count(*) from public.barangays where region = 'cebu'")).scalar()
        n_bad = c.execute(text(
            "select count(*) from public.barangays where region = :r and centroid is null"),
            {"r": REGION}).scalar()

    print(f"  danang rows: {n} | cebu rows (untouched): {n_cebu}")
    check("all urban-core wards inserted", n == len(URBAN_CORE), f"{n} rows")
    check("every ward has a centroid", n_bad == 0, f"{n_bad} without centroid")
    check("cebu rows intact", n_cebu == 1203, f"{n_cebu} (expected 1203)")


def main() -> int:
    engine = get_engine()
    write_barangays(engine, load_wards())
    print("\n== done. Da Nang pack loaded; next: build_danang_graph.py\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
