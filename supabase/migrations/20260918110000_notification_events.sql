create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  notification_type text not null,
  order_id uuid references public.orders (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_events_customer_id_idx
  on public.notification_events (customer_id, created_at desc);

alter table public.notification_events enable row level security;

drop policy if exists notification_events_select on public.notification_events;
create policy notification_events_select on public.notification_events
  for select using (customer_id = auth.uid());
