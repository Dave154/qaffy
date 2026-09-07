-- Preserve the exact service and price selected for every order item.
alter table public.order_items
  add column if not exists service text not null default 'wash',
  add column if not exists unit_price numeric(10, 2) not null default 0;

alter table public.order_items
  drop constraint if exists order_items_service_check;

alter table public.order_items
  add constraint order_items_service_check
  check (service in ('wash', 'iron', 'wash_iron'));