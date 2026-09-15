alter table public.order_items
  add column if not exists confirmed_quantity int;

alter table public.order_items
  add constraint order_items_confirmed_quantity_check
  check (confirmed_quantity is null or confirmed_quantity >= 0);