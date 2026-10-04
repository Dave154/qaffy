alter table public.invoices
  add column if not exists billing_breakdown jsonb;

drop policy if exists plan_category_rates_select on public.plan_category_rates;
create policy plan_category_rates_select on public.plan_category_rates
  for select using (public.is_admin());
