"""API-level tests for POST /parse.

The app's real parser (built from .env keys) is replaced with a fake-backed one so these
run offline and deterministically. DISABLE_TABPFN avoids loading torch in the lifespan.
"""
import os

os.environ["DISABLE_TABPFN"] = "true"  # must be set before app/Settings construction

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.rate_limiter import RateLimiter
from app.main import app
from app.services.parser import Parser

REPLY_HIGH = (
    '{"location":"Barangay Apas, Cebu City","population_estimate":500,'
    '"needs_severity":"high","road_status":"impassable",'
    '"confidence":{"location":0.95,"population_estimate":0.7,'
    '"needs_severity":0.85,"road_status":0.9},"overall_confidence":0.82}'
)
REPLY_LOW = REPLY_HIGH.replace('"overall_confidence":0.82', '"overall_confidence":0.3')


class FakeBackend:
    def __init__(self, name: str, reply: str):
        self.name = name
        self._reply = reply

    def complete(self, system: str, user: str) -> str:
        return self._reply


def install_parser(reply: str) -> None:
    app.state.parser = Parser(
        Settings(), primary=FakeBackend("sea-lion", reply), fallback=None,
        rate_limiter=RateLimiter(10, 60, now=lambda: 0.0, sleep=lambda dt: None),
    )


class FailingBackend:
    """A backend whose every call raises — used to force the fallback path."""

    def __init__(self, name: str, error: Exception):
        self.name = name
        self._error = error

    def complete(self, system: str, user: str) -> str:
        raise self._error


def install_parser_with_fallback(primary_error: Exception, fallback_reply: str) -> None:
    app.state.parser = Parser(
        Settings(),
        primary=FailingBackend("sea-lion", primary_error),
        fallback=FakeBackend("gemini", fallback_reply),
        rate_limiter=RateLimiter(10, 60, now=lambda: 0.0, sleep=lambda dt: None),
    )


@pytest.fixture()
def client():
    with TestClient(app) as c:  # lifespan builds the real parser; we override it below
        yield c


def test_parse_ok(client):
    install_parser(REPLY_HIGH)
    r = client.post("/parse", json={"text": "Grabe ang baha sa Apas, 500 katawo, dili maagian",
                                    "id": "r1"})
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "sea-lion"
    assert body["id"] == "r1"
    assert body["needs_review"] is False
    fr = body["field_report"]
    assert fr["source"] == "parsed"
    assert fr["location_text"] == "Barangay Apas, Cebu City"
    assert fr["needs_severity"] == "high"
    assert fr["road_status"] == "impassable"
    assert fr["road_impassable"] is True
    assert fr["status"] == "pending"


def test_parse_low_confidence_flagged(client):
    install_parser(REPLY_LOW)
    r = client.post("/parse", json={"text": "vague"})
    assert r.status_code == 200
    body = r.json()
    assert body["needs_review"] is True
    assert body["field_report"]["status"] == "flagged"


def test_parse_falls_back_to_gemini_through_the_route(client):
    install_parser_with_fallback(RuntimeError("sea-lion 503"), REPLY_HIGH)
    r = client.post("/parse", json={"text": "Grabe ang baha sa Apas, 500 katawo"})
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "gemini"
    assert body["field_report"]["needs_severity"] == "high"
    assert body["needs_review"] is False


def test_parse_rejects_empty_text(client):
    r = client.post("/parse", json={"text": ""})
    assert r.status_code == 422


def test_translate_ok(client):
    install_parser('{"translated_text": "Severe flooding in Apas", "is_english": false}')
    r = client.post("/translate", json={"text": "Grabe ang baha sa Apas", "id": "t1"})
    assert r.status_code == 200
    body = r.json()
    assert body["translated_text"] == "Severe flooding in Apas"
    assert body["provider"] == "sea-lion"
    assert body["id"] == "t1"


def test_translate_already_english_returns_null(client):
    install_parser('{"translated_text": "Flooding in Apas", "is_english": true}')
    r = client.post("/translate", json={"text": "Flooding in Apas"})
    assert r.status_code == 200
    assert r.json()["translated_text"] is None


def test_translate_rejects_empty_text(client):
    r = client.post("/translate", json={"text": ""})
    assert r.status_code == 422


def test_health_reports_parse_providers(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert "parse_providers" in r.json()
