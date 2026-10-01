do $$
declare
  current_max bigint;
begin
  select max((substring(qaffy_id from 3))::bigint)
  into current_max
  from public.profiles
  where qaffy_id ~ '^QF[0-9]+$';

  if current_max is null then
    perform setval('public.qaffy_id_seq', 1, false);
  else
    perform setval('public.qaffy_id_seq', current_max, true);
  end if;
end
$$;

update public.profiles
set qaffy_id = 'QF' || lpad(nextval('public.qaffy_id_seq')::text, 5, '0')
where qaffy_id is null;

alter table public.profiles
  alter column qaffy_id set default ('QF' || lpad(nextval('public.qaffy_id_seq')::text, 5, '0')),
  alter column qaffy_id set not null;