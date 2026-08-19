#!/usr/bin/env python3
"""
LUWAS — S10 Da Nang country pack: APPEND the Da Nang road graph to public.road_edges.

This is deliberately NOT build_road_graph.py with a different path. That script starts
with

    truncate public.road_edges restart identity cascade;

which is correct when Cebu is the only region, and catastrophic now: it would renumber
every edge id and cascade into routes and blocked spans. The S08 bridge beat pins the
CCLEX span to edge ids 108987/108988, so ids are load-bearing demo state. This script
only ever appends, and asserts the Cebu watermark is intact before and after.

Cebu and Da Nang share one road_edges table and one vertex table but form two disjoint
graph components ~1,300 km apart, so pgr_dijkstra can never wander between them — the
region split needs no column here, only geography.

  raw/osm-roads/danang-roads.gpkg (Overpass, urban-core bbox)
    -> ogr2ogr loads drivable "lines" into a staging table
    -> pgr_nodeNetwork()    splits ways at intersections
    -> INSERT (append!)     into public.road_edges
    -> pgr_createTopology(rows_where='id > watermark')   new vertices only
    -> pgr_dijkstra()       Hải Châu -> An Hải across the Hàn River (acceptance)

Run (deps live in data-pipeline/.venv; ogr2ogr must be on PATH):
    data-pipeline/.venv/bin/python data-pipeline/build_danang_graph.py

Idempotent: re-running deletes only edges above the recorded Cebu watermark and rebuilds
them. Reads DATABASE_URL from the repo-root .env.local. Local-only ETL.
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

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
ROADS_GPKG = SCRIPT_DIR / "raw" / "osm-roads" / "danang-roads.gpkg"
ROADS_LAYER = "lines"

# The Cebu graph as built by build_road_graph.py. Anything above these ids is Da Nang
# and is safe to delete; anything at or below is Cebu and must never be touched.
CEBU_MAX_EDGE_ID = 117644
CEBU_MAX_VERTEX_ID = 104107
CEBU_EDGE_COUNT = 117644

TOL = 1e-6
STAGING = "_stg_danang_lines"
NODED = "_stg_danang_lines_noded"

DRIVABLE = [
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
    "residential", "living_street", "service", "road", "busway", "track",
]

BBOX_PAD = 0.01


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        sys.exit(1)


def banner(msg: str) -> None:
    print(f"\n== {msg}")


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


def guard_cebu(engine, when: str) -> None:
    """Refuse to run if the Cebu graph is not exactly as build_road_graph.py left it."""
    with engine.connect() as c:
        n = c.execute(text(
            "select count(*) from public.road_edges where id <= :w"),
            {"w": CEBU_MAX_EDGE_ID}).scalar()
        span = c.execute(text(
            "select count(*) from public.road_edges where id in (108987, 108988)")).scalar()
    check(f"Cebu edges intact ({when})", n == CEBU_EDGE_COUNT,
          f"{n} at/below watermark, expected {CEBU_EDGE_COUNT}")
    check(f"S08 CCLEX span edges present ({when})", span == 2, f"{span}/2 found")


def danang_bbox(engine) -> tuple[float, float, float, float]:
    with engine.connect() as c:
        e = c.execute(text(
            "select st_xmin(e), st_ymin(e), st_xmax(e), st_ymax(e) "
            "from (select st_extent(geom) e from public.barangays where region='danang') s"
        )).fetchone()
    if e is None or e[0] is None:
        sys.exit("ERROR: no danang barangays. Run ingest_danang.py first.")
    xmin, ymin, xmax, ymax = (e[0] - BBOX_PAD, e[1] - BBOX_PAD,
                              e[2] + BBOX_PAD, e[3] + BBOX_PAD)
    print(f"  Da Nang clip bbox (padded {BBOX_PAD}°): "
          f"[{xmin:.4f},{ymin:.4f}] .. [{xmax:.4f},{ymax:.4f}]")
    return xmin, ymin, xmax, ymax


def load_staging(bbox: tuple[float, float, float, float]) -> None:
    banner(f"ogr2ogr: drivable roads -> public.{STAGING}")
    if not ROADS_GPKG.exists():
        sys.exit(f"ERROR: road extract not found at {ROADS_GPKG}")

    parts = urlsplit(os.environ["DATABASE_URL"])
    host, port = parts.hostname, parts.port or 5432
    dbname = parts.path.lstrip("/") or "postgres"
    user = unquote(parts.username or "")
    pg_dsn = (f"PG:host={host} port={port} dbname={dbname} user={user} "
              "sslmode=require active_schema=public")
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
    t0 = time.time()
    r = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("ERROR: ogr2ogr failed.\n  " + (r.stderr.strip() or r.stdout.strip()))
    print(f"  loaded staging in {time.time() - t0:.1f}s")


def build_topology(engine) -> None:
    banner("pgRouting: node network -> append to road_edges -> topology")
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
        n_stg = c.execute(text(f"select count(*) from public.{STAGING}")).scalar()
        check("staging table populated", n_stg > 0, f"{n_stg} ways")

        c.execute(text(f"drop table if exists public.{NODED};"))
        t0 = time.time()
        res = c.execute(text("select pgr_nodeNetwork(:tbl, :tol, :id, :geom)"),
                        {"tbl": f"public.{STAGING}", "tol": TOL,
                         "id": "ogc_fid", "geom": "geom"}).scalar()
        n_noded = c.execute(text(f"select count(*) from public.{NODED}")).scalar()
        print(f"  pgr_nodeNetwork -> {res}: {n_noded} noded segments ({time.time()-t0:.1f}s)")

        # Idempotent reload: drop any previous Da Nang append, keep Cebu untouched.
        gone = c.execute(text("delete from public.road_edges where id > :w"),
                         {"w": CEBU_MAX_EDGE_ID}).rowcount
        if gone:
            print(f"  cleared {gone} previously appended Da Nang edges")
        c.execute(text("delete from public.road_edges_vertices_pgr where id > :w"),
                  {"w": CEBU_MAX_VERTEX_ID})

        # APPEND. Same costing as Cebu: geodesic metres, bidirectional (no oneway tag).
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
        n_new = c.execute(text("select count(*) from public.road_edges where id > :w"),
                          {"w": CEBU_MAX_EDGE_ID}).scalar()
        print(f"  appended Da Nang edges: {n_new}")
        check("Da Nang edges appended", n_new > 0, f"{n_new} edges")

        # rows_where confines topology to the new edges, so Cebu's source/target and
        # existing vertex ids are never recomputed.
        t0 = time.time()
        res = c.execute(text("""
            select pgr_createTopology('public.road_edges', :tol, 'geom', 'id',
                                      'source', 'target', :rw, false)
        """), {"tol": TOL, "rw": f"id > {CEBU_MAX_EDGE_ID}"}).scalar()
        print(f"  pgr_createTopology -> {res} ({time.time()-t0:.1f}s)")

        n_null = c.execute(text(
            "select count(*) from public.road_edges "
            "where id > :w and (source is null or target is null)"),
            {"w": CEBU_MAX_EDGE_ID}).scalar()
        check("topology assigned source/target to every Da Nang edge", n_null == 0,
              f"{n_null} unassigned")

        n_cebu_null = c.execute(text(
            "select count(*) from public.road_edges "
            "where id <= :w and (source is null or target is null)"),
            {"w": CEBU_MAX_EDGE_ID}).scalar()
        check("Cebu topology untouched", n_cebu_null == 0, f"{n_cebu_null} unassigned")

        comp = c.execute(text(f"""
            with cc as (
                select component, count(*) n
                from pgr_connectedComponents(
                    'select id, source, target, cost, reverse_cost
                       from public.road_edges where id > {CEBU_MAX_EDGE_ID}'
                ) group by component order by n desc limit 1
            ) select n from cc
        """)).scalar()
        print(f"  largest Da Nang connected component: {comp} vertices")


def route_test(engine) -> None:
    banner("acceptance: route across the Hàn River")
    with engine.connect() as c:
        def centroid(name: str):
            return c.execute(text(
                "select st_x(centroid), st_y(centroid) from public.barangays "
                "where region='danang' and name = :n"), {"n": name}).fetchone()

        def nearest_vertex(lon: float, lat: float):
            return c.execute(text("""
                select v.id from public.road_edges_vertices_pgr v
                where v.id > :w
                order by v.the_geom <-> st_setsrid(st_makepoint(:lon, :lat), 4326)
                limit 1
            """), {"lon": lon, "lat": lat, "w": CEBU_MAX_VERTEX_ID}).scalar()

        src_name, dst_name = "Phường Hải Châu", "Phường An Hải"
        sx, sy = centroid(src_name)
        dx, dy = centroid(dst_name)
        sv, dv = nearest_vertex(sx, sy), nearest_vertex(dx, dy)
        print(f"  {src_name} v{sv} -> {dst_name} v{dv}")

        rows = c.execute(text(f"""
            select r.seq, e.name, e.length_m
            from pgr_dijkstra(
                'select id, source, target, cost, reverse_cost
                   from public.road_edges
                  where id > {CEBU_MAX_EDGE_ID} and not impassable',
                :sv, :dv, directed := false
            ) r join public.road_edges e on e.id = r.edge
            order by r.seq
        """), {"sv": sv, "dv": dv}).fetchall()

        total_km = sum(r[2] for r in rows) / 1000
        names = [r[1] for r in rows if r[1]]
        bridges = sorted({n for n in names if n.startswith("Cầu")})
        print(f"  path: {len(rows)} edges, {total_km:.2f} km")
        print(f"  bridges crossed: {bridges or 'NONE'}")

        check("route found between the two banks", len(rows) > 0)
        check("route length is plausible for the urban core", 1 < total_km < 30,
              f"{total_km:.2f} km")
        check("route crosses the Hàn River on a real bridge", bool(bridges),
              f"bridges: {bridges}")


def cleanup(engine) -> None:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
        c.execute(text(f"drop table if exists public.{NODED};"))
        c.execute(text(f"drop table if exists public.{STAGING};"))
    print("\n  dropped staging tables")


def main() -> int:
    engine = get_engine()
    guard_cebu(engine, "before")
    load_staging(danang_bbox(engine))
    build_topology(engine)
    route_test(engine)
    guard_cebu(engine, "after")
    cleanup(engine)
    print("\n== done. Da Nang road graph appended.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
