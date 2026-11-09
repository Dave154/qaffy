import { sql } from './db.server'
import { getSubscriptionWeekStart } from './subscription-week'

export async function getSubscriptionUsageTotals(
  input: {
    customerId: string
    subscription: { id: string; startDate: string; endDate: string | null }
  },
  reference = new Date(),
) {
  const [totals] = await sql<{ used_units: number; used_this_week: number }[]>`
    select
      coalesce(sum(order_row.subscription_units_applied) filter (
        where case
          when order_row.subscription_allowance_subscription_id is not null
            then order_row.subscription_allowance_subscription_id = ${input.subscription.id}::uuid
          when order_row.subscription_id = ${input.subscription.id}::uuid then true
          when order_row.subscription_id is not null
            then order_row.subscription_units_applied_at is not null
              and order_row.subscription_units_applied_at >= ${getSubscriptionWeekStart(reference).toISOString()}::timestamptz
          else (order_row.created_at at time zone 'Africa/Lagos')::date >= ${input.subscription.startDate}::date
            and (
              ${input.subscription.endDate}::date is null
              or (order_row.created_at at time zone 'Africa/Lagos')::date <= ${input.subscription.endDate}::date
            )
        end
      ), 0)::int as used_units,
      coalesce(sum(order_row.subscription_units_applied) filter (
        where coalesce(order_row.subscription_units_applied_at, order_row.created_at)
          >= ${getSubscriptionWeekStart(reference).toISOString()}::timestamptz
      ), 0)::int as used_this_week
    from orders order_row
    where order_row.customer_id = ${input.customerId}::uuid
      and order_row.is_subscription_order = true
      and order_row.status <> 'cancelled'
      and order_row.clothes_count_vendor is not null
      and order_row.subscription_units_applied is not null
  `

  return {
    usedUnits: Number(totals?.used_units ?? 0),
    usedThisWeek: Number(totals?.used_this_week ?? 0),
  }
}
