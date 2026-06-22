#!/usr/bin/env python3
"""
LUWAS — Phase 1.2: Build the routable road graph (pgRouting) in Supabase.

We do NOT use osm2pgrouting (not installed; it would also create its own ways/
ways_vertices_pgr tables instead of the existing public.road_edges schema). Instead we
build the topology directly with GDAL + pgRouting, which are both already available:

  raw/osm-roads/cebu-roads.gpkg (bbbike, Cebu-clipped)
    -> ogr2ogr loads the drivable "lines" layer into a staging PostGIS table
    -> pgr_nodeNetwork()     splits ways at intersections (real connectivity)
    -> INSERT noded segments  into public.road_edges (geodesic length_m + costs)
    -> pgr_createTopology()  populates source/target, builds road_edges_vertices_pgr
    -> pgr_dijkstra()        routes between two real Cebu barangay centroids (acceptance)

Costing:
  length_m = ST_Length(geom::geography)            (geodesic metres)
  cost     = length_m
  reverse_cost = length_m                          (bidirectional — see ONEWAY note)
  original_cost / original_reverse_cost = the same (Phase 2.6 restores these after an
                                                     impassable flag clears).

ONEWAY: the bbbike export only carries (osm_id, name, highway) — there is NO oneway tag,
so every edge is built bidirectional. The hook below (see build_topology) shows exactly
where to penalise reverse_cost once a future export includes oneway.

Run (deps live in data-pipeline/.venv; GDAL/ogr2ogr must be on PATH):
    data-pipeline/.venv/bin/python data-pipeline/build_road_graph.py

Reads DATABASE_URL from the repo-root .env.local (falls back to .env). Local-only ETL;
not deployed. Idempotent: re-running rebuilds road_edges from scratch.
"""
from __future__ import annotations

import os
import sys
import time
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, unquote

from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# --- paths -----------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent          # data-pipeline/
REPO_ROOT = SCRIPT_DIR.parent                         # repo root
ROADS_GPKG = SCRIPT_DIR / "raw" / "osm-roads" / "cebu-roads.gpkg"
ROADS_LAYER = "lines"

# --- CRS -------------------------------------------------------------------
WGS84 = 4326          # storage CRS for all geometry

# --- graph tuning ----------------------------------------------------------
# Drivable highway classes for vehicle relief logistics. Excludes path/footway/steps/
# pedestrian/cycleway/construction/proposed etc. 'track' kept for rural connectivity.
DRIVABLE = [
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
    "residential", "living_street", "service", "road", "busway", "track",
]
# Snap tolerance (degrees) for noding + topology. ~1e-6 deg ≈ 0.11 m: tight enough to
# keep distinct junctions separate, loose enough to absorb OSM coordinate fuzz.
TOL = 1e-6
BBOX_PAD = 0.02       # pad the barangay extent (deg) before clipping the road extract

STAGING = "_stg_road_lines"
NODED = "_stg_road_lines_noded"

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
            pgr = c.execute(text("select pgr_version()")).scalar()
        print(f"Connected. {pg.split(',')[0]}")
        print(f"pgRouting: {pgr}")
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
# 1. Cebu bbox from the barangay extent (no hardcoded box)
# ---------------------------------------------------------------------------
def cebu_bbox(engine) -> tuple[float, float, float, float]:
    with engine.connect() as c:
        e = c.execute(text(
            "select st_xmin(e), st_ymin(e), st_xmax(e), st_ymax(e) "
            "from (select st_extent(geom) e from public.barangays) s"
        )).fetchone()
    xmin, ymin, xmax, ymax = (e[0] - BBOX_PAD, e[1] - BBOX_PAD,
                              e[2] + BBOX_PAD, e[3] + BBOX_PAD)
    print(f"  Cebu clip bbox (padded {BBOX_PAD}°): "
          f"[{xmin:.4f},{ymin:.4f}] .. [{xmax:.4f},{ymax:.4f}]")
    return xmin, ymin, xmax, ymax


