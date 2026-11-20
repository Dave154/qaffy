alter table public.payments
  add column if not exists subscription_reconciliation_checked_at timestamptz,
  add column if not exists subscription_reconciliation_attempts integer not null default 0,
  add column if not exists subscription_reconciliation_result text;

alter table public.payments
  drop constraint if exists payments_subscription_reconciliation_result_check;

alter table public.payments
  add constraint payments_subscription_reconciliation_result_check
  check (
    subscription_reconciliation_result is null
    or subscription_reconciliation_result in (
      'checking',
      'success',
      'failed',
      'abandoned',
      'pending',
      'not_found',
      'unavailable',
      'mismatch',
      'unknown'
    )
  );

drop index if exists public.payments_pending_subscription_reconciliation_idx;

create index payments_pending_subscription_reconciliation_idx
  on public.payments (created_at, subscription_reconciliation_checked_at)
  where plan_id is not null
    and (
      status = 'pending'
      or (status = 'success' and subscription_id is null)
    );
