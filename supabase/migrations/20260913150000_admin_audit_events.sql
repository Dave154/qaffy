create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_at_idx
  on public.admin_audit_events (created_at desc);

alter table public.admin_audit_events enable row level security;

create policy admin_audit_events_select on public.admin_audit_events
  for select using (public.is_admin());

create policy admin_audit_events_insert on public.admin_audit_events
  for insert with check (public.is_admin() and admin_profile_id = auth.uid());