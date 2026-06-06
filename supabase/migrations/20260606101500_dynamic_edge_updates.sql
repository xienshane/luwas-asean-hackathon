-- LUWAS — Phase 2.6: pgRouting dynamic edge updates
--
-- When a volunteer flags a road segment impassable — field_reports.road_impassable
-- = true with impassable_edge_id pointing at the matching road_edges row — a trigger
-- raises that edge's cost and reverse_cost to a sentinel "blocked" value so subsequent
-- pgr_dijkstra routing avoids it. The edge's real costs are preserved in
-- road_edges.original_cost / original_reverse_cost (columns shipped in the 0.2 schema)
-- so a coordinator can clear the flag and restore the road. Pure DB logic — no external
-- API (CLAUDE.md > Rules: real roads only; AI/derived outputs are assistive/overridable).
--
-- Blocking uses a very high FINITE cost (not edge removal): routing avoids the segment
-- whenever an alternative exists, but a barangay with no other road is not stranded — it
-- still routes over the flagged edge, with a clear cost signal downstream.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Block / restore a single edge — idempotent and reversible.
-- ---------------------------------------------------------------------------
create or replace function public.set_edge_impassable(
  p_edge_id    bigint,
  p_impassable boolean default true,
  p_report_id  uuid    default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  blocked_cost constant double precision := 1e9;  -- "very high"; avoid-if-possible
begin
  if p_impassable then
    -- Save the baseline ONCE (guard on impassable = false so repeat flags from
    -- multiple volunteers never overwrite the real cost with the sentinel), then block.
    update public.road_edges e
       set original_cost         = coalesce(e.original_cost, e.cost),
           original_reverse_cost = coalesce(e.original_reverse_cost, e.reverse_cost),
           cost                  = blocked_cost,
           reverse_cost          = case when e.reverse_cost is null
                                        then null else blocked_cost end,
           impassable            = true
     where e.id = p_edge_id
       and e.impassable = false;
  else
    -- Restore the saved baseline and clear the flag (only if currently blocked).
    update public.road_edges e
       set cost                  = e.original_cost,
           reverse_cost          = e.original_reverse_cost,
           original_cost         = null,
           original_reverse_cost = null,
           impassable            = false
     where e.id = p_edge_id
       and e.impassable = true;
  end if;
end;
$$;

comment on function public.set_edge_impassable(bigint, boolean, uuid) is
  'Phase 2.6: block (very high cost) or restore one road_edges row; idempotent, reversible.';

-- ---------------------------------------------------------------------------
-- 2. Trigger — a report flagging a segment impassable blocks the matching edge.
-- ---------------------------------------------------------------------------
create or replace function public.field_report_block_edge()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.road_impassable and new.impassable_edge_id is not null then
    perform public.set_edge_impassable(new.impassable_edge_id, true, new.id);
  end if;
  return new;
end;
$$;

comment on function public.field_report_block_edge() is
  'Phase 2.6 trigger fn: blocks the reported road_edges row when a report flags it impassable.';

drop trigger if exists field_reports_block_edge on public.field_reports;
create trigger field_reports_block_edge
  after insert or update of road_impassable, impassable_edge_id
  on public.field_reports
  for each row
  execute function public.field_report_block_edge();

-- ---------------------------------------------------------------------------
-- 3. Privileges
-- ---------------------------------------------------------------------------
-- The trigger fn is SECURITY DEFINER so a volunteer's field_reports insert can update
-- the routing graph without direct write access to road_edges (RLS narrows that to the
-- coordinator). set_edge_impassable is server/coordinator-only — not a public RPC.
revoke execute on function public.set_edge_impassable(bigint, boolean, uuid) from public;
grant  execute on function public.set_edge_impassable(bigint, boolean, uuid) to service_role;
revoke execute on function public.field_report_block_edge() from public;
