create table if not exists public.order_confirmation_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  vendor_profile_id uuid not null references public.profiles (id),
  original_count int not null check (original_count >= 0),
  confirmed_count int not null check (confirmed_count >= 0),
  mismatch_direction public.mismatch_direction,
  mismatch_detail text,
  invoice_amount numeric(10, 2) not null check (invoice_amount >= 0),
  invoice_status public.invoice_status not null,
  created_at timestamptz not null default now()
);

create index if not exists order_confirmation_events_order_idx
  on public.order_confirmation_events (order_id, created_at desc);

alter table public.order_confirmation_events enable row level security;

create policy order_confirmation_events_select on public.order_confirmation_events
  for select using (
    public.is_admin()
    or vendor_profile_id = auth.uid()
    or exists (
      select 1
      from public.orders o
      where o.id = order_id and o.customer_id = auth.uid()
    )
  );

alter table public.mismatches
  add column if not exists details jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

end
$$;