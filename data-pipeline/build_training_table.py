#!/usr/bin/env python3
"""
LUWAS — Phase 1.3: assemble the TabPFN impact-model training table.

Builds ONE model-ready row per (province, storm-event) from the NATIONAL raw files in
data-pipeline/raw/ (the whole country — NOT the Cebu-only Supabase tables), so the impact
model trains nationwide:

  impact_data.csv                      province × storm-event impact + Category + Total Houses
  pre-disaster-indicators/housing-type.csv   national housing units + roof/wall make-up (HDX)
  pre-disaster-indicators/water-access.csv   national households + water-source make-up (HDX)
    -> out/training_table.csv

Steps (mirrors the Phase 1.3 plan):
  1. Dedupe the 5 duplicate (Cyclone Name, Year, Province) groups. They are complementary
     PARTIAL records (one row carries Affected, its sibling the house counts), not multi-
     landfall — so collapse each group by column-wise MAX (keeps the larger Affected AND
     recovers the sibling's Houses damaged / Total Houses; the zeros never double-count).
  2. Reconcile the CSV province names to the HDX/PSA province names (alias map below);
     print any unmatched names — the list should be empty.
  3. Join national HDX features aggregated to province: housing-unit + household scale
     (the per-province population proxy — there is NO national PSA population file in raw/,
     only Cebu-City barangays) plus structural- and water-vulnerability fractions.
  4. Ordinal-encode Category (PAGASA intensity) as the primary hazard-intensity feature.
     The cyclone-name -> HDX wind-footprint join stays a clearly-marked deferred hook.
  5. Target: damage_rate = Houses damaged / Total Houses (guarded: Total Houses == 0 -> 0,
     which is exact here because every zero-Total row also has Houses damaged == 0). Keep
     raw Affected as an alternate target.
  6. Write out/training_table.csv with a printed data dictionary.

Run (deps live in data-pipeline/.venv):
    data-pipeline/.venv/bin/python data-pipeline/build_training_table.py

Local-only ETL; not deployed. No DB connection — pure file -> file.
"""
from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

# --- paths -----------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent          # data-pipeline/
RAW = SCRIPT_DIR / "raw"
OUT = SCRIPT_DIR / "out"
IMPACT_CSV = RAW / "impact_data.csv"
HOUSING_CSV = RAW / "pre-disaster-indicators" / "housing-type.csv"
WATER_CSV = RAW / "pre-disaster-indicators" / "water-access.csv"
OUT_CSV = OUT / "training_table.csv"

# --- feature config --------------------------------------------------------
KEY = ["Cyclone Name", "Year", "Province"]

# PAGASA tropical-cyclone intensity, weakest -> strongest (keys lowercased for matching).
CATEGORY_ORDER = {
    "tropical depression": 0,
    "tropical storm": 1,
    "severe tropical storm": 2,
    "strong typhoon": 3,
    "very strong typhoon": 4,
    "violent typhoon": 5,
}

# Province aliases: normalized impact name -> the HDX raw Province label(s) it maps to.
# (norm() lower-cases/strips, so the keys are the normalized form of the impact spelling.)
PROVINCE_ALIASES = {
    "cotabato": ["Cotabato (North Cotabato)"],          # impact 'Cotabato' = North Cotabato
    "davao de oro": ["Compostela Valley"],              # 2019 rename
    "samar": ["Samar (Western Samar)"],
    "metro manila": [                                    # NCR has no provinces -> sum districts
        "NCR, Second District (Not a Province)",
        "NCR, Third District (Not a Province)",
        "NCR, Fourth District (Not a Province)",
    ],
}

HOUSING_NUM = [
    "Housing Units", "Strong Roof/Strong Wall", "Strong Roof/Light Wall",
    "Strong Roof/Salvage Wall", "Light Roof/Strong Wall", "Light Roof/Light Wall",
    "Light Roof/Salvage Wall", "Salvaged Roof/Strong Wall", "Salvaged Roof/Light Wall",
    "Salvaged Roof/Salvage Wall",
]
WATER_NUM = [
    "Number of Households", "Faucet/Community System", "Tubed/Piped", "Dug well",
    "Bottled Water", "Natural Sources", "Peddler/Others/Not Reported",
]
IMPACT_NUM = ["Deaths", "Affected", "Houses destroyed", "Houses damaged", "Total Houses"]

# Columns that must contain NO nulls for the table to be model-ready.
FEATURE_COLS = [
    "category_ordinal", "total_houses", "province_housing_units", "province_households",
    "structural_vuln_frac", "unimproved_water_frac",
]

_checks: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    _checks.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def banner(msg: str) -> None:
    print(f"\n{'=' * 4} {msg} {'=' * (72 - len(msg))}")


