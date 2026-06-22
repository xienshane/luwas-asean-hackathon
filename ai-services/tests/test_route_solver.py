"""Unit tests for the OR-Tools VRP solver (Phase 2.4).

The solver consumes a real-road cost matrix (pgr_dijkstraCostMatrix, seconds) supplied in
the request — it never computes Euclidean distance itself. Acceptance: 3 teams across 10
barangays in <500ms; capacity never exceeded; reported leg costs match the input matrix.

Skipped (via importorskip) where the ortools wheel isn't installed.
"""
import time

import pytest

pytest.importorskip("ortools")

from app.models.routing import OptimizeRoutesRequest, RouteStop, Vehicle
from app.services.route_solver import solve_routes


def make_matrix(n: int) -> list[list[float]]:
    """A deterministic, symmetric stand-in for a pgRouting real-road cost matrix (seconds)."""
    return [[0 if i == j else 300 * abs(i - j) + 10 * (i + j) + 50 for j in range(n)]
            for i in range(n)]


def stop(i: int, demand: float = 0.0, priority: float = 0.0, service: int = 0) -> RouteStop:
    return RouteStop(id=f"brgy-{i}", name=f"Barangay {i}", demand_kg=demand,
                     priority=priority, service_seconds=service)


def ten_barangay_request(**overrides) -> OptimizeRoutesRequest:
    """Depot (node 0) + 10 barangay stops, 3 teams. Feasible: all stops fit."""
    n = 11
    stops = [stop(0)] + [stop(i, demand=800.0, priority=0.5) for i in range(1, n)]
    kwargs = dict(
        stops=stops,
        cost_matrix=make_matrix(n),
        vehicles=[Vehicle(id=f"team-{v}", capacity_kg=5000.0) for v in range(3)],
        depot_index=0,
    )
    kwargs.update(overrides)
    return OptimizeRoutesRequest(**kwargs)


def node_index_of(req: OptimizeRoutesRequest, stop_id: str) -> int:
    return next(i for i, s in enumerate(req.stops) if s.id == stop_id)


# --- acceptance: 3 teams / 10 barangays / <500ms ----------------------------

def test_three_teams_ten_barangays_under_500ms():
    req = ten_barangay_request()
    t0 = time.perf_counter()
    resp = solve_routes(req)
    elapsed = time.perf_counter() - t0
    print(f"\nVRP solve for 3 teams / 10 barangays: {elapsed*1000:.1f} ms")

    assert elapsed < 0.5, f"solve took {elapsed:.3f}s (>500ms)"
    assert resp.solver_status == "SUCCESS"
    assert len(resp.routes) == 3                  # one route per team
    assert resp.served_count == 10                # all barangays served (feasible)
    assert resp.dropped_count == 0


# --- capacity is never exceeded ---------------------------------------------

def test_vehicle_capacity_never_exceeded():
    req = ten_barangay_request()
    resp = solve_routes(req)
    for route in resp.routes:
        served = sum(v.demand_kg for v in route.stops)
        assert served <= route.capacity_kg, f"{route.vehicle_id} over capacity"
        assert route.total_cargo_kg == pytest.approx(served)


# --- reported leg costs match the real-road (pgRouting) matrix --------------

def test_leg_costs_match_input_matrix():
    req = ten_barangay_request()
    matrix = req.cost_matrix
    resp = solve_routes(req)

    for route in resp.routes:
        prev = req.depot_index
        legs_sum = 0
        for visit in route.stops:
            cur = node_index_of(req, visit.stop_id)
            assert visit.travel_seconds == matrix[prev][cur]   # real-road cost, not Euclidean
            legs_sum += visit.travel_seconds
            prev = cur
        legs_sum += matrix[prev][req.depot_index]              # return to depot
        assert route.total_travel_seconds == legs_sum


# --- ETAs accumulate travel + service along the route -----------------------

def test_etas_accumulate_travel_and_service():
    req = ten_barangay_request(
        stops=[stop(0)] + [stop(i, demand=800.0, priority=0.5, service=120) for i in range(1, 11)]
    )
    service_by_id = {s.id: s.service_seconds for s in req.stops}
    resp = solve_routes(req)

    for route in resp.routes:
        if not route.stops:
            continue
        assert route.stops[0].arrival_seconds == route.stops[0].travel_seconds
        for prev_v, cur_v in zip(route.stops, route.stops[1:]):
            expected = prev_v.arrival_seconds + service_by_id[prev_v.stop_id] + cur_v.travel_seconds
            assert cur_v.arrival_seconds == expected
            assert cur_v.arrival_seconds > prev_v.arrival_seconds


# --- priority decides who is dropped under capacity pressure ----------------

def test_drops_lowest_priority_stops_when_capacity_insufficient():
    # 3 vehicles x 1000 kg = 3000 capacity; 5 stops x 1000 kg = 5000 demand.
    # Each vehicle can carry exactly one stop -> 3 served, 2 dropped.
    priorities = {1: 0.9, 2: 0.8, 3: 0.7, 4: 0.2, 5: 0.1}
    stops = [stop(0)] + [stop(i, demand=1000.0, priority=priorities[i]) for i in range(1, 6)]
    req = OptimizeRoutesRequest(
        stops=stops, cost_matrix=make_matrix(6),
        vehicles=[Vehicle(id=f"team-{v}", capacity_kg=1000.0) for v in range(3)],
    )
    resp = solve_routes(req)

    assert resp.served_count == 3
    assert resp.dropped_count == 2
    assert set(resp.dropped_stop_ids) == {"brgy-4", "brgy-5"}   # the two lowest priorities
    for route in resp.routes:
        assert sum(v.demand_kg for v in route.stops) <= route.capacity_kg


# --- infeasible without dropping -------------------------------------------

def test_infeasible_when_dropping_disabled():
    req = OptimizeRoutesRequest(
        stops=[stop(0), stop(1, demand=1000.0), stop(2, demand=1000.0)],
        cost_matrix=make_matrix(3),
        vehicles=[Vehicle(id="team-0", capacity_kg=500.0)],
        allow_dropping_stops=False,
    )
    resp = solve_routes(req)
    assert resp.solver_status == "INFEASIBLE"
    assert resp.served_count == 0


# --- determinism ------------------------------------------------------------

def test_deterministic_served_set():
    a = solve_routes(ten_barangay_request())
    b = solve_routes(ten_barangay_request())
    served_a = sorted(v.stop_id for r in a.routes for v in r.stops)
    served_b = sorted(v.stop_id for r in b.routes for v in r.stops)
    assert served_a == served_b
    assert a.total_travel_seconds == b.total_travel_seconds


# --- contract validation ----------------------------------------------------

def test_rejects_non_square_matrix():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        OptimizeRoutesRequest(
            stops=[stop(0), stop(1, demand=100.0)],
            cost_matrix=[[0, 1, 2], [1, 0, 2]],            # 2x3, not 2x2
            vehicles=[Vehicle(id="t0", capacity_kg=1000.0)],
        )


def test_rejects_depot_index_out_of_range():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        OptimizeRoutesRequest(
            stops=[stop(0), stop(1, demand=100.0)],
            cost_matrix=make_matrix(2),
            vehicles=[Vehicle(id="t0", capacity_kg=1000.0)],
            depot_index=5,
        )
