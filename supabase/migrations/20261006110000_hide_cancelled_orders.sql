drop policy if exists orders_select on public.orders;

create policy orders_select on public.orders
  for select using (
    public.is_admin()
    or public.has_role('admin')
    or (
      status <> 'cancelled'
      and (
        customer_id = auth.uid()
        or public.has_role('vendor')
        or public.has_role('logistics')
      )
    )
  );
