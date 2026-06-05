"""LUWAS AI services — FastAPI entry point.

One Hugging Face Space (Docker SDK) mounts the impact router here; routing.py and
parse.py mount alongside it in later phases.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import Settings
from app.routers import impact
from app.services.impact_model import ImpactPredictor


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    predictor = ImpactPredictor(settings)
    predictor.warmup()  # loads TabPFN context once; no-op when disabled/unavailable
    app.state.predictor = predictor
    yield


app = FastAPI(title="LUWAS AI services", version="0.1.0", lifespan=lifespan)
app.include_router(impact.router)


@app.get("/health")
def health():
    predictor: ImpactPredictor = app.state.predictor
    return {
        "status": "ok",
        "model_framing": predictor.settings.model_framing,
        "tabpfn_active": predictor.tabpfn_active,
    }
