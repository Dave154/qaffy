-- Keep physical cloth counts separate from weighted subscription accounting.
-- Existing count columns become physical counts for every order.
alter table public.orders
  add column if not exists clothes_count_customer_units int,
  add column if not exists clothes_count_vendor_units int,
  add column if not exists subscription_units_applied int;

update public.orders
set clothes_count_customer_units = case
  when is_subscription_order then clothes_count_customer
  else clothes_count_customer
end
where clothes_count_customer_units is null;

update public.orders o
set clothes_count_customer = coalesce(items.physical_count, 0)
from (
  select order_id, sum(quantity)::int as physical_count
  from public.order_items
  group by order_id
) items
where o.id = items.order_id;

update public.orders o
set clothes_count_vendor_units = case
  when o.is_subscription_order then o.clothes_count_vendor
  else o.clothes_count_vendor
end
where o.clothes_count_vendor is not null
  and o.clothes_count_vendor_units is null;

update public.orders o
set clothes_count_vendor = items.physical_count
from (
  select order_id, sum(confirmed_quantity)::int as physical_count
  from public.order_items
  where confirmed_quantity is not null
  group by order_id
) items
where o.id = items.order_id;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_customer_count_units_check'
  ) then
    alter table public.orders
      add constraint orders_customer_count_units_check
      check (clothes_count_customer_units is null or clothes_count_customer_units >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_vendor_count_units_check'
  ) then
    alter table public.orders
      add constraint orders_vendor_count_units_check
      check (clothes_count_vendor_units is null or clothes_count_vendor_units >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_subscription_units_applied_check'
  ) then
    alter table public.orders
      add constraint orders_subscription_units_applied_check
      check (subscription_units_applied is null or subscription_units_applied >= 0);
  end if;
end $$;

update public.orders o
set subscription_units_applied = case
  when o.is_subscription_order then least(
    coalesce(o.clothes_count_vendor_units, 0),
    coalesce((
      select p.weekly_limit
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.customer_id = o.customer_id
        and s.status = 'active'
      order by s.created_at desc
      limit 1
    ), 0)
  )
  else null
end
where o.subscription_units_applied is null
  and o.clothes_count_vendor_units is not null;

comment on column public.orders.clothes_count_customer is 'Physical customer-declared cloth count.';
comment on column public.orders.clothes_count_vendor is 'Physical vendor-confirmed cloth count.';
comment on column public.orders.clothes_count_customer_units is 'Weighted subscription units for the customer-declared order.';
comment on column public.orders.clothes_count_vendor_units is 'Weighted subscription units for the vendor-confirmed order.';
comment on column public.orders.subscription_units_applied is 'Weighted units covered by the subscription allowance; excess units are billed separately.';
