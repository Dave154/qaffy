-- Keep normal one-time funds nonnegative; subscription usage may become debt.
alter table public.wallets
  drop constraint if exists wallets_one_off_balance_check,
  drop constraint if exists wallets_subscription_balance_check;

alter table public.wallets
  add constraint wallets_one_off_balance_check check (one_off_balance >= 0);