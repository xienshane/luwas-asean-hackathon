-- Block a set of road edges named by a volunteer's report. Ownership-checked (the caller must
-- own the report) and attributed to the reporter. set_edge_impassable is idempotent, so blocking
-- an edge the BEFORE-INSERT trigger already blocked (impassable_edge_id = ids[0]) is a no-op.
create or replace function public.block_edges_for_report(p_report_id uuid, p_edge_ids bigint[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_reporter uuid; eid bigint; n int := 0;
begin
  select reporter_id into v_reporter from public.field_reports where id = p_report_id;
  if v_reporter is null then raise exception 'block_edges_for_report: unknown report'; end if;
  if v_reporter <> auth.uid() then raise exception 'block_edges_for_report: forbidden'; end if;

  foreach eid in array coalesce(p_edge_ids, '{}') loop
    perform public.set_edge_impassable(eid, true, p_report_id, v_reporter, 'volunteer field report');
    n := n + 1;
  end loop;
  return n;
end;
$function$;

revoke execute on function public.block_edges_for_report(uuid, bigint[]) from public;
grant  execute on function public.block_edges_for_report(uuid, bigint[]) to authenticated;
