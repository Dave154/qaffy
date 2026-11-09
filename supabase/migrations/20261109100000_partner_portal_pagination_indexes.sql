create index if not exists orders_unclaimed_vendor_queue_idx
  on public.orders (created_at desc, id desc)
  where status = 'picked_up' and vendor_id is null;

create index if not exists orders_pending_pickup_queue_idx
  on public.orders (created_at desc, id desc)
  where status = 'pending_pickup';

create index if not exists orders_out_for_delivery_queue_idx
  on public.orders (created_at desc, id desc)
  where status = 'out_for_delivery';

create index if not exists order_logistics_events_agent_type_created_idx
  on public.order_logistics_events (agent_profile_id, event_type, created_at desc, id desc);

create index if not exists vendor_settlements_vendor_created_page_idx
  on public.vendor_settlements (vendor_id, created_at desc, id desc);
