update public.mismatches
set details = (details #>> '{}')::jsonb
where jsonb_typeof(details) = 'string'
  and left(ltrim(details #>> '{}'), 1) = '[';

update public.invoices
set billing_breakdown = (billing_breakdown #>> '{}')::jsonb
where jsonb_typeof(billing_breakdown) = 'string'
  and left(ltrim(billing_breakdown #>> '{}'), 1) = '{';
