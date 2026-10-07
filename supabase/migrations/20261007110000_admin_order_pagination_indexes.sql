create index if not exists orders_created_at_id_page_idx
  on public.orders (created_at desc, id desc);

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create index if not exists mismatches_order_id_idx
  on public.mismatches (order_id);
