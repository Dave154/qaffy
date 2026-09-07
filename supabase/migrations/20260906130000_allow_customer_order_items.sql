-- Customers own the order and may add its item rows during checkout.
drop policy if exists order_items_write on public.order_items;

create policy order_items_write on public.order_items
  for insert
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.customer_id = auth.uid()
    )
    or public.is_admin()
    or public.has_role('vendor')
  );