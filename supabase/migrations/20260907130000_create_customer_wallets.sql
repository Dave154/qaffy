-- Every customer has a wallet row from account creation onward.
insert into public.wallets (customer_id)
select id
from public.profiles
on conflict (customer_id) do nothing;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, phone, role, qaffy_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'phone',
    'customer',
    'QF' || lpad(nextval('public.qaffy_id_seq')::text, 5, '0')
  )
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name),
    phone = coalesce(public.profiles.phone, excluded.phone);

  insert into public.wallets (customer_id)
  values (new.id)
  on conflict (customer_id) do nothing;

  return new;
end;
$$;