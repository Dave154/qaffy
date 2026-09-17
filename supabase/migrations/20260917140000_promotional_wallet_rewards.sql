alter type public.wallet_balance_type add value if not exists 'promotional';
alter type public.wallet_txn_type add value if not exists 'referral_reward';
alter type public.wallet_txn_type add value if not exists 'referral_reward_expiry';

alter table public.wallets
  add column if not exists promotional_balance numeric(12, 2) not null default 0 check (promotional_balance >= 0);

alter table public.wallet_transactions
  add column if not exists related_referral_reward_id uuid references public.referral_rewards (id);

alter table public.referral_rewards
  add column if not exists remaining_value numeric(10, 2) not null default 0 check (remaining_value >= 0);