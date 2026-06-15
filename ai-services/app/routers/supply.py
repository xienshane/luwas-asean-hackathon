"""POST /build-manifest — deterministic Sphere relief manifest."""
from fastapi import APIRouter

from app.models.supply import SupplyManifest, SupplyManifestRequest
from app.services.sphere_supply import sphere_supply

router = APIRouter()


@router.post("/build-manifest", response_model=SupplyManifest)
def build_manifest(req: SupplyManifestRequest) -> SupplyManifest:
    return sphere_supply(
        predicted_affected=req.predicted_affected,
        days=req.days,
        access_modifier=req.access_modifier,
        id=req.id,
    )
