-- Customers may create an invoice for an order they own during checkout.
drop policy if exists invoices_customer_insert on public.invoices;

create policy invoices_customer_insert on public.invoices
  for insert
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.customer_id = auth.uid()
    )
  );