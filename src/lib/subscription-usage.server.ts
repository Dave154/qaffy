import type { TransactionSql } from 'postgres'
import { sql } from './db.server'
import { getSubscriptionWeekStart } from './subscription-week'

export async function getSubscriptionUsageTotals(
  input: {
    customerId: string
    subscription: { id: string; startDate: string; endDate: string | null }
  },
  reference = new Date(),
) {
  const [totals] = await sql<{ used_units: number; used_this_week: number; historical_used: number; historical_used_this_week: number }[]>`
    select
      coalesce(sum(greatest(0, order_row.subscription_units_applied - coalesce(order_row.retroactive_units_applied, 0))::int) filter (
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
      coalesce(sum(greatest(0, order_row.subscription_units_applied - coalesce(order_row.retroactive_units_applied, 0))::int) filter (
        where coalesce(order_row.subscription_units_applied_at, order_row.created_at)
          >= ${getSubscriptionWeekStart(reference).toISOString()}::timestamptz
      ), 0)::int as used_this_week
      ,
      coalesce(sum(order_row.retroactive_units_applied) filter (
        where order_row.retroactive_subscription_id = ${input.subscription.id}::uuid
      ), 0)::int as historical_used,
      coalesce(sum(order_row.retroactive_units_applied) filter (
        where order_row.retroactive_subscription_id = ${input.subscription.id}::uuid
          and (order_row.created_at at time zone 'Africa/Lagos')::date
            >= (${getSubscriptionWeekStart(reference).toISOString()}::timestamptz at time zone 'Africa/Lagos')::date
      ), 0)::int as historical_used_this_week
    from orders order_row
    where order_row.customer_id = ${input.customerId}::uuid
      and (
        order_row.is_subscription_order = true
        or order_row.subscription_allowance_subscription_id is not null
      )
      and order_row.status <> 'cancelled'
      and order_row.clothes_count_vendor is not null
      and order_row.subscription_units_applied is not null
  `

  return {
    usedUnits: Number(totals?.used_units ?? 0),
    usedThisWeek: Number(totals?.used_this_week ?? 0),
    historicalUsed: Number(totals?.historical_used ?? 0),
    historicalUsedThisWeek: Number(totals?.historical_used_this_week ?? 0),
  }
}

function nextWeekStart(reference: Date) {
  return new Date(getSubscriptionWeekStart(reference).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Backdated (historical) units already spent on a subscription: the lifetime total and the
 * amount spent on orders created in the week containing `reference`
 * (window [weekStart, weekStart + 7d)). Cancelled orders and `excludeOrderId` are ignored.
 */
export async function getHistoricalAllowanceUsage(
  db: TransactionSql,
  input: { customerId: string; subscriptionId: string; excludeOrderId?: string },
  reference = new Date(),
) {
  const weekStart = getSubscriptionWeekStart(reference).toISOString()
  const weekEnd = nextWeekStart(reference)
  const excludeId = input.excludeOrderId ?? null
  const [row] = await db<{ historical_used: number | string; historical_used_this_week: number | string }[]>`
    select
      coalesce(sum(retroactive_units_applied), 0)::int as historical_used,
      coalesce(sum(retroactive_units_applied) filter (
        where created_at >= ${weekStart}::timestamptz and created_at < ${weekEnd}::timestamptz
      ), 0)::int as historical_used_this_week
    from orders
    where customer_id = ${input.customerId}::uuid
      and retroactive_subscription_id = ${input.subscriptionId}::uuid
      and status <> 'cancelled'
      and (${excludeId}::uuid is null or id <> ${excludeId}::uuid)
  `
  return {
    historicalUsed: Number(row?.historical_used ?? 0),
    historicalUsedThisWeek: Number(row?.historical_used_this_week ?? 0),
  }
}
