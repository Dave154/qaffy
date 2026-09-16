-- Vendor review, mismatch, and order-item finalization use trusted server paths.
drop policy if exists orders_update on public.orders;
drop policy if exists order_items_write on public.order_items;
drop policy if exists mismatches_write on public.mismatches;

create policy orders_admin_update on public.orders
  for update using (public.is_admin())
  with check (public.is_admin());

create policy order_items_customer_insert on public.order_items
  for insert
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.customer_id = auth.uid()
    )
    or public.is_admin()
  );

create policy mismatches_admin_write on public.mismatches
  for all using (public.is_admin())
  with check (public.is_admin());

create unique index if not exists vendor_settlement_orders_order_unique
  on public.vendor_settlement_orders (order_id);