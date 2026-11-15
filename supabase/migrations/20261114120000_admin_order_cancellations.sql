alter type public.invoice_status add value if not exists 'void';
alter type public.invoice_status add value if not exists 'refunded';
alter type public.settlement_status add value if not exists 'cancelled';

create table public.order_cancellations (
  order_id uuid primary key references public.orders (id) on delete restrict,
  cancelled_by uuid not null references public.profiles (id) on delete restrict,
  original_status public.order_status not null,
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  refund_requested boolean not null,
  refund_amount numeric(12, 2) not null default 0 check (refund_amount >= 0),
  include_in_vendor_settlement boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.invoices
  add column if not exists voided_at timestamptz,
  add column if not exists refunded_at timestamptz;

create table public.invoice_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  balance_type public.wallet_balance_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  related_referral_reward_id uuid references public.referral_rewards (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (balance_type = 'promotional' and related_referral_reward_id is not null)
    or (balance_type <> 'promotional' and related_referral_reward_id is null)
  )
);

create unique index invoice_payment_allocations_wallet_source_idx
  on public.invoice_payment_allocations (invoice_id, balance_type)
  where related_referral_reward_id is null;

create unique index invoice_payment_allocations_reward_source_idx
  on public.invoice_payment_allocations (invoice_id, related_referral_reward_id)
  where related_referral_reward_id is not null;

create index invoice_payment_allocations_invoice_idx
  on public.invoice_payment_allocations (invoice_id);

alter table public.wallet_transactions
  add column if not exists related_order_cancellation_id uuid
    references public.order_cancellations (order_id) on delete restrict;

create index wallet_transactions_cancellation_idx
  on public.wallet_transactions (related_order_cancellation_id)
  where related_order_cancellation_id is not null;

alter table public.order_cancellations enable row level security;
alter table public.invoice_payment_allocations enable row level security;

create policy order_cancellations_admin_select on public.order_cancellations
  for select using (public.has_role('admin'));

create policy invoice_payment_allocations_admin_select on public.invoice_payment_allocations
  for select using (public.has_role('admin'));

with grouped_debits as (
  select
    transaction.related_invoice_id as invoice_id,
    transaction.balance_type,
    transaction.related_referral_reward_id,
    sum(transaction.amount) as amount
  from public.wallet_transactions transaction
  join public.invoices invoice on invoice.id = transaction.related_invoice_id
  where transaction.txn_type = 'debit'
    and invoice.status = 'paid'
    and invoice.payment_method is distinct from 'offline'
  group by transaction.related_invoice_id, transaction.balance_type, transaction.related_referral_reward_id
),
exact_invoice_totals as (
  select invoice_id, sum(amount) as amount
  from grouped_debits
  group by invoice_id
)
insert into public.invoice_payment_allocations (
  invoice_id,
  balance_type,
  amount,
  related_referral_reward_id
)
select
  grouped.invoice_id,
  grouped.balance_type,
  grouped.amount,
  grouped.related_referral_reward_id
from grouped_debits grouped
join exact_invoice_totals total on total.invoice_id = grouped.invoice_id
join public.invoices invoice on invoice.id = grouped.invoice_id
where total.amount = invoice.amount;

update public.invoices invoice
set payment_method = 'wallet'
where invoice.status = 'paid'
  and invoice.payment_method is null
  and exists (
    select 1
    from public.invoice_payment_allocations allocation
    where allocation.invoice_id = invoice.id
  );
