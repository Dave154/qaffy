alter table public.orders
  add column if not exists subscription_units_applied_at timestamptz;

update public.orders
set subscription_units_applied_at = created_at
where subscription_units_applied is not null
  and subscription_units_applied_at is null;

create index if not exists orders_subscription_usage_week_idx
  on public.orders (customer_id, subscription_units_applied_at)
  where is_subscription_order = true
    and subscription_units_applied is not null
    and status <> 'cancelled';alter table public.orders
  add column if not exists subscription_units_applied_at timestamptz;

update public.orders
set subscription_units_applied_at = created_at
where subscription_units_applied is not null
  and subscription_units_applied_at is null;

create index if not exists orders_subscription_usage_week_idx
  on public.orders (customer_id, subscription_units_applied_at)
  where is_subscription_order = true
    and subscription_units_applied is not null
    and status <> 'cancelled';