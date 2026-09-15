-- Qaffy foundation schema: enums, tables, and RLS.
-- Wallet balances only ever change through src/lib/wallet.server.ts, which
-- runs on a trusted direct Postgres connection (DATABASE_URL) that bypasses
-- RLS — never via direct client table writes.

-- ============================================================
-- Enums
-- ============================================================
create type public.user_role as enum ('customer', 'logistics', 'vendor', 'admin');
create type public.partner_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.plan_type as enum ('monthly', 'semester');
create type public.subscription_status as enum ('active', 'ended', 'cancelled');
create type public.wallet_balance_type as enum ('one_off', 'subscription');
create type public.wallet_txn_type as enum ('topup', 'debit', 'refund', 'adjustment');
create type public.order_type as enum ('wash', 'wash_iron', 'mixed');
create type public.order_status as enum (
  'pending_pickup', 'picked_up', 'at_vendor', 'invoiced',
  'paid', 'out_for_delivery', 'delivered', 'cancelled'
);
create type public.mismatch_direction as enum ('over', 'under');
create type public.invoice_status as enum ('unpaid', 'paid');
create type public.payment_status as enum ('pending', 'success', 'failed');
create type public.settlement_status as enum ('pending', 'paid');
create type public.referral_status as enum ('pending', 'rewarded');

-- ============================================================
-- Tables
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  qaffy_id text unique,
  name text,
  phone text,
  email text,
  referral_code text unique,
  referred_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  business_name text not null,
  status public.partner_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.logistics_agents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  status public.partner_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.cloth_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.cloth_category_rates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.cloth_categories (id) on delete cascade,
  wash_price numeric(10, 2) not null default 0,
  iron_price numeric(10, 2) not null default 0,
  wash_iron_price numeric(10, 2) not null default 0,
  weight_kg numeric(6, 2),
  created_at timestamptz not null default now()
);

create table public.pickup_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.plan_type not null,
  weekly_limit int not null,
  price numeric(10, 2) not null,
  semester_end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status public.subscription_status not null default 'active',
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now()
);

-- One row per customer; the only mutable columns are the two balances,
-- and those are only ever touched by src/lib/wallet.server.ts.
create table public.wallets (
  customer_id uuid primary key references public.profiles (id) on delete cascade,
  one_off_balance numeric(12, 2) not null default 0 check (one_off_balance >= 0),
  subscription_balance numeric(12, 2) not null default 0 check (subscription_balance >= 0),
  updated_at timestamptz not null default now()
);

-- Append-only ledger; never updated or deleted, only inserted by wallet.server.ts.
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  balance_type public.wallet_balance_type not null,
  txn_type public.wallet_txn_type not null,
  amount numeric(12, 2) not null,
  balance_after numeric(12, 2) not null,
  related_invoice_id uuid,
  related_payment_id uuid,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  order_type public.order_type not null,
  clothes_count_customer int not null,
  clothes_count_vendor int,
  status public.order_status not null default 'pending_pickup',
  pickup_otp text,
  delivery_otp text,
  pickup_location_id uuid references public.pickup_locations (id),
  notes text,
  is_subscription_order boolean not null default false,
  billed_extra_amount numeric(10, 2),
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  category_id uuid not null references public.cloth_categories (id),
  quantity int not null
);

