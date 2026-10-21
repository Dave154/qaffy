create index if not exists orders_vendor_created_at_id_page_idx
  on public.orders (vendor_id, created_at desc, id desc);
