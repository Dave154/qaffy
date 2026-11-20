import type { TransactionSql } from 'postgres'
import { sql } from './db.server'
import type { PlanType } from '../types/database.types'
import {
  addCalendarDaysToDate,
  getSubscriptionEndDate,
  getSubscriptionStartState,
  isValidSemesterWeeks,
  subscriptionPurchaseQuotesMatch,
} from './subscription-terms'
import type { SubscriptionPurchaseQuote } from './subscription-terms'
import type { SubscriptionCheckoutState } from './subscription-checkout'
import { calculateRetroactiveSubscriptionUnits } from './subscription-week'

type SubscriptionSnapshotInput = {
  customerId: string
  planId: string
  startDate: string
  endDate: string
  status?: 'active' | 'scheduled'
  isQueuedRenewal?: boolean
  priceSnapshot?: number | null
  weeklyLimitSnapshot?: number
  semesterWeeksSnapshot?: number | null
  coversWashSnapshot?: boolean
  coversIronSnapshot?: boolean
}

type SubscriptionPurchaseTerms = SubscriptionPurchaseQuote

export { addCalendarMonthsToDate } from './subscription-terms'

export async function lockCustomerSubscription(tx: TransactionSql, customerId: string) {
  await tx`select pg_advisory_xact_lock(hashtextextended(${customerId}, 0))`
}

function dateOnly(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
}

export async function resolveSubscriptionPurchaseTerms(
  tx: TransactionSql,
  customerId: string,
  planId: string,
  requireActivePlan = true,
): Promise<SubscriptionPurchaseTerms> {
  const [clock] = await tx<{ today: string }[]>`select (now() at time zone 'Africa/Lagos')::date::text as today`
  const today = clock.today
  await tx`
    update subscriptions
    set status = 'ended', is_queued_renewal = false
    where customer_id = ${customerId}
      and status = 'scheduled'
      and end_date < ${today}::date
  `
  await tx`
    update subscriptions
    set is_queued_renewal = false
    where customer_id = ${customerId}
      and status = 'scheduled'
      and is_queued_renewal = true
      and start_date <= ${today}::date
      and end_date >= ${today}::date
  `
  const [queued] = await tx`
    select id
    from subscriptions
    where customer_id = ${customerId}
      and status = 'scheduled'
      and is_queued_renewal = true
      and start_date > ${today}::date
      and end_date >= ${today}::date
    limit 1
    for update
  `
  if (queued) throw new Error('You already have a renewal scheduled.')

  const [current] = await tx`
    select end_date::text as end_date
    from subscriptions
    where customer_id = ${customerId}
      and status in ('active', 'scheduled')
      and start_date <= ${today}::date
      and (end_date is null or end_date >= ${today}::date)
    order by start_date desc, created_at desc
    limit 1
    for update
  `
  if (current && !current.end_date) {
    throw new Error('Your current subscription has no end date. Contact support before purchasing another plan.')
  }
  const scheduled = Boolean(current)
  const startDate = current ? addCalendarDaysToDate(dateOnly(current.end_date), 1) : today

  const [plan] = await tx`
    select id, name, type, price, weekly_limit, covers_wash, covers_iron
    from plans
    where id = ${planId} and (${requireActivePlan} = false or active = true)
    for share
  `
  if (!plan) throw new Error('This plan is no longer available.')

  const [settings] = await tx<{ semester_end_date: Date | string | null; semester_weeks: number | null }[]>`
    select semester_end_date, semester_weeks
    from app_settings
    where key = 'semester'
    limit 1
  `
  const semesterEndDate = settings?.semester_end_date ? dateOnly(settings.semester_end_date) : null
  const semesterWeeks = plan.type === 'semester' ? Number(settings?.semester_weeks) : null
  if (plan.type === 'semester' && !isValidSemesterWeeks(semesterWeeks)) {
    throw new Error('Set a valid number of semester weeks in Admin Plans before purchasing or creating a semester subscription.')
  }
  if (semesterWeeks !== null && !Number.isSafeInteger(Number(plan.weekly_limit) * semesterWeeks)) {
    throw new Error('The semester allowance exceeds the supported unit limit. Update the semester weeks or plan weekly limit.')
  }
  const endDate = getSubscriptionEndDate(plan.type as PlanType, startDate, semesterEndDate)

  return {
    planId: plan.id,
    planName: plan.name,
    planType: plan.type as PlanType,
    amount: Number(plan.price),
    startDate,
    endDate,
    scheduled,
    weeklyLimit: Number(plan.weekly_limit),
    semesterWeeks,
    coversWash: Boolean(plan.covers_wash),
    coversIron: Boolean(plan.covers_iron),
  }
}

