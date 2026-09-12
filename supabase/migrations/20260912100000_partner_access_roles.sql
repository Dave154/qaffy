-- Partner access is represented by the partner tables. Profiles remain customer
-- identities unless they are administrators.

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
  select case p_role
    when 'vendor' then exists (
      select 1 from public.vendors
      where profile_id = auth.uid() and status = 'approved'
    )
    when 'logistics' then exists (
      select 1 from public.logistics_agents
      where profile_id = auth.uid() and status = 'approved'
    )
    else exists (
      select 1 from public.profiles
      where id = auth.uid() and role = p_role
    )
  end;
$$;

drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select using (
    auth.uid() = id
    or public.is_admin()
    or public.has_role('vendor')
    or public.has_role('logistics')
  );