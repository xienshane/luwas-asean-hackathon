// OR-Tools VRP solver API contract.
// MIRRORS ai-services/app/models/routing.py (the canonical source). Any change to one
// must update the other in the SAME commit (see CLAUDE.md > Rules).

/** One node in the network. The depot is `stops[depot_index]` (its demand is ignored). */
export interface RouteStop {
  id: string;
  name?: string | null;
  /** Cargo demand (Sphere manifest total_weight_kg). >= 0. */
  demand_kg?: number;
  /** Silent Area score; higher = less likely to be dropped. >= 0. */
  priority?: number;
  /** Unload time at the stop, added to ETAs. >= 0. */
  service_seconds?: number;
}

export interface Vehicle {
  id: string;
  capacity_kg: number;
}

export interface OptimizeRoutesRequest {
  /** Depot + delivery stops (>= 2). */
  stops: RouteStop[];
  /** N×N real-road pgRouting agg_cost in seconds, aligned to `stops`. NEVER Euclidean. */
  cost_matrix: number[][];
  vehicles: Vehicle[];
  /** Index into `stops` that every vehicle starts/ends at. Defaults to 0. */
  depot_index?: number;
  /** If true, low-priority stops may be skipped when capacity is short. Defaults to true. */
  allow_dropping_stops?: boolean;
  /** OR-Tools search budget in ms (keeps the <500ms acceptance). Defaults to 200. */
  solve_time_limit_ms?: number;
}

/** One served stop on a vehicle's route, in visit order. */
export interface StopVisit {
  /** 1-based position on the route. */
  seq: number;
  stop_id: string;
  name?: string | null;
  /** ETA = cumulative travel + service. */
  arrival_seconds: number;
  /** Leg cost from the previous node (matches the cost matrix). */
  travel_seconds: number;
  demand_kg: number;
  /** Cargo delivered up to and including this stop. */
  cumulative_load_kg: number;
}

export interface VehicleRoute {
  vehicle_id: string;
  /** Ordered delivery stops (depot excluded; empty if the vehicle is unused). */
  stops: StopVisit[];
  /** Sum of legs incl. return to depot. */
  total_travel_seconds: number;
  /** Time back at depot (travel + service). */
  finish_seconds: number;
  total_cargo_kg: number;
  capacity_kg: number;
}

export interface OptimizeRoutesResponse {
  routes: VehicleRoute[];
  /** Stops not served (capacity-limited). */
  dropped_stop_ids: string[];
  served_count: number;
  dropped_count: number;
  /** Sum across all vehicle routes. */
  total_travel_seconds: number;
  /** "SUCCESS" or "INFEASIBLE". */
  solver_status: string;
  latency_ms: number;
}
