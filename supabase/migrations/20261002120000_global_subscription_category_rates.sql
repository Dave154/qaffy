do $$
begin
  if exists (
    select 1
    from public.plan_category_rates
    group by category_id
    having count(distinct (subscriber_wash_price, subscriber_iron_price, subscriber_wash_iron_price)) > 1
  ) then
    raise exception 'Existing plan subscriber rates differ by category. Reconcile them before converting to global category rates.';
  end if;
end;
$$;

alter table public.cloth_category_rates
  add column if not exists subscriber_wash_price numeric(10, 2),
  add column if not exists subscriber_iron_price numeric(10, 2),
  add column if not exists subscriber_wash_iron_price numeric(10, 2);

update public.cloth_category_rates rates
set subscriber_wash_price = coalesce((
      select min(plan_rates.subscriber_wash_price)
      from public.plan_category_rates plan_rates
      where plan_rates.category_id = rates.category_id
    ), rates.wash_price),
    subscriber_iron_price = coalesce((
      select min(plan_rates.subscriber_iron_price)
      from public.plan_category_rates plan_rates
      where plan_rates.category_id = rates.category_id
    ), rates.iron_price),
    subscriber_wash_iron_price = coalesce((
      select min(plan_rates.subscriber_wash_iron_price)
      from public.plan_category_rates plan_rates
      where plan_rates.category_id = rates.category_id
    ), rates.wash_iron_price)
where rates.subscriber_wash_price is null
   or rates.subscriber_iron_price is null
   or rates.subscriber_wash_iron_price is null;

alter table public.cloth_category_rates
  alter column subscriber_wash_price set not null,
  alter column subscriber_iron_price set not null,
  alter column subscriber_wash_iron_price set not null;

drop trigger if exists plans_seed_category_rates on public.plans;
drop function if exists public.seed_plan_category_rates_for_plan();
drop trigger if exists cloth_category_rates_seed_plan_rates on public.cloth_category_rates;
drop function if exists public.seed_plan_category_rates_for_category();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cloth_category_rates_subscriber_prices_check') then
    alter table public.cloth_category_rates
      add constraint cloth_category_rates_subscriber_prices_check check (
        subscriber_wash_price >= 0 and subscriber_wash_price <= wash_price and
        subscriber_iron_price >= 0 and subscriber_iron_price <= iron_price and
        subscriber_wash_iron_price >= 0 and subscriber_wash_iron_price <= wash_iron_price
      );
  end if;
end;
$$;

create or replace function public.set_order_item_customer_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_rates record;
  order_subscription_id uuid;
begin
  select wash_price, iron_price, wash_iron_price,
    subscriber_wash_price, subscriber_iron_price, subscriber_wash_iron_price,
    subscription_units
  into configured_rates
  from public.cloth_category_rates
  where category_id = new.category_id;

  if configured_rates.wash_price is null
    or configured_rates.iron_price is null
    or configured_rates.wash_iron_price is null
    or configured_rates.subscriber_wash_price is null
    or configured_rates.subscriber_iron_price is null
    or configured_rates.subscriber_wash_iron_price is null
    or configured_rates.subscription_units is null
    or configured_rates.subscription_units <= 0 then
    raise exception 'A valid customer rate, subscriber rate, and subscription weight are required for this category';
  end if;

  new.unit_price := case new.service
    when 'wash' then configured_rates.wash_price
    when 'iron' then configured_rates.iron_price
    when 'wash_iron' then configured_rates.wash_iron_price
  end;
  if new.unit_price is null or new.unit_price <= 0 then
    raise exception 'A positive customer rate is required for this category and service';
  end if;

  new.subscription_units_snapshot := configured_rates.subscription_units;
  new.regular_wash_price_snapshot := configured_rates.wash_price;
  new.regular_iron_price_snapshot := configured_rates.iron_price;
  new.regular_wash_iron_price_snapshot := configured_rates.wash_iron_price;
  new.subscriber_wash_price_snapshot := null;
  new.subscriber_iron_price_snapshot := null;
  new.subscriber_wash_iron_price_snapshot := null;

  select o.subscription_id into order_subscription_id
  from public.orders o
  where o.id = new.order_id;

  if order_subscription_id is not null then
    new.subscriber_wash_price_snapshot := configured_rates.subscriber_wash_price;
    new.subscriber_iron_price_snapshot := configured_rates.subscriber_iron_price;
    new.subscriber_wash_iron_price_snapshot := configured_rates.subscriber_wash_iron_price;
  end if;

  return new;
end;
$$;
