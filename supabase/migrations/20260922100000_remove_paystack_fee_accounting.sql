alter table public.payments
  drop column if exists charged_amount,
  drop column if exists fee_amount;