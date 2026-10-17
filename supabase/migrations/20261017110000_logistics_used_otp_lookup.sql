create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$
declare
  installed_schema text;
begin
  select n.nspname
  into installed_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if installed_schema <> 'extensions' then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.logistics_otp_lookup_key (
  singleton boolean primary key default true check (singleton),
  secret bytea not null default extensions.gen_random_bytes(32)
);
revoke all on private.logistics_otp_lookup_key from public, anon, authenticated;
insert into private.logistics_otp_lookup_key default values on conflict (singleton) do nothing;

create table if not exists public.logistics_used_otps (
  id uuid primary key default gen_random_uuid(),
  otp_hash text not null check (otp_hash ~ '^[0-9a-f]{64}$'),
  order_id uuid not null references public.orders (id) on delete cascade,
  handoff_type text not null check (handoff_type in ('picked_up', 'delivered')),
  agent_profile_id uuid references public.profiles (id) on delete set null,
  agent_name text not null,
  confirmed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint logistics_used_otps_expiration_after_confirmation check (expires_at > confirmed_at)
);

create index if not exists logistics_used_otps_lookup_idx
  on public.logistics_used_otps (otp_hash, expires_at desc);

create index if not exists logistics_used_otps_expiration_idx
  on public.logistics_used_otps (expires_at);

create index if not exists orders_pending_pickup_otp_lookup_idx
  on public.orders (right(regexp_replace(coalesce(pickup_otp, ''), '[^0-9]', '', 'g'), 4))
  where status = 'pending_pickup' and pickup_otp is not null;

create index if not exists orders_active_delivery_otp_lookup_idx
  on public.orders (right(regexp_replace(coalesce(delivery_otp, ''), '[^0-9]', '', 'g'), 4))
  where status in ('paid', 'out_for_delivery') and delivery_otp is not null;

alter table public.logistics_used_otps enable row level security;

create or replace function public.generate_pickup_otp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  perform pg_advisory_xact_lock(22017, 1);

  for attempt in 1..10000 loop
    candidate := lpad(floor(random() * 10000)::text, 4, '0');

    if not exists (
      select 1
      from public.orders o
      where o.status in ('pending_pickup', 'paid', 'out_for_delivery')
        and (
          right(regexp_replace(coalesce(o.pickup_otp, ''), '[^0-9]', '', 'g'), 4) = candidate
          or right(regexp_replace(coalesce(o.delivery_otp, ''), '[^0-9]', '', 'g'), 4) = candidate
        )
    ) and not exists (
      select 1
      from public.logistics_used_otps used
      cross join private.logistics_otp_lookup_key lookup_key
      where used.otp_hash = encode(extensions.hmac(convert_to(candidate, 'UTF8'), lookup_key.secret, 'sha256'), 'hex')
        and used.expires_at > now()
    ) then
      new.pickup_otp := candidate;
      return new;
    end if;
  end loop;

  raise exception 'Unable to generate an unused pickup OTP';
end;
$$;
