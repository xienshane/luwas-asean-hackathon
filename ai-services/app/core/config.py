"""Service configuration (pydantic-settings).

Values come from env / ai-services/.env, or can be passed directly for tests.
`protected_namespaces=()` is required because `model_framing` starts with `model_`,
which pydantic v2 otherwise reserves.
"""
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", protected_namespaces=()
    )

    # Which severity head TabPFN uses. `affected` is always regressed regardless.
    model_framing: Literal["regressor", "classifier"] = "regressor"

    # Training context for TabPFN's in-context learning (bundled into the image).
    training_table_path: str = "data/training_table.csv"

    tabpfn_device: str = "cpu"
    # Fewer estimators -> faster CPU inference (keeps the <2s budget on free CPU).
    tabpfn_n_estimators: int = 1
    # In-context training rows. TabPFN forward cost scales with context length; 128 keeps
    # CPU predict comfortably under the 2s budget. Phase 5.1 raises it (env) for accuracy.
    tabpfn_context_size: int = 128
    # Force the deterministic heuristic (skips torch entirely) — used by tests/CI.
    disable_tabpfn: bool = False

    # Fixed confidence reported by the heuristic fallback (coarse, model-free).
    heuristic_confidence: float = 0.25
