alter table public.vendors
  add column if not exists payout_recipient_code text,
  add column if not exists payout_recipient_created_at timestamptz,
  add column if not exists payout_recipient_updated_at timestamptz;

create table if not exists public.vendor_settlement_transfers (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null unique references public.vendor_settlements (id) on delete restrict,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'queued' check (status in ('queued', 'processing', 'success', 'failed', 'reversed', 'rejected')),
  paystack_transfer_code text unique,
  paystack_reference text unique,
  paystack_recipient_code text,
  recipient_bank_code text,
  recipient_account_number_masked text,
  recipient_account_name text,
  admin_profile_id uuid not null references public.profiles (id) on delete restrict,
  failure_reason text,
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists vendor_settlement_transfers_vendor_status_idx
  on public.vendor_settlement_transfers (vendor_id, status, created_at desc);

create index if not exists vendor_settlement_transfers_status_idx
  on public.vendor_settlement_transfers (status, created_at desc);

alter table public.vendor_settlement_transfers enable row level security;

create policy vendor_settlement_transfers_admin_select on public.vendor_settlement_transfers
  for select using (public.is_admin());

create policy vendor_settlement_transfers_admin_insert on public.vendor_settlement_transfers
  for insert with check (public.is_admin() and admin_profile_id = auth.uid());

create policy vendor_settlement_transfers_admin_update on public.vendor_settlement_transfers
  for update using (public.is_admin()) with check (public.is_admin());