# ---------------------------------------------------------------------------
# 2. ogr2ogr: drivable road lines -> staging PostGIS table (Cebu-clipped)
# ---------------------------------------------------------------------------
def load_staging(bbox: tuple[float, float, float, float]) -> None:
    banner(f"ogr2ogr: drivable roads -> public.{STAGING}")
    if not ROADS_GPKG.exists():
        sys.exit(f"ERROR: road extract not found at {ROADS_GPKG}\n"
                 "  Place the bbbike Cebu-clipped GeoPackage there (layer 'lines').")

    parts = urlsplit(os.environ["DATABASE_URL"])
    host, port = parts.hostname, parts.port or 5432
    dbname = parts.path.lstrip("/") or "postgres"
    user = unquote(parts.username or "")
    pg_dsn = (f"PG:host={host} port={port} dbname={dbname} user={user} "
              "sslmode=require active_schema=public")
    # Keep the password out of argv/ps: libpq reads it from PGPASSWORD.
    env = dict(os.environ, PGPASSWORD=unquote(parts.password or ""))

    where = "highway IN (" + ",".join(f"'{h}'" for h in DRIVABLE) + ")"
    xmin, ymin, xmax, ymax = bbox
    cmd = [
        "ogr2ogr", "-f", "PostgreSQL", pg_dsn,
        str(ROADS_GPKG), ROADS_LAYER,
        "-select", "osm_id,name,highway",
        "-where", where,
        "-spat", f"{xmin}", f"{ymin}", f"{xmax}", f"{ymax}",
        "-nln", STAGING, "-nlt", "LINESTRING",
        "-s_srs", "EPSG:4326", "-t_srs", "EPSG:4326",
        "-lco", "GEOMETRY_NAME=geom", "-lco", "FID=ogc_fid",
        "-lco", "SPATIAL_INDEX=GIST",
        "-overwrite", "--config", "PG_USE_COPY", "YES",
    ]
    print(f"  filter: {len(DRIVABLE)} drivable highway classes")
    t0 = time.time()
    r = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("ERROR: ogr2ogr failed.\n  " + (r.stderr.strip() or r.stdout.strip()))
    if r.stderr.strip():
        print("  ogr2ogr:", r.stderr.strip()[:300])
    print(f"  loaded staging in {time.time() - t0:.1f}s")


