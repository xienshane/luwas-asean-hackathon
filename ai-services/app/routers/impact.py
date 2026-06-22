"""POST /predict-impact — TabPFN (or heuristic) impact prediction."""
import time

from fastapi import APIRouter, Depends, Request

from app.models.impact import PredictImpactRequest, PredictImpactResponse
from app.services.impact_model import ImpactPredictor

router = APIRouter()


def get_predictor(request: Request) -> ImpactPredictor:
    return request.app.state.predictor


@router.post("/predict-impact", response_model=PredictImpactResponse)
def predict_impact(
    req: PredictImpactRequest,
    predictor: ImpactPredictor = Depends(get_predictor),
) -> PredictImpactResponse:
    t0 = time.perf_counter()
    predictions = predictor.predict(req.features)
    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    return PredictImpactResponse(
        predictions=predictions,
        model_framing=predictor.settings.model_framing,
        latency_ms=latency_ms,
    )
