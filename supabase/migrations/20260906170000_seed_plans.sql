-- Seed the plans currently offered in the customer portal.
-- Safe to run repeatedly: each name/billing-period pair is inserted once.
create unique index if not exists plans_name_type_unique
  on public.plans (name, type);

insert into public.plans (
  name,
  type,
  weekly_limit,
  price,
  semester_end_date,
  active
)
select seeded.name, seeded.type::public.plan_type, seeded.weekly_limit, seeded.price, seeded.semester_end_date, true
from (
  values
    ('Lite', 'monthly', 20, 18000.00, null::date),
    ('Silver', 'monthly', 20, 27000.00, null::date),
    ('Gold', 'monthly', 25, 33000.00, null::date),
    ('Lite', 'semester', 20, 100000.00, null::date),
    ('Silver', 'semester', 20, 150000.00, null::date),
    ('Gold', 'semester', 25, 185000.00, null::date)
) as seeded(name, type, weekly_limit, price, semester_end_date)
where not exists (
  select 1
  from public.plans existing
  where existing.name = seeded.name
    and existing.type = seeded.type::public.plan_type
);