export async function ensureNoPendingSubscriptionPayment(tx: TransactionSql, customerId: string) {
  const [pending] = await tx`
    select id
    from payments
    where customer_id = ${customerId}
      and plan_id is not null
      and (
        status = 'pending'
        or (status = 'success' and subscription_id is null)
      )
    limit 1
    for update
  `
  if (pending) {
    throw new Error(
      'A subscription payment is already awaiting confirmation or activation. Complete or wait for that checkout before starting another.',
    )
  }
}

export async function getPendingSubscriptionPayment(customerId: string) {
  return sql.begin(async (tx) => {
    await lockCustomerSubscription(tx, customerId)
    const [payment] = await tx`
      select reference, amount, authorization_url, subscription_checkout_state
      from payments
      where customer_id = ${customerId}
        and plan_id is not null
        and status = 'pending'
      order by created_at desc
      limit 1
      for update
    `
    return payment
      ? {
          reference: String(payment.reference),
          amount: Number(payment.amount),
          authorizationUrl: payment.authorization_url ? String(payment.authorization_url) : null,
          checkoutState: payment.subscription_checkout_state as SubscriptionCheckoutState,
        }
      : null
  })
}

export async function getSubscriptionPurchaseOffer(customerId: string, planId: string) {
  return sql.begin(async (tx) => {
    await lockCustomerSubscription(tx, customerId)
    await ensureNoPendingSubscriptionPayment(tx, customerId)
    return resolveSubscriptionPurchaseTerms(tx, customerId, planId)
  })
}

export async function createPendingSubscriptionPayment(
  customerId: string,
  planId: string,
  reference: string,
  expectedAmount?: number,
  expectedTerms?: SubscriptionPurchaseQuote,
) {
  return sql.begin(async (tx) => {
    await lockCustomerSubscription(tx, customerId)
    await ensureNoPendingSubscriptionPayment(tx, customerId)
    const terms = await resolveSubscriptionPurchaseTerms(tx, customerId, planId)
    if (expectedTerms && !subscriptionPurchaseQuotesMatch(terms, expectedTerms))
      throw new Error('SUBSCRIPTION_TERMS_CHANGED')
    if (expectedAmount !== undefined && expectedAmount !== terms.amount) throw new Error('PLAN_PRICE_CHANGED')
    await tx`
      insert into payments (
        customer_id, provider, reference, amount, balance_type, plan_id, status,
        subscription_checkout_state, subscription_start_date_snapshot, subscription_end_date_snapshot,
        subscription_weekly_limit_snapshot, subscription_semester_weeks_snapshot,
        subscription_covers_wash_snapshot, subscription_covers_iron_snapshot
      )
      values (
        ${customerId}, 'paystack', ${reference}, ${terms.amount}, 'subscription', ${planId}, 'pending',
        'initializing', ${terms.startDate}, ${terms.endDate}, ${terms.weeklyLimit}, ${terms.semesterWeeks},
        ${terms.coversWash}, ${terms.coversIron}
      )
    `
    return terms
  })
}

export async function saveSubscriptionPaymentAuthorizationUrl(customerId: string, reference: string, authorizationUrl: string) {
  const [payment] = await sql`
    update payments
    set authorization_url = ${authorizationUrl}, subscription_checkout_state = 'ready'
    where customer_id = ${customerId}
      and reference = ${reference}
      and plan_id is not null
      and status = 'pending'
      and subscription_checkout_state = 'initializing'
    returning id
  `
  if (!payment) throw new Error('The pending subscription checkout is no longer available.')
}

export async function failPendingSubscriptionPayment(reference: string) {
  await sql`
    update payments
    set status = 'failed', subscription_checkout_state = 'failed'
    where reference = ${reference}
      and provider = 'paystack'
      and plan_id is not null
      and status = 'pending'
  `
}

export async function insertSubscriptionWithSnapshot(tx: TransactionSql, input: SubscriptionSnapshotInput) {
  if (!input.endDate) throw new Error('A subscription end date is required.')
  const [plan] = await tx`
    select id, weekly_limit, covers_wash, covers_iron
    from plans
    where id = ${input.planId}
    for share
  `
  if (!plan) throw new Error('Plan not found')

  const [subscription] = await tx`
    insert into subscriptions (
      customer_id, plan_id, status, start_date, end_date,
      weekly_limit_snapshot, semester_weeks_snapshot, covers_wash_snapshot, covers_iron_snapshot, price_snapshot, is_queued_renewal
    )
    values (
      ${input.customerId}, ${input.planId}, ${input.status ?? 'active'}, ${input.startDate}, ${input.endDate},
      ${input.weeklyLimitSnapshot ?? plan.weekly_limit},
      ${input.semesterWeeksSnapshot ?? null},
      ${input.coversWashSnapshot ?? plan.covers_wash},
      ${input.coversIronSnapshot ?? plan.covers_iron},
      ${input.priceSnapshot ?? null},
      ${input.isQueuedRenewal ?? input.status === 'scheduled'}
    )
    returning id, customer_id, plan_id, status, start_date, end_date,
      weekly_limit_snapshot, semester_weeks_snapshot, covers_wash_snapshot, covers_iron_snapshot,
      price_snapshot, is_queued_renewal, created_at
  `

  return subscription
}