def norm(s: str) -> str:
    """Normalize a province name for matching: upper, de-accent, drop generic words/punct."""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"\b(PROVINCE OF|CITY OF)\b", " ", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def clean_num(series: pd.Series) -> pd.Series:
    """Parse a possibly comma-grouped numeric column ('2,351') to float."""
    return pd.to_numeric(
        series.astype(str).str.replace(",", "", regex=False).str.strip(),
        errors="coerce",
    )


# ---------------------------------------------------------------------------
# 1. Impact data: clean numerics + dedupe by column-wise max
# ---------------------------------------------------------------------------
def load_impact() -> pd.DataFrame:
    banner("Impact data -> clean + dedupe (column-wise max)")
    df = pd.read_csv(IMPACT_CSV)
    for col in IMPACT_NUM:
        df[col] = clean_num(df[col])
    df["Year"] = clean_num(df["Year"]).astype(int)
    df["Category"] = df["Category"].astype(str).str.strip()

    dup_groups = df.duplicated(KEY, keep=False)
    n_dup_rows = int(dup_groups.sum())
    n_groups = df[dup_groups].groupby(KEY).ngroups
    print(f"  rows in: {len(df)}; duplicate rows: {n_dup_rows} across {n_groups} groups")

    # Collapse every key group by max so the partial records merge into one full row.
    agg = {c: "max" for c in IMPACT_NUM}
    agg["Category"] = "first"  # constant within each duplicate group
    for c in df.columns:
        if c not in KEY and c not in agg:
            agg[c] = "max"
    merged = df.groupby(KEY, as_index=False).agg(agg)
    print(f"  rows out: {len(merged)} ({len(df) - len(merged)} duplicate rows merged away)")
    check("one row per (cyclone, year, province)",
          int(merged.duplicated(KEY).sum()) == 0, "no duplicate keys")
    return merged


# ---------------------------------------------------------------------------
# 2 + 3. National HDX features aggregated to province
# ---------------------------------------------------------------------------
def build_province_features() -> pd.DataFrame:
    banner("National HDX housing + water -> per-province features")
    housing = pd.read_csv(HOUSING_CSV)
    water = pd.read_csv(WATER_CSV)
    for col in HOUSING_NUM:
        housing[col] = clean_num(housing[col])
    for col in WATER_NUM:
        water[col] = clean_num(water[col])

    # Canonical province key: norm() for everything, overridden by the alias map so the
    # HDX labels collapse onto the impact spelling (e.g. 'Compostela Valley' -> 'davao de oro',
    # the three NCR districts -> 'metro manila').
    def canon_map(labels) -> dict:
        m = {lbl: norm(lbl) for lbl in labels}
        for impact_key, hdx_list in PROVINCE_ALIASES.items():
            for lbl in hdx_list:
                m[lbl] = impact_key
        return m

    h_map = canon_map(housing["Province"].dropna().unique())
    w_map = canon_map(water["Province"].dropna().unique())
    housing["canon"] = housing["Province"].map(h_map)
    water["canon"] = water["Province"].map(w_map)

    h = housing.groupby("canon").agg(
        province_housing_units=("Housing Units", "sum"),
        strong=("Strong Roof/Strong Wall", "sum"),
        province_psgc=("Province Code", "first"),
    )
    # Structural vulnerability = share of homes that are NOT fully strong roof + strong wall.
    h["structural_vuln_frac"] = np.where(
        h["province_housing_units"] > 0,
        1.0 - h["strong"] / h["province_housing_units"], 0.0,
    )

    w = water.groupby("canon").agg(
        province_households=("Number of Households", "sum"),
        unimproved=("Natural Sources", "sum"),
        peddler=("Peddler/Others/Not Reported", "sum"),
    )
    # Water vulnerability = share of households on unimproved sources (natural + peddler/other).
    w["unimproved_water_frac"] = np.where(
        w["province_households"] > 0,
        (w["unimproved"] + w["peddler"]) / w["province_households"], 0.0,
    )

    prov = h.join(w, how="outer")
    prov = prov[[
        "province_psgc", "province_housing_units", "province_households",
        "structural_vuln_frac", "unimproved_water_frac",
    ]]
    print(f"  provinces with features: {len(prov)} "
          f"(housing {h.shape[0]}, water {w.shape[0]} canon groups)")
    return prov


