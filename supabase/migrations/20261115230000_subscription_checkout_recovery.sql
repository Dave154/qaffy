alter table public.subscriptions
  add column if not exists is_queued_renewal boolean not null default false;

update public.subscriptions
set is_queued_renewal = status = 'scheduled'
  and start_date > (now() at time zone 'Africa/Lagos')::date;

drop index if exists public.subscriptions_one_scheduled_per_customer_idx;

create unique index if not exists subscriptions_one_queued_renewal_per_customer_idx
  on public.subscriptions (customer_id)
  where is_queued_renewal = true;

alter table public.payments
  add column if not exists authorization_url text,
  add column if not exists subscription_checkout_state text not null default 'legacy',
  add column if not exists subscription_start_date_snapshot date,
  add column if not exists subscription_end_date_snapshot date,
  add column if not exists subscription_weekly_limit_snapshot integer,
  add column if not exists subscription_covers_wash_snapshot boolean,
  add column if not exists subscription_covers_iron_snapshot boolean;

alter table public.payments
  drop constraint if exists payments_subscription_checkout_state_check;

alter table public.payments
  add constraint payments_subscription_checkout_state_check
  check (subscription_checkout_state in ('legacy', 'initializing', 'ready', 'failed', 'completed'));
