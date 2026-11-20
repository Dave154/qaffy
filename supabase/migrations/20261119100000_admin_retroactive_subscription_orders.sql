alter table public.subscriptions
  add column if not exists retroactive_allowance_units integer not null default 0
    check (retroactive_allowance_units >= 0);

alter table public.orders
  add column if not exists retroactive_subscription_id uuid
    references public.subscriptions(id) on delete set null,
  add column if not exists retroactive_units_applied integer
    check (retroactive_units_applied is null or retroactive_units_applied >= 0);

create index if not exists orders_retroactive_subscription_id_idx
  on public.orders (retroactive_subscription_id)
  where retroactive_subscription_id is not null;

comment on column public.subscriptions.retroactive_allowance_units is
  'Historical allowance units available only to unpaid orders explicitly selected by Admin.';

comment on column public.orders.retroactive_subscription_id is
  'Backdated subscription applied by Admin to this previously unpaid order.';

comment on column public.orders.retroactive_units_applied is
  'Historical subscription units consumed when Admin rebilled this order.';

alter table public.invoices
  drop constraint if exists invoices_payment_method_check;

alter table public.invoices
  add constraint invoices_payment_method_check
  check (payment_method is null or payment_method in ('wallet', 'offline', 'subscription_units'));