# ---------------------------------------------------------------------------
# 3. Node the network + populate road_edges + build topology
# ---------------------------------------------------------------------------
def build_topology(engine) -> None:
    banner("pgRouting: node network -> road_edges -> topology")
    # pgr_* helpers create tables and commit; run in autocommit like a migration.
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
        n_stg = c.execute(text(f"select count(*) from public.{STAGING}")).scalar()
        print(f"  staging ways (drivable, Cebu-clipped): {n_stg}")
        check(f"staging table populated", n_stg > 0, f"{n_stg} ways")

        # Split ways at every intersection so junctions become shared nodes.
        c.execute(text(f"drop table if exists public.{NODED};"))
        t0 = time.time()
        res = c.execute(text(
            "select pgr_nodeNetwork(:tbl, :tol, :id, :geom)"
        ), {"tbl": f"public.{STAGING}", "tol": TOL, "id": "ogc_fid", "geom": "geom"}).scalar()
        n_noded = c.execute(text(f"select count(*) from public.{NODED}")).scalar()
        print(f"  pgr_nodeNetwork -> {res}: {n_noded} noded segments ({time.time()-t0:.1f}s)")

        # Rebuild road_edges from the noded segments.
        c.execute(text("truncate public.road_edges restart identity cascade;"))
        # NOTE(oneway): bidirectional because the export has no oneway tag. When a future
        # export carries oneway, replace the reverse_cost expression below with e.g.
        #   case when s.oneway in ('yes','true','1') then len*1e9 else len end
        # (and swap cost<->reverse_cost for oneway='-1'), then re-mirror into original_*.
        c.execute(text(f"""
            insert into public.road_edges
                (geom, osm_id, name, length_m, cost, reverse_cost,
                 original_cost, original_reverse_cost, impassable)
            select geom, osm_id, name, len, len, len, len, len, false
            from (
                select n.geom as geom,
                       nullif(regexp_replace(coalesce(s.osm_id, ''), '[^0-9]', '', 'g'),
                              '')::bigint as osm_id,
                       s.name as name,
                       st_length(n.geom::geography) as len
                from public.{NODED} n
                join public.{STAGING} s on s.ogc_fid = n.old_id
            ) q
            where len > 0;
        """))
        n_edges = c.execute(text("select count(*) from public.road_edges")).scalar()
        print(f"  road_edges rows: {n_edges}")
        check("road_edges populated", n_edges > 0, f"{n_edges} edges")

        # Topology: fills source/target, builds public.road_edges_vertices_pgr.
        c.execute(text(
            "create index if not exists road_edges_geom_gix "
            "on public.road_edges using gist (geom);"
        ))
        t0 = time.time()
        res = c.execute(text(
            "select pgr_createTopology(:tbl, :tol, :geom, :id)"
        ), {"tbl": "public.road_edges", "tol": TOL, "geom": "geom", "id": "id"}).scalar()
        print(f"  pgr_createTopology -> {res} ({time.time()-t0:.1f}s)")

        n_null = c.execute(text(
            "select count(*) from public.road_edges where source is null or target is null"
        )).scalar()
        n_vert = c.execute(text(
            "select count(*) from public.road_edges_vertices_pgr"
        )).scalar()
        print(f"  vertices: {n_vert}; edges with NULL source/target: {n_null}")
        check("createTopology assigned source/target to every edge", n_null == 0,
              f"{n_null} unassigned")

        # Connectivity: how much of the graph is one reachable component?
        comp = c.execute(text("""
            with cc as (
                select component, count(*) n
                from pgr_connectedComponents(
                    'select id, source, target, cost, reverse_cost from public.road_edges')
                group by component)
            select count(*) as components,
                   max(n) as largest,
                   sum(n) as total
            from cc;
        """)).fetchone()
        frac = (comp[1] / comp[2]) if comp and comp[2] else 0.0
        print(f"  connected components: {comp[0]}; "
              f"largest holds {comp[1]}/{comp[2]} nodes ({frac*100:.1f}%)")
        check("graph is well-connected (largest component ≥ 60% of nodes)", frac >= 0.60,
              f"{frac*100:.1f}% in largest component")


