alter table public.order_items
  add column if not exists is_vendor_added boolean not null default false;

update public.order_items oi
set is_vendor_added = true
where exists (
  select 1
  from public.mismatches m
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(m.details) = 'array' then m.details else '[]'::jsonb end
  ) line
  where m.order_id = oi.order_id
    and line ->> 'itemId' = oi.id::text
    and line ->> 'originalQuantity' = '0'
    and line ->> 'confirmedQuantity' ~ '^[1-9][0-9]*$'
);

create or replace function public.protect_customer_order_item_counts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.is_vendor_added := false;
    if tg_op = 'INSERT' then
      new.confirmed_quantity := null;
    elsif old.confirmed_quantity is distinct from new.confirmed_quantity then
      new.confirmed_quantity := old.confirmed_quantity;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists order_items_protect_customer_counts on public.order_items;
create trigger order_items_protect_customer_counts
before insert or update of is_vendor_added, confirmed_quantity on public.order_items
for each row execute function public.protect_customer_order_item_counts();

create or replace function public.sync_order_physical_counts_from_items()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_order_id uuid;
  new_order_id uuid;
  target_order_id uuid;
  customer_count_changed boolean;
  customer_units_changed boolean;
  vendor_count_changed boolean;
begin
  if tg_op = 'INSERT' then
    new_order_id := new.order_id;
    customer_count_changed := true;
    customer_units_changed := not new.is_vendor_added;
    vendor_count_changed := true;
  elsif tg_op = 'DELETE' then
    old_order_id := old.order_id;
    customer_count_changed := true;
    customer_units_changed := not old.is_vendor_added;
    vendor_count_changed := true;
  else
    old_order_id := old.order_id;
    new_order_id := new.order_id;
    customer_count_changed :=
      old.order_id is distinct from new.order_id
      or old.quantity is distinct from new.quantity
      or old.is_vendor_added is distinct from new.is_vendor_added;
    customer_units_changed :=
      old.is_vendor_added is distinct from new.is_vendor_added
      or (
        old.order_id is distinct from new.order_id
        and (not old.is_vendor_added or not new.is_vendor_added)
      )
      or (
        not old.is_vendor_added
        and not new.is_vendor_added
        and old.quantity is distinct from new.quantity
      );
    vendor_count_changed :=
      old.order_id is distinct from new.order_id
      or old.confirmed_quantity is distinct from new.confirmed_quantity;
  end if;

  for target_order_id in
    select distinct target_id
    from unnest(array[old_order_id, new_order_id]) as targets(target_id)
    where target_id is not null
  loop
    update public.orders o
    set clothes_count_customer = case when customer_count_changed then (
          select coalesce(sum(oi.quantity) filter (where not oi.is_vendor_added), 0)::int
          from public.order_items oi
          where oi.order_id = target_order_id
        ) else o.clothes_count_customer end,
        clothes_count_customer_units = case when customer_units_changed then (
          select case
            when o.is_subscription_order then coalesce(
              sum(oi.quantity * oi.subscription_units_snapshot) filter (where not oi.is_vendor_added),
              0
            )::int
            else coalesce(sum(oi.quantity) filter (where not oi.is_vendor_added), 0)::int
          end
          from public.order_items oi
          where oi.order_id = target_order_id
        ) else o.clothes_count_customer_units end,
        clothes_count_vendor = case when vendor_count_changed then (
          select case
            when count(oi.confirmed_quantity) = 0 then null
            else coalesce(sum(oi.confirmed_quantity), 0)::int
          end
          from public.order_items oi
          where oi.order_id = target_order_id
        ) else o.clothes_count_vendor end
    where o.id = target_order_id;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_sync_physical_counts on public.order_items;
create trigger order_items_sync_physical_counts
after insert or update or delete on public.order_items
for each row execute function public.sync_order_physical_counts_from_items();

create or replace function public.create_customer_order(
  p_notes text,
  p_pickup_location_id uuid,
  p_subscription_borrow_consent_units integer,
  p_items jsonb
)
returns public.orders
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid := auth.uid();
  v_item jsonb;
  v_category_id uuid;
  v_quantity_value numeric;
  v_item_service text;
  v_seen_line_keys text[] := array[]::text[];
  v_service_types text[] := array[]::text[];
  v_line_key text;
  v_order_type public.order_type;
  v_order_row public.orders;
begin
  if v_customer_id is null then
    raise exception 'Sign in to create an order';
  end if;
  if p_subscription_borrow_consent_units is null or p_subscription_borrow_consent_units < 0 then
    raise exception 'Subscription borrowing consent is invalid';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(v_item ->> 'category_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(v_item ->> 'quantity', '') !~ '^[1-9][0-9]*$'
      or coalesce(v_item ->> 'service', '') not in ('wash', 'iron', 'wash_iron') then
      raise exception 'Order item details are invalid';
    end if;

    v_category_id := (v_item ->> 'category_id')::uuid;
    v_quantity_value := (v_item ->> 'quantity')::numeric;
    v_item_service := v_item ->> 'service';
    if v_quantity_value > 2147483647 then
      raise exception 'Order item quantity is too large';
    end if;
    if not exists (
      select 1 from public.cloth_categories c where c.id = v_category_id and c.active
    ) then
      raise exception 'An order category is no longer available';
    end if;

    v_line_key := v_category_id::text || ':' || v_item_service;
    if v_line_key = any(v_seen_line_keys) then
      raise exception 'Each category and service combination can only be added once';
    end if;

    v_seen_line_keys := array_append(v_seen_line_keys, v_line_key);
    v_service_types := array_append(v_service_types, v_item_service);
  end loop;

  if (
    select count(distinct service_type)
    from unnest(v_service_types) as service_values(service_type)
  ) > 1 then
    v_order_type := 'mixed';
  elsif 'wash_iron' = any(v_service_types) then
    v_order_type := 'wash_iron';
  else
    v_order_type := 'wash';
  end if;

  insert into public.orders (
    customer_id,
    order_type,
    clothes_count_customer,
    clothes_count_customer_units,
    status,
    notes,
    pickup_location_id,
    is_subscription_order,
    subscription_borrow_consent_units,
    billed_extra_amount
  )
  values (
    v_customer_id,
    v_order_type,
    0,
    0,
    'pending_pickup',
    nullif(p_notes, ''),
    p_pickup_location_id,
    false,
    p_subscription_borrow_consent_units,
    null
  )
  returning * into v_order_row;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, category_id, quantity, service)
    values (
      v_order_row.id,
      (v_item ->> 'category_id')::uuid,
      (v_item ->> 'quantity')::integer,
      v_item ->> 'service'
    );
  end loop;

  select * into v_order_row from public.orders o where o.id = v_order_row.id;
  return v_order_row;
end;
$$;

revoke all on function public.create_customer_order(text, uuid, integer, jsonb) from public, anon;
grant execute on function public.create_customer_order(text, uuid, integer, jsonb) to authenticated;