create table public.mismatches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  direction public.mismatch_direction not null,
  detail text,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  amount numeric(10, 2) not null,
  status public.invoice_status not null default 'unpaid',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Paystack top-up transactions only; invoice payment is an internal wallet debit.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'paystack',
  reference text not null unique,
  amount numeric(10, 2) not null,
  balance_type public.wallet_balance_type not null,
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.vendor_settlements (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount_due numeric(10, 2) not null,
  status public.settlement_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.vendor_settlement_orders (
  settlement_id uuid not null references public.vendor_settlements (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  primary key (settlement_id, order_id)
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  referred_id uuid not null unique references public.profiles (id) on delete cascade,
  reward_type text,
  reward_value numeric(10, 2),
  status public.referral_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helper functions (used by RLS policies)
-- ============================================================
create or replace function public.has_role(p_role public.user_role)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = p_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.has_role('admin');
$$;

-- ============================================================
-- Auth triggers: auto-create profile row, assign qaffy_id, block role escalation
-- ============================================================
create sequence public.qaffy_id_seq;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, qaffy_id)
  values (new.id, new.email, 'customer', 'QF' || lpad(nextval('public.qaffy_id_seq')::text, 5, '0'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> old.role and not public.is_admin() then
    raise exception 'Not authorized to change role';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_prevent_role_escalation
before update on public.profiles
for each row execute function public.prevent_role_escalation();

-- Pickup OTP is generated server-side on order creation; never client-set.
-- Qaffy standard: pickup OTPs are always 4 digits.
create or replace function public.generate_pickup_otp()
returns trigger
language plpgsql
as $$
begin
  new.pickup_otp := lpad(floor(random() * 10000)::text, 4, '0');
  return new;
end;
$$;

create trigger trg_orders_pickup_otp
before insert on public.orders
for each row execute function public.generate_pickup_otp();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.logistics_agents enable row level security;
alter table public.cloth_categories enable row level security;
alter table public.cloth_category_rates enable row level security;
alter table public.pickup_locations enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.mismatches enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.vendor_settlements enable row level security;
alter table public.vendor_settlement_orders enable row level security;
alter table public.referrals enable row level security;

-- profiles: everyone can read/update their own row (role changes blocked by trigger); admin sees all
create policy profiles_select on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy profiles_admin_write on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy profiles_update on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- vendors / logistics_agents: partner sees their own row, admin sees/manages all
create policy vendors_select on public.vendors
  for select using (profile_id = auth.uid() or public.is_admin());
create policy vendors_admin_write on public.vendors
  for all using (public.is_admin()) with check (public.is_admin());

create policy logistics_agents_select on public.logistics_agents
  for select using (profile_id = auth.uid() or public.is_admin());
create policy logistics_agents_admin_write on public.logistics_agents
  for all using (public.is_admin()) with check (public.is_admin());

-- reference data: readable by any signed-in user, writable only by admin
create policy cloth_categories_select on public.cloth_categories
  for select using (auth.uid() is not null);
create policy cloth_categories_admin_write on public.cloth_categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy cloth_category_rates_select on public.cloth_category_rates
  for select using (auth.uid() is not null);
create policy cloth_category_rates_admin_write on public.cloth_category_rates
  for all using (public.is_admin()) with check (public.is_admin());

create policy pickup_locations_select on public.pickup_locations
  for select using (auth.uid() is not null);
create policy pickup_locations_admin_write on public.pickup_locations
  for all using (public.is_admin()) with check (public.is_admin());

create policy plans_select on public.plans
  for select using (auth.uid() is not null);
create policy plans_admin_write on public.plans
  for all using (public.is_admin()) with check (public.is_admin());

-- subscriptions: customer reads own; writes admin-only for now (self-serve
-- subscribe flow is a follow-up feature phase, not part of the foundation)
create policy subscriptions_select on public.subscriptions
  for select using (customer_id = auth.uid() or public.is_admin());
create policy subscriptions_admin_write on public.subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

-- wallets / wallet_transactions: read-only for the owner; all writes go
-- through src/lib/wallet.server.ts using the direct DATABASE_URL connection
-- (no insert/update/delete policy for the authenticated/anon roles)
create policy wallets_select on public.wallets
  for select using (customer_id = auth.uid() or public.is_admin());
create policy wallet_transactions_select on public.wallet_transactions
  for select using (customer_id = auth.uid() or public.is_admin());

-- orders: customer manages their own; vendor/logistics/admin have operational visibility
create policy orders_select on public.orders
  for select using (
    customer_id = auth.uid()
    or public.is_admin()
    or public.has_role('vendor')
    or public.has_role('logistics')
  );
create policy orders_insert on public.orders
  for insert with check (customer_id = auth.uid());
create policy orders_update on public.orders
  for update using (
    customer_id = auth.uid()
    or public.is_admin()
    or public.has_role('vendor')
    or public.has_role('logistics')
  );

create policy order_items_select on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and (
      o.customer_id = auth.uid() or public.is_admin() or public.has_role('vendor') or public.has_role('logistics')
    ))
  );
create policy order_items_write on public.order_items
  for all using (public.is_admin() or public.has_role('vendor'))
  with check (public.is_admin() or public.has_role('vendor'));

create policy mismatches_select on public.mismatches
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and (
      o.customer_id = auth.uid() or public.is_admin() or public.has_role('vendor') or public.has_role('logistics')
    ))
  );
create policy mismatches_write on public.mismatches
  for all using (public.is_admin() or public.has_role('vendor'))
  with check (public.is_admin() or public.has_role('vendor'));

create policy invoices_select on public.invoices
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and (
      o.customer_id = auth.uid() or public.is_admin() or public.has_role('vendor')
    ))
  );
create policy invoices_admin_write on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());

-- payments: customer creates their own pending top-up row; only
-- creditWallet() in wallet.server.ts (via DATABASE_URL) may flip it to success/failed
create policy payments_select on public.payments
  for select using (customer_id = auth.uid() or public.is_admin());
create policy payments_insert on public.payments
  for insert with check (customer_id = auth.uid() and status = 'pending');

create policy vendor_settlements_select on public.vendor_settlements
  for select using (
    public.is_admin()
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.profile_id = auth.uid())
  );
create policy vendor_settlements_admin_write on public.vendor_settlements
  for all using (public.is_admin()) with check (public.is_admin());

create policy vendor_settlement_orders_select on public.vendor_settlement_orders
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.vendor_settlements s
      join public.vendors v on v.id = s.vendor_id
      where s.id = settlement_id and v.profile_id = auth.uid()
    )
  );
create policy vendor_settlement_orders_admin_write on public.vendor_settlement_orders
  for all using (public.is_admin()) with check (public.is_admin());

create policy referrals_select on public.referrals
  for select using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());
create policy referrals_admin_write on public.referrals
  for all using (public.is_admin()) with check (public.is_admin());
