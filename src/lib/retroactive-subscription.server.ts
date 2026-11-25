import type { TransactionSql } from 'postgres'
import { calculateSubscriptionBilling } from './subscription-billing'
import { sql } from './db.server'
import { generateFourDigitOtp } from './order-otp.server'
import {
  calculateSubscriptionAllowance,
  calculateWeeklyBackdatedAllowance,
  getSubscriptionWeekStart,
} from './subscription-week'
import { getHistoricalAllowanceUsage } from './subscription-usage.server'

type RetroactiveOrderCandidate = {
  id: string
  public_order_number: string
  status: string
  created_at: Date | string
  item_count: number
  amount: number
}

type RetroactiveSubscription = {
  id: string
  customer_id: string
  start_date: string
  end_date: string | null
  created_at: Date | string
  weekly_limit_snapshot: number
  semester_weeks_snapshot: number | null
  covers_wash_snapshot: boolean
  covers_iron_snapshot: boolean
  retroactive_allowance_units: number
}

export type RetroactiveInvoiceResult = {
  invoiceId: string
  orderId: string
  publicOrderNumber: string
  amount: number
  coveredUnits: number
  historicalUnits: number
  currentUnits: number
  paid: boolean
}

export class RetroactiveSubscriptionError extends Error {}

type RetroactiveSubscriptionSummaryRow = {
  id: string
  plan_name: string | null
  start_date: Date | string
  end_date: Date | string | null
  created_at: Date | string
  retroactive_allowance_units: number
}

function dateOnly(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
}

export async function getRetroactiveSubscriptionOrderCandidates(input: {
  customerId: string
  subscriptionId: string
}) {
  const [subscription] = await sql<RetroactiveSubscriptionSummaryRow[]>`
    select
      subscription.id,
      plan.name as plan_name,
      subscription.start_date,
      subscription.end_date,
      subscription.created_at,
      subscription.retroactive_allowance_units
    from subscriptions subscription
    left join plans plan on plan.id = subscription.plan_id
    where subscription.id = ${input.subscriptionId}::uuid
      and subscription.customer_id = ${input.customerId}::uuid
  `
  if (!subscription) return null
  const startDate = dateOnly(subscription.start_date)
  const endDate = subscription.end_date ? dateOnly(subscription.end_date) : null
  const createdAt = subscription.created_at instanceof Date
    ? subscription.created_at.toISOString()
    : String(subscription.created_at)
  const [usage] = await sql<{ used_units: number | string }[]>`
    select coalesce(sum(retroactive_units_applied), 0)::int as used_units
    from orders
    where customer_id = ${input.customerId}::uuid
      and retroactive_subscription_id = ${subscription.id}::uuid
  `

  const orders = await sql<RetroactiveOrderCandidate[]>`
    select
      order_row.id,
      order_row.public_order_number,
      order_row.status,
      order_row.created_at,
      count(item.id)::int as item_count,
      invoice.amount
    from orders order_row
    join invoices invoice on invoice.order_id = order_row.id
    join order_items item on item.order_id = order_row.id
    where order_row.customer_id = ${input.customerId}::uuid
      and order_row.retroactive_subscription_id is null
      and order_row.status in ('invoiced', 'out_for_delivery')
      and order_row.clothes_count_vendor is not null
      and invoice.status = 'unpaid'
      and order_row.created_at <= ${createdAt}::timestamptz
      and (order_row.created_at at time zone 'Africa/Lagos')::date >= ${startDate}::date
      and (
        ${endDate}::date is null
        or (order_row.created_at at time zone 'Africa/Lagos')::date <= ${endDate}::date
      )
      and not exists (
        select 1
        from order_items incomplete
        where incomplete.order_id = order_row.id
          and incomplete.confirmed_quantity is null
      )
    group by order_row.id, invoice.amount
    order by order_row.created_at, order_row.id
  `

  const totalUnits = Number(subscription.retroactive_allowance_units)
  const usedUnits = Number(usage?.used_units ?? 0)
  return {
    subscriptionId: subscription.id,
    planName: subscription.plan_name ?? 'Subscription',
    startDate,
    endDate,
    totalUnits,
    usedUnits,
    remainingUnits: Math.max(0, totalUnits - usedUnits),
    orders: orders.map((order) => ({
      id: order.id,
      publicOrderNumber: order.public_order_number,
      status: order.status,
      createdAt: order.created_at instanceof Date ? order.created_at.toISOString() : String(order.created_at),
      itemCount: Number(order.item_count),
      amount: Number(order.amount),
    })),
  }
}

