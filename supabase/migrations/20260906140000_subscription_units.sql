-- Subscription limits count weighted laundry units, not kilograms.
alter table public.cloth_category_rates
  rename column weight_kg to subscription_units;

update public.cloth_category_rates
set subscription_units = coalesce(subscription_units, 1);

alter table public.cloth_category_rates
  alter column subscription_units set default 1,
  alter column subscription_units set not null;

insert into public.cloth_categories (name)
values
  ('General clothing'),
  ('Bedsheet'),
  ('Towel'),
  ('Suit'),
  ('Hoodie'),
  ('Duvet'),
  ('Pair of shoes')
on conflict (name) do nothing;

with category_prices(name, wash_price, iron_price, wash_iron_price, subscription_units) as (
  values
    ('General clothing', 350.00, 350.00, 350.00, 1),
    ('Bedsheet', 700.00, 700.00, 700.00, 3),
    ('Towel', 700.00, 700.00, 700.00, 1),
    ('Suit', 3000.00, 3000.00, 3000.00, 2),
    ('Hoodie', 500.00, 500.00, 500.00, 2),
    ('Duvet', 2500.00, 2500.00, 2500.00, 6),
    ('Pair of shoes', 1200.00, 1200.00, 1200.00, 2)
)
insert into public.cloth_category_rates (
  category_id,
  wash_price,
  iron_price,
  wash_iron_price,
  subscription_units
)
select categories.id, prices.wash_price, prices.iron_price, prices.wash_iron_price, prices.subscription_units
from public.cloth_categories categories
join category_prices prices on prices.name = categories.name
where not exists (
  select 1
  from public.cloth_category_rates rates
  where rates.category_id = categories.id
);

update public.cloth_category_rates rates
set subscription_units = weights.subscription_units
from public.cloth_categories categories
join (
  values
    ('General clothing', 1),
    ('Bedsheet', 3),
    ('Towel', 1),
    ('Suit', 2),
    ('Hoodie', 2),
    ('Duvet', 6),
    ('Pair of shoes', 2)
) as weights(name, subscription_units)
  on weights.name = categories.name
where rates.category_id = categories.id;

alter table public.cloth_category_rates
  drop constraint if exists cloth_category_rates_subscription_units_check;

alter table public.cloth_category_rates
  add constraint cloth_category_rates_subscription_units_check
  check (subscription_units > 0);