import { ArrowLeft, Copy, Pencil, Save, WalletCards } from 'lucide-react'
import { data, Form, Link, redirect, useActionData, useFetcher, useLoaderData, useLocation, useNavigation, useRevalidator } from 'react-router'
import { useEffect, useRef, useState } from 'react'
import type { Route } from './+types/UserDetails'
import { requireRole } from '../../../lib/auth.server'
import { activateSubscriptionFromPayment, adjustWallet, creditAdminWallet } from '../../../lib/wallet.server'
import { createManualSubscriptionWithSnapshot, lockCustomerSubscription } from '../../../lib/subscriptions.server'
import {
  reconcileCustomerSubscriptionPayments,
  reconcilePaystackSubscriptionPayment,
} from '../../../lib/subscription-payment-reconciliation.server'
import { sql } from '../../../lib/db.server'
import { addCalendarMonthsToDate } from '../../../lib/subscription-terms'
import { toast } from '../../../lib/toast'
import { calculateSubscriptionAllowance } from '../../../lib/subscription-week'
import { getSubscriptionUsageTotals } from '../../../lib/subscription-usage.server'
import { getRetroactiveSubscriptionOrderCandidates } from '../../../lib/retroactive-subscription.server'

const userHistoryPageSize = 20

type OrderHistoryFilter = 'all' | 'paid' | 'unpaid' | 'backdated-paid'
type OrderHistorySort = 'newest' | 'oldest' | 'invoice-high' | 'invoice-low'

type OrderHistoryRow = {
  id: string
  public_order_number: string | null
  status: string
  created_at: string | Date
  customer_count: number
  vendor_count: number | null
  invoice_amount: number | string | null
  invoice_status: string | null
}

type DetailOrder = {
  id: string
  publicOrderNumber: string
  status: string
  createdAt: string
  customerCount: number
  vendorCount: number | null
  invoiceAmount: number | null
  invoiceStatus: string | null
}
type DetailSubscription = {
  id: string
  planName: string
  type: string
  status: string
  startDate: string
  endDate: string | null
}
type DetailPayment = {
  id: string
  provider: string
  reference: string
  amount: number
  status: string
  subscriptionId: string | null
  createdAt: string
  succeededAt: string | null
  planName: string | null
  reconciliationCheckedAt: string | null
  reconciliationResult: string | null
}
type DetailTransaction = {
  id: string
  balanceType: string
  txnType: string
  amount: number
  balanceAfter: number
  createdAt: string
}
type DetailReferral = {
  id: string
  referredId: string
  status: string
  rewardType: string | null
  rewardValue: number | null
  createdAt: string
}
type UserDetailsData = {
  profile: {
    id: string
    qaffyId: string | null
    name: string | null
    email: string | null
    phone: string | null
    createdAt: string
  }
  roles: string[]
  stats: {
    totalOrders: number
    completedOrders: number
    cancelledOrders: number
    totalSpent: number
    activeSubscriptions: number
  }
  wallet: { oneOff: number; subscription: number }
  activeSubscriptionId: string | null
  activeSubscriptionAllowance: {
    weeklyUnits: number
    availableUnits: number
    usedThisWeek: number
    totalUnitsUsed: number
    reservedUnits: number
    backdatedUnitsTotal: number
    backdatedUnitsUsed: number
    backdatedUnitsAvailable: number
  } | null
  backdatedSubscription: NonNullable<Awaited<ReturnType<typeof getRetroactiveSubscriptionOrderCandidates>>> | null
  orderControls: { search: string; filter: OrderHistoryFilter; sort: OrderHistorySort }
  orders: DetailOrder[]
  subscriptions: DetailSubscription[]
  payments: DetailPayment[]
  transactions: DetailTransaction[]
  referrals: DetailReferral[]
  pagination: {
    orders: { page: number; pageSize: number; totalCount: number; pageCount: number }
    subscriptions: { page: number; pageSize: number; totalCount: number; pageCount: number }
    payments: { page: number; pageSize: number; totalCount: number; pageCount: number }
    transactions: { page: number; pageSize: number; totalCount: number; pageCount: number }
    referrals: { page: number; pageSize: number; totalCount: number; pageCount: number }
  }
  semesterEndDate: string | null
  plans: Array<{
    id: string
    name: string
    type: string
    semesterEndDate: string | null
    active: boolean
  }>
}
type ManualSubscriptionActionData = {
  ok: boolean
  message: string
  backdatedSubscription?: UserDetailsData['backdatedSubscription']
  backdatedOrdersError?: boolean
}

