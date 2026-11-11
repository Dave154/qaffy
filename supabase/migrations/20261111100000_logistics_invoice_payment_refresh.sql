create policy "Logistics can receive invoice payment refreshes"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'logistics:invoice-payment'
    and public.has_role('logistics')
  );

create or replace function public.broadcast_logistics_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'paid' then
      perform realtime.send('{}'::jsonb, 'invoice_paid', 'logistics:invoice-payment', true);
    end if;
  elsif new.status = 'paid' and old.status is distinct from new.status then
    perform realtime.send('{}'::jsonb, 'invoice_paid', 'logistics:invoice-payment', true);
  end if;

  return new;
end;
$$;

revoke all on function public.broadcast_logistics_invoice_paid() from public, anon, authenticated;

create trigger invoices_broadcast_logistics_payment
  after insert or update of status on public.invoices
  for each row
  execute function public.broadcast_logistics_invoice_paid();