# ---------------------------------------------------------------------------
# 4 + 5 + 6. Assemble, derive features/target, write
# ---------------------------------------------------------------------------
def assemble(impact: pd.DataFrame, prov: pd.DataFrame) -> pd.DataFrame:
    banner("Assemble training rows + derive features/target")
    impact = impact.copy()
    impact["canon"] = impact["Province"].map(norm)
    df = impact.merge(prov, left_on="canon", right_index=True, how="left")

    unmatched = sorted(df.loc[df["province_households"].isna(), "Province"].unique())
    print(f"  unmatched provinces (should be empty): {unmatched or '[]'}")
    check("province name reconciliation complete (no unmatched)", not unmatched,
          f"{len(unmatched)} unmatched")

    df["category_ordinal"] = df["Category"].str.lower().map(CATEGORY_ORDER)
    bad_cat = sorted(df.loc[df["category_ordinal"].isna(), "Category"].unique())
    check("every Category ordinal-encoded", not bad_cat, f"unmapped: {bad_cat}")

    # damage_rate: Houses damaged / Total Houses, guarded. Total==0 -> 0 (damaged is 0 too).
    total, dmg = df["Total Houses"], df["Houses damaged"]
    df["damage_rate"] = np.where(total > 0, dmg / total, 0.0).clip(0.0, 1.0)

    # HOOK (deferred): cyclone-name -> HDX wind-footprint join. When footprints arrive, map
    # (Cyclone Name, Year) -> per-province max wind and add e.g. df["max_wind_kmh"] here.
    # Category already covers intensity for now, so this is NOT required.

    out = pd.DataFrame({
        "cyclone_name": df["Cyclone Name"],
        "year": df["Year"].astype(int),
        "province": df["Province"],
        "province_psgc": df["province_psgc"],
        # features (null-free)
        "category": df["Category"],
        "category_ordinal": df["category_ordinal"].astype("Int64"),
        "total_houses": df["Total Houses"].round().astype("Int64"),
        "province_housing_units": df["province_housing_units"].round().astype("Int64"),
        "province_households": df["province_households"].round().astype("Int64"),
        "structural_vuln_frac": df["structural_vuln_frac"].round(4),
        "unimproved_water_frac": df["unimproved_water_frac"].round(4),
        # targets
        "damage_rate": df["damage_rate"].round(4),
        "affected": df["Affected"].round().astype("Int64"),
        # traceability
        "deaths": df["Deaths"].round().astype("Int64"),
        "houses_damaged": df["Houses damaged"].round().astype("Int64"),
        "houses_destroyed": df["Houses destroyed"].round().astype("Int64"),
    }).sort_values(["year", "cyclone_name", "province"]).reset_index(drop=True)
    return out


def acceptance(out: pd.DataFrame) -> None:
    banner("Acceptance checks")
    nulls = {c: int(out[c].isna().sum()) for c in FEATURE_COLS if out[c].isna().any()}
    check("no nulls in feature columns", not nulls, f"nulls: {nulls or 'none'}")
    dr = out["damage_rate"]
    check("damage_rate within [0, 1]", bool(((dr >= 0) & (dr <= 1)).all()),
          f"min {dr.min():.3f}, max {dr.max():.3f}")
    check("one row per province-event", int(out.duplicated(
        ["cyclone_name", "year", "province"]).sum()) == 0, f"{len(out)} rows")
    print(f"  row count: {len(out)}  |  storms: {out['cyclone_name'].nunique()}  |  "
          f"provinces: {out['province'].nunique()}  |  years: "
          f"{out['year'].min()}–{out['year'].max()}")


def print_data_dictionary() -> None:
    banner("Data dictionary (out/training_table.csv)")
    print("""  keys
    cyclone_name           storm name (PAGASA)
    year                   storm year
    province               impact-CSV province name (reconciled to HDX)
    province_psgc          PSGC province code (HDX), traceability
  features (null-free, model inputs)
    category               PAGASA intensity label
    category_ordinal       0 TD < 1 TS < 2 STS < 3 strong < 4 very strong < 5 violent
    total_houses           houses in the affected area for the event (impact CSV)
    province_housing_units national housing units, summed to province (HDX) — scale proxy
    province_households     national households, summed to province (HDX) — scale proxy
    structural_vuln_frac   1 − (strong-roof & strong-wall share) of province housing [0,1]
    unimproved_water_frac  households on natural/peddler water sources, province share [0,1]
  targets
    damage_rate            Houses damaged / Total Houses, guarded to [0,1] — PRIMARY
    affected               raw affected population — alternate target
  traceability
    deaths, houses_damaged, houses_destroyed   raw event counts

  Notes: province population uses HDX household/housing counts (no national PSA file in
  raw/, only Cebu-City barangays). Metro Manila = sum of HDX NCR 2nd/3rd/4th districts
  (NCR 1st/Manila is absent in HDX, so its totals are mildly understated). Wind-footprint
  join is a deferred hook; Category covers intensity for now.""")


def main() -> int:
    print("LUWAS Phase 1.3 — build the impact-model training table")
    impact = load_impact()
    prov = build_province_features()
    out = assemble(impact, prov)
    acceptance(out)

    OUT.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT_CSV, index=False)
    print(f"\n  wrote {len(out)} rows -> {OUT_CSV.relative_to(SCRIPT_DIR.parent)}")
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
