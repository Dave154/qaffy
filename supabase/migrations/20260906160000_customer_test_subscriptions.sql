-- Test-only self-serve activation until payment verification is implemented.
create unique index if not exists subscriptions_one_active_per_customer
  on public.subscriptions (customer_id)
  where status = 'active';

drop policy if exists subscriptions_customer_insert on public.subscriptions;

create policy subscriptions_customer_insert on public.subscriptions
  for insert
  with check (customer_id = auth.uid());