alter table public.notification_events
  add column if not exists read_at timestamptz;

alter table public.notification_events
  drop constraint if exists notification_events_order_id_fkey,
  drop constraint if exists notification_events_subscription_id_fkey;

alter table public.notification_events
  add constraint notification_events_order_id_fkey
    foreign key (order_id) references public.orders (id) on delete set null,
  add constraint notification_events_subscription_id_fkey
    foreign key (subscription_id) references public.subscriptions (id) on delete set null;

drop policy if exists notification_events_update on public.notification_events;
create policy notification_events_update on public.notification_events
  for update using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_events'
  ) then
    alter publication supabase_realtime add table public.notification_events;
  end if;
end
$$;
