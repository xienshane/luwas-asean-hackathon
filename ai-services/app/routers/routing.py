"""POST /optimize-routes — OR-Tools multi-team VRP over a real-road cost matrix."""
from fastapi import APIRouter

from app.models.routing import OptimizeRoutesRequest, OptimizeRoutesResponse
from app.services.route_solver import solve_routes

router = APIRouter()


@router.post("/optimize-routes", response_model=OptimizeRoutesResponse)
def optimize_routes(req: OptimizeRoutesRequest) -> OptimizeRoutesResponse:
    return solve_routes(req)
