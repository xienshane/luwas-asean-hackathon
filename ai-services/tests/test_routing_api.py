"""API-level tests for POST /optimize-routes.

DISABLE_TABPFN=true so the app lifespan doesn't load torch. Skipped (via importorskip)
where the ortools wheel isn't installed.
"""
import os

os.environ["DISABLE_TABPFN"] = "true"  # must be set before app/Settings construction

import pytest

pytest.importorskip("ortools")

from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def _payload():
    n = 6
    matrix = [[0 if i == j else 300 * abs(i - j) + 10 * (i + j) + 50 for j in range(n)]
              for i in range(n)]
    return {
        "stops": [{"id": "depot", "demand_kg": 0, "priority": 0}]
        + [{"id": f"brgy-{i}", "name": f"Barangay {i}", "demand_kg": 700,
            "priority": 0.5, "service_seconds": 60} for i in range(1, n)],
        "cost_matrix": matrix,
        "vehicles": [{"id": f"team-{v}", "capacity_kg": 3000} for v in range(2)],
        "depot_index": 0,
    }


def test_optimize_routes_ok(client):
    r = client.post("/optimize-routes", json=_payload())
    assert r.status_code == 200
    body = r.json()
    assert body["solver_status"] == "SUCCESS"
    assert body["served_count"] == 5
    assert body["dropped_count"] == 0
    assert isinstance(body["latency_ms"], (int, float))
    for route in body["routes"]:
        served = sum(v["demand_kg"] for v in route["stops"])
        assert served <= route["capacity_kg"]


def test_optimize_routes_rejects_bad_matrix(client):
    payload = _payload()
    payload["cost_matrix"] = [[0, 1], [1, 0]]  # 2x2, but 6 stops
    r = client.post("/optimize-routes", json=payload)
    assert r.status_code == 422
