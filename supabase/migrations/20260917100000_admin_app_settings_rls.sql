alter table public.app_settings enable row level security;

drop policy if exists app_settings_admin_select on public.app_settings;
create policy app_settings_admin_select on public.app_settings
  for select using (public.is_admin());

drop policy if exists app_settings_admin_insert on public.app_settings;
create policy app_settings_admin_insert on public.app_settings
  for insert with check (public.is_admin());

drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings
  for update using (public.is_admin())
  with check (public.is_admin());