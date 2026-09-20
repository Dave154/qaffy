alter table public.payments
  add column if not exists charged_amount numeric(10, 2),
  add column if not exists fee_amount numeric(10, 2) not null default 0;

update public.payments
set charged_amount = amount
where charged_amount is null;

alter table public.payments
  alter column charged_amount set not null;