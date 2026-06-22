#!/usr/bin/env python3
"""
LUWAS — Phase 1.1: Ingest static datasets into PostGIS.

Loads each source dataset into its own table in the Supabase Postgres/PostGIS DB,
all reprojected to EPSG:4326:

  * OSM barangay boundaries (gpkg)        -> public.barangays  (geom + centroid)
  * PSA 2020 barangay population (csv)    -> public.barangays.population (name match)
  * HDX vulnerability indicators (csv)    -> public.hdx_housing_type / hdx_water_access
                                             / hdx_evacuation_centers
  * Project NOAH hazard layers (shp)      -> public.barangay_hazard_exposure
        Raw hazard geometry is read LOCALLY and never persisted (CLAUDE.md). Only the
        per-barangay exposure (area-weighted normalized hazard) is written to PostGIS.
  * Cyclone wind footprints               -> deferred hook (no file yet; see GATE 1).

Then reverse-geocodes a few known Cebu coordinates against barangay boundaries and runs
printed acceptance checks. Exits non-zero if any acceptance check fails.

Run (deps live in data-pipeline/.venv):
    data-pipeline/.venv/bin/python data-pipeline/ingest_static.py

Reads DATABASE_URL from the repo-root .env.local (falls back to .env). This is a
local-only ETL; it is not deployed.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import MultiPolygon
from rasterio import features
from rasterio.enums import MergeAlg
from affine import Affine
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# --- paths -----------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent          # data-pipeline/
REPO_ROOT = SCRIPT_DIR.parent                         # repo root
RAW = SCRIPT_DIR / "raw"

# --- CRS -------------------------------------------------------------------
WGS84 = 4326          # storage CRS for all geometry
METRIC = 32651        # WGS 84 / UTM zone 51N — covers Cebu (~123-124E); area in metres

# --- hazard-exposure tuning ------------------------------------------------
# Some NOAH layers (the flood sets) ship as a handful of province-spanning
# multipolygons with millions of vertices. Both a polygon×polygon overlay and a
# per-point point-in-polygon sweep are intractable: even a prepared STRtree costs
# ~1 ms/point, so ~500k land cells × 8 layers = hours. Instead we RASTERIZE each
# hazard onto a regular SAMPLE_M grid (GDAL scanline fill, seconds) and aggregate
# per barangay with numpy. Cell-center rasterization (all_touched=False) is
# mathematically identical to sampling hazard class at each grid-cell centre.
SAMPLE_M = 100        # raster cell size (m); exposure = mean hazard over a barangay's land cells

# --- NOAH hazard layers: (hazard_type, shapefile, class_field) -------------
# class_field is the per-polygon hazard intensity attribute provided by NOAH.
HAZARD_LAYERS = [
    ("flood_5yr",        "project-noah/flood5yr/PH072200000_FH_5yr.shp",     "Var"),
    ("flood_25yr",       "project-noah/flood25yr/PH072200000_FH_25yr.shp",   "Var"),
    ("flood_100yr",      "project-noah/flood100yr/PH072200000_FH_100yr.shp", "Var"),
    ("landslide",        "project-noah/landslide/Cebu_LandslideHazards.shp", "GRID"),
    ("storm_surge_ssa1", "project-noah/storm-surge-1/Cebu_StormSurge_SSA1.shp", "HAZ"),
    ("storm_surge_ssa2", "project-noah/storm-surge-2/Cebu_StormSurge_SSA2.shp", "HAZ"),
    ("storm_surge_ssa3", "project-noah/storm-surge-3/Cebu_StormSurge_SSA3.shp", "HAZ"),
    ("storm_surge_ssa4", "project-noah/storm-surge-4/Cebu_StormSurge_SSA4.shp", "HAZ"),
]

# Reference tables this pipeline creates and exposes (RLS: authenticated read).
REFERENCE_TABLES = [
    "hdx_housing_type",
    "hdx_water_access",
    "hdx_evacuation_centers",
    "barangay_hazard_exposure",
]

_checks: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    _checks.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def banner(msg: str) -> None:
    print(f"\n{'=' * 4} {msg} {'=' * (72 - len(msg))}")


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------
def get_engine():
    load_dotenv(REPO_ROOT / ".env.local")
    load_dotenv(REPO_ROOT / ".env")  # fallback; does not override existing
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ERROR: DATABASE_URL not set (expected in repo-root .env.local).")
    try:
        eng = create_engine(url, connect_args={"sslmode": "require"}, future=True)
        with eng.connect() as c:
            pg = c.execute(text("select version()")).scalar()
            postgis = c.execute(text("select postgis_full_version()")).scalar()
        print(f"Connected. {pg.split(',')[0]}")
        print(f"PostGIS: {postgis.split('GEOS')[0].strip()}")
        return eng
    except Exception as e:  # noqa: BLE001
        sys.exit(
            "ERROR: could not connect to Postgres.\n"
            f"  {type(e).__name__}: {e}\n"
            "  If the host is db.<ref>.supabase.co (direct, IPv6-only), switch DATABASE_URL\n"
            "  to the IPv4 session pooler from the Supabase dashboard "
            "(aws-0-<region>.pooler.supabase.com:5432)."
        )


# ---------------------------------------------------------------------------
# 1. OSM barangay boundaries -> public.barangays
# ---------------------------------------------------------------------------
def ingest_barangays(engine) -> None:
    banner("OSM barangay boundaries -> public.barangays")
    g = gpd.read_file(RAW / "osm-boundaries/cebu_barangays.gpkg", layer="phl_admin4")
    g = g.to_crs(WGS84)
    print(f"  read {len(g)} features from gpkg (CRS -> EPSG:{WGS84})")

    b = gpd.GeoDataFrame(
        {
            "psgc_code": g["adm4_pcode"].astype("string").str.strip(),
            "name": g["adm4_name"].astype("string").str.strip(),
            "city_municipality": g["adm3_name"].astype("string").str.strip(),
            "province": g["adm2_name"].astype("string").str.strip(),
        },
        geometry=g.geometry,
        crs=WGS84,
    )
    # repair invalid geometry; coerce all to MultiPolygon for the geom(MultiPolygon) column
    b["geometry"] = b.geometry.buffer(0)
    b = b[b.geometry.notna() & ~b.geometry.is_empty]
    b["geometry"] = b.geometry.apply(
        lambda geom: geom if geom.geom_type == "MultiPolygon" else MultiPolygon([geom])
    )
    dropped = b["psgc_code"].isna().sum() + (b["psgc_code"] == "").sum()
    b = b[b["psgc_code"].notna() & (b["psgc_code"] != "")]
    if dropped:
        print(f"  dropped {dropped} features with no PSGC code (cannot upsert)")

    b.to_postgis("_stg_barangays", engine, if_exists="replace", index=False)
    with engine.begin() as c:
        c.execute(text(
            """
            insert into public.barangays
                (psgc_code, name, city_municipality, province, geom, centroid)
            select psgc_code, name, city_municipality, province,
                   st_multi(st_setsrid(geometry, 4326)),
                   st_centroid(geometry)
            from _stg_barangays
            on conflict (psgc_code) do update set
                name              = excluded.name,
                city_municipality = excluded.city_municipality,
                province          = excluded.province,
                geom              = excluded.geom,
                centroid          = excluded.centroid;
            """
        ))
        c.execute(text("drop table if exists _stg_barangays;"))
        n = c.execute(text("select count(*) from public.barangays")).scalar()
    print(f"  upserted -> public.barangays now has {n} rows")


# ---------------------------------------------------------------------------
# 2. PSA population -> barangays.population  (province-wide coverage)
# ---------------------------------------------------------------------------
# The PSA 2020 CSV is a flat report: a province-total row ("CEBU *"), then one
# ALL-CAPS municipality header per municipality (carrying its subtotal), each
# followed by its mixed-case barangay rows. Cebu City appears at the end under
# "CITY OF CEBU (Capital)". Barangay names repeat across municipalities (dozens
# of "Poblacion"/"Bagacay"), so we forward-fill the current municipality and
# match on (municipality, barangay) — never name alone. The 3 Highly-Urbanized
# Cities not in the province file (Lapu-Lapu, Mandaue) have no source here.
def _muni_key(name: str) -> str:
    """Canonical municipality key: strip parens/digits, drop CITY/OF so
    'CITY OF TOLEDO', 'Toledo City' and 'CITY OF CEBU (Capital)' all collapse."""
    import re
    n = re.sub(r"\(.*?\)", "", str(name)).upper().replace("*", "")
    n = re.sub(r"\bCITY\b", " ", n)
    n = re.sub(r"\bOF\b", " ", n)
    n = re.sub(r"\d+", " ", n)
    return re.sub(r"[^A-Z]+", " ", n).strip()


def _is_muni_header(name: str) -> bool:
    """A row is a municipality header if ALL-CAPS (Alcantara..Tudela) or the
    mixed-case Cebu City header 'CITY OF CEBU (Capital)'."""
    n = str(name).strip()
    if not n:
        return False
    if n.upper().startswith("CITY OF CEBU"):
        return True
    return any(c.isalpha() for c in n) and n.upper() == n


def ingest_population(engine) -> None:
    banner("PSA 2020 population -> public.barangays.population (province-wide)")
    raw = pd.read_csv(
        RAW / "barangay_population.csv", header=0,
        names=["barangay", "population"], dtype=str, keep_default_na=False,
    )

    rows, cur = [], None
    for _, r in raw.iterrows():
        name = str(r["barangay"]).strip()
        low = name.lower()
        if not name or low.startswith("source") or "philippine statistics" in low:
            continue
        if _is_muni_header(name):
            # the province total ("CEBU *") is a header but NOT a municipality
            cur = None if name.upper().startswith("CEBU *") else name
            continue
        if cur is None:
            continue
        pop = pd.to_numeric(str(r["population"]).replace(",", "").strip(), errors="coerce")
        if pd.isna(pop):
            continue
        rows.append({
            "muni_key": _muni_key(cur),
            "bgy_key": " ".join(name.lower().split()),
            "population": int(pop),
        })
    stg = pd.DataFrame(rows)
    stg.to_sql("_stg_pop", engine, if_exists="replace", index=False)

    # Same municipality-key normalization on the table side, in SQL, so the join
    # is municipality-aware (regexp_replace mirrors _muni_key()).
    tbl_muni_key = (
        "upper(regexp_replace(regexp_replace(regexp_replace(regexp_replace("
        "b.city_municipality, '\\(.*?\\)', '', 'g'), '\\m(CITY|OF)\\M', ' ', 'gi'), "
        "'[0-9]+', ' ', 'g'), '[^A-Za-z]+', ' ', 'g'))"
    )
    with engine.begin() as c:
        matched = c.execute(text(
            f"""
            update public.barangays b
               set population = s.population
              from _stg_pop s
             where lower(btrim(b.name)) = s.bgy_key
               and btrim(regexp_replace({tbl_muni_key}, '\\s+', ' ', 'g'))
                   = btrim(s.muni_key);
            """
        )).rowcount
        total = c.execute(text("select count(*) from _stg_pop")).scalar()
        munis = c.execute(text("select count(distinct muni_key) from _stg_pop")).scalar()
        c.execute(text("drop table if exists _stg_pop;"))
        with_pop, total_bgy = c.execute(text(
            "select count(population), count(*) from public.barangays"
        )).one()
    print(f"  CSV barangay rows: {total} across {munis} municipalities; matched: {matched}")
    print(f"  barangays with population set: {with_pop} / {total_bgy} "
          f"({total_bgy - with_pop} still without — HUCs/unmatched)")
    check("population matched the bulk of barangays", matched >= 1000, f"{matched} matched")


# ---------------------------------------------------------------------------
# 3. HDX vulnerability indicators -> own attribute tables
# ---------------------------------------------------------------------------
def _snake(cols) -> list[str]:
    import re
    out = []
    for c in cols:
        s = re.sub(r"[^0-9a-zA-Z]+", "_", str(c).strip().lower()).strip("_")
        out.append(s or "col")
    return out


def _clean_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(
        series.astype(str).str.replace(",", "", regex=False).str.strip(),
        errors="coerce",
    )


def ingest_hdx(engine) -> None:
    banner("HDX vulnerability indicators -> hdx_* tables")
    indic = RAW / "pre-disaster-indicators"
    specs = [
        ("hdx_housing_type", indic / "housing-type.csv"),
        ("hdx_water_access", indic / "water-access.csv"),
        ("hdx_evacuation_centers", indic / "evacuation-centers.csv"),
    ]
    for table, path in specs:
        df = pd.read_csv(path)
        df.columns = _snake(df.columns)
        # numeric-clean any column past the identifier columns (those with codes/names)
        id_like = {"region", "region_code", "province", "province_code",
                   "municipality_city", "municipality_city_code"}
        for col in df.columns:
            if col not in id_like:
                cleaned = _clean_numeric(df[col])
                if cleaned.notna().mean() > 0.8:   # treat as numeric if mostly parses
                    df[col] = cleaned
        df.to_sql(table, engine, if_exists="replace", index=False, chunksize=2000)
        print(f"  {table}: {len(df)} rows, {len(df.columns)} cols")


# ---------------------------------------------------------------------------
# 4. NOAH hazard layers -> per-barangay exposure (raw geometry stays local)
# ---------------------------------------------------------------------------
def compute_hazard_exposure(engine) -> None:
    banner("NOAH hazard layers -> public.barangay_hazard_exposure (exposure only)")
    # Rasterize each hazard onto a regular SAMPLE_M grid over Cebu, then aggregate per
    # barangay with numpy. GDAL scanline fill burns the million-vertex flood polygons in
    # seconds and tolerates their invalid rings (so no costly make_valid() is needed),
    # whereas a per-point point-in-polygon sweep costs ~1 ms/point -> hours. Cell-center
    # rasterization (all_touched=False) is identical to sampling hazard class at each
    # grid-cell centre. Only the scalar exposure is persisted; raw hazard geometry stays
    # local (CLAUDE.md).
    bgy = gpd.read_file(RAW / "osm-boundaries/cebu_barangays.gpkg", layer="phl_admin4")
    bgy = bgy[["adm4_pcode", "geometry"]].rename(columns={"adm4_pcode": "psgc_code"})
    bgy["psgc_code"] = bgy["psgc_code"].astype("string").str.strip()
    bgy = bgy[bgy["psgc_code"].notna() & (bgy["psgc_code"] != "")]
    bgy = bgy.to_crs(METRIC)
    bgy["geometry"] = bgy.geometry.buffer(0)
    bgy = bgy[bgy.geometry.area > 0].reset_index(drop=True)
    n_bgy = len(bgy)
    psgc = bgy["psgc_code"].to_numpy()

    # north-up raster grid covering the barangay extent at SAMPLE_M resolution
    minx, miny, maxx, maxy = bgy.total_bounds
    width = int(np.ceil((maxx - minx) / SAMPLE_M))
    height = int(np.ceil((maxy - miny) / SAMPLE_M))
    transform = Affine(SAMPLE_M, 0, minx, 0, -SAMPLE_M, maxy)

    # label raster: each cell -> 1-based barangay index (0 = sea). Admin boundaries don't
    # overlap, so every land cell maps to exactly one barangay; cells outside all
    # barangays stay 0, dropping the sea between Cebu's islands.
    labels = features.rasterize(
        ((geom, i + 1) for i, geom in enumerate(bgy.geometry.values)),
        out_shape=(height, width), transform=transform, fill=0,
        dtype="int32", all_touched=False,
    ).ravel()
    counts = np.bincount(labels, minlength=n_bgy + 1)[1:].astype(float)  # land cells / barangay
    land = labels > 0
    lab_land = labels[land] - 1   # 0-based barangay index for each land cell
    print(f"  raster {width}x{height} = {width * height:,} cells -> {int(land.sum()):,} land "
          f"cells in {int((counts > 0).sum())} barangays (cell {SAMPLE_M} m)", flush=True)

    rows: list[pd.DataFrame] = []
    for hazard_type, rel, field in HAZARD_LAYERS:
        path = RAW / rel
        if not path.exists():
            print(f"  [skip] {hazard_type}: missing {rel}")
            continue
        t0 = time.time()
        try:
            hz = gpd.read_file(path)
            if field not in hz.columns:
                print(f"  [skip] {hazard_type}: field '{field}' not in {list(hz.columns)}")
                continue
            hz = hz.to_crs(METRIC)
            hz = hz[hz.geometry.notna() & ~hz.geometry.is_empty].reset_index(drop=True)
            vals = pd.to_numeric(hz[field], errors="coerce").fillna(0).to_numpy()
            cmax = float(np.nanmax(vals)) if len(vals) else 0.0
            norm = (vals / cmax) if cmax else np.zeros(len(vals))

            # Rasterize the normalized hazard class. Burn higher classes last (stable
            # ascending sort) so the "replace" merge yields the MAX normalized class
            # wherever hazard polygons overlap. 0 = not exposed.
            order = np.argsort(norm, kind="stable")
            hraster = features.rasterize(
                ((geom, float(v)) for geom, v in zip(hz.geometry.values[order], norm[order])),
                out_shape=(height, width), transform=transform, fill=0.0,
                dtype="float64", all_touched=False, merge_alg=MergeAlg.replace,
            ).ravel()
            h_land = hraster[land]

            sum_cls = np.bincount(lab_land, weights=h_land, minlength=n_bgy)
            sum_exp = np.bincount(lab_land, weights=(h_land > 0).astype(float), minlength=n_bgy)
            max_cls = np.zeros(n_bgy)
            np.maximum.at(max_cls, lab_land, h_land)
            with np.errstate(invalid="ignore", divide="ignore"):
                exposure = np.where(counts > 0, sum_cls / counts, 0.0)
                exposed_fraction = np.where(counts > 0, sum_exp / counts, 0.0)

            keep = exposed_fraction > 0
            if not keep.any():
                print(f"  {hazard_type}: no rasterized exposure in Cebu ({time.time()-t0:.1f}s)")
                continue
            agg = pd.DataFrame({
                "psgc_code": psgc[keep],
                "exposure": np.clip(exposure[keep], 0, 1),
                "exposed_fraction": np.clip(exposed_fraction[keep], 0, 1),
                "max_class_norm": np.clip(max_cls[keep], 0, 1),
                "hazard_type": hazard_type,
            })
            rows.append(agg)
            print(f"  {hazard_type}: {len(agg)} barangays exposed "
                  f"(raw class max={cmax:g}, {time.time()-t0:.1f}s)", flush=True)
        except Exception as e:  # noqa: BLE001 — resilient per-layer
            print(f"  [error] {hazard_type}: {type(e).__name__}: {e}")

    if not rows:
        check("hazard exposure computed for >=1 layer", False, "no layers produced exposure")
        return

    exposure = pd.concat(rows, ignore_index=True)

    # create the exposure table (idempotent) and map psgc_code -> barangay_id
    with engine.begin() as c:
        c.execute(text(
            """
            create table if not exists public.barangay_hazard_exposure (
                id               bigserial primary key,
                barangay_id      uuid references public.barangays (id) on delete cascade,
                psgc_code        text,
                hazard_type      text not null,
                exposure         double precision,   -- area-weighted normalized hazard [0,1]
                exposed_fraction double precision,   -- fraction of barangay area exposed [0,1]
                max_class_norm   double precision,   -- max normalized hazard class [0,1]
                computed_at      timestamptz not null default now(),
                unique (barangay_id, hazard_type)
            );
            """
        ))
        c.execute(text("truncate public.barangay_hazard_exposure restart identity;"))
        id_map = pd.read_sql(
            "select id::text as barangay_id, psgc_code from public.barangays", c
        )

    exposure = exposure.merge(id_map, on="psgc_code", how="inner")
    exposure = exposure[
        ["barangay_id", "psgc_code", "hazard_type",
         "exposure", "exposed_fraction", "max_class_norm"]
    ]
    exposure.to_sql("barangay_hazard_exposure", engine, if_exists="append",
                    index=False, chunksize=2000)
    print(f"  wrote {len(exposure)} exposure rows across "
          f"{exposure['hazard_type'].nunique()} hazard layers")


# ---------------------------------------------------------------------------
# 5. Cyclone wind footprints — deferred hook (GATE 1)
# ---------------------------------------------------------------------------
def ingest_wind_footprints(engine) -> None:
    banner("Cyclone wind footprints -> DEFERRED")
    # GATE 1: cyclone-name -> wind-footprint mapping is deferred; the storm `Category`
    # column in Impact_Data.csv covers intensity for now. No source file present, so
    # this is a no-op hook. When footprints arrive, persist per-barangay wind exposure
    # into barangay_hazard_exposure with hazard_type='wind_<event>', same shape as above.
    print("  no cyclone wind-footprint source in raw/; skipping (intentional).")


# ---------------------------------------------------------------------------
# RLS: expose reference tables read-only to authenticated users
# ---------------------------------------------------------------------------
def apply_reference_rls(engine) -> None:
    banner("RLS on reference tables (authenticated read)")
    with engine.begin() as c:
        for t in REFERENCE_TABLES:
            exists = c.execute(text(
                "select to_regclass(:t)"), {"t": f"public.{t}"}).scalar()
            if not exists:
                continue
            c.execute(text(f"alter table public.{t} enable row level security;"))
            c.execute(text(f"drop policy if exists {t}_read on public.{t};"))
            c.execute(text(
                f"create policy {t}_read on public.{t} for select to authenticated using (true);"
            ))
            print(f"  RLS enabled + authenticated read policy on {t}")


# ---------------------------------------------------------------------------
# 6. Reverse-geocode test points + acceptance checks
# ---------------------------------------------------------------------------
def reverse_geocode_tests(engine) -> None:
    banner("Reverse-geocode test points")
    # (label, lon, lat, expect_land)
    points = [
        ("Cebu Provincial Capitol", 123.8907, 10.3157, True),
        ("Mactan-Cebu Airport (Lapu-Lapu)", 123.9794, 10.3075, True),
        ("Tañon Strait (offshore, west of Cebu)", 123.60, 10.30, False),
    ]
    land_hits = 0
    with engine.connect() as c:
        for label, lon, lat, expect_land in points:
            row = c.execute(text(
                """
                select name, city_municipality, province
                  from public.barangays
                 where st_contains(geom, st_setsrid(st_makepoint(:lon, :lat), 4326))
                 limit 1;
                """
            ), {"lon": lon, "lat": lat}).fetchone()
            if row:
                print(f"  ({lat:.4f},{lon:.4f}) {label:34s} -> {row[0]}, {row[1]} [{row[2]}]")
                if expect_land:
                    land_hits += 1
            else:
                print(f"  ({lat:.4f},{lon:.4f}) {label:34s} -> (no barangay)")
    check("reverse-geocode: land points resolve to a barangay", land_hits >= 2,
          f"{land_hits}/2 land points matched")


def acceptance_checks(engine) -> None:
    banner("Acceptance checks")
    with engine.connect() as c:
        n_bgy = c.execute(text("select count(*) from public.barangays")).scalar()
        bad_srid = c.execute(text(
            "select count(*) from public.barangays where geom is not null and st_srid(geom) <> 4326"
        )).scalar()
        n_house = c.execute(text("select count(*) from public.hdx_housing_type")).scalar()
        n_water = c.execute(text("select count(*) from public.hdx_water_access")).scalar()
        n_exp = c.execute(text("select count(*) from public.barangay_hazard_exposure")).scalar()
        bad_exp = c.execute(text(
            "select count(*) from public.barangay_hazard_exposure "
            "where exposure < 0 or exposure > 1"
        )).scalar()
    check("barangays loaded (>1000)", n_bgy > 1000, f"{n_bgy} rows")
    check("all barangay geom SRID = 4326", bad_srid == 0, f"{bad_srid} off-SRID rows")
    check("hdx_housing_type queryable", n_house > 0, f"{n_house} rows")
    check("hdx_water_access queryable", n_water > 0, f"{n_water} rows")
    check("hazard exposure rows present", n_exp > 0, f"{n_exp} rows")
    check("exposure values within [0,1]", bad_exp == 0, f"{bad_exp} out-of-range")


def print_data_dictionary() -> None:
    banner("Data dictionary (tables produced)")
    print("""  public.barangays
    psgc_code         PSGC barangay code (OSM adm4_pcode)        [upsert key]
    name              barangay name (adm4_name)
    city_municipality adm3_name
    province          adm2_name
    population        PSA 2020 count (Cebu City coverage; else NULL)
    geom              MultiPolygon, EPSG:4326
    centroid          Point, EPSG:4326 (st_centroid of geom)

  public.barangay_hazard_exposure   (per-barangay, per-hazard; raw geometry NOT stored)
    barangay_id       FK -> barangays.id
    hazard_type       flood_5yr|flood_25yr|flood_100yr|landslide|storm_surge_ssa1..4
    exposure          area-weighted normalized hazard class, [0,1]
    exposed_fraction  share of barangay area intersecting the hazard, [0,1]
    max_class_norm    max normalized hazard class within the barangay, [0,1]

  public.hdx_housing_type / hdx_water_access / hdx_evacuation_centers
    nationwide, municipality-level attribute rows (Region/Province/Municipality + counts).
    Consumed by Phase 1.3 (aggregated to province for the impact-model training table).""")


def main() -> int:
    print("LUWAS Phase 1.1 — static dataset ingestion")
    engine = get_engine()
    ingest_barangays(engine)
    ingest_population(engine)
    ingest_hdx(engine)
    compute_hazard_exposure(engine)
    ingest_wind_footprints(engine)
    apply_reference_rls(engine)
    reverse_geocode_tests(engine)
    acceptance_checks(engine)
    print_data_dictionary()

    banner("Summary")
    passed = sum(1 for _, ok, _ in _checks if ok)
    failed = [n for n, ok, _ in _checks if not ok]
    print(f"  {passed}/{len(_checks)} acceptance checks passed")
    if failed:
        print("  FAILED: " + "; ".join(failed))
        return 1
    print("  ALL ACCEPTANCE CHECKS PASSED ✓")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
