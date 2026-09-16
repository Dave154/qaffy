alter table public.vendors
  add column if not exists payout_bank_name text,
  add column if not exists payout_bank_code text,
  add column if not exists payout_account_number text,
  add column if not exists payout_account_name text,
  add column if not exists payout_account_status text not null default 'unverified',
  add column if not exists payout_account_verified_at timestamptz,
  add column if not exists payout_account_error text;

alter table public.vendors
  add constraint vendors_payout_account_status_check
  check (payout_account_status in ('unverified', 'verified'));
