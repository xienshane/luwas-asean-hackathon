"""API-level tests for POST /predict-impact and /health.

Run against the heuristic path (DISABLE_TABPFN=true) so no torch is needed here.
"""
import os

os.environ["DISABLE_TABPFN"] = "true"  # must be set before app/Settings construction

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:  # `with` runs the lifespan (predictor warm-up)
        yield c


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_predict_impact_batch(client):
    payload = {
        "features": [
            {"category_ordinal": 3, "total_houses": 1000, "province_housing_units": 50000,
             "province_households": 51000, "structural_vuln_frac": 0.20,
             "unimproved_water_frac": 0.10, "id": "brgy-A"},
            {"category_ordinal": 5, "total_houses": 4200, "province_housing_units": 80000,
             "province_households": 82000, "structural_vuln_frac": 0.55,
             "unimproved_water_frac": 0.30, "id": "brgy-B"},
        ]
    }
    r = client.post("/predict-impact", json=payload)
    assert r.status_code == 200
    body = r.json()

    assert body["model_framing"] == "regressor"
    assert isinstance(body["latency_ms"], (int, float))
    assert len(body["predictions"]) == 2

    # aligned by order, ids echoed
    assert [p["id"] for p in body["predictions"]] == ["brgy-A", "brgy-B"]
    for p in body["predictions"]:
        assert p["affected"] >= 0
        assert 0.0 <= p["confidence"] <= 1.0
        assert p["source"] in ("tabpfn", "heuristic")


def test_predict_impact_rejects_out_of_range_category(client):
    payload = {"features": [
        {"category_ordinal": 7, "total_houses": 1000, "province_housing_units": 50000,
         "province_households": 51000, "structural_vuln_frac": 0.20,
         "unimproved_water_frac": 0.10}
    ]}
    r = client.post("/predict-impact", json=payload)
    assert r.status_code == 422


def test_predict_impact_rejects_empty_batch(client):
    r = client.post("/predict-impact", json={"features": []})
    assert r.status_code == 422
