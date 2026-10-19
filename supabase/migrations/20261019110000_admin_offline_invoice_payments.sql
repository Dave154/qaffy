alter table public.invoices
  add column if not exists payment_method text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_payment_method_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_payment_method_check
      check (payment_method is null or payment_method in ('wallet', 'offline'));
  end if;
end
$$;
