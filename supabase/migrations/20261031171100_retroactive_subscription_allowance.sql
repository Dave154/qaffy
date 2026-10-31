alter table public.orders
  add column if not exists subscription_allowance_subscription_id uuid
  references public.subscriptions (id) on delete set null;

comment on column public.orders.subscription_allowance_subscription_id is
  'Subscription whose allowance was applied to this order; distinct from the order-time subscription snapshot.';
