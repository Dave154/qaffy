-- Normal one-time orders are recorded as wallet debt until a top-up settles them.
alter table public.wallets
  drop constraint if exists wallets_one_off_balance_check;