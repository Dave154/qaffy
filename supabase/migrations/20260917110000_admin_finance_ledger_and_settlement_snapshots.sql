create table if not exists public.admin_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type in ('profit_withdrawal')),
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  admin_profile_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists admin_finance_transactions_created_at_idx
  on public.admin_finance_transactions (created_at desc);

alter table public.admin_finance_transactions enable row level security;

create policy admin_finance_transactions_select on public.admin_finance_transactions
  for select using (public.has_role('admin'));

create policy admin_finance_transactions_insert on public.admin_finance_transactions
  for insert with check (public.has_role('admin') and admin_profile_id = auth.uid());

create table if not exists public.vendor_settlement_items (
  settlement_id uuid not null references public.vendor_settlements (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  confirmed_quantity int not null check (confirmed_quantity >= 0),
  vendor_unit_price numeric(10, 2) not null check (vendor_unit_price >= 0),
  amount numeric(12, 2) not null check (amount >= 0),
  primary key (settlement_id, order_item_id),
  unique (order_item_id)
);

alter table public.vendor_settlement_items enable row level security;

create policy vendor_settlement_items_select on public.vendor_settlement_items
  for select using (
    public.has_role('admin')
    or exists (
      select 1
      from public.vendor_settlement_orders so
      join public.vendors v on v.id = (select vendor_id from public.vendor_settlements where id = so.settlement_id)
      where so.settlement_id = vendor_settlement_items.settlement_id
        and v.profile_id = auth.uid()
    )
  );

create policy vendor_settlement_items_admin_insert on public.vendor_settlement_items
  for insert with check (public.has_role('admin'));
