create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  semester_start_date date,
  semester_end_date date,
  updated_at timestamptz not null default now()
);