# ---------------------------------------------------------------------------
# 4. Acceptance: pgr_dijkstra between real Cebu barangay centroids
# ---------------------------------------------------------------------------
def route_tests(engine) -> None:
    banner("Acceptance: pgr_dijkstra between Cebu barangay centroids")
    with engine.connect() as c:
        # Urban-core barangays (dense, mainland-contiguous) make a reliable test set.
        # distinct on (name): barangays has duplicate-name rows (Phase 1.1 OSM artifact),
        # so dedupe to the highest-population row per name for an unambiguous test.
        cands = c.execute(text("""
            select name, lon, lat from (
                select distinct on (name)
                       name, st_x(centroid) lon, st_y(centroid) lat, population
                from public.barangays
                where city_municipality ilike '%Cebu City%'
                  and centroid is not null and population is not null
                order by name, population desc
            ) d
            order by population desc
            limit 6;
        """)).fetchall()
        if len(cands) < 2:
            cands = c.execute(text("""
                select name, st_x(centroid) lon, st_y(centroid) lat
                from public.barangays
                where centroid is not null
                order by population desc nulls last
                limit 6;
            """)).fetchall()

        def nearest_vertex(lon: float, lat: float) -> int | None:
            return c.execute(text("""
                select id from public.road_edges_vertices_pgr
                order by the_geom <-> st_setsrid(st_makepoint(:lon, :lat), 4326)
                limit 1;
            """), {"lon": lon, "lat": lat}).scalar()

        def route(a, b) -> tuple[int, float, float]:
            src, tgt = nearest_vertex(a.lon, a.lat), nearest_vertex(b.lon, b.lat)
            if src is None or tgt is None or src == tgt:
                return 0, 0.0, 0.0
            row = c.execute(text("""
                select count(*) legs, coalesce(max(agg_cost), 0) total_m
                from pgr_dijkstra(
                    'select id, source, target, cost, reverse_cost from public.road_edges',
                    :src, :tgt, directed := true);
            """), {"src": src, "tgt": tgt}).fetchone()
            straight = c.execute(text("""
                select st_distance(
                    st_setsrid(st_makepoint(:lon1, :lat1), 4326)::geography,
                    st_setsrid(st_makepoint(:lon2, :lat2), 4326)::geography);
            """), {"lon1": a.lon, "lat1": a.lat, "lon2": b.lon, "lat2": b.lat}).scalar()
            return row[0], float(row[1]), float(straight or 0.0)

        # Three spread-out pairs from the candidate set.
        pairs = [(cands[0], cands[1])]
        if len(cands) >= 4:
            pairs.append((cands[2], cands[3]))
        if len(cands) >= 6:
            pairs.append((cands[4], cands[5]))

        any_connected = False
        sane = False
        for a, b in pairs:
            legs, total_m, straight_m = route(a, b)
            if legs > 0 and straight_m > 0:
                ratio = total_m / straight_m
                any_connected = True
                ok = 0.95 <= ratio <= 8.0
                sane = sane or ok
                print(f"  {a.name} → {b.name}: {legs} legs, "
                      f"road {total_m/1000:.2f} km vs straight {straight_m/1000:.2f} km "
                      f"(×{ratio:.2f}) {'OK' if ok else 'SUSPECT'}")
            else:
                print(f"  {a.name} → {b.name}: NO PATH")

    check("pgr_dijkstra returns a connected path between two Cebu barangays", any_connected)
    check("routed path length is sane vs straight-line (0.95×–8×)", sane)


# ---------------------------------------------------------------------------
# 5. Drop staging (keep road_edges + road_edges_vertices_pgr)
# ---------------------------------------------------------------------------
def cleanup(engine) -> None:
    banner("Cleanup staging tables")
    with engine.begin() as c:
        c.execute(text(f"drop table if exists public.{NODED};"))
        c.execute(text(f"drop table if exists public.{STAGING};"))
    print(f"  dropped public.{STAGING}, public.{NODED}")


def report_size(engine) -> None:
    with engine.connect() as c:
        size = c.execute(text("""
            select pg_size_pretty(
                pg_total_relation_size('public.road_edges') +
                pg_total_relation_size('public.road_edges_vertices_pgr'));
        """)).scalar()
        total_km = c.execute(text(
            "select coalesce(sum(length_m), 0) / 1000.0 from public.road_edges"
        )).scalar()
    print(f"  road graph on-disk size: {size}; total network length: {total_km:.0f} km")


def print_data_dictionary() -> None:
    banner("Data dictionary (tables produced)")
    print("""  public.road_edges   (pgRouting edge table; one row per noded road segment)
    id                    bigint PK (edge id used by pgr_* functions)
    source / target       bigint FK -> road_edges_vertices_pgr.id (set by createTopology)
    cost / reverse_cost   double — geodesic length_m each way (bidirectional)
    original_cost / original_reverse_cost
                          double — pristine costs; Phase 2.6 restores after impassable clears
    osm_id                bigint — source OSM way id
    name                  text   — road name (nullable)
    length_m              double — ST_Length(geom::geography), geodesic metres
    impassable            bool   — Phase 2.6 dynamic-edge flag (default false)
    geom                  LineString, EPSG:4326

  public.road_edges_vertices_pgr   (built by pgr_createTopology)
    id, cnt, chk, ein, eout, the_geom (Point, EPSG:4326) — graph nodes for routing.""")


def main() -> int:
    print("LUWAS Phase 1.2 — build the routable road graph (pgRouting)")
    engine = get_engine()
    banner("Cebu clip extent")
    bbox = cebu_bbox(engine)
    load_staging(bbox)
    build_topology(engine)
    route_tests(engine)
    cleanup(engine)
    report_size(engine)
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
