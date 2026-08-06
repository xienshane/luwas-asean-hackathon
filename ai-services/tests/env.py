"""Test-environment scoping for DISABLE_TABPFN.

The API test modules need the heuristic path so their lifespan does not load torch.
Setting `os.environ["DISABLE_TABPFN"] = "true"` at import time did that — and left it
set for the rest of the process. Collection is alphabetical, so `test_api` poisoned
every later module: `measure_latency()` (scripts/evaluate_impact.py) builds a *fresh*
`Settings()`, read the leaked value, and silently benchmarked the heuristic fallback
while reporting it as TabPFN.

`monkeypatch.setenv` gives the same value with pytest restoring the environment after
each test, so the full suite is order-independent.

Import the fixture into a module to opt that module in:

    from .env import disable_tabpfn  # noqa: F401

It is autouse within the importing module. Depend on it explicitly from any fixture
that builds a `TestClient` — `Settings` is constructed in the app lifespan, so the
env must be in place before the client, not merely before import.
"""
import pytest


@pytest.fixture(autouse=True)
def disable_tabpfn(monkeypatch):
    monkeypatch.setenv("DISABLE_TABPFN", "true")
