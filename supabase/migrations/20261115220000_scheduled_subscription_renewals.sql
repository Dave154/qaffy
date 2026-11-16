alter table public.subscriptions
  add column if not exists price_snapshot numeric(10, 2)
    check (price_snapshot is null or price_snapshot >= 0);

alter table public.payments
  add column if not exists subscription_id uuid
    references public.subscriptions (id) on delete set null,
  add column if not exists subscription_activation_processed_at timestamptz;

create unique index if not exists subscriptions_one_scheduled_per_customer_idx
  on public.subscriptions (customer_id)
  where status = 'scheduled';

create unique index if not exists payments_one_subscription_per_payment_idx
  on public.payments (subscription_id)
  where subscription_id is not null;

update public.payments
set subscription_activation_processed_at = coalesce(succeeded_at, created_at)
where plan_id is not null
  and status = 'success'
  and subscription_activation_processed_at is null;

create or replace function public.require_subscription_end_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.end_date is null then
    raise exception 'A subscription end date is required';
  end if;
  if new.end_date < new.start_date then
    raise exception 'A subscription end date cannot be before its start date';
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_require_end_date on public.subscriptions;
create trigger subscriptions_require_end_date
before insert or update of end_date on public.subscriptions
for each row execute function public.require_subscription_end_date();

create or replace function public.snapshot_order_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Africa/Lagos')::date;
begin
  select s.id
  into new.subscription_id
  from public.subscriptions s
  where s.customer_id = new.customer_id
    and s.status in ('active', 'scheduled')
    and s.start_date <= today
    and (s.end_date is null or s.end_date >= today)
  order by s.start_date desc, s.created_at desc
  limit 1;

  new.is_subscription_order := new.subscription_id is not null;
  return new;
end;
$$;

create index if not exists subscriptions_customer_status_term_idx
  on public.subscriptions (customer_id, status, start_date, end_date);
