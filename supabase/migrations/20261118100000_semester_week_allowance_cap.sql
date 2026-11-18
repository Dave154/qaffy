alter table public.app_settings
  add column if not exists semester_weeks integer;

alter table public.subscriptions
  add column if not exists semester_weeks_snapshot integer;

alter table public.payments
  add column if not exists subscription_semester_weeks_snapshot integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_settings_semester_weeks_positive'
  ) then
    alter table public.app_settings
      add constraint app_settings_semester_weeks_positive
      check (semester_weeks is null or semester_weeks > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_semester_weeks_snapshot_positive'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_semester_weeks_snapshot_positive
      check (semester_weeks_snapshot is null or semester_weeks_snapshot > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payments_subscription_semester_weeks_snapshot_positive'
  ) then
    alter table public.payments
      add constraint payments_subscription_semester_weeks_snapshot_positive
      check (subscription_semester_weeks_snapshot is null or subscription_semester_weeks_snapshot > 0);
  end if;
end
$$;
