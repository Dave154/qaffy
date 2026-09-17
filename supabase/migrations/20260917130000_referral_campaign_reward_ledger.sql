alter type public.referral_status add value if not exists 'qualified';
alter type public.referral_status add value if not exists 'rejected';
alter type public.referral_status add value if not exists 'expired';
alter type public.referral_status add value if not exists 'reversed';

create type public.referral_campaign_status as enum ('draft', 'active', 'paused', 'ended');
create type public.referral_reward_status as enum ('pending', 'issued', 'expired', 'reversed', 'failed');

create table public.referral_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.referral_campaign_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  referrer_reward_type text not null default 'wallet_credit' check (referrer_reward_type = 'wallet_credit'),
  referrer_reward_value numeric(10, 2) not null check (referrer_reward_value > 0),
  referred_reward_type text not null default 'wallet_credit' check (referred_reward_type = 'wallet_credit'),
  referred_reward_value numeric(10, 2) not null check (referred_reward_value > 0),
  minimum_order_amount numeric(10, 2) not null default 0 check (minimum_order_amount >= 0),
  reward_expiry_days int not null default 90 check (reward_expiry_days > 0),
  max_rewards_per_referrer int check (max_rewards_per_referrer is null or max_rewards_per_referrer > 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

alter table public.referrals
  add column if not exists campaign_id uuid references public.referral_campaigns (id),
  add column if not exists qualified_at timestamptz,
  add column if not exists qualifying_order_id uuid references public.orders (id),
  add column if not exists rejection_reason text,
  add column if not exists updated_at timestamptz not null default now();

create table public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid not null references public.referral_campaigns (id),
  qualifying_order_id uuid not null references public.orders (id),
  reward_type text not null check (reward_type = 'wallet_credit'),
  reward_value numeric(10, 2) not null check (reward_value > 0),
  status public.referral_reward_status not null default 'pending',
  wallet_transaction_id uuid,
  expires_at timestamptz not null,
  issued_at timestamptz,
  reversed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (referral_id, recipient_id, reward_type)
);

create index referral_campaigns_active_idx
  on public.referral_campaigns (status, starts_at, ends_at);
create unique index referral_campaigns_one_active_idx
  on public.referral_campaigns (status)
  where status = 'active';
create index referrals_campaign_id_idx on public.referrals (campaign_id);
create index referral_rewards_recipient_idx on public.referral_rewards (recipient_id, status, expires_at);
create index referral_rewards_qualifying_order_idx on public.referral_rewards (qualifying_order_id);

alter table public.referral_campaigns enable row level security;
alter table public.referral_rewards enable row level security;

create policy referral_campaigns_select on public.referral_campaigns
  for select using (auth.uid() is not null and (status = 'active' or public.is_admin()));
create policy referral_campaigns_admin_write on public.referral_campaigns
  for all using (public.is_admin()) with check (public.is_admin());

create policy referral_rewards_select on public.referral_rewards
  for select using (
    recipient_id = auth.uid()
    or exists (
      select 1 from public.referrals r
      where r.id = referral_id and r.referrer_id = auth.uid()
    )
    or public.is_admin()
  );
create policy referral_rewards_admin_write on public.referral_rewards
  for all using (public.is_admin()) with check (public.is_admin());