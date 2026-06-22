"""LUWAS AI services — FastAPI entry point.

One Hugging Face Space (Docker SDK) mounts all three routers here: impact, routing, parse.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import Settings
from app.routers import impact, parse, routing, supply
from app.services.impact_model import ImpactPredictor
from app.services.parser import build_parser


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    predictor = ImpactPredictor(settings)
    predictor.warmup()  # loads TabPFN context once; no-op when disabled/unavailable
    app.state.predictor = predictor
    app.state.parser = build_parser(settings)  # SEA-LION primary, Gemini fallback
    yield


app = FastAPI(title="LUWAS AI services", version="0.1.0", lifespan=lifespan)
app.include_router(impact.router)
app.include_router(routing.router)
app.include_router(parse.router)
app.include_router(supply.router)


@app.get("/health")
def health():
    predictor: ImpactPredictor = app.state.predictor
    parser = app.state.parser
    return {
        "status": "ok",
        "model_framing": predictor.settings.model_framing,
        "tabpfn_active": predictor.tabpfn_active,
        "parse_providers": {
            "sea_lion": parser.primary is not None,
            "gemini": parser.fallback is not None,
        },
    }
