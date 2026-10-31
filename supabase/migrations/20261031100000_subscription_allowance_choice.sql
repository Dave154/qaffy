alter table public.order_confirmation_events
  add column if not exists subscription_allowance_enabled boolean not null default true;

comment on column public.order_confirmation_events.subscription_allowance_enabled is
  'Whether vendor confirmation authorized use of subscription allowance for the order.';
