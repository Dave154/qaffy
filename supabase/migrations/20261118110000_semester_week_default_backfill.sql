insert into public.app_settings (key, semester_weeks)
values ('semester', 17)
on conflict (key) do update
set semester_weeks = excluded.semester_weeks,
    updated_at = now();

update public.subscriptions s
set semester_weeks_snapshot = 17
from public.plans p
where p.id = s.plan_id
  and p.type = 'semester'
  and s.semester_weeks_snapshot is null;

update public.payments payment
set subscription_semester_weeks_snapshot = 17
from public.plans p
where p.id = payment.plan_id
  and p.type = 'semester'
  and payment.balance_type = 'subscription'
  and payment.status = 'pending'
  and payment.subscription_semester_weeks_snapshot is null;
