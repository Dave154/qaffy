do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vendor_settlements'
  ) then
    alter publication supabase_realtime add table public.vendor_settlements;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vendor_settlement_transfers'
  ) then
    alter publication supabase_realtime add table public.vendor_settlement_transfers;
  end if;
end
$$;