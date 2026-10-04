alter table public.plans
  add column if not exists covers_wash boolean not null default true,
  add column if not exists covers_iron boolean not null default true;

alter table public.subscriptions
  add column if not exists weekly_limit_snapshot integer,
  add column if not exists covers_wash_snapshot boolean,
  add column if not exists covers_iron_snapshot boolean;

update public.subscriptions s
set weekly_limit_snapshot = p.weekly_limit,
    covers_wash_snapshot = p.covers_wash,
    covers_iron_snapshot = p.covers_iron
from public.plans p
where p.id = s.plan_id
  and (s.weekly_limit_snapshot is null or s.covers_wash_snapshot is null or s.covers_iron_snapshot is null);

alter table public.subscriptions
  alter column weekly_limit_snapshot set not null,
  alter column covers_wash_snapshot set not null,
  alter column covers_iron_snapshot set not null;

create table if not exists public.plan_category_rates (
  plan_id uuid not null references public.plans (id) on delete cascade,
  category_id uuid not null references public.cloth_categories (id) on delete cascade,
  subscriber_wash_price numeric(10, 2) not null check (subscriber_wash_price >= 0),
  subscriber_iron_price numeric(10, 2) not null check (subscriber_iron_price >= 0),
  subscriber_wash_iron_price numeric(10, 2) not null check (subscriber_wash_iron_price >= 0),
  created_at timestamptz not null default now(),
  primary key (plan_id, category_id)
);

insert into public.plan_category_rates (plan_id, category_id, subscriber_wash_price, subscriber_iron_price, subscriber_wash_iron_price)
select p.id, r.category_id, r.wash_price, r.iron_price, r.wash_iron_price
from public.plans p
cross join public.cloth_category_rates r
on conflict (plan_id, category_id) do nothing;

create table if not exists public.subscription_category_rate_snapshots (
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  category_id uuid not null references public.cloth_categories (id) on delete cascade,
  subscriber_wash_price numeric(10, 2) not null check (subscriber_wash_price >= 0),
  subscriber_iron_price numeric(10, 2) not null check (subscriber_iron_price >= 0),
  subscriber_wash_iron_price numeric(10, 2) not null check (subscriber_wash_iron_price >= 0),
  created_at timestamptz not null default now(),
  primary key (subscription_id, category_id)
);

insert into public.subscription_category_rate_snapshots (
  subscription_id,
  category_id,
  subscriber_wash_price,
  subscriber_iron_price,
  subscriber_wash_iron_price
)
select s.id, pcr.category_id, pcr.subscriber_wash_price, pcr.subscriber_iron_price, pcr.subscriber_wash_iron_price
from public.subscriptions s
join public.plan_category_rates pcr on pcr.plan_id = s.plan_id
on conflict (subscription_id, category_id) do nothing;

alter table public.plan_category_rates enable row level security;
drop policy if exists plan_category_rates_select on public.plan_category_rates;
create policy plan_category_rates_select on public.plan_category_rates
  for select using (public.is_admin());
drop policy if exists plan_category_rates_admin_write on public.plan_category_rates;
create policy plan_category_rates_admin_write on public.plan_category_rates
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.subscription_category_rate_snapshots enable row level security;
drop policy if exists subscription_category_rate_snapshots_select on public.subscription_category_rate_snapshots;
create policy subscription_category_rate_snapshots_select on public.subscription_category_rate_snapshots
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id and s.customer_id = auth.uid()
    )
  );

alter table public.orders
  add column if not exists subscription_id uuid references public.subscriptions (id) on delete set null;

create or replace function public.snapshot_order_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select s.id
  into new.subscription_id
  from public.subscriptions s
  where s.customer_id = new.customer_id
    and s.status = 'active'
    and s.start_date <= current_date
    and (s.end_date is null or s.end_date >= current_date)
  order by s.created_at desc
  limit 1;

  new.is_subscription_order := new.subscription_id is not null;
  return new;
end;
$$;

