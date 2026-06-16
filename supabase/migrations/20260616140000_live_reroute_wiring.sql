-- LUWAS — Phase 4.5: live dynamic re-route wiring (Issue 5)
--
-- Builds on Phase 2.6 (20260606101500_dynamic_edge_updates.sql). Two additions, both
-- pure DB (CLAUDE.md > Rules: real roads only; no external API):
--
-- 1. ATTRIBUTION. set_edge_impassable() now records who blocked an edge, when, and why
--    (road_edges.blocked_by / blocked_at / block_reason) so every block/restore is logged
--    and attributable. Restoring clears them alongside the cost.
-- 2. VOLUNTEER AUTO-SNAP. A field report can flag a road impassable without naming an
--    edge — volunteers don't pick a road_edges row. When such a report carries a GPS
--    location, the trigger snaps it to the nearest edge (nearest_road_edge), writes that
--    id back onto the report, and blocks the edge attributed to the reporter. Coordinator
--    blocks come through set_edge_impassable directly (see web/app/api/road-status).

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 0. Attribution columns on the edge (audit, not referential — stores the actor's
--    uuid whether a coordinator user or a volunteer reporter).
-- ---------------------------------------------------------------------------
alter table public.road_edges
  add column if not exists blocked_by   uuid,
  add column if not exists blocked_at   timestamptz,
  add column if not exists block_reason text;

comment on column public.road_edges.blocked_by   is 'Phase 4.5: actor uuid who blocked this edge (coordinator user or volunteer reporter).';
comment on column public.road_edges.blocked_at   is 'Phase 4.5: when the edge was blocked.';
comment on column public.road_edges.block_reason is 'Phase 4.5: why the edge was blocked (free text / source).';

-- ---------------------------------------------------------------------------
-- 1. Nearest-edge snap helper — KNN on geom (same <-> pattern as pipeline_cost_matrix).
-- ---------------------------------------------------------------------------
create or replace function public.nearest_road_edge(p_location geometry)
returns bigint
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select e.id
    from public.road_edges e
   where e.geom is not null
   order by e.geom <-> p_location
   limit 1;
$$;

comment on function public.nearest_road_edge(geometry) is
  'Phase 4.5: snap a point to the id of the closest road_edges row (KNN on geom).';

-- ---------------------------------------------------------------------------
-- 2. Block / restore one edge — now attributed. Idempotent and reversible.
--    Drops the 3-arg 2.6 signature; the new defaults keep 2- and 3-arg calls working.
-- ---------------------------------------------------------------------------
drop function if exists public.set_edge_impassable(bigint, boolean, uuid);

create or replace function public.set_edge_impassable(
  p_edge_id    bigint,
  p_impassable boolean default true,
  p_report_id  uuid    default null,
  p_actor      uuid    default null,
  p_reason     text    default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  blocked_cost constant double precision := 1e9;  -- "very high"; avoid-if-possible
begin
  if p_impassable then
    -- Save the baseline ONCE (guard on impassable = false so repeat flags never
    -- overwrite the real cost with the sentinel), then block + attribute.
    update public.road_edges e
       set original_cost         = coalesce(e.original_cost, e.cost),
           original_reverse_cost = coalesce(e.original_reverse_cost, e.reverse_cost),
           cost                  = blocked_cost,
           reverse_cost          = case when e.reverse_cost is null
                                        then null else blocked_cost end,
           impassable            = true,
           blocked_by            = p_actor,
           blocked_at            = now(),
           block_reason          = p_reason
     where e.id = p_edge_id
       and e.impassable = false;
  else
    -- Restore the saved baseline and clear the flag + attribution (only if blocked).
    update public.road_edges e
       set cost                  = e.original_cost,
           reverse_cost          = e.original_reverse_cost,
           original_cost         = null,
           original_reverse_cost = null,
           impassable            = false,
           blocked_by            = null,
           blocked_at            = null,
           block_reason          = null
     where e.id = p_edge_id
       and e.impassable = true;
  end if;
end;
$$;

comment on function public.set_edge_impassable(bigint, boolean, uuid, uuid, text) is
  'Phase 4.5: block (very high cost) or restore one road_edges row, recording attribution; idempotent, reversible.';

-- ---------------------------------------------------------------------------
-- 3. Trigger — a report flagging a segment impassable blocks the matching edge,
--    auto-snapping to the nearest edge when none was named. BEFORE so the resolved
--    edge id is written back onto the report row.
-- ---------------------------------------------------------------------------
create or replace function public.field_report_block_edge()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.road_impassable then
    -- Volunteers don't pick an edge: snap a located report to the nearest one.
    if new.impassable_edge_id is null and new.location is not null then
      new.impassable_edge_id := public.nearest_road_edge(new.location);
    end if;
    if new.impassable_edge_id is not null then
      perform public.set_edge_impassable(
        new.impassable_edge_id, true, new.id,
        new.reporter_id, 'volunteer field report'
      );
    end if;
  end if;
  return new;
end;
$$;

comment on function public.field_report_block_edge() is
  'Phase 4.5 trigger fn: snaps a located impassable report to the nearest edge and blocks it.';

drop trigger if exists field_reports_block_edge on public.field_reports;
create trigger field_reports_block_edge
  before insert or update of road_impassable, impassable_edge_id, location
  on public.field_reports
  for each row
  execute function public.field_report_block_edge();

-- ---------------------------------------------------------------------------
-- 4. Privileges — set_edge_impassable stays server/coordinator-only (not a public RPC);
--    the trigger fn is SECURITY DEFINER so a volunteer insert can update the graph.
-- ---------------------------------------------------------------------------
revoke execute on function public.set_edge_impassable(bigint, boolean, uuid, uuid, text) from public;
grant  execute on function public.set_edge_impassable(bigint, boolean, uuid, uuid, text) to service_role;
revoke execute on function public.nearest_road_edge(geometry) from public;
grant  execute on function public.nearest_road_edge(geometry) to service_role;
revoke execute on function public.field_report_block_edge() from public;
