alter table public.orders
  add column if not exists vendor_id uuid references public.vendors (id) on delete set null;

create index if not exists orders_vendor_id_idx
  on public.orders (vendor_id);