function money(value: number) {
  return `\u20A6${value.toLocaleString()}`
}
function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded'
}
function dateInput(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
function dateOnly(value: Date | string | null | undefined) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value?.slice(0, 10) ?? null
}
function getOrdersReturnPath(state: unknown) {
  if (!state || typeof state !== 'object' || !('returnTo' in state) || typeof state.returnTo !== 'string') return null
  return /^\/admin\/orders(?:\?[^#]*)?$/.test(state.returnTo) ? state.returnTo : null
}
function HistoryPagination({
  section,
  pagination,
  pathname,
  search,
}: {
  section: keyof UserDetailsData['pagination']
  pagination: UserDetailsData['pagination'][keyof UserDetailsData['pagination']]
  pathname: string
  search: string
}) {
  const toPage = (page: number) => {
    const params = new URLSearchParams(search)
    if (page === 1) params.delete(`${section}Page`)
    else params.set(`${section}Page`, String(page))
    const query = params.toString()
    return `${pathname}${query ? `?${query}` : ''}`
  }
  const firstItem = pagination.totalCount === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1
  const lastItem = Math.min(pagination.page * pagination.pageSize, pagination.totalCount)

  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500" aria-label={`${section} pagination`}>
      <span>
        Showing {firstItem}-{lastItem} of {pagination.totalCount}
      </span>
      <div className="flex items-center gap-2">
        {pagination.page > 1 ? (
          <Link
            to={toPage(pagination.page - 1)}
            className="rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-100 px-3 py-2 text-slate-300">Previous</span>
        )}
        {pagination.page < pagination.pageCount ? (
          <Link
            to={toPage(pagination.page + 1)}
            className="rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-lg border border-slate-100 px-3 py-2 text-slate-300">Next</span>
        )}
      </div>
    </nav>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  const customerId = params.id
  if (!auth || !customerId) return data<UserDetailsData | null>(null, { status: 404 })
  const { supabase, headers } = auth
  const url = new URL(request.url)
  const requestedBackdatedSubscriptionId = url.searchParams.get('backdatedSubscriptionId')
  const backdatedSubscriptionId =
    requestedBackdatedSubscriptionId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestedBackdatedSubscriptionId,
    )
      ? requestedBackdatedSubscriptionId
      : null
  const pageKeys = ['orders', 'subscriptions', 'payments', 'transactions', 'referrals'] as const
  type PageKey = (typeof pageKeys)[number]
  const requestedPages = Object.fromEntries(
    pageKeys.map((key) => {
      const requestedPage = Number.parseInt(url.searchParams.get(`${key}Page`) ?? '1', 10)
      return [key, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1]
    }),
  ) as Record<PageKey, number>
  const orderSearch = (url.searchParams.get('ordersSearch') ?? '').trim().slice(0, 100)
  const requestedOrderFilter = url.searchParams.get('ordersFilter')
  const orderFilter: OrderHistoryFilter =
    requestedOrderFilter === 'paid' ||
    requestedOrderFilter === 'unpaid' ||
    requestedOrderFilter === 'backdated-paid'
      ? requestedOrderFilter
      : 'all'
  const requestedOrderSort = url.searchParams.get('ordersSort')
  const orderSort: OrderHistorySort =
    requestedOrderSort === 'oldest' ||
    requestedOrderSort === 'invoice-high' ||
    requestedOrderSort === 'invoice-low'
      ? requestedOrderSort
      : 'newest'
  const orderFilters = sql`
    (
      ${orderSearch} = ''
      or o.public_order_number ilike '%' || ${orderSearch} || '%'
      or o.status::text ilike '%' || ${orderSearch} || '%'
    )
    and (
      ${orderFilter} = 'all'
      or (${orderFilter} = 'paid' and latest_invoice.status = 'paid')
      or (${orderFilter} = 'unpaid' and coalesce(latest_invoice.status::text, 'unpaid') = 'unpaid')
      or (
        ${orderFilter} = 'backdated-paid'
        and o.retroactive_subscription_id is not null
        and latest_invoice.status = 'paid'
      )
    )
  `
  const ordersFrom = sql`
    from orders o
    left join lateral (
      select amount, status
      from invoices invoice
      where invoice.order_id = o.id
      order by invoice.created_at desc, invoice.id desc
      limit 1
    ) latest_invoice on true
    where o.customer_id = ${customerId}::uuid
      and ${orderFilters}
  `
  const orderBy =
    orderSort === 'oldest'
      ? sql`o.created_at asc`
      : orderSort === 'invoice-high'
        ? sql`latest_invoice.amount desc nulls last`
        : orderSort === 'invoice-low'
          ? sql`latest_invoice.amount asc nulls last`
          : sql`o.created_at desc`
  const today = dateInput(new Date())
  const [
    { data: profile },
    { data: roles },
    { data: wallet },
    orderRows,
    orderCountRows,
    { data: subscriptions, count: subscriptionCount, error: subscriptionsError },
    { data: activeSubscription },
    { data: plans },
    { data: payments, count: paymentCount, error: paymentsError },
    { data: transactions, count: transactionCount, error: transactionsError },
    { data: referrals, count: referralCount, error: referralsError },
  ] = await Promise.all([
    supabase.from('profiles').select('id, qaffy_id, name, email, phone, created_at').eq('id', customerId).maybeSingle(),
    supabase.from('profile_roles').select('role').eq('profile_id', customerId).eq('status', 'approved'),
    supabase.from('wallets').select('one_off_balance, subscription_balance').eq('customer_id', customerId).maybeSingle(),
    sql<OrderHistoryRow[]>`
      select
        o.id,
        o.public_order_number,
        o.status::text as status,
        o.created_at,
        (select coalesce(sum(item.quantity), 0)::int from order_items item where item.order_id = o.id) as customer_count,
        o.clothes_count_vendor as vendor_count,
        latest_invoice.amount as invoice_amount,
        latest_invoice.status::text as invoice_status
      ${ordersFrom}
      order by ${orderBy}, o.created_at desc, o.id desc
      limit ${userHistoryPageSize}
      offset ${(requestedPages.orders - 1) * userHistoryPageSize}
    `,
    sql<{ total: number }[]>`
      select count(*)::int as total
      ${ordersFrom}
    `,
    supabase
      .from('subscriptions')
      .select('id, plan_id, status, start_date, end_date, created_at', { count: 'exact' })
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(
        (requestedPages.subscriptions - 1) * userHistoryPageSize,
        requestedPages.subscriptions * userHistoryPageSize - 1,
      ),
    supabase
      .from('subscriptions')
      .select('id, plan_id, status, start_date, end_date, weekly_limit_snapshot, semester_weeks_snapshot, retroactive_allowance_units, created_at')
      .eq('customer_id', customerId)
      .in('status', ['active', 'scheduled'])
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('plans').select('id, name, type, semester_end_date, active').order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select(
        'id, provider, reference, amount, status, plan_id, subscription_id, created_at, succeeded_at, subscription_reconciliation_checked_at, subscription_reconciliation_result',
        { count: 'exact' },
      )
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range((requestedPages.payments - 1) * userHistoryPageSize, requestedPages.payments * userHistoryPageSize - 1),
    supabase
      .from('wallet_transactions')
      .select('id, balance_type, txn_type, amount, balance_after, created_at', { count: 'exact' })
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(
        (requestedPages.transactions - 1) * userHistoryPageSize,
        requestedPages.transactions * userHistoryPageSize - 1,
      ),
    supabase
      .from('referrals')
      .select('id, referred_id, status, reward_type, reward_value, created_at', { count: 'exact' })
      .eq('referrer_id', customerId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range((requestedPages.referrals - 1) * userHistoryPageSize, requestedPages.referrals * userHistoryPageSize - 1),
  ])
  const historyQueryError = subscriptionsError ?? paymentsError ?? transactionsError ?? referralsError
  if (historyQueryError) throw new Error(`Customer history could not be loaded: ${historyQueryError.message}`)
  const countByKey: Record<PageKey, number> = {
    orders: Number(orderCountRows[0]?.total ?? 0),
    subscriptions: subscriptionCount ?? 0,
    payments: paymentCount ?? 0,
    transactions: transactionCount ?? 0,
    referrals: referralCount ?? 0,
  }
  const pagination = Object.fromEntries(
    pageKeys.map((key) => {
      const totalCount = countByKey[key]
      const pageCount = Math.max(1, Math.ceil(totalCount / userHistoryPageSize))
      return [key, { page: Math.min(requestedPages[key], pageCount), pageSize: userHistoryPageSize, totalCount, pageCount }]
    }),
  ) as UserDetailsData['pagination']
  if (pageKeys.some((key) => pagination[key].page !== requestedPages[key])) {
    for (const key of pageKeys) {
      if (pagination[key].page <= 1) url.searchParams.delete(`${key}Page`)
      else url.searchParams.set(`${key}Page`, String(pagination[key].page))
    }
    throw redirect(`${url.pathname}${url.search}`, { headers })
  }

  const [semesterSettings] = await sql<{ semester_end_date: Date | string | null }[]>`
    select semester_end_date
    from app_settings
    where key = 'semester'
    limit 1
  `
  if (!profile) return data<UserDetailsData | null>(null, { headers, status: 404 })
  const planById = new Map((plans ?? []).map((plan) => [plan.id, plan]))
  const allowanceReference = new Date()
  const subscriptionUsage = activeSubscription
    ? await getSubscriptionUsageTotals(
        {
          customerId,
          subscription: {
            id: activeSubscription.id,
            startDate: activeSubscription.start_date,
            endDate: activeSubscription.end_date,
          },
        },
        allowanceReference,
      )
    : { usedUnits: 0, usedThisWeek: 0 }
  const activeSubscriptionAllowance = activeSubscription
    ? calculateSubscriptionAllowance(
        {
          weeklyLimit: Number(activeSubscription.weekly_limit_snapshot),
          semesterWeeks: activeSubscription.semester_weeks_snapshot,
          startDate: activeSubscription.start_date,
          startAt: activeSubscription.created_at,
          endDate: activeSubscription.end_date,
          usedUnits: subscriptionUsage.usedUnits,
          retroactiveUnits: Number(activeSubscription.retroactive_allowance_units),
        },
        allowanceReference,
      )
    : null
  const backdatedSubscription = backdatedSubscriptionId
    ? await getRetroactiveSubscriptionOrderCandidates({
        customerId,
        subscriptionId: backdatedSubscriptionId,
      })
    : null
  const activeBackdatedSubscription =
    activeSubscription && activeSubscription.id === backdatedSubscription?.subscriptionId
      ? backdatedSubscription
      : activeSubscription && Number(activeSubscription.retroactive_allowance_units) > 0
        ? await getRetroactiveSubscriptionOrderCandidates({
            customerId,
            subscriptionId: activeSubscription.id,
          })
        : null
  const stats = {
    totalOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    totalSpent: 0,
    activeSubscriptions: 0,
  }
  const [allTimeStats] = await sql<
    {
      total_orders: number
      completed_orders: number
      cancelled_orders: number
      paid_invoice_total: number
      plan_payment_total: number
      active_subscriptions: number
    }[]
  >`
    select
      (select count(*)::int from orders where customer_id = ${customerId}::uuid) as total_orders,
      (select count(*)::int from orders where customer_id = ${customerId}::uuid and status = 'delivered') as completed_orders,
      (select count(*)::int from orders where customer_id = ${customerId}::uuid and status = 'cancelled') as cancelled_orders,
      (select coalesce(sum(invoice.amount), 0) from invoices invoice
        join orders order_row on order_row.id = invoice.order_id
        where order_row.customer_id = ${customerId}::uuid and invoice.status = 'paid') as paid_invoice_total,
      (select coalesce(sum(amount), 0) from payments
        where customer_id = ${customerId}::uuid and status = 'success' and plan_id is not null) as plan_payment_total,
      (select count(*)::int from subscriptions
        where customer_id = ${customerId}::uuid
          and status in ('active', 'scheduled')
          and start_date <= ${today}::date
          and (end_date is null or end_date >= ${today}::date)) as active_subscriptions
  `
  stats.totalOrders = Number(allTimeStats?.total_orders ?? 0)
  stats.completedOrders = Number(allTimeStats?.completed_orders ?? 0)
  stats.cancelledOrders = Number(allTimeStats?.cancelled_orders ?? 0)
  stats.totalSpent = Number(allTimeStats?.paid_invoice_total ?? 0) + Number(allTimeStats?.plan_payment_total ?? 0)
  stats.activeSubscriptions = Number(allTimeStats?.active_subscriptions ?? 0)
  return data<UserDetailsData>(
    {
      profile: {
        id: profile.id,
        qaffyId: profile.qaffy_id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        createdAt: profile.created_at,
      },
      roles: (roles ?? []).map((role) => role.role),
      stats,
      wallet: {
        oneOff: Number(wallet?.one_off_balance ?? 0),
        subscription: Number(wallet?.subscription_balance ?? 0),
      },
      activeSubscriptionId: activeSubscription?.id ?? null,
      activeSubscriptionAllowance: activeSubscriptionAllowance
        ? {
            weeklyUnits: Number(activeSubscription?.weekly_limit_snapshot ?? 0),
            availableUnits: Math.max(0, activeSubscriptionAllowance.balance),
            usedThisWeek: subscriptionUsage.usedThisWeek,
            totalUnitsUsed: subscriptionUsage.usedUnits,
            reservedUnits: Math.max(0, -activeSubscriptionAllowance.balance),
            backdatedUnitsTotal: Number(activeSubscription?.retroactive_allowance_units ?? 0),
            backdatedUnitsUsed: activeBackdatedSubscription?.usedUnits ?? 0,
            backdatedUnitsAvailable: activeBackdatedSubscription?.remainingUnits ?? 0,
          }
        : null,
      backdatedSubscription,
      orderControls: { search: orderSearch, filter: orderFilter, sort: orderSort },
      orders: orderRows.map((order) => ({
        id: order.id,
        publicOrderNumber: order.public_order_number ?? 'QO-UNKNOWN',
        status: order.status,
        createdAt: order.created_at instanceof Date ? order.created_at.toISOString() : order.created_at,
        customerCount: Number(order.customer_count ?? 0),
        vendorCount: order.vendor_count,
        invoiceAmount: order.invoice_amount === null ? null : Number(order.invoice_amount),
        invoiceStatus: order.invoice_status,
      })),
      subscriptions: (subscriptions ?? []).map((subscription) => ({
        id: subscription.id,
        planName: planById.get(subscription.plan_id)?.name ?? 'Unknown plan',
        type: planById.get(subscription.plan_id)?.type ?? 'unknown',
        status: subscription.status,
        startDate: subscription.start_date,
        endDate: subscription.end_date,
      })),
      payments: (payments ?? []).map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        reference: payment.reference,
        amount: Number(payment.amount),
        status: payment.status,
        subscriptionId: payment.subscription_id,
        createdAt: payment.created_at,
        succeededAt: payment.succeeded_at,
        planName: payment.plan_id ? (planById.get(payment.plan_id)?.name ?? 'Subscription plan') : null,
        reconciliationCheckedAt: payment.subscription_reconciliation_checked_at,
        reconciliationResult: payment.subscription_reconciliation_result,
      })),
      transactions: (transactions ?? []).map((transaction) => ({
        id: transaction.id,
        balanceType: transaction.balance_type,
        txnType: transaction.txn_type,
        amount: Number(transaction.amount),
        balanceAfter: Number(transaction.balance_after),
        createdAt: transaction.created_at,
      })),
      referrals: (referrals ?? []).map((referral) => ({
        id: referral.id,
        referredId: referral.referred_id,
        status: referral.status,
        rewardType: referral.reward_type,
        rewardValue: referral.reward_value === null ? null : Number(referral.reward_value),
        createdAt: referral.created_at,
      })),
      pagination,
      semesterEndDate: dateOnly(semesterSettings?.semester_end_date),
      plans: (plans ?? []).map((plan) => ({
        id: plan.id,
        name: plan.name,
        type: plan.type,
        semesterEndDate: plan.semester_end_date,
        active: plan.active,
      })),
    },
    { headers, status: 200 },
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request, params }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  const customerId = params.id
  if (!auth || !customerId) return data({ ok: false, message: 'Admin access required.' }, { status: 403 })
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  if (intent === 'profile') {
    const { error } = await auth.supabase
      .from('profiles')
      .update({
        name: String(formData.get('name') ?? '').trim() || null,
        email: String(formData.get('email') ?? '').trim() || null,
        phone: String(formData.get('phone') ?? '').trim() || null,
      })
      .eq('id', customerId)
    return error ? data({ ok: false, message: error.message }, { status: 400 }) : data({ ok: true, message: 'Profile updated.' })
  }
  if (intent === 'wallet') {
    try {
      const amount = Number(formData.get('amount'))
      if (!Number.isInteger(amount)) return data({ ok: false, message: 'Wallet adjustments must use whole numbers.' }, { status: 400 })
      if (amount > 0) {
        const result = await creditAdminWallet(customerId, amount)
        const paidInvoiceCount = result.settledInvoices.length
        return data({
          ok: true,
          message: `Wallet topped up by ${money(amount)}.${paidInvoiceCount > 0 ? ` ${paidInvoiceCount} unpaid ${paidInvoiceCount === 1 ? 'invoice was' : 'invoices were'} paid.` : ''}`,
        })
      }
      const result = await adjustWallet(customerId, 'one_off', amount)
      return data({
        ok: true,
        message: `One-off wallet adjusted by ${money(result.amount)}.`,
      })
    } catch (error) {
      return data(
        {
          ok: false,
          message: error instanceof Error ? error.message : 'Wallet adjustment failed.',
        },
        { status: 400 },
      )
    }
  }
  if (intent === 'reconcile-subscription-payment') {
    const reference = String(formData.get('reference') ?? '').trim()
    if (!reference || reference.length > 200) {
      return data({ ok: false, message: 'A valid payment reference is required.' }, { status: 400, headers: auth.headers })
    }
    try {
      const reconciliation = await reconcilePaystackSubscriptionPayment(customerId, reference, true)
      const succeeded = reconciliation.outcome === 'activated' || reconciliation.outcome === 'failed'
      const status =
        reconciliation.outcome === 'missing'
          ? 404
          : reconciliation.outcome === 'unavailable'
            ? 502
            : succeeded
              ? 200
              : 409
      const message =
        reconciliation.outcome === 'activated'
          ? 'Paystack confirmed this payment and the subscription is activated.'
          : reconciliation.outcome === 'failed'
            ? 'Paystack confirmed this checkout did not complete. It has been closed; a new subscription can now be created.'
            : reconciliation.message
      return data({ ok: succeeded, message }, { status, headers: auth.headers })
    } catch (error) {
      console.error('[admin-user-details] Subscription payment reconciliation failed', error)
      return data(
        { ok: false, message: 'The subscription payment could not be reconciled. Please try again.' },
        { status: 500, headers: auth.headers },
      )
    }
  }
  if (intent === 'subscription') {
    const planId = String(formData.get('planId') ?? '')
    const startDate = String(formData.get('startDate') ?? '').trim()
    if (!planId) return data({ ok: false, message: 'Select a plan.' }, { status: 400 })
    const parsedStartDate = new Date(`${startDate}T00:00:00Z`)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      Number.isNaN(parsedStartDate.getTime()) ||
      parsedStartDate.toISOString().slice(0, 10) !== startDate
    ) {
      return data({ ok: false, message: 'Enter a valid subscription start date.' }, { status: 400 })
    }
    try {
      const reconciliation = await reconcileCustomerSubscriptionPayments(customerId)
      if (reconciliation.outcome === 'activated') {
        return data(
          {
            ok: true,
            message: 'An existing Paystack checkout was confirmed and its subscription activated. No manual subscription was created.',
          },
          { headers: auth.headers },
        )
      }
      if (reconciliation.outcome !== 'clear') {
        return data(
          { ok: false, message: reconciliation.message },
          { status: reconciliation.outcome === 'unavailable' ? 502 : 409, headers: auth.headers },
        )
      }
      const created = await createManualSubscriptionWithSnapshot({
        customerId,
        planId,
        startDate,
      })
      let backdatedSubscription: UserDetailsData['backdatedSubscription']
      try {
        backdatedSubscription = await getRetroactiveSubscriptionOrderCandidates({
          customerId,
          subscriptionId: created.subscription.id,
        })
      } catch (error) {
        console.error('[admin-user-details] Subscription created but backdated orders could not be loaded', error)
        return data(
          {
            ok: true,
            message: 'Subscription created, but its backdated order list could not be loaded. Refresh and check the required database migration.',
            backdatedOrdersError: true,
          },
          { headers: auth.headers },
        )
      }
      return data(
        {
          ok: true,
          message: 'Subscription created.',
          backdatedSubscription,
        },
        { headers: auth.headers },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Subscription could not be created.'
      const status = /already has|already awaiting confirmation|no longer eligible/i.test(message)
        ? 409
        : /plan (not found|is no longer available)|valid number of semester weeks|semester allowance|end date is required/i.test(
              message,
            )
          ? 400
          : 500
      if (status === 500) console.error('[admin-user-details] Manual subscription creation failed', error)
      return data(
        { ok: false, message },
        { status, headers: auth.headers },
      )
    }
  }
  if (intent === 'cancel-subscription') {
    const subscriptionId = String(formData.get('subscriptionId') ?? '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subscriptionId)) {
      return data({ ok: false, message: 'Invalid subscription.' }, { status: 400, headers: auth.headers })
    }
    try {
      const [cancelledSubscription] = await sql`
        update subscriptions
        set status = 'cancelled'
        where id = ${subscriptionId}
          and customer_id = ${customerId}
          and status = 'active'
        returning id
      `
      if (!cancelledSubscription) {
        return data({ ok: false, message: 'This subscription is no longer active.' }, { status: 409, headers: auth.headers })
      }
      return data({ ok: true, message: 'Subscription cancelled.' }, { headers: auth.headers })
    } catch (error) {
      console.error('[admin-user-details] Subscription cancellation failed', error)
      return data({ ok: false, message: 'The subscription could not be cancelled. Please try again.' }, { status: 500, headers: auth.headers })
    }
  }
  if (intent === 'update-subscription-end-date') {
    const subscriptionId = String(formData.get('subscriptionId') ?? '')
    const rawEndDate = String(formData.get('endDate') ?? '').trim()
    const endDate = rawEndDate || null
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subscriptionId)) {
      return data({ ok: false, message: 'Invalid subscription.' }, { status: 400, headers: auth.headers })
    }
    if (!endDate) {
      return data({ ok: false, message: 'A subscription end date is required.' }, { status: 400, headers: auth.headers })
    }
    if (endDate) {
      const parsedEndDate = new Date(`${endDate}T00:00:00Z`)
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
        Number.isNaN(parsedEndDate.getTime()) ||
        parsedEndDate.toISOString().slice(0, 10) !== endDate
      ) {
        return data({ ok: false, message: 'Enter a valid subscription end date.' }, { status: 400, headers: auth.headers })
      }
    }

    try {
      const updatedSubscription = await sql.begin(async (tx) => {
        await lockCustomerSubscription(tx, customerId)
        const [updated] = await tx`
          update subscriptions
          set end_date = ${endDate}
          where id = ${subscriptionId}
            and customer_id = ${customerId}
            and status = 'active'
            and ${endDate}::date >= start_date
            and not exists (
              select 1
              from subscriptions scheduled
              where scheduled.customer_id = ${customerId}
                and scheduled.is_queued_renewal = true
            )
            and not exists (
              select 1
              from payments pending
              where pending.customer_id = ${customerId}
                and pending.plan_id is not null
                and pending.status = 'pending'
            )
            and not exists (
              select 1
              from subscriptions scheduled
              where scheduled.customer_id = ${customerId}
                and scheduled.status = 'scheduled'
                and scheduled.start_date <= ${endDate}::date
            )
          returning id
        `
        return updated
      })
      if (!updatedSubscription) {
        return data(
          {
            ok: false,
            message:
              'Only active subscriptions can be edited. The end date must be on or after the start date and cannot conflict with a queued renewal or pending subscription checkout.',
          },
          { status: 409, headers: auth.headers },
        )
      }
      return data({ ok: true, message: 'Subscription end date updated.' }, { headers: auth.headers })
    } catch (error) {
      console.error('[admin-user-details] Subscription end-date update failed', error)
      return data({ ok: false, message: 'The subscription end date could not be updated. Please try again.' }, { status: 500, headers: auth.headers })
    }
  }
  return data({ ok: false, message: 'Unknown action.' }, { status: 400 })
}

