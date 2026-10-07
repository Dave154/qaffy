create index if not exists profiles_customer_created_page_idx
  on public.profiles (created_at desc, id desc)
  where role = 'customer';

create index if not exists profile_roles_approved_profile_role_idx
  on public.profile_roles (profile_id, role)
  where status = 'approved';

create index if not exists orders_customer_created_page_idx
  on public.orders (customer_id, created_at desc);

create index if not exists subscriptions_active_customer_created_idx
  on public.subscriptions (customer_id, created_at desc)
  where status = 'active';

create index if not exists payments_success_plan_customer_idx
  on public.payments (customer_id)
  where status = 'success' and plan_id is not null;
