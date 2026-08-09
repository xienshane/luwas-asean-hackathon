-- LUWAS — road closures: block the whole SPAN, and only on CONFIRMATION.
--
-- Two defects this fixes, both found while rehearsing the bridge-collapse beat.
--
-- 1. BLOCKING ONE EDGE DOES NOT CLOSE A DIVIDED ROAD. road_edges carries each
--    carriageway of a dual-carriageway road as its own row. Blocking the edge a
--    coordinator clicked (or a report named) leaves the twin open, and pgr_dijkstra
--    simply hops across: on the pilot route (HQ -> Catarman) blocking the 1,518 m
--    Cebu-Cordova Link Expressway main span left the route at 14.02 km, byte for
--    byte unchanged. Blocking both carriageways rerouted it to 17.99 km through
--    Mandaue and the old Mactan bridge — the honest answer. A coordinator who taps
--    "this bridge is gone" means the bridge, not one direction of it.
--
-- 2. AN UNCONFIRMED REPORT MUST NOT CLOSE A ROAD. field_reports_block_edge fired
--    BEFORE INSERT on any road_impassable report regardless of status, so an
--    unverified SMS could delete a corridor from the routing graph with nobody
--    having agreed to it. That contradicts the rule the rest of the system already
--    keeps: silent_area_score counts `status = 'confirmed'` contact only, precisely
--    so an unverified message cannot switch off an alarm. Same standard here — a
--    pending report is visible on the map and inert in the graph until a person
--    confirms it. (CLAUDE.md > Rules: all AI outputs are ASSISTIVE.)
--
--    The volunteer PWA path is deliberately NOT changed: web/app/api/reports calls
--    block_edges_for_report directly for edges the volunteer picked by hand while
--    standing at the closure. That is a first-party, ownership-checked act, not a
--    parsed inference, and it keeps blocking on submission.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. The span of a clicked/reported edge: that edge plus every same-named edge
--    lying wholly inside a narrow corridor around it — i.e. the opposite
--    carriageway and any sub-segment of the same physical stretch.
--
--    ST_CoveredBy (not a distance test) is what keeps this tight. A continuation
--    of the same road leaves the corridor within metres of the shared vertex and
--    is excluded; only geometry that runs alongside for its whole length is in.
--    Verified on CCLEX edge 108987: returns exactly {108987, 108988} (twin, 9 m
--    away), while the four adjoining CCLEX segments are all rejected. On ordinary
--    Cebu arterials the span comes back at 1-5 edges, never a whole road.
--
--    Limit, stated rather than hidden: a twin carriageway that OSM has split so
--    that one of its pieces extends past this edge's corridor will not be picked
--    up. The remedy is another tap, which is already how the control works.
-- ---------------------------------------------------------------------------
create or replace function public.road_span_edges(
  p_edge_id   bigint,
  p_radius_m  double precision default 25
) returns bigint[]
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    array(
      select e.id
        from public.road_edges e
        join public.road_edges src on src.id = p_edge_id
       where e.geom is not null
         and src.geom is not null
         and (e.id = src.id
              or (e.name is not null
                  and e.name = src.name
                  and st_dwithin(e.geom::geography, src.geom::geography, p_radius_m * 2)
                  and st_coveredby(e.geom, st_buffer(src.geom::geography, p_radius_m)::geometry)))
       order by e.id
    ),
    array[p_edge_id]
  );
$$;

comment on function public.road_span_edges(bigint, double precision) is
  'Every road_edges row belonging to the same physical stretch as p_edge_id (both carriageways). Used so one "block this road" gesture closes the road, not one direction of it.';

-- ---------------------------------------------------------------------------
-- 2. Block / restore a whole span. Thin fan-out over set_edge_impassable, which
--    stays the single-edge primitive and is already idempotent and reversible.
--    Returns the edge ids it touched so callers can name them.
-- ---------------------------------------------------------------------------
create or replace function public.set_span_impassable(
  p_edge_id    bigint,
  p_impassable boolean default true,
  p_report_id  uuid    default null,
  p_actor      uuid    default null,
  p_reason     text    default null
) returns bigint[]
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare ids bigint[]; eid bigint;
begin
  ids := public.road_span_edges(p_edge_id);
  foreach eid in array ids loop
    perform public.set_edge_impassable(eid, p_impassable, p_report_id, p_actor, p_reason);
  end loop;
  return ids;
end;
$$;

comment on function public.set_span_impassable(bigint, boolean, uuid, uuid, text) is
  'Block or restore every carriageway of the stretch p_edge_id belongs to (road_span_edges), attributed like set_edge_impassable.';

-- ---------------------------------------------------------------------------
-- 3. Trigger — snap on arrival, block on CONFIRMATION.
--
--    The snap still runs for a pending report so the queue can show which road the
--    report names while it waits. Only the graph edit waits for status='confirmed'.
-- ---------------------------------------------------------------------------
create or replace function public.field_report_block_edge()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.road_impassable then
    -- Volunteers don't pick an edge: snap a located report to the nearest one. This
    -- happens whatever the status, so a pending report already names its road.
    if new.impassable_edge_id is null and new.location is not null then
      new.impassable_edge_id := public.nearest_road_edge(new.location);
    end if;
    -- The graph edit is the coordinator's call, not the reporter's.
    if new.impassable_edge_id is not null and new.status = 'confirmed' then
      perform public.set_span_impassable(
        new.impassable_edge_id, true, new.id,
        new.reporter_id, 'confirmed field report'
      );
    end if;
  end if;
  return new;
end;
$$;

comment on function public.field_report_block_edge() is
  'Trigger fn: snaps a located impassable report to the nearest edge on arrival, and closes that span once the report is CONFIRMED.';

-- `status` joins the UPDATE column list — confirming a report is now what fires this.
drop trigger if exists field_reports_block_edge on public.field_reports;
create trigger field_reports_block_edge
  before insert or update of road_impassable, impassable_edge_id, location, status
  on public.field_reports
  for each row
  execute function public.field_report_block_edge();

-- ---------------------------------------------------------------------------
-- 4. The volunteer PWA path blocks spans too. Same defect, same fix: a volunteer
--    who picks the bridge they are standing next to means the bridge. The
--    ownership check and the immediate (unconfirmed) block are unchanged — see
--    the header note on why that path is deliberately not gated.
-- ---------------------------------------------------------------------------
create or replace function public.block_edges_for_report(p_report_id uuid, p_edge_ids bigint[])
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare v_reporter uuid; eid bigint; n int := 0;
begin
  select reporter_id into v_reporter from public.field_reports where id = p_report_id;
  if v_reporter is null then raise exception 'block_edges_for_report: unknown report'; end if;
  if v_reporter <> auth.uid() then raise exception 'block_edges_for_report: forbidden'; end if;

  foreach eid in array coalesce(p_edge_ids, '{}') loop
    n := n + coalesce(array_length(
      public.set_span_impassable(eid, true, p_report_id, v_reporter, 'volunteer field report'), 1), 0);
  end loop;
  return n;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Privileges — same posture as set_edge_impassable: server/coordinator-only.
-- ---------------------------------------------------------------------------
revoke execute on function public.road_span_edges(bigint, double precision) from public;
grant  execute on function public.road_span_edges(bigint, double precision) to service_role;
revoke execute on function public.set_span_impassable(bigint, boolean, uuid, uuid, text) from public;
grant  execute on function public.set_span_impassable(bigint, boolean, uuid, uuid, text) to service_role;
revoke execute on function public.block_edges_for_report(uuid, bigint[]) from public;
grant  execute on function public.block_edges_for_report(uuid, bigint[]) to authenticated;
