alter table public.cloth_categories
  add column if not exists is_main boolean not null default false;

alter table public.cloth_category_rates
  add column if not exists vendor_wash_price numeric(10, 2) not null default 0,
  add column if not exists vendor_iron_price numeric(10, 2) not null default 0,
  add column if not exists vendor_wash_iron_price numeric(10, 2) not null default 0;

update public.cloth_categories
set is_main = true
where lower(name) = 'general clothing'
  and not exists (select 1 from public.cloth_categories where is_main);

create unique index if not exists cloth_categories_one_main_idx
  on public.cloth_categories (is_main)
  where is_main;