function CopyField({ label, value }: { label: string; value: string | null }) {
  const copy = async () => {
    if (value && navigator.clipboard) {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied`)
    }
  }
  return (
    <div>
      <label className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">{label}</label>
      <div className="mt-1 flex gap-2">
        <input
          name={label.toLowerCase()}
          defaultValue={value ?? ''}
          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
        />
        {value && (
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={`Copy ${label}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-brand-primary hover:text-brand-primary"
          >
            <Copy size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

function UserStats({ stats }: { stats: UserDetailsData['stats'] }) {
  const cards = [
    ['Total orders', stats.totalOrders],
    ['Completed', stats.completedOrders],
    ['Total spent', money(stats.totalSpent)],
    ['Active subscriptions', stats.activeSubscriptions],
  ] as const
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] font-semibold capitalize tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
        </div>
      ))}
    </section>
  )
}

function ManualSubscription({
  plans,
  semesterEndDate,
  onCreated,
}: {
  plans: UserDetailsData['plans']
  semesterEndDate: string | null
  onCreated: (subscription: UserDetailsData['backdatedSubscription']) => void
}) {
  const today = dateInput(new Date())
  const fetcher = useFetcher<ManualSubscriptionActionData>()
  const { revalidate } = useRevalidator()
  const handledResponse = useRef<typeof fetcher.data>(null)
  const [planId, setPlanId] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState('')
  const isSaving = fetcher.state !== 'idle'
  const selectedPlan = plans.find((candidate) => candidate.id === planId)
  const endDateIsValid = Boolean(endDate && endDate >= startDate)
  useEffect(() => {
    const result = fetcher.data
    if (fetcher.state !== 'idle' || !result || handledResponse.current === result) return
    handledResponse.current = result
    if (!result.ok) {
      toast.error(result.message)
      revalidate()
      return
    }
    if (result.backdatedOrdersError) {
      toast.error(result.message)
      revalidate()
      return
    }
    if ('backdatedSubscription' in result) onCreated(result.backdatedSubscription ?? null)
    toast.success(result.message)
    revalidate()
  }, [fetcher.data, fetcher.state, onCreated, revalidate])

  const updatePlanDates = (nextPlanId: string, nextStartDate = startDate) => {
    const plan = plans.find((candidate) => candidate.id === nextPlanId)
    setPlanId(nextPlanId)
    if (!plan) {
      setEndDate('')
      return
    }
    setEndDate(
      plan.type === 'semester'
        ? (semesterEndDate ?? '')
        : nextStartDate
          ? addCalendarMonthsToDate(nextStartDate, 1)
          : '',
    )
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-bold text-slate-900">Manual subscription</h3>
      <fetcher.Form method="post" className="mt-4 space-y-3">
        <input type="hidden" name="intent" value="subscription" />
        <select
          name="planId"
          value={planId}
          onChange={(event) => updatePlanDates(event.target.value)}
          required
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="">Select active plan</option>
          {plans
            .filter((plan) => plan.active)
            .map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} | {plan.type}
              </option>
            ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input
            name="startDate"
            type="date"
            value={startDate}
            required
            onChange={(event) => {
              setStartDate(event.target.value)
              if (plans.find((plan) => plan.id === planId)?.type === 'monthly') {
                setEndDate(event.target.value ? addCalendarMonthsToDate(event.target.value, 1) : '')
              }
            }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
          />
          <input
            name="endDate"
            type="date"
            value={endDate}
            readOnly
            required
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
          />
        </div>
        {selectedPlan?.type === 'semester' && !semesterEndDate && (
          <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Set the semester end date in Admin Plans before creating a semester subscription.
          </p>
        )}
        {selectedPlan && endDate && !endDateIsValid && (
          <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            The subscription end date must be on or after its start date.
          </p>
        )}
        <button
          type="submit"
          disabled={isSaving || !endDateIsValid}
          className="rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSaving ? 'Creating subscription...' : 'Create subscription'}
        </button>
      </fetcher.Form>
    </div>
  )
}

function BackdatedSubscriptionOrders({
  customerId,
  subscription,
  activeSubscriptionId,
}: {
  customerId: string
  subscription: NonNullable<UserDetailsData['backdatedSubscription']>
  activeSubscriptionId: string | null
}) {
  if (subscription.orders.length === 0) return null
  const showSeparateBalanceCard = subscription.subscriptionId !== activeSubscriptionId
  return (
    <section className="rounded-2xl border border-brand-border bg-brand-soft p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">Backdated orders</h3>
          <p className="mt-1 text-sm text-slate-600">
            {subscription.planName} · {subscription.startDate} to {subscription.endDate ?? 'No end date'}
          </p>
        </div>
        {showSeparateBalanceCard && subscription.remainingUnits > 0 && (
          <div className="min-w-36 rounded-xl border border-brand-border bg-white/80 p-3">
            <p className="text-xs font-medium text-slate-500">Backdated units</p>
            <p className="mt-1 text-2xl font-bold text-brand-primary">{subscription.remainingUnits}</p>
            <p className="mt-1 text-xs text-slate-500">
              Used {subscription.usedUnits} of {subscription.totalUnits}
            </p>
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Open an eligible unpaid order to apply this subscription’s units. Any amount still due remains unpaid.
      </p>
      <div className="mt-3 space-y-2">
        {subscription.orders.map((order) => (
          <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-border bg-white/80 p-3">
            <div>
              <p className="font-semibold text-slate-900">{order.publicOrderNumber}</p>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(order.createdAt).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} · {order.itemCount} items · {money(order.amount)} due
              </p>
            </div>
            <Link
              to={`/admin/orders?orderId=${encodeURIComponent(order.id)}&backdatedSubscriptionId=${encodeURIComponent(subscription.subscriptionId)}`}
              state={{ returnTo: `/admin/users/${customerId}?backdatedSubscriptionId=${encodeURIComponent(subscription.subscriptionId)}` }}
              className="rounded-lg border border-brand-primary/30 bg-white px-3 py-2 text-xs font-semibold text-brand-primary hover:bg-brand-soft"
            >
              View order details
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function UserDetails() {
  const details = useLoaderData<typeof loader>()
  const location = useLocation()
  const preservedOrderParams = new URLSearchParams(location.search)
  for (const key of ['ordersPage', 'ordersSearch', 'ordersFilter', 'ordersSort']) {
    preservedOrderParams.delete(key)
  }
  const ordersReturnPath = getOrdersReturnPath(location.state)
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const ordersSectionRef = useRef<HTMLElement | null>(null)
  const previousHistoryLocation = useRef({ pathname: location.pathname, search: location.search })
  const isHistoryUpdating =
    navigation.state === 'loading' && navigation.location?.pathname === location.pathname
  const handledActionResponse = useRef<typeof actionData>(null)
  const cancelFetcher = useFetcher<typeof action>()
  const handledCancelResponse = useRef<typeof cancelFetcher.data>(null)
  const paymentReconcileFetcher = useFetcher<typeof action>()
  const handledPaymentReconcileResponse = useRef<typeof paymentReconcileFetcher.data>(null)
  const subscriptionDateFetcher = useFetcher<typeof action>()
  const handledSubscriptionDateResponse = useRef<typeof subscriptionDateFetcher.data>(null)
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null)
  const [subscriptionEndDateDraft, setSubscriptionEndDateDraft] = useState('')
  const [createdBackdatedSubscription, setCreatedBackdatedSubscription] = useState<{
    customerId: string
    subscription: NonNullable<UserDetailsData['backdatedSubscription']>
  } | null>(null)
  useEffect(() => {
    const previous = previousHistoryLocation.current
    if (previous.pathname === location.pathname) {
      const previousParams = new URLSearchParams(previous.search)
      const currentParams = new URLSearchParams(location.search)
      const orderHistoryChanged = ['ordersSearch', 'ordersFilter', 'ordersSort', 'ordersPage'].some(
        (key) => previousParams.get(key) !== currentParams.get(key),
      )
      if (orderHistoryChanged) {
        ordersSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    previousHistoryLocation.current = { pathname: location.pathname, search: location.search }
  }, [location.pathname, location.search])
  useEffect(() => {
    if (navigation.state !== 'idle' || !actionData?.message || handledActionResponse.current === actionData) return
    handledActionResponse.current = actionData
    if (actionData.ok) toast.success(actionData.message)
    else toast.error(actionData.message)
  }, [actionData, navigation.state])
  useEffect(() => {
    const result = cancelFetcher.data
    if (cancelFetcher.state !== 'idle' || !result || handledCancelResponse.current === result) return
    handledCancelResponse.current = result
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }, [cancelFetcher.data, cancelFetcher.state])
  useEffect(() => {
    const result = paymentReconcileFetcher.data
    if (paymentReconcileFetcher.state !== 'idle' || !result || handledPaymentReconcileResponse.current === result) return
    handledPaymentReconcileResponse.current = result
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }, [paymentReconcileFetcher.data, paymentReconcileFetcher.state])
  useEffect(() => {
    const result = subscriptionDateFetcher.data
    if (subscriptionDateFetcher.state !== 'idle' || !result || handledSubscriptionDateResponse.current === result) return
    handledSubscriptionDateResponse.current = result
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }, [subscriptionDateFetcher.data, subscriptionDateFetcher.state])
  if (!details) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Customer not found.</div>
  const backdatedSubscription =
    createdBackdatedSubscription?.customerId === details.profile.id
      ? createdBackdatedSubscription.subscription
      : details.backdatedSubscription
  const isSaving = navigation.state !== 'idle'
  return (
    <div className="space-y-6">
      <Link
        to={ordersReturnPath ?? '/admin/users'}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand-primary"
      >
        <ArrowLeft size={15} />
        {ordersReturnPath ? 'Back to orders' : 'Back to users'}
      </Link>
      <header>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{details.profile.name ?? 'Unnamed customer'}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {details.profile.qaffyId ?? 'Qaffy ID unavailable'} || Joined {date(details.profile.createdAt)}
        </p>
      </header>
      <UserStats stats={details.stats} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Save size={17} className="text-brand-primary" />
          <h3 className="font-bold text-slate-900">Profile and contact</h3>
        </div>
        <Form method="post" className="grid gap-4 md:grid-cols-3">
          <input type="hidden" name="intent" value="profile" />
          <div>
            <label className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Name</label>
            <input
              name="name"
              defaultValue={details.profile.name ?? ''}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
            />
          </div>
          <CopyField label="Email" value={details.profile.email} />
          <CopyField label="Phone" value={details.profile.phone} />
          <div className="md:col-span-3">
            <p className="text-xs text-slate-500">
              Roles: <strong className="capitalize text-slate-700">{details.roles.join(', ') || 'customer'}</strong>
            </p>
            <button
              type="submit"
              disabled={isSaving}
              className="mt-4 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:opacity-50"
            >
              Save profile
            </button>
          </div>
        </Form>
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-brand-border bg-brand-soft p-5">
          <div className="mb-4 flex items-center gap-2">
            <WalletCards size={17} className="text-brand-primary" />
            <h3 className="font-bold text-slate-900">Wallet balance</h3>
          </div>
          <div className="text-sm">
            <p className="text-xs text-slate-500">One-off balance</p>
            <strong>{money(details.wallet.oneOff)}</strong>
          </div>
          <Form method="post" className="mt-5 space-y-3">
            <input type="hidden" name="intent" value="wallet" />
            <input
              name="amount"
              type="number"
              step="1"
              inputMode="numeric"
              placeholder="Top-up amount (+) or adjustment (-)"
              required
              className="h-10 w-full rounded-lg border border-brand-border bg-white px-3 text-sm outline-none focus:border-brand-primary"
            />
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Apply wallet change
            </button>
          </Form>
        </div>
        <ManualSubscription
          plans={details.plans}
          semesterEndDate={details.semesterEndDate}
          onCreated={(subscription) => {
            if (subscription) {
              setCreatedBackdatedSubscription({ customerId: details.profile.id, subscription })
            }
          }}
        />
      </section>
      {details.activeSubscriptionAllowance && (
        <section className="rounded-2xl border border-brand-border bg-brand-soft p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">Subscription units</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-brand-border bg-white/80 p-3">
              <p className="text-xs font-medium text-slate-500">Weekly allowance</p>
              <p className="mt-1 text-2xl font-bold text-brand-primary">{details.activeSubscriptionAllowance.weeklyUnits}</p>
            </div>
            <div className="rounded-xl border border-brand-border bg-white/80 p-3">
              <p className="text-xs font-medium text-slate-500">Total used</p>
              <p className="mt-1 text-2xl font-bold text-brand-primary">{details.activeSubscriptionAllowance.totalUnitsUsed}</p>
              <p className="mt-1 text-xs text-slate-500">This week: {details.activeSubscriptionAllowance.usedThisWeek}</p>
            </div>
            <div className="rounded-xl border border-brand-border bg-white/80 p-3">
              <p className="text-xs font-medium text-slate-500">Available (rollover)</p>
              <p className="mt-1 text-2xl font-bold text-brand-primary">{details.activeSubscriptionAllowance.availableUnits}</p>
            </div>
            <div className="rounded-xl border border-brand-border bg-white/80 p-3">
              <p className="text-xs font-medium text-slate-500">Borrowed from next week</p>
              <p className="mt-1 text-2xl font-bold text-brand-primary">{details.activeSubscriptionAllowance.reservedUnits}</p>
            </div>
            {details.activeSubscriptionAllowance.backdatedUnitsAvailable > 0 && (
              <div className="rounded-xl border border-brand-border bg-white/80 p-3">
                <p className="text-xs font-medium text-slate-500">Backdated units</p>
                <p className="mt-1 text-2xl font-bold text-brand-primary">
                  {details.activeSubscriptionAllowance.backdatedUnitsAvailable}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Used {details.activeSubscriptionAllowance.backdatedUnitsUsed} of {details.activeSubscriptionAllowance.backdatedUnitsTotal}
                </p>
              </div>
            )}
          </div>
        </section>
      )}
      {backdatedSubscription && (
        <BackdatedSubscriptionOrders
          customerId={details.profile.id}
          subscription={backdatedSubscription}
          activeSubscriptionId={details.activeSubscriptionId}
        />
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Subscriptions</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs capitalize tracking-[0.12em] text-slate-500">
              <tr>
                <th className="pb-3">Plan</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Start</th>
                <th className="pb-3">End date</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {details.subscriptions.map((subscription) => (
                <tr key={subscription.id} className="border-t border-slate-100">
                  <td className="py-3 font-semibold">
                    {subscription.planName} | {subscription.type}
                  </td>
                  <td className="py-3 capitalize">{subscription.status}</td>
                  <td className="py-3">{subscription.startDate}</td>
                  <td className="py-3">
                    {subscription.status === 'active' && editingSubscriptionId === subscription.id ? (
                        <input
                          type="date"
                          value={subscriptionEndDateDraft}
                          onChange={(event) => setSubscriptionEndDateDraft(event.target.value)}
                          min={subscription.startDate}
                          className="h-9 w-full min-w-[140px] rounded-lg border border-slate-200 px-2 text-xs"
                          aria-label={`End date for ${subscription.planName}`}
                        />
                    ) : (
                      subscription.endDate ?? 'Open ended'
                    )}
                  </td>
                  <td className="py-3">
                    {subscription.status === 'active' && (
                      <div className="flex items-center justify-end gap-2">
                        {editingSubscriptionId === subscription.id ? (
                          <button
                            type="button"
                            disabled={subscriptionDateFetcher.state !== 'idle'}
                            onClick={() =>
                              {
                                subscriptionDateFetcher.submit(
                                  {
                                    intent: 'update-subscription-end-date',
                                    subscriptionId: subscription.id,
                                    endDate: subscriptionEndDateDraft,
                                  },
                                  { method: 'post' },
                                )
                                setEditingSubscriptionId(null)
                              }
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold text-brand-primary hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Save size={13} />
                            {subscriptionDateFetcher.state !== 'idle' &&
                            subscriptionDateFetcher.formData?.get('subscriptionId') === subscription.id
                              ? 'Saving…'
                              : 'Save'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSubscriptionEndDateDraft(subscription.endDate ?? '')
                              setEditingSubscriptionId(subscription.id)
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                            aria-label={`Edit end date for ${subscription.planName}`}
                            title="Edit end date"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <cancelFetcher.Form
                          method="post"
                          onSubmit={(event) => {
                            if (!window.confirm('Are you sure you want to cancel this subscription?')) event.preventDefault()
                          }}
                        >
                          <input type="hidden" name="intent" value="cancel-subscription" />
                          <input type="hidden" name="subscriptionId" value={subscription.id} />
                          <button
                            type="submit"
                            disabled={cancelFetcher.state !== 'idle'}
                            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {cancelFetcher.state !== 'idle' &&
                            cancelFetcher.formData?.get('subscriptionId') === subscription.id
                              ? 'Cancelling…'
                              : 'Cancel'}
                          </button>
                        </cancelFetcher.Form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {details.subscriptions.length === 0 && <p className="text-sm text-slate-500">No subscriptions recorded.</p>}
        </div>
        <HistoryPagination
          section="subscriptions"
          pagination={details.pagination.subscriptions}
          pathname={location.pathname}
          search={location.search}
        />
      </section>
      <section
        id="orders-and-invoices"
        ref={ordersSectionRef}
        className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h3 className="font-bold text-slate-900">Orders and invoices</h3>
        <Form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from(preservedOrderParams.entries()).map(([key, value], index) => (
            <input key={`${key}-${index}`} type="hidden" name={key} value={value} />
          ))}
          <label className="block text-xs font-medium text-slate-600">
            Search order
            <input
              key={details.orderControls.search}
              type="search"
              name="ordersSearch"
              defaultValue={details.orderControls.search}
              placeholder="Order reference or status"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900 outline-none focus:border-brand-primary"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Payment filter
            <select
              key={details.orderControls.filter}
              name="ordersFilter"
              defaultValue={details.orderControls.filter}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-brand-primary"
            >
              <option value="all">All orders</option>
              <option value="paid">Paid orders</option>
              <option value="unpaid">Unpaid orders</option>
              <option value="backdated-paid">Backdated paid orders</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Sort by
            <select
              key={details.orderControls.sort}
              name="ordersSort"
              defaultValue={details.orderControls.sort}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-brand-primary"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="invoice-high">Highest invoice</option>
              <option value="invoice-low">Lowest invoice</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={navigation.state !== 'idle'}
            className="h-10 self-end rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-wait disabled:opacity-50"
          >
            Apply
          </button>
        </Form>
        {isHistoryUpdating && (
          <p className="mt-3 text-xs text-slate-500" role="status">
            Updating customer history…
          </p>
        )}
        <div
          className={`mt-4 overflow-x-auto ${isHistoryUpdating ? 'opacity-60' : ''}`}
          aria-busy={isHistoryUpdating}
        >
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs capitalize tracking-[0.12em] text-slate-500">
              <tr>
                <th className="pb-3">Order</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Items</th>
                <th className="pb-3">Invoice</th>
                <th className="pb-3">Payment</th>
                <th className="pb-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {details.orders.map((order) => (
                <tr key={order.id} className="border-t border-slate-100">
                  <td className="py-3 font-semibold">
                    <Link
                      to={`/admin/orders?orderId=${encodeURIComponent(order.id)}`}
                      state={{ returnTo: `${location.pathname}${location.search}` }}
                      className="text-brand-primary hover:underline"
                    >
                      {order.publicOrderNumber}
                    </Link>
                  </td>
                  <td className="py-3 capitalize">{order.status.replaceAll('_', ' ')}</td>
                  <td className="py-3" title="Customer-declared item count / vendor-confirmed item count">
                    {order.customerCount} / {order.vendorCount ?? 'Not confirmed'}
                  </td>
                  <td className="py-3">{order.invoiceAmount === null ? 'Not created' : money(order.invoiceAmount)}</td>
                  <td className="py-3 capitalize">{order.invoiceStatus ?? 'Pending'}</td>
                  <td className="py-3">{date(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {details.orders.length === 0 && (
            <p className="text-sm text-slate-500">
              {details.orderControls.search || details.orderControls.filter !== 'all'
                ? 'No orders match this search or filter.'
                : 'No orders recorded.'}
            </p>
          )}
        </div>
        <HistoryPagination
          section="orders"
          pagination={details.pagination.orders}
          pathname={location.pathname}
          search={location.search}
        />
      </section>
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-900">Payments</h3>
          <div className="mt-4 space-y-2">
            {details.payments.length === 0 ? (
              <p className="text-sm text-slate-500">No payments recorded.</p>
            ) : (
              details.payments.map((payment) => (
                <div key={payment.id} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-800">
                      {payment.planName ? `${payment.planName} subscription` : 'Wallet top-up'}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {payment.provider} | {payment.reference}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {payment.succeededAt ? `Paid ${date(payment.succeededAt)}` : `Created ${date(payment.createdAt)}`}
                    </span>
                    {payment.reconciliationCheckedAt && (
                      <span className="block text-xs text-slate-500">
                        Last Paystack check: {payment.reconciliationResult ?? 'in progress'} at{' '}
                        {date(payment.reconciliationCheckedAt)}
                      </span>
                    )}
                    {payment.planName &&
                      payment.provider === 'paystack' &&
                      (payment.status === 'pending' ||
                        (payment.status === 'success' && !payment.subscriptionId)) && (
                      <paymentReconcileFetcher.Form method="post" className="mt-2">
                        <input type="hidden" name="intent" value="reconcile-subscription-payment" />
                        <input type="hidden" name="reference" value={payment.reference} />
                        <button
                          type="submit"
                          disabled={paymentReconcileFetcher.state !== 'idle'}
                          className="rounded-lg border border-brand-border px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {paymentReconcileFetcher.state !== 'idle' &&
                          paymentReconcileFetcher.formData?.get('reference') === payment.reference
                            ? 'Checking Paystack…'
                            : 'Reconcile with Paystack'}
                        </button>
                      </paymentReconcileFetcher.Form>
                    )}
                  </span>
                  <strong className="shrink-0 text-right">
                    {money(payment.amount)} | {payment.status}
                  </strong>
                </div>
              ))
            )}
          </div>
          <HistoryPagination
            section="payments"
            pagination={details.pagination.payments}
            pathname={location.pathname}
            search={location.search}
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-900">Wallet ledger</h3>
          <div className="mt-4 space-y-2">
            {details.transactions.length === 0 ? (
              <p className="text-sm text-slate-500">No wallet transactions recorded.</p>
            ) : (
              details.transactions.map((transaction) => (
                <div key={transaction.id} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm">
                  <span className="capitalize">
                    {transaction.txnType} | {transaction.balanceType}
                  </span>
                  <strong>
                    {money(transaction.amount)} | {money(transaction.balanceAfter)}
                  </strong>
                </div>
              ))
            )}
          </div>
          <HistoryPagination
            section="transactions"
            pagination={details.pagination.transactions}
            pathname={location.pathname}
            search={location.search}
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-900">Referrals</h3>
          <div className="mt-4 space-y-2">
            {details.referrals.length === 0 ? (
              <p className="text-sm text-slate-500">No referrals recorded.</p>
            ) : (
              details.referrals.map((referral) => (
                <div key={referral.id} className="border-b border-slate-100 pb-2 text-sm">
                  <p className="font-semibold">{referral.referredId}</p>
                  <p className="capitalize text-slate-500">
                    {referral.status}
                    {referral.rewardValue === null ? '' : ` | ${money(referral.rewardValue)}`}
                  </p>
                </div>
              ))
            )}
          </div>
          <HistoryPagination
            section="referrals"
            pagination={details.pagination.referrals}
            pathname={location.pathname}
            search={location.search}
          />
        </div>
      </section>
    </div>
  )
}