drop trigger if exists orders_snapshot_subscription on public.orders;
create trigger orders_snapshot_subscription
before insert on public.orders
for each row execute function public.snapshot_order_subscription();

alter table public.order_items
  add column if not exists subscription_units_snapshot integer,
  add column if not exists regular_wash_price_snapshot numeric(10, 2),
  add column if not exists regular_iron_price_snapshot numeric(10, 2),
  add column if not exists regular_wash_iron_price_snapshot numeric(10, 2),
  add column if not exists subscriber_wash_price_snapshot numeric(10, 2),
  add column if not exists subscriber_iron_price_snapshot numeric(10, 2),
  add column if not exists subscriber_wash_iron_price_snapshot numeric(10, 2);

create or replace function public.set_order_item_customer_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_rates record;
  order_subscription_id uuid;
  subscriber_rates record;
begin
  select wash_price, iron_price, wash_iron_price, subscription_units
  into configured_rates
  from public.cloth_category_rates
  where category_id = new.category_id;

  if configured_rates.wash_price is null
    or configured_rates.iron_price is null
    or configured_rates.wash_iron_price is null
    or configured_rates.subscription_units is null
    or configured_rates.subscription_units <= 0 then
    raise exception 'A valid customer rate and subscription weight are required for this category';
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
    select subscriber_wash_price, subscriber_iron_price, subscriber_wash_iron_price
    into subscriber_rates
    from public.subscription_category_rate_snapshots
    where subscription_id = order_subscription_id
      and category_id = new.category_id;

    if subscriber_rates.subscriber_wash_price is null
      or subscriber_rates.subscriber_iron_price is null
      or subscriber_rates.subscriber_wash_iron_price is null then
      raise exception 'Subscriber rates are not configured for this plan and category';
    end if;

    new.subscriber_wash_price_snapshot := subscriber_rates.subscriber_wash_price;
    new.subscriber_iron_price_snapshot := subscriber_rates.subscriber_iron_price;
    new.subscriber_wash_iron_price_snapshot := subscriber_rates.subscriber_wash_iron_price;
  end if;

  return new;
end;
$$;

drop trigger if exists order_items_customer_rate on public.order_items;
create trigger order_items_customer_rate
before insert or update of category_id, service, unit_price on public.order_items
for each row execute function public.set_order_item_customer_rate();

create or replace function public.seed_plan_category_rates_for_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.plan_category_rates (
    plan_id, category_id, subscriber_wash_price, subscriber_iron_price, subscriber_wash_iron_price
  )
  select new.id, r.category_id, r.wash_price, r.iron_price, r.wash_iron_price
  from public.cloth_category_rates r
  on conflict (plan_id, category_id) do nothing;
  return new;
end;
$$;

drop trigger if exists plans_seed_category_rates on public.plans;
create trigger plans_seed_category_rates
after insert on public.plans
for each row execute function public.seed_plan_category_rates_for_plan();

create or replace function public.seed_plan_category_rates_for_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.plan_category_rates (
    plan_id, category_id, subscriber_wash_price, subscriber_iron_price, subscriber_wash_iron_price
  )
  select p.id, new.category_id, new.wash_price, new.iron_price, new.wash_iron_price
  from public.plans p
  on conflict (plan_id, category_id) do nothing;

  insert into public.subscription_category_rate_snapshots (
    subscription_id, category_id, subscriber_wash_price, subscriber_iron_price, subscriber_wash_iron_price
  )
  select s.id, new.category_id, pcr.subscriber_wash_price, pcr.subscriber_iron_price, pcr.subscriber_wash_iron_price
  from public.subscriptions s
  join public.plan_category_rates pcr on pcr.plan_id = s.plan_id and pcr.category_id = new.category_id
  on conflict (subscription_id, category_id) do nothing;
  return new;
end;
$$;

drop trigger if exists cloth_category_rates_seed_plan_rates on public.cloth_category_rates;
create trigger cloth_category_rates_seed_plan_rates
after insert on public.cloth_category_rates
for each row execute function public.seed_plan_category_rates_for_category();