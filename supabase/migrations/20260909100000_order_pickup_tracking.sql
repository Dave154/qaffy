-- Persist pickup state separately so operational reporting does not depend only on status.
alter table public.orders
  add column if not exists picked boolean not null default false,
  add column if not exists picked_up_date timestamptz;

update public.orders
set picked = true,
    picked_up_date = coalesce(picked_up_date, created_at)
where status = 'picked_up'
  and picked = false;

alter table public.orders
  add constraint orders_picked_date_check
  check ((picked = false and picked_up_date is null) or (picked = true and picked_up_date is not null));
