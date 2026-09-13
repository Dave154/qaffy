-- Partner access is represented by the partner tables. Profiles remain customer
-- identities unless they are administrators.

create table if not exists public.profile_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.user_role not null check (role in ('vendor', 'logistics', 'admin')),
  status public.partner_status not null default 'approved',
  created_at timestamptz not null default now(),
  unique (profile_id, role)
);

alter table public.profile_roles enable row level security;

drop policy if exists profile_roles_select on public.profile_roles;
create policy profile_roles_select on public.profile_roles
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists profile_roles_admin_write on public.profile_roles;
create policy profile_roles_admin_write on public.profile_roles
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.profiles
  disable trigger trg_profiles_prevent_role_escalation;

insert into public.vendors (profile_id, business_name, status)
select id, coalesce(name, 'Qaffy Vendor'), 'approved'
from public.profiles
where role = 'vendor'
on conflict (profile_id) do update
set status = 'approved';

insert into public.logistics_agents (profile_id, status)
select id, 'approved'
from public.profiles
where role = 'logistics'
on conflict (profile_id) do update
set status = 'approved';

insert into public.profile_roles (profile_id, role, status)
select profile_id, 'vendor', status
from public.vendors
where status = 'approved'
on conflict (profile_id, role) do update
set status = excluded.status;

insert into public.profile_roles (profile_id, role, status)
select profile_id, 'logistics', status
from public.logistics_agents
where status = 'approved'
on conflict (profile_id, role) do update
set status = excluded.status;

insert into public.profile_roles (profile_id, role, status)
select id, 'admin', 'approved'
from public.profiles
where role = 'admin'
on conflict (profile_id, role) do update
set status = 'approved';

update public.profiles
set role = 'customer'
where role in ('vendor', 'logistics');

alter table public.profiles
  enable trigger trg_profiles_prevent_role_escalation;

create or replace function public.has_role(p_role public.user_role)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_roles
    where profile_id = auth.uid()
      and role = p_role
      and status = 'approved'
  ) or (p_role = 'admin' and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));
$$;

drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select using (
    auth.uid() = id
    or public.is_admin()
    or public.has_role('vendor')
    or public.has_role('logistics')
  );