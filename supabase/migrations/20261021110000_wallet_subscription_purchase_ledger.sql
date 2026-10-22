alter table public.wallet_transactions
  add column if not exists related_subscription_id uuid references public.subscriptions (id) on delete set null;

create index if not exists wallet_transactions_related_subscription_id_idx
  on public.wallet_transactions (related_subscription_id)
  where related_subscription_id is not null;
