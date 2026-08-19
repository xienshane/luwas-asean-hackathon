#!/usr/bin/env python3
"""
LUWAS — S10 Da Nang country pack: hazard exposure from a GEOGRAPHIC PROXY.

READ THIS BEFORE QUOTING ANY NUMBER THIS SCRIPT PRODUCES.

The Cebu hazard layer is real: Project NOAH flood, landslide and storm-surge rasters,
rasterized per barangay by ingest_static.py. There is no equivalent loaded for Vietnam.
VNDMA publishes the real thing and a production pack would use it.

What this computes instead is a PROXY from actual OSM geometry — not measured hazard,
but not invented either:

  flood_100yr      = fraction of ward area within 500 m of mapped inland water
  storm_surge_ssa2 = fraction of ward area within 1,500 m of the mapped coastline

Both are real distances over real polygons, and they rank the wards the way local
knowledge would: riverside wards flood, seafront wards take surge. What they are NOT is
a hydrological model, a return-period estimate, or anything a responder should plan
against. It is stage dressing with a defensible shape, and the Q&A bank says so.

Values are clamped into Cebu's existing composite range [0.0172, 1.0]. That is not
cosmetic: silent_area_score normalizes hazard against min/max across ALL rows, so a
Da Nang value outside Cebu's range would silently move every Cebu hazard_norm and shift
1,203 Philippine scores. The clamp keeps the two packs independent.

Sources fetched via Overpass (bbox 15.93–16.18 N, 108.03–108.36 E):
  natural=water      -> 437 polygons
  natural=coastline  ->  24 ways

Run (deps live in data-pipeline/.venv):
    data-pipeline/.venv/bin/python data-pipeline/build_danang_hazard.py

Idempotent: deletes and rebuilds only Da Nang rows. Cebu is never touched.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.ops import unary_union
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
RAW = SCRIPT_DIR / "raw" / "danang-hazard"
WATER_GPKG = RAW / "dn_water.gpkg"
COAST_GPKG = RAW / "dn_coast.gpkg"

WGS84 = 4326
METRIC = 32649          # WGS 84 / UTM zone 49N — covers Da Nang (~108.2 E)

FLOOD_BUFFER_M = 500     # inland water influence band
SURGE_BUFFER_M = 1500    # coastal surge influence band

# Cebu's existing composite range. Staying inside it keeps hbounds — and therefore every
# Philippine hazard_norm — exactly where it was.
CLAMP_LO, CLAMP_HI = 0.02, 0.98

REGION = "danang"


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


def load_wards(engine) -> gpd.GeoDataFrame:
    with engine.connect() as c:
        rows = c.execute(text(
            "select id::text, name, st_asewkb(geom) as geom from public.barangays "
            "where region = :r and geom is not null"), {"r": REGION}).fetchall()
    if not rows:
        sys.exit("ERROR: no danang barangays. Run ingest_danang.py first.")
    g = gpd.GeoDataFrame(
        {"id": [r[0] for r in rows], "name": [r[1] for r in rows]},
        geometry=gpd.GeoSeries.from_wkb([bytes(r[2]) for r in rows]),
        crs=WGS84,
    )
    print(f"  wards: {len(g)}")
    return g.to_crs(epsg=METRIC)


def load_layer(path: Path, what: str):
    if not path.exists():
        sys.exit(f"ERROR: {what} not found at {path}")
    g = gpd.read_file(path)
    g = g[g.geometry.notna() & ~g.geometry.is_empty]
    print(f"  {what}: {len(g)} features")
    return unary_union(g.to_crs(epsg=METRIC).geometry.values)


def fraction_within(wards: gpd.GeoDataFrame, feature, buffer_m: int) -> pd.Series:
    """Share of each ward's area lying inside `buffer_m` of `feature`."""
    band = feature.buffer(buffer_m)
    inter = wards.geometry.intersection(band).area
    return (inter / wards.geometry.area).clip(0.0, 1.0)


def build(engine) -> None:
    print("\n== reading layers")
    wards = load_wards(engine)
    water = load_layer(WATER_GPKG, "inland water polygons")
    coast = load_layer(COAST_GPKG, "coastline ways")

    print("\n== computing proxies")
    wards = wards.copy()
    wards["flood_100yr"] = fraction_within(wards, water, FLOOD_BUFFER_M)
    wards["storm_surge_ssa2"] = fraction_within(wards, coast, SURGE_BUFFER_M)

    for col in ("flood_100yr", "storm_surge_ssa2"):
        wards[col] = wards[col].clip(CLAMP_LO, CLAMP_HI)

    for _, r in wards.sort_values("flood_100yr", ascending=False).iterrows():
        print(f"  {r['name']:<26} flood {r['flood_100yr']:.3f}  surge {r['storm_surge_ssa2']:.3f}")

    print("\n== writing public.barangay_hazard_exposure")
    with engine.begin() as c:
        removed = c.execute(text("""
            delete from public.barangay_hazard_exposure he
             using public.barangays b
             where b.id = he.barangay_id and b.region = :r
        """), {"r": REGION}).rowcount
        if removed:
            print(f"  cleared {removed} existing danang rows")

        for _, r in wards.iterrows():
            for htype in ("flood_100yr", "storm_surge_ssa2"):
                c.execute(text("""
                    insert into public.barangay_hazard_exposure
                        (barangay_id, psgc_code, hazard_type, exposure,
                         exposed_fraction, max_class_norm)
                    values (:bid, null, :ht, :val, :val, null)
                """), {"bid": r["id"], "ht": htype, "val": float(r[htype])})

    with engine.connect() as c:
        n = c.execute(text("""
            select count(*) from public.barangay_hazard_exposure he
              join public.barangays b on b.id = he.barangay_id where b.region = :r
        """), {"r": REGION}).scalar()
        lo, hi = c.execute(text("""
            with h as (select max(exposure) e from public.barangay_hazard_exposure
                       group by barangay_id)
            select min(e), max(e) from h
        """)).fetchone()

    print(f"  danang hazard rows: {n}")
    check("two hazard rows per ward", n == len(wards) * 2, f"{n} rows")
    # If either bound moved, every Cebu hazard_norm just changed with it.
    check("Cebu hazard bounds unmoved", abs(lo - 0.0172) < 5e-4 and abs(hi - 1.0) < 1e-9,
          f"[{lo:.4f}, {hi:.4f}] (expected [0.0172, 1.0000])")


def main() -> int:
    engine = get_engine()
    build(engine)
    print("\n== done. Re-run silent_area_score() to pick the new hazard up.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
