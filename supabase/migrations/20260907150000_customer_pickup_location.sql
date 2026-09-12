-- Store the customer's preferred pickup location for future orders.
alter table public.profiles
  add column if not exists pickup_location_id uuid references public.pickup_locations (id);