from fastapi.testclient import TestClient
from app.main import app


def test_build_manifest_returns_itemized_manifest():
    with TestClient(app) as client:
        resp = client.post("/build-manifest", json={"predicted_affected": 1000, "days": 3})
        assert resp.status_code == 200
        body = resp.json()
        assert body["predicted_affected"] == 1000
        assert body["days"] == 3
        # Sphere: 1000 * 15 L/day * 3 days = 45000 L
        water = next(l for l in body["lines"] if l["category"] == "water")
        assert water["quantity"] == 45000
        assert body["total_weight_kg"] > 0


def test_build_manifest_rejects_bad_input():
    with TestClient(app) as client:
        assert client.post("/build-manifest", json={"predicted_affected": -1, "days": 3}).status_code == 422
