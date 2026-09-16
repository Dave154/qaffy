create or replace function public.set_order_item_customer_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_price numeric(10, 2);
begin
  select case new.service
    when 'wash' then wash_price
    when 'iron' then iron_price
    when 'wash_iron' then wash_iron_price
  end
  into configured_price
  from public.cloth_category_rates
  where category_id = new.category_id;

  if configured_price is null or configured_price <= 0 then
    raise exception 'A valid customer rate is required for this category and service';
  end if;

  new.unit_price := configured_price;
  return new;
end;
$$;

drop trigger if exists order_items_customer_rate on public.order_items;

create trigger order_items_customer_rate
before insert or update of category_id, service, unit_price on public.order_items
for each row execute function public.set_order_item_customer_rate();