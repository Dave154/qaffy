alter table public.payments
  add column if not exists plan_id uuid references public.plans (id);

create index if not exists payments_plan_id_idx
  on public.payments (plan_id)
  where plan_id is not null;