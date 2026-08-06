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

    # --- NLP parser (Phase 2.5): SEA-LION primary, Gemini fallback ----------
    # Keys come from ai-services/.env (SEA_LION_API_KEY, GEMINI_API_KEY).
    sea_lion_api_key: str = ""
    sea_lion_base_url: str = "https://api.sea-lion.ai/v1"
    sea_lion_model: str = "aisingapore/Gemma-SEA-LION-v4-27B-IT"
    sea_lion_max_calls_per_min: int = 10  # free-tier limit
    sea_lion_max_tokens: int = 400
    # 12 + gemini 6 < the web layer's 20s abort, so the fallback still lands in-window.
    sea_lion_timeout_s: float = 12.0
    # Only for `-R` reasoning models; empty = send nothing.
    sea_lion_thinking_mode: str = ""

    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    gemini_model: str = "gemini-2.5-flash"
    gemini_max_tokens: int = 400
    gemini_timeout_s: float = 6.0
    # Gemini 2.5 Flash charges *thinking* tokens against max_tokens while returning only the
    # visible reply, so at 400 the JSON truncates mid-object and the fallback never parses.
    # 0 disables thinking (whole reply, ~1.5s); -1 restores the model's dynamic budget.
    gemini_thinking_budget: int = 0

    # Extractions below this overall confidence are flagged for coordinator review.
    parse_confidence_threshold: float = 0.6
