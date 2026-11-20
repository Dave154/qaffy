alter table public.orders
  add column if not exists vendor_claimed_at timestamptz;

comment on column public.orders.vendor_claimed_at is
  'Timestamp when a vendor claimed the order; null for historical claims made before this field was added.';
