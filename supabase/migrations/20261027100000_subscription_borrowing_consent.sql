alter table public.orders
  add column if not exists subscription_borrow_consent_units integer not null default 0
    check (subscription_borrow_consent_units >= 0);
