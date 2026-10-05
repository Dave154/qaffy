alter type public.wallet_txn_type add value if not exists 'cashback';

alter table public.app_settings
  add column if not exists cashback_percent numeric(5, 2) not null default 0;

insert into public.app_settings (key, cashback_percent)
values ('cashback', 0)
on conflict (key) do update set cashback_percent = excluded.cashback_percent;
