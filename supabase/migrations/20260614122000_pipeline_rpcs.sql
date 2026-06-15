-- LUWAS — Phase 4.1: pipeline routing RPCs (real roads only; never Euclidean).
set search_path = public, extensions;

-- Snap each {lat,lng} point to the nearest pgRouting vertex, run a single
-- pgr_dijkstraCostMatrix over the real road graph, and return:
--   { "vids":[...], "meters":[[...]], "seconds":[[...]] }
-- aligned to the input order. Unreachable pairs -> sentinel 9_999_999 s so the
-- OR-Tools solver can drop the stop instead of failing. Cost in road_edges is
-- METRES (verified ~1.0/m); seconds = metres / (speed_kmh * 1000 / 3600).
create or replace function public.pipeline_cost_matrix(
  p_points    jsonb,
  p_speed_kmh numeric default 30
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  n            int := jsonb_array_length(p_points);
  vids         bigint[] := '{}';
  v            bigint;
  i            int;
  j            int;
  mps          double precision := greatest(p_speed_kmh, 1) * 1000.0 / 3600.0;
  meters       double precision[][];
  seconds      double precision[][];
  rec          record;
  idx_of       jsonb := '{}'::jsonb;  -- vid(text) -> first input index
begin
  if n is null or n < 1 then
    raise exception 'p_points must be a non-empty JSON array of {lat,lng}';
  end if;

  -- 1) snap each point to its nearest vertex (KNN on the_geom)
  for i in 0 .. n - 1 loop
    select pgrv.id into v
      from public.road_edges_vertices_pgr pgrv
     order by pgrv.the_geom <-> st_setsrid(st_makepoint(
                (p_points -> i ->> 'lng')::double precision,
                (p_points -> i ->> 'lat')::double precision), 4326)
     limit 1;
    vids := vids || v;
    if not (idx_of ? v::text) then
      idx_of := idx_of || jsonb_build_object(v::text, i);
    end if;
  end loop;

  -- 2) init matrices: diagonal 0, everything else sentinel
  meters  := array_fill(9999999::double precision, array[n, n]);
  seconds := array_fill(9999999::double precision, array[n, n]);
  for i in 1 .. n loop
    meters[i][i] := 0;
    seconds[i][i] := 0;
  end loop;

  -- 3) one cost matrix over the real graph (undirected; uses cost + reverse_cost)
  for rec in
    select m.start_vid, m.end_vid, m.agg_cost
      from pgr_dijkstraCostMatrix(
        'select id, source, target, cost, reverse_cost from public.road_edges',
        (select array_agg(distinct x) from unnest(vids) x),
        false) m
  loop
    -- map start/end vids back to EVERY input slot that snapped to them
    for i in 0 .. n - 1 loop
      if vids[i + 1] = rec.start_vid then
        for j in 0 .. n - 1 loop
          if vids[j + 1] = rec.end_vid and rec.agg_cost >= 0 then
            meters[i + 1][j + 1] := rec.agg_cost;
            seconds[i + 1][j + 1] := round(rec.agg_cost / mps);
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'vids',    to_jsonb(vids),
    'meters',  to_jsonb(meters),
    'seconds', to_jsonb(seconds)
  );
end;
$$;

comment on function public.pipeline_cost_matrix(jsonb, numeric) is
  'Phase 4.1: real-road N×N cost matrix (metres + seconds) for OR-Tools; snaps to nearest vertices.';

revoke execute on function public.pipeline_cost_matrix(jsonb, numeric) from public;
grant  execute on function public.pipeline_cost_matrix(jsonb, numeric) to service_role;

-- ===== A6 APPENDS pipeline_save_route BELOW =====
