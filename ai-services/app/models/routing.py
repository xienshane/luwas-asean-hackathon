"""API contracts for the OR-Tools VRP solver — SOURCE OF TRUTH (mirror in web/lib/types).

Multi-team dispatch over real roads. The `cost_matrix` is the pgRouting
`pgr_dijkstraCostMatrix` output (real-road travel seconds) supplied by the caller — the
solver NEVER computes Euclidean distance (CLAUDE.md > Rules). Per-stop `demand_kg` comes
from the Sphere manifest (Phase 2.3) and `priority` from the Silent Area score (Phase 2.1).
"""
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class RouteStop(BaseModel):
    """One node in the network. The depot is `stops[depot_index]` (its demand is ignored)."""

    id: str
    name: Optional[str] = None
    demand_kg: float = Field(0.0, ge=0.0, description="cargo demand (Sphere manifest total_weight_kg)")
    priority: float = Field(
        0.0, ge=0.0, description="Silent Area score; higher = less likely to be dropped"
    )
    service_seconds: int = Field(0, ge=0, description="unload time at the stop, added to ETAs")


class Vehicle(BaseModel):
    id: str
    capacity_kg: float = Field(..., gt=0.0)


class OptimizeRoutesRequest(BaseModel):
    stops: list[RouteStop] = Field(..., min_length=2, description="depot + delivery stops")
    cost_matrix: list[list[float]] = Field(
        ..., description="N×N real-road pgRouting agg_cost in seconds; aligned to `stops`. NEVER Euclidean."
    )
    vehicles: list[Vehicle] = Field(..., min_length=1)
    depot_index: int = Field(0, ge=0, description="index into `stops` that every vehicle starts/ends at")
    allow_dropping_stops: bool = Field(
        True, description="if True, low-priority stops may be skipped when capacity is short"
    )
    solve_time_limit_ms: int = Field(
        200, ge=10, le=5000, description="OR-Tools search budget (keeps the <500ms acceptance)"
    )

    @model_validator(mode="after")
    def _check_shape(self) -> "OptimizeRoutesRequest":
        n = len(self.stops)
        if len(self.cost_matrix) != n or any(len(row) != n for row in self.cost_matrix):
            raise ValueError(f"cost_matrix must be {n}x{n} to match stops")
        if not (0 <= self.depot_index < n):
            raise ValueError(f"depot_index {self.depot_index} out of range [0,{n})")
        return self


class StopVisit(BaseModel):
    """One served stop on a vehicle's route, in visit order."""

    seq: int = Field(..., ge=1, description="1-based position on the route")
    stop_id: str
    name: Optional[str] = None
    arrival_seconds: int = Field(..., ge=0, description="ETA = cumulative travel + service")
    travel_seconds: int = Field(..., ge=0, description="leg cost from the previous node (matches matrix)")
    demand_kg: float = Field(..., ge=0.0)
    cumulative_load_kg: float = Field(..., ge=0.0, description="cargo delivered up to and incl. this stop")


class VehicleRoute(BaseModel):
    vehicle_id: str
    stops: list[StopVisit] = Field(..., description="ordered delivery stops (depot excluded; empty if unused)")
    total_travel_seconds: int = Field(..., ge=0, description="sum of legs incl. return to depot")
    finish_seconds: int = Field(..., ge=0, description="time back at depot (travel + service)")
    total_cargo_kg: float = Field(..., ge=0.0)
    capacity_kg: float = Field(..., gt=0.0)


class OptimizeRoutesResponse(BaseModel):
    routes: list[VehicleRoute]
    dropped_stop_ids: list[str] = Field(..., description="stops not served (capacity-limited)")
    served_count: int = Field(..., ge=0)
    dropped_count: int = Field(..., ge=0)
    total_travel_seconds: int = Field(..., ge=0, description="sum across all vehicle routes")
    solver_status: str = Field(..., description='"SUCCESS" or "INFEASIBLE"')
    latency_ms: float