export async function applyRetroactiveSubscriptionOrders(
  tx: TransactionSql,
  input: {
    customerId: string
    subscriptionId: string
    orderIds: string[]
  },
) {
  const [subscription] = await tx<RetroactiveSubscription[]>`
    select
      id,
      customer_id,
      start_date::text as start_date,
      end_date::text as end_date,
      created_at,
      weekly_limit_snapshot,
      semester_weeks_snapshot,
      covers_wash_snapshot,
      covers_iron_snapshot,
      retroactive_allowance_units
    from subscriptions
    where id = ${input.subscriptionId}::uuid
      and customer_id = ${input.customerId}::uuid
    for update
  `
  if (!subscription) throw new RetroactiveSubscriptionError('The backdated subscription could not be found.')

  const [clock] = await tx<{ now: Date | string }[]>`select now() as now`
  const reference = new Date(clock.now)
  const [alreadyApplied] = await tx<{ historical_units: number | string; current_units: number | string }[]>`
    select
      coalesce(sum(retroactive_units_applied), 0)::int as historical_units,
      coalesce(sum(greatest(0, subscription_units_applied - coalesce(retroactive_units_applied, 0))), 0)::int as current_units
    from orders
    where customer_id = ${input.customerId}::uuid
      and retroactive_subscription_id = ${input.subscriptionId}::uuid
  `
  const [existingUsage] = await tx<{ used_units: number | string }[]>`
    select coalesce(sum(greatest(0, order_row.subscription_units_applied - coalesce(order_row.retroactive_units_applied, 0))), 0)::int as used_units
    from orders order_row
    where order_row.customer_id = ${input.customerId}::uuid
      and (
        order_row.is_subscription_order = true
        or order_row.subscription_allowance_subscription_id is not null
      )
      and order_row.status <> 'cancelled'
      and order_row.clothes_count_vendor is not null
      and order_row.subscription_units_applied is not null
      and order_row.id <> all(${input.orderIds}::uuid[])
      and (
        order_row.subscription_allowance_subscription_id = ${input.subscriptionId}::uuid
        or (
          order_row.subscription_allowance_subscription_id is null
          and (
            order_row.subscription_id = ${input.subscriptionId}::uuid
            or (
              order_row.subscription_id is not null
              and order_row.subscription_units_applied_at >= ${getSubscriptionWeekStart(reference).toISOString()}::timestamptz
            )
            or (
              order_row.subscription_id is null
              and (order_row.created_at at time zone 'Africa/Lagos')::date >= ${subscription.start_date}::date
              and (
                ${subscription.end_date}::date is null
                or (order_row.created_at at time zone 'Africa/Lagos')::date <= ${subscription.end_date}::date
              )
            )
          )
        )
      )
  `
  let historicalUnitsRemaining = Math.max(
    0,
    Number(subscription.retroactive_allowance_units) - Number(alreadyApplied?.historical_units ?? 0),
  )
  const createdAt = subscription.created_at instanceof Date
    ? subscription.created_at.toISOString()
    : String(subscription.created_at)
  const currentAllowance = calculateSubscriptionAllowance(
    {
      weeklyLimit: Number(subscription.weekly_limit_snapshot),
      startDate: subscription.start_date,
      startAt: createdAt,
      endDate: subscription.end_date,
      semesterWeeks: subscription.semester_weeks_snapshot,
      usedUnits: Number(alreadyApplied?.current_units ?? 0) + Number(existingUsage?.used_units ?? 0),
      retroactiveUnits: Number(subscription.retroactive_allowance_units),
    },
    reference,
  )
  let currentUnitsRemaining = Math.max(0, currentAllowance.balance)
  const results: RetroactiveInvoiceResult[] = []

  for (const orderId of input.orderIds) {
    const [order] = await tx`
      select
        order_row.id,
        order_row.public_order_number,
        order_row.status,
        order_row.created_at,
        order_row.delivery_otp,
        invoice.id as invoice_id,
        invoice.amount as invoice_amount
      from orders order_row
      join invoices invoice on invoice.order_id = order_row.id
      where order_row.id = ${orderId}::uuid
        and order_row.customer_id = ${input.customerId}::uuid
        and order_row.retroactive_subscription_id is null
        and order_row.status in ('invoiced', 'out_for_delivery')
        and order_row.clothes_count_vendor is not null
        and invoice.status = 'unpaid'
        and order_row.created_at <= ${subscription.created_at}::timestamptz
        and (order_row.created_at at time zone 'Africa/Lagos')::date >= ${subscription.start_date}::date
        and (
          ${subscription.end_date}::date is null
          or (order_row.created_at at time zone 'Africa/Lagos')::date <= ${subscription.end_date}::date
        )
        and not exists (
          select 1
          from order_items incomplete
          where incomplete.order_id = order_row.id
            and incomplete.confirmed_quantity is null
        )
      for update of order_row, invoice
    `
    if (!order) throw new RetroactiveSubscriptionError('This order is no longer eligible. Refresh the list and try again.')

    const items = await tx`
      select
        item.id,
        item.category_id,
        item.service,
        item.unit_price,
        item.subscription_units_snapshot,
        item.regular_wash_price_snapshot,
        item.regular_iron_price_snapshot,
        item.regular_wash_iron_price_snapshot,
        item.confirmed_quantity,
        rates.wash_price,
        rates.iron_price,
        rates.wash_iron_price,
        rates.subscriber_wash_price,
        rates.subscriber_iron_price,
        rates.subscriber_wash_iron_price,
        rates.subscription_units
      from order_items item
      join cloth_category_rates rates on rates.category_id = item.category_id
      where item.order_id = ${orderId}::uuid
      order by item.id
      for update of item
    `
    if (items.length === 0 || items.some((item) => item.confirmed_quantity === null)) {
      throw new RetroactiveSubscriptionError(`Order ${order.public_order_number} has no complete vendor-confirmed item quantities.`)
    }

    const historicalWeekUsage = await getHistoricalAllowanceUsage(
      tx,
      { customerId: input.customerId, subscriptionId: subscription.id, excludeOrderId: orderId },
      new Date(order.created_at),
    )
    const weeklyHistoricalAllowance = calculateWeeklyBackdatedAllowance(
      {
        weeklyLimit: Number(subscription.weekly_limit_snapshot),
        startDate: subscription.start_date,
        startAt: createdAt,
        retroactiveUnits: Number(subscription.retroactive_allowance_units),
        historicalUsed: Number(subscription.retroactive_allowance_units) - historicalUnitsRemaining,
        historicalUsedThisWeek: historicalWeekUsage.historicalUsedThisWeek,
      },
      new Date(order.created_at),
    )

    const billingItems = items.map((item) => {
      const unitsPerItem = Number(item.subscription_units_snapshot ?? item.subscription_units)
      const regularWashPrice = Number(item.regular_wash_price_snapshot ?? item.wash_price)
      const regularIronPrice = Number(item.regular_iron_price_snapshot ?? item.iron_price)
      const regularWashIronPrice = Number(item.regular_wash_iron_price_snapshot ?? item.wash_iron_price)
      const subscriberWashPrice = Number(item.subscriber_wash_price ?? 0)
      const subscriberIronPrice = Number(item.subscriber_iron_price ?? 0)
      const subscriberWashIronPrice = Number(item.subscriber_wash_iron_price ?? 0)
      if (
        !Number.isSafeInteger(unitsPerItem) ||
        unitsPerItem <= 0 ||
        ![regularWashPrice, regularIronPrice, regularWashIronPrice, subscriberWashPrice, subscriberIronPrice, subscriberWashIronPrice].every(
          Number.isFinite,
        )
      ) {
        throw new RetroactiveSubscriptionError(`Current subscription rates are unavailable for order ${order.public_order_number}.`)
      }
      return {
        id: item.id,
        service: item.service as 'wash' | 'iron' | 'wash_iron',
        quantity: Number(item.confirmed_quantity),
        unitsPerItem,
        regularPrice: Number(item.unit_price),
        regularWashPrice,
        regularIronPrice,
        subscriberWashPrice,
        subscriberIronPrice,
        subscriberWashIronPrice,
      }
    })
    const availableUnits = weeklyHistoricalAllowance.availableUnits + currentUnitsRemaining
    const billing = calculateSubscriptionBilling(
      billingItems,
      {
        wash: subscription.covers_wash_snapshot,
        iron: subscription.covers_iron_snapshot,
      },
      availableUnits,
    )
    if (billing.coveredUnits === 0) {
      throw new RetroactiveSubscriptionError(
        availableUnits > 0
          ? `This subscription does not cover any services in order ${order.public_order_number}.`
          : 'No backdated or current subscription units are available to apply.',
      )
    }
    const historicalUsed = Math.min(weeklyHistoricalAllowance.availableUnits, billing.coveredUnits)
    const currentUsed = Math.max(0, billing.coveredUnits - historicalUsed)
    historicalUnitsRemaining -= historicalUsed
    currentUnitsRemaining -= currentUsed
    const amount = Math.round(billing.totalAmount * 100) / 100
    const paid = amount === 0
    const deliveryOtp = paid && !order.delivery_otp ? await generateFourDigitOtp(tx) : order.delivery_otp

    for (const item of items) {
      await tx`
        update order_items
        set subscriber_wash_price_snapshot = ${item.subscriber_wash_price}::numeric,
            subscriber_iron_price_snapshot = ${item.subscriber_iron_price}::numeric,
            subscriber_wash_iron_price_snapshot = ${item.subscriber_wash_iron_price}::numeric
        where id = ${item.id}
      `
    }
    await tx`
      update orders
      set retroactive_subscription_id = ${subscription.id},
          retroactive_units_applied = ${historicalUsed},
          subscription_allowance_subscription_id = ${subscription.id},
          subscription_units_applied = ${currentUsed},
          subscription_units_applied_at = case when ${currentUsed} > 0 then now() else null end,
          status = case
            when ${paid} and status <> 'out_for_delivery' then 'paid'
            else status
          end,
          delivery_otp = case when ${paid} then ${deliveryOtp} else delivery_otp end
      where id = ${orderId}::uuid
    `
    await tx`
      update invoices
      set amount = ${amount},
          status = case
            when ${paid} then 'paid'::public.invoice_status
            else 'unpaid'::public.invoice_status
          end,
          payment_method = case when ${paid} then 'subscription_units' else null end,
          paid_at = case when ${paid} then now() else null end,
          billing_breakdown = ${tx.json({
            coveredUnits: billing.coveredUnits,
            subscriberAmount: Math.round(billing.subscriberAmount * 100) / 100,
            regularAmount: Math.round(billing.regularAmount * 100) / 100,
            items: billing.lines.map((line) => ({ itemId: line.id, creditsUsed: line.coveredUnits })),
          })}::jsonb
      where id = ${order.invoice_id}::uuid
    `

    results.push({
      invoiceId: order.invoice_id,
      orderId: order.id,
      publicOrderNumber: order.public_order_number,
      amount,
      coveredUnits: billing.coveredUnits,
      historicalUnits: historicalUsed,
      currentUnits: currentUsed,
      paid,
    })
  }

  return results
}
