-- The coordinator map subscribes to facility_stock (depot on-hand drives manifest coverage),
-- but the table was never added to the Realtime publication, so that subscription could never
-- fire. Publish it alongside the other tables the live plan watches.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'facility_stock'
  ) then
    alter publication supabase_realtime add table public.facility_stock;
  end if;
end$$;
