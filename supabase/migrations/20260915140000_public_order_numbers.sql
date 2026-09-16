create sequence if not exists public.order_public_number_seq;

alter table public.orders
  add column if not exists public_order_number text;

update public.orders
set public_order_number = 'QO-' || lpad(nextval('public.order_public_number_seq')::text, 6, '0')
where public_order_number is null;

create or replace function public.assign_public_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.public_order_number is distinct from old.public_order_number then
    raise exception 'Public order number cannot be changed';
  end if;

  if tg_op = 'INSERT' then
    new.public_order_number := 'QO-' || lpad(nextval('public.order_public_number_seq')::text, 6, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists orders_public_order_number on public.orders;

create trigger orders_public_order_number
before insert or update of public_order_number on public.orders
for each row execute function public.assign_public_order_number();

alter table public.orders
  alter column public_order_number set not null;

create unique index if not exists orders_public_order_number_unique
  on public.orders (public_order_number);