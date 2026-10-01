alter table public.cloth_category_rates
  add constraint cloth_category_rates_vendor_wash_not_above_customer
  check (vendor_wash_price <= wash_price),
  add constraint cloth_category_rates_vendor_iron_not_above_customer
  check (vendor_iron_price <= iron_price),
  add constraint cloth_category_rates_vendor_wash_iron_not_above_customer
  check (vendor_wash_iron_price <= wash_iron_price);