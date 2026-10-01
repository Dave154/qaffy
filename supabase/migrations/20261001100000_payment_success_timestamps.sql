alter table public.payments
  add column if not exists succeeded_at timestamptz;

update public.payments
set succeeded_at = created_at
where status = 'success'
  and succeeded_at is null;