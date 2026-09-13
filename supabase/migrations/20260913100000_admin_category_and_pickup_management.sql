alter table public.cloth_categories
  add column if not exists active boolean not null default true;

create index if not exists cloth_categories_active_idx
  on public.cloth_categories (active);
