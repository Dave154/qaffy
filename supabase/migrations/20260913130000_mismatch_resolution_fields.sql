alter table public.mismatches
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles (id);

create index if not exists mismatches_unresolved_created_at_idx
  on public.mismatches (created_at desc)
  where resolved_at is null;