"""OR-Tools VRP solver: multi-team dispatch over a real-road cost matrix.

Solves a capacitated vehicle-routing problem where the arc costs are the pgRouting
`pgr_dijkstraCostMatrix` (real-road travel seconds) passed in the request — the solver
never computes Euclidean distance (CLAUDE.md > Rules). Per-stop cargo demand comes from
the Sphere manifest (2.3); the Silent Area score (2.1) is used as a drop penalty so that,
when capacity is short, the lowest-priority stops are skipped first.

`ortools` is imported lazily so the FastAPI app still boots if the wheel is missing.
"""
import logging
import math
import time

from app.models.routing import (
    OptimizeRoutesRequest,
    OptimizeRoutesResponse,
    StopVisit,
    VehicleRoute,
)

logger = logging.getLogger("luwas.routing")

# Drop-penalty model: dropping any stop costs DROP_PENALTY_BASE (far above any travel
# cost, so stops are dropped only when capacity forces it) plus priority*PRIORITY_WEIGHT,
# so among forced drops the solver sheds the LOWEST-priority (lowest Silent Area) stops.
DROP_PENALTY_BASE = 10_000_000
PRIORITY_WEIGHT = 1_000_000


def solve_routes(req: OptimizeRoutesRequest) -> OptimizeRoutesResponse:
    """Optimize per-team routes. Pure & offline — no model, no network."""
    t0 = time.perf_counter()
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2

    n = len(req.stops)
    num_vehicles = len(req.vehicles)
    depot = req.depot_index

    # Integer cost matrix (OR-Tools works in integers); real-road seconds, never Euclidean.
    matrix = [[int(round(c)) for c in row] for row in req.cost_matrix]
    # Demand is rounded UP (never under-provision capacity); the depot never has demand.
    demands = [0 if i == depot else math.ceil(req.stops[i].demand_kg) for i in range(n)]
    capacities = [int(v.capacity_kg) for v in req.vehicles]  # floor: don't over-promise

    manager = pywrapcp.RoutingIndexManager(n, num_vehicles, depot)
    routing = pywrapcp.RoutingModel(manager)

    def transit_cb(from_index: int, to_index: int) -> int:
        return matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

    transit_idx = routing.RegisterTransitCallback(transit_cb)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_idx)

    def demand_cb(from_index: int) -> int:
        return demands[manager.IndexToNode(from_index)]

    demand_idx = routing.RegisterUnaryTransitCallback(demand_cb)
    routing.AddDimensionWithVehicleCapacity(
        demand_idx, 0, capacities, True, "Capacity"
    )

    if req.allow_dropping_stops:
        for node in range(n):
            if node == depot:
                continue
            penalty = DROP_PENALTY_BASE + int(round(req.stops[node].priority * PRIORITY_WEIGHT))
            routing.AddDisjunction([manager.NodeToIndex(node)], penalty)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    params.time_limit.FromMilliseconds(req.solve_time_limit_ms)

    solution = routing.SolveWithParameters(params)
    latency_ms = round((time.perf_counter() - t0) * 1000, 2)

    if solution is None:
        return OptimizeRoutesResponse(
            routes=[], dropped_stop_ids=[s.id for i, s in enumerate(req.stops) if i != depot],
            served_count=0, dropped_count=n - 1, total_travel_seconds=0,
            solver_status="INFEASIBLE", latency_ms=latency_ms,
        )

    routes: list[VehicleRoute] = []
    served: set[int] = set()
    for v in range(num_vehicles):
        index = routing.Start(v)
        prev_node = manager.IndexToNode(index)  # depot
        clock = 0          # seconds since departing the depot
        total_travel = 0
        load = 0.0
        visits: list[StopVisit] = []

        index = solution.Value(routing.NextVar(index))
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            leg = matrix[prev_node][node]
            clock += leg
            total_travel += leg
            s = req.stops[node]
            load += s.demand_kg
            visits.append(StopVisit(
                seq=len(visits) + 1, stop_id=s.id, name=s.name,
                arrival_seconds=clock, travel_seconds=leg,
                demand_kg=s.demand_kg, cumulative_load_kg=round(load, 2),
            ))
            served.add(node)
            clock += s.service_seconds  # depart after unloading
            prev_node = node
            index = solution.Value(routing.NextVar(index))

        return_leg = matrix[prev_node][depot]
        total_travel += return_leg
        routes.append(VehicleRoute(
            vehicle_id=req.vehicles[v].id, stops=visits,
            total_travel_seconds=total_travel, finish_seconds=clock + return_leg,
            total_cargo_kg=round(load, 2), capacity_kg=req.vehicles[v].capacity_kg,
        ))

    dropped = [s.id for i, s in enumerate(req.stops) if i != depot and i not in served]
    return OptimizeRoutesResponse(
        routes=routes, dropped_stop_ids=dropped,
        served_count=len(served), dropped_count=len(dropped),
        total_travel_seconds=sum(r.total_travel_seconds for r in routes),
        solver_status="SUCCESS", latency_ms=latency_ms,
    )
