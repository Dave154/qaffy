-- Immutable operational history for logistics pickup and delivery actions.
create table if not exists public.order_logistics_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  agent_profile_id uuid references public.profiles (id) on delete set null,
  event_type text not null check (event_type in ('picked_up', 'delivered')),
  created_at timestamptz not null default now()
);

create index if not exists order_logistics_events_order_id_idx
  on public.order_logistics_events (order_id, created_at desc);

create index if not exists order_logistics_events_type_date_idx
  on public.order_logistics_events (event_type, created_at desc);

alter table public.order_logistics_events enable row level security;

create policy order_logistics_events_select on public.order_logistics_events
  for select using (
    public.is_admin()
    or public.has_role('logistics')
    or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

create policy order_logistics_events_insert on public.order_logistics_events
  for insert with check (public.is_admin() or public.has_role('logistics'));