export async function createManualSubscriptionWithSnapshot(
  input: Pick<SubscriptionSnapshotInput, 'customerId' | 'planId' | 'startDate'>,
) {
  return sql.begin(async (tx) => {
    await lockCustomerSubscription(tx, input.customerId)
    await ensureNoPendingSubscriptionPayment(tx, input.customerId)
    const [clock] = await tx<{ today: string }[]>`select (now() at time zone 'Africa/Lagos')::date::text as today`
    await tx`
      update subscriptions
      set status = 'ended', is_queued_renewal = false
      where customer_id = ${input.customerId}
        and status = 'scheduled'
        and end_date < ${clock.today}::date
    `
    await tx`
      update subscriptions
      set is_queued_renewal = false
      where customer_id = ${input.customerId}
        and status = 'scheduled'
        and is_queued_renewal = true
        and start_date <= ${clock.today}::date
        and end_date >= ${clock.today}::date
    `
    const [queued] = await tx`
      select id
      from subscriptions
      where customer_id = ${input.customerId}
        and status = 'scheduled'
        and is_queued_renewal = true
        and start_date > ${clock.today}::date
        and end_date >= ${clock.today}::date
      limit 1
      for update
    `
    if (queued) throw new Error('Customer already has a renewal scheduled.')
    const [existing] = await tx`
      select id
      from subscriptions
      where customer_id = ${input.customerId}
        and status in ('active', 'scheduled')
        and start_date <= ${clock.today}::date
        and (end_date is null or end_date >= ${clock.today}::date)
      limit 1
      for update
    `
    if (existing) throw new Error('Customer already has an active subscription.')

    const [plan] = await tx`
      select type, active, weekly_limit
      from plans
      where id = ${input.planId}
      for share
    `
    if (!plan || !plan.active) throw new Error('This plan is no longer available.')

    const [semesterSettings] = await tx<{ semester_end_date: Date | string | null; semester_weeks: number | null }[]>`
      select semester_end_date, semester_weeks
      from app_settings
      where key = 'semester'
      limit 1
    `
    const semesterEndDate = semesterSettings?.semester_end_date ? dateOnly(semesterSettings.semester_end_date) : null
    const semesterWeeks = plan.type === 'semester' ? Number(semesterSettings?.semester_weeks) : null
    if (plan.type === 'semester' && !isValidSemesterWeeks(semesterWeeks)) {
      throw new Error('Set a valid number of semester weeks in Admin Plans before creating a semester subscription.')
    }
    if (semesterWeeks !== null && !Number.isSafeInteger(Number(plan.weekly_limit) * semesterWeeks)) {
      throw new Error('The semester allowance exceeds the supported unit limit. Update the semester weeks or plan weekly limit.')
    }
    const endDate = getSubscriptionEndDate(plan.type as PlanType, input.startDate, semesterEndDate)
    const startState = getSubscriptionStartState(input.startDate, clock.today)

    const subscription = await insertSubscriptionWithSnapshot(tx, {
      customerId: input.customerId,
      planId: input.planId,
      startDate: input.startDate,
      endDate,
      status: startState.status,
      isQueuedRenewal: startState.isQueuedRenewal,
      semesterWeeksSnapshot: semesterWeeks,
    })
    const createdAt = subscription.created_at instanceof Date
      ? subscription.created_at.toISOString()
      : String(subscription.created_at)
    const retroactiveAllowanceUnits = calculateRetroactiveSubscriptionUnits(
      {
        weeklyLimit: Number(subscription.weekly_limit_snapshot),
        semesterWeeks: subscription.semester_weeks_snapshot,
        startDate: input.startDate,
        startAt: createdAt,
        endDate,
      },
      new Date(createdAt),
    )
    await tx`
      update subscriptions
      set retroactive_allowance_units = ${retroactiveAllowanceUnits}
      where id = ${subscription.id}
    `
    return { subscription, retroactiveAllowanceUnits }
  })
}