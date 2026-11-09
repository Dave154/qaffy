import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  data,
  Form,
  NavLink,
  Outlet,
  redirect,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
  type LoaderFunctionArgs,
} from 'react-router'
import {
  Home,
  LayoutGrid,
  ReceiptText,
  FileText,
  Sparkles,
  Settings,
  Menu,
  X,
  UserCircle2,
  Search,
  Bell,
  ClipboardList,
  LogOut,
  Gift,
  WifiOff,
} from 'lucide-react'
import QaffyLogo from '../../components/QaffyLogo'
import PwaInstallLink from '../../components/PwaInstallLink'
import { isSupabaseServerConfigured, getSupabaseServerClient } from '../../lib/supabase.server'
import { supabase } from '../../lib/supabase.client'
import { CustomerStoreProvider } from './customer-store'
import type { MismatchLine, PersistedOrderItem, PickupLocationOption } from './customer-store'
import { useCustomerStore } from './customer-store-hook'
import type { Invoice, Order, Payment, Plan, Subscription, Wallet, WalletTransaction } from '../../types/database.types'
import { ensurePushSubscription, savePushSubscription } from '../../lib/push.client'
import {
  calculateSubscriptionAllowance,
  calculateSubscriptionUnitsApplied,
  type SubscriptionUsageOrder,
} from '../../lib/subscription-week'
import { CustomerInlineSkeleton } from '../../components/customer/CustomerDataSkeleton'
import { sql } from '../../lib/db.server'
import { getSubscriptionUsageTotals } from '../../lib/subscription-usage.server'

const navItems = [
  { to: '/', label: 'Overview', icon: Home, end: true },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText },
  { to: '/orders', label: 'Orders', icon: LayoutGrid },
  { to: '/invoice', label: 'Invoice', icon: FileText },
  { to: '/plans', label: 'Plans', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function getCustomerDataScope(pathname: string) {
  if (pathname === '/') return 'overview'
  if (pathname === '/orders') return 'orders'
  if (pathname === '/invoice') return 'invoice'
  if (pathname === '/transactions') return 'transactions'
  return ['/plans', '/settings', '/notifications'].some((path) => pathname === path || pathname.startsWith(`${path}/`)) ? 'summary' : 'full'
}

function subscribeToNetworkStatus(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getNetworkStatus() {
  return navigator.onLine
}

function getServerNetworkStatus() {
  return true
}

async function loadCustomerLayoutData(request: Request) {
  if (!isSupabaseServerConfigured) return null

  const { supabase: serverSupabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await serverSupabase.auth.getUser()

  if (!userData.user) {
    throw redirect('/login', { headers })
  }

  const { data: profile } = await serverSupabase
    .from('profiles')
    .select('id, role, name, qaffy_id, email, phone, referral_code, pickup_location_id')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (!profile) {
    throw redirect('/login', { headers })
  }

  const requestUrl = new URL(request.url)
  const isCustomerDataRequest = requestUrl.searchParams.get('customerData') === '1'
  const customerDataRequestId = isCustomerDataRequest ? requestUrl.searchParams.get('requestId') : null
  const requestedScope = requestUrl.searchParams.get('scope')
  const customerDataScope = isCustomerDataRequest
    ? requestedScope === 'summary' ||
      requestedScope === 'overview' ||
      requestedScope === 'orders' ||
      requestedScope === 'invoice' ||
      requestedScope === 'transactions'
      ? requestedScope
      : 'full'
    : getCustomerDataScope(requestUrl.pathname)

  const loadCustomerData = async (scope: 'summary' | 'overview' | 'orders' | 'invoice' | 'transactions' | 'full') => {
    const isSummaryScope = scope === 'summary'
    const isOverviewScope = scope === 'overview'
    const isOrdersScope = scope === 'orders'
    const isInvoiceScope = scope === 'invoice'
    const isTransactionsScope = scope === 'transactions'
    const requestedOrderPage = Number.parseInt(requestUrl.searchParams.get('page') ?? '1', 10)
    const orderPage = Number.isSafeInteger(requestedOrderPage) && requestedOrderPage > 0 ? requestedOrderPage : 1
    const orderPageSize = 10
    const transactionPageSize = 20
    const requestedTransactionFilter = requestUrl.searchParams.get('filter') ?? 'All activity'
    const allowedTransactionFilters = ['All activity', 'Top ups', 'Payments', 'Rewards']
    const transactionFilter = allowedTransactionFilters.includes(requestedTransactionFilter) ? requestedTransactionFilter : 'All activity'
    const [transactionPageSummary] = isTransactionsScope
      ? await sql<
          {
            transactions: {
              id: string
              created_at: string
              title: string
              reference: string
              order_reference: string | null
              amount: number
              direction: 'credit' | 'debit'
              category: 'topup' | 'payment' | 'reward'
              status: 'Successful' | 'Failed' | 'Pending'
            }[]
            total_count: number
            page: number
          }[]
        >`
          with plan_purchases as (
            select
              (array_agg(id order by created_at desc, id desc))[1]::text as id,
              related_subscription_id,
              sum(amount)::numeric as amount,
              max(created_at) as created_at
            from wallet_transactions
            where customer_id = ${userData.user.id}
              and related_subscription_id is not null
            group by related_subscription_id
          ),
          all_transactions as (
            select
              payment.id::text as id,
              payment.created_at,
              case when payment.plan_id is not null then 'Subscription payment' else 'Wallet top up' end as title,
              payment.reference,
              null::text as order_reference,
              payment.amount::numeric as amount,
              'credit'::text as direction,
              'topup'::text as category,
              case payment.status
                when 'success' then 'Successful'
                when 'failed' then 'Failed'
                else 'Pending'
              end as status
            from payments payment
            where payment.customer_id = ${userData.user.id}

            union all

            select
              transaction.id::text,
              transaction.created_at,
              case
                when transaction.txn_type = 'topup' and transaction.balance_type = 'subscription'
                  then 'Admin top-up applied to subscription debt'
                when transaction.txn_type = 'topup' then 'Admin wallet top-up'
                when transaction.txn_type = 'cashback' then 'Cashback earned'
                when transaction.txn_type = 'referral_reward_expiry' then 'Promotional credit expired'
                when transaction.txn_type = 'referral_reward' then 'Referral reward'
                else 'Order payment'
              end,
              case
                when transaction.txn_type = 'topup' then 'Admin credit • ' || left(transaction.id::text, 8)
                when transaction.related_referral_reward_id is not null
                  then 'Referral • ' || left(transaction.related_referral_reward_id::text, 8)
                when transaction.related_invoice_id is not null
                  then 'Invoice • ' || left(transaction.related_invoice_id::text, 8)
                when transaction.txn_type = 'cashback'
                  then 'Cashback • ' || left(transaction.id::text, 8)
                else 'Wallet • ' || left(transaction.id::text, 8)
              end,
              order_row.public_order_number,
              abs(transaction.amount)::numeric,
              case
                when transaction.txn_type in ('topup', 'cashback', 'referral_reward') then 'credit'
                else 'debit'
              end,
              case
                when transaction.txn_type in ('cashback', 'referral_reward', 'referral_reward_expiry') then 'reward'
                when transaction.txn_type = 'topup' then 'topup'
                else 'payment'
              end,
              'Successful'::text
            from wallet_transactions transaction
            left join invoices invoice on invoice.id = transaction.related_invoice_id
            left join orders order_row on order_row.id = invoice.order_id
            where transaction.customer_id = ${userData.user.id}
              and transaction.related_subscription_id is null
              and (transaction.txn_type <> 'topup' or transaction.related_payment_id is null)

            union all

            select
              plan.id,
              plan.created_at,
              'Plan purchase',
              'Wallet plan • ' || left(plan.related_subscription_id::text, 8),
              null::text,
              abs(plan.amount),
              'debit'::text,
              'payment'::text,
              'Successful'::text
            from plan_purchases plan

            union all

            select
              ('offline-invoice-' || invoice.id::text),
              coalesce(invoice.paid_at, invoice.created_at),
              'Offline order payment',
              'Offline payment • ' || upper(left(invoice.id::text, 8)),
              order_row.public_order_number,
              abs(invoice.amount)::numeric,
              'debit'::text,
              'payment'::text,
              'Successful'::text
            from invoices invoice
            join orders order_row on order_row.id = invoice.order_id
            where order_row.customer_id = ${userData.user.id}
              and invoice.status = 'paid'
              and invoice.payment_method = 'offline'
          ),
          filtered_transactions as (
            select *
            from all_transactions
            where ${transactionFilter} = 'All activity'
              or (${transactionFilter} = 'Top ups' and category = 'topup')
              or (${transactionFilter} = 'Payments' and category = 'payment')
              or (${transactionFilter} = 'Rewards' and category = 'reward')
          ),
          total as (
            select count(*)::int as total_count from filtered_transactions
          ),
          page_info as (
            select case
              when total.total_count = 0 then 1
              else least(${orderPage}, ceil(total.total_count::numeric / ${transactionPageSize})::int)
            end as page
            from total
          ),
          page_rows as (
            select *
            from filtered_transactions
            order by created_at desc, id desc
            offset ((select page from page_info) - 1) * ${transactionPageSize}
            limit ${transactionPageSize}
          )
          select
            coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc) from page_rows), '[]'::jsonb)
              as transactions,
            total.total_count,
            page_info.page
          from total, page_info
        `
      : []
    const [invoicePageSummary] = isInvoiceScope
      ? await sql<
          {
            page_invoice_ids: string[]
            page_order_ids: string[]
            total_count: number
            page: number
          }[]
        >`
          with invoice_count as (
            select count(*)::int as total_count
            from invoices invoice
            join orders order_row on order_row.id = invoice.order_id
            where order_row.customer_id = ${userData.user.id}
              and order_row.status <> 'cancelled'
          ),
          page_info as (
            select case
              when invoice_count.total_count = 0 then 1
              else least(${orderPage}, ceil(invoice_count.total_count::numeric / ${orderPageSize})::int)
            end as page
            from invoice_count
          ),
          paged_invoices as (
            select invoice.id, invoice.order_id
            from invoices invoice
            join orders order_row on order_row.id = invoice.order_id
            where order_row.customer_id = ${userData.user.id}
              and order_row.status <> 'cancelled'
            order by invoice.created_at desc, invoice.id desc
            offset ((select page from page_info) - 1) * ${orderPageSize}
            limit ${orderPageSize}
          )
          select
            coalesce(array(select id from paged_invoices), '{}'::uuid[]) as page_invoice_ids,
            coalesce(array(select distinct order_id from paged_invoices), '{}'::uuid[]) as page_order_ids,
            invoice_count.total_count,
            page_info.page
          from invoice_count, page_info
        `
      : []
    const orderFilter = requestUrl.searchParams.get('filter') ?? 'All orders'
    const allowedOrderFilters = ['All orders', 'Active', 'Delivered', 'Pending payment', 'Needs attention']
    const activeOrderFilter = allowedOrderFilters.includes(orderFilter) ? orderFilter : 'All orders'
    const orderSearch = (requestUrl.searchParams.get('search') ?? '').trim().slice(0, 100)
    const requestedOrderReference = requestUrl.searchParams.get('order')
    const [orderPageSummary] = isOrdersScope
      ? await sql<
          {
            page_order_ids: string[]
            filtered_count: number
            page: number
            total_count: number
            active_count: number
            delivered_count: number
          }[]
        >`
          with customer_orders as (
            select order_row.id, order_row.created_at
            from orders order_row
            where order_row.customer_id = ${userData.user.id}
              and order_row.status <> 'cancelled'
              and (
                ${activeOrderFilter} = 'All orders'
                or (${activeOrderFilter} = 'Active' and order_row.status <> 'delivered')
                or (${activeOrderFilter} = 'Delivered' and order_row.status = 'delivered')
                or (
                  ${activeOrderFilter} = 'Pending payment'
                  and (
                    (
                      select status
                      from invoices
                      where order_id = order_row.id
                      order by created_at desc
                      limit 1
                    ) = 'unpaid'
                    or (
                      not exists (select 1 from invoices where order_id = order_row.id)
                      and order_row.status not in ('paid', 'out_for_delivery', 'delivered')
                    )
                  )
                )
                or (
                  ${activeOrderFilter} = 'Needs attention'
                  and exists (select 1 from mismatches where order_id = order_row.id)
                  and (
                    (
                      select status
                      from invoices
                      where order_id = order_row.id
                      order by created_at desc
                      limit 1
                    ) = 'unpaid'
                    or (
                      not exists (select 1 from invoices where order_id = order_row.id)
                      and order_row.status not in ('paid', 'out_for_delivery', 'delivered')
                    )
                  )
                )
              )
              and (
                ${orderSearch} = ''
                or position(
                  lower(${orderSearch}) in lower(concat_ws(
                    ' ',
                    order_row.public_order_number,
                    case order_row.order_type
                      when 'wash' then 'Wash only'
                      when 'wash_iron' then 'Wash + Iron'
                      else 'Mixed service'
                    end,
                    case order_row.status
                      when 'pending_pickup' then 'Awaiting pickup'
                      when 'picked_up' then 'Picked up'
                      when 'at_vendor' then 'In progress'
                      when 'invoiced' then 'Pending payment'
                      when 'paid' then 'Ready for delivery'
                      when 'out_for_delivery' then 'Ready for delivery'
                      when 'delivered' then 'Delivered'
                      else ''
                    end,
                    case when order_row.status = 'pending_pickup' then 'Pickup pending' else 'Pickup confirmed' end
                  ))
                ) > 0
                or exists (
                  select 1
                  from pickup_locations pickup_location
                  where pickup_location.id = order_row.pickup_location_id
                    and position(lower(${orderSearch}) in lower(pickup_location.name)) > 0
                )
              )
          ),
          counts as (
            select count(*)::int as filtered_count from customer_orders
          ),
          all_counts as (
            select
              count(*)::int as total_count,
              count(*) filter (where status <> 'delivered')::int as active_count,
              count(*) filter (where status = 'delivered')::int as delivered_count
            from orders
            where customer_id = ${userData.user.id}
              and status <> 'cancelled'
          ),
          page_info as (
            select case
              when counts.filtered_count = 0 then 1
              else least(${orderPage}, ceil(counts.filtered_count::numeric / ${orderPageSize})::int)
            end as page
            from counts
          )
          select
            coalesce(
              array(
                select customer_orders.id
                from customer_orders
                order by customer_orders.created_at desc, customer_orders.id desc
                offset ((page_info.page - 1) * ${orderPageSize})
                limit ${orderPageSize}
              ),
              '{}'::uuid[]
            ) as page_order_ids,
            counts.filtered_count,
            page_info.page,
            all_counts.total_count,
            all_counts.active_count,
            all_counts.delivered_count
          from counts, page_info, all_counts
        `
      : []
    const requestedOrderId =
      isOrdersScope && requestedOrderReference
        ? await sql<{ id: string }[]>`
            select id
            from orders
            where customer_id = ${userData.user.id}
              and status <> 'cancelled'
              and (id::text = ${requestedOrderReference} or public_order_number = ${requestedOrderReference})
            limit 1
          `
        : []
    const overviewSummaryPromise = isOverviewScope
      ? sql<
          {
            active_order_count: number
            pending_payment_total: number
            has_pending_invoice_order: boolean
            mismatch_count: number
            latest_mismatch_detail: string | null
          }[]
        >`
          select
            count(*) filter (where order_row.status <> 'delivered')::int as active_order_count,
            coalesce(sum(coalesce(invoice.amount, order_row.billed_extra_amount, 0)) filter (
              where (invoice.status is null or invoice.status = 'unpaid')
                and order_row.status <> 'delivered'
            ), 0) as pending_payment_total,
            bool_or(order_row.status = 'invoiced') as has_pending_invoice_order,
            count(*) filter (
              where (invoice.status is null or invoice.status = 'unpaid')
                and exists (select 1 from mismatches mismatch where mismatch.order_id = order_row.id)
            )::int as mismatch_count,
            (
              select mismatch.detail
              from orders mismatch_order
              left join lateral (
                select status
                from invoices
                where order_id = mismatch_order.id
                order by created_at desc
                limit 1
              ) mismatch_invoice on true
              join lateral (
                select detail, created_at
                from mismatches
                where order_id = mismatch_order.id
                order by created_at desc
                limit 1
              ) mismatch on true
              where mismatch_order.customer_id = ${userData.user.id}
                and mismatch_order.status <> 'cancelled'
                and (mismatch_invoice.status is null or mismatch_invoice.status = 'unpaid')
              order by mismatch_order.created_at desc
              limit 1
            ) as latest_mismatch_detail
          from orders order_row
          left join lateral (
            select amount, status
            from invoices
            where order_id = order_row.id
            order by created_at desc
            limit 1
          ) invoice on true
          where order_row.customer_id = ${userData.user.id}
            and order_row.status <> 'cancelled'
        `
      : Promise.resolve([])
    const [
      { count: unreadNotificationCount },
      { data: orders },
      { data: pickupLocations },
      { data: wallet },
      { data: walletTransactions },
      { data: payments, error: paymentsError },
      { data: subscription },
    ] = await Promise.all([
      serverSupabase
        .from('notification_events')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', userData.user.id)
        .is('read_at', null),
      isSummaryScope
        ? Promise.resolve({ data: [] })
        : isInvoiceScope
          ? invoicePageSummary?.page_order_ids.length
            ? serverSupabase
                .from('orders')
                .select(
                  'id, public_order_number, customer_id, subscription_id, subscription_allowance_subscription_id, order_type, clothes_count_customer, clothes_count_vendor, subscription_units_applied, subscription_units_applied_at, status, pickup_otp, delivery_otp, pickup_location_id, notes, is_subscription_order, billed_extra_amount, picked, picked_up_date, created_at',
                )
                .eq('customer_id', userData.user.id)
                .in('id', invoicePageSummary.page_order_ids)
            : Promise.resolve({ data: [] })
          : isOrdersScope
              ? (() => {
                  const orderIds = [
                    ...new Set([...(orderPageSummary?.page_order_ids ?? []), ...(requestedOrderId.map((order) => order.id) ?? [])]),
                  ]
                  return orderIds.length > 0
                    ? serverSupabase
                        .from('orders')
                        .select(
                          'id, public_order_number, customer_id, subscription_id, subscription_allowance_subscription_id, order_type, clothes_count_customer, clothes_count_vendor, subscription_units_applied, subscription_units_applied_at, status, pickup_otp, delivery_otp, pickup_location_id, notes, is_subscription_order, billed_extra_amount, picked, picked_up_date, created_at',
                        )
                        .eq('customer_id', userData.user.id)
                        .in('id', orderIds)
                    : Promise.resolve({ data: [] })
                })()
              : (() => {
                  let query = serverSupabase
                    .from('orders')
                    .select(
                      'id, public_order_number, customer_id, subscription_id, subscription_allowance_subscription_id, order_type, clothes_count_customer, clothes_count_vendor, subscription_units_applied, subscription_units_applied_at, status, pickup_otp, delivery_otp, pickup_location_id, notes, is_subscription_order, billed_extra_amount, picked, picked_up_date, created_at',
                    )
                    .eq('customer_id', userData.user.id)
                    .neq('status', 'cancelled')
                    .order('created_at', { ascending: false })
                  if (isOverviewScope) query = query.limit(2)
                  return query
                })(),
      serverSupabase.from('pickup_locations').select('id, name, address').eq('active', true).order('name'),
      serverSupabase
        .from('wallets')
        .select('customer_id, one_off_balance, subscription_balance, promotional_balance, updated_at')
        .eq('customer_id', userData.user.id)
        .maybeSingle(),
      isTransactionsScope
        ? Promise.resolve({ data: [] as WalletTransaction[] })
        : serverSupabase
            .from('wallet_transactions')
            .select(
              'id, customer_id, balance_type, txn_type, amount, related_invoice_id, related_payment_id, related_referral_reward_id, related_subscription_id, created_at',
            )
            .eq('customer_id', userData.user.id)
            .order('created_at', { ascending: false })
            .limit(20),
      isTransactionsScope
        ? Promise.resolve({ data: [] as Payment[], error: null })
        : serverSupabase
            .from('payments')
            .select('id, reference, amount, plan_id, status, created_at')
            .eq('customer_id', userData.user.id)
            .order('created_at', { ascending: false })
            .limit(20),
      serverSupabase
        .from('subscriptions')
        .select(
          'id, customer_id, plan_id, start_date, end_date, weekly_limit_snapshot, covers_wash_snapshot, covers_iron_snapshot, created_at',
        )
        .eq('customer_id', userData.user.id)
        .eq('status', 'active')
        .or(`end_date.is.null,end_date.gte.${new Date().toISOString().slice(0, 10)}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const [overviewSummaryRow] = await overviewSummaryPromise

    const orderIds = (orders ?? []).map((order) => order.id)
    const subscriptionUsageReference = new Date()
    const subscriptionUsageTotalsQuery =
      (isSummaryScope || isOverviewScope || isInvoiceScope) && subscription
        ? getSubscriptionUsageTotals(
            {
              customerId: userData.user.id,
              subscription: {
                id: subscription.id,
                startDate: subscription.start_date,
                endDate: subscription.end_date,
              },
            },
            subscriptionUsageReference,
          )
        : Promise.resolve(null)
    const subscriptionUsageOrdersQuery =
      !(isSummaryScope || isOverviewScope || isInvoiceScope) || !subscription
        ? Promise.resolve((orders ?? []) as SubscriptionUsageOrder[])
        : Promise.resolve(null)
    const [
      { data: orderItems },
      { data: invoiceRows, error: invoiceRowsError },
      { data: subscriptionPlan },
      subscriptionUsageTotalsRows,
      subscriptionUsageOrders,
    ] = await Promise.all([
      orderIds.length > 0
        ? serverSupabase
            .from('order_items')
            .select('id, order_id, category_id, quantity, confirmed_quantity, service, unit_price, subscription_units_snapshot')
            .in('order_id', orderIds)
        : Promise.resolve({ data: [] }),
      isInvoiceScope && invoicePageSummary?.page_invoice_ids.length
        ? serverSupabase
            .from('invoices')
            .select('id, order_id, amount, status, payment_method, billing_breakdown, paid_at, created_at')
            .in('id', invoicePageSummary.page_invoice_ids)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
        : orderIds.length > 0
          ? serverSupabase
              .from('invoices')
              .select('id, order_id, amount, status, payment_method, billing_breakdown, paid_at, created_at')
              .in('order_id', orderIds)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      subscription
        ? serverSupabase
            .from('plans')
            .select('id, name, type, weekly_limit, covers_wash, covers_iron')
            .eq('id', subscription.plan_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      subscriptionUsageTotalsQuery,
      subscriptionUsageOrdersQuery,
    ])

    const categoryIds = [...new Set((orderItems ?? []).map((item) => item.category_id))]
    const customerInvoiceOrderIds = (invoiceRows ?? []).map((invoice) => invoice.order_id)
    const [{ data: orderCategories }, { data: invoiceMismatches }] = await Promise.all([
      categoryIds.length > 0
        ? serverSupabase.from('cloth_categories').select('id, name').in('id', categoryIds)
        : Promise.resolve({ data: [] }),
      customerInvoiceOrderIds.length > 0
        ? serverSupabase
            .from('mismatches')
            .select('id, order_id, direction, detail, details, created_at')
            .in('order_id', customerInvoiceOrderIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])
    const categoryNameById = new Map((orderCategories ?? []).map((category) => [category.id, category.name]))
    const persistedOrderItems: PersistedOrderItem[] = (orderItems ?? []).map((item) => ({
      ...item,
      category_name: categoryNameById.get(item.category_id) ?? 'Laundry item',
    }))
    if (invoiceRowsError) {
      console.error('Customer invoice details could not be loaded:', invoiceRowsError)
    }
    const orderMismatches = (invoiceMismatches ?? []).map((mismatch) => ({
      id: mismatch.id,
      order_id: mismatch.order_id,
      direction: mismatch.direction,
      detail: mismatch.detail,
      details: (mismatch.details ?? []) as MismatchLine[],
    }))
    const mismatchByOrderId = new Map<string, { direction: 'over' | 'under'; detail: string | null; details: MismatchLine[] }>()
    for (const mismatch of invoiceMismatches ?? []) {
      if (!mismatchByOrderId.has(mismatch.order_id)) mismatchByOrderId.set(mismatch.order_id, mismatch)
    }
    const invoicesWithDetails = (invoiceRows ?? []).map((invoice) => {
      const invoiceOrder = (orders ?? []).find((order) => order.id === invoice.order_id)
      const invoiceMismatch = mismatchByOrderId.get(invoice.order_id)
      return {
        ...invoice,
        order_reference: invoiceOrder?.public_order_number ?? invoice.order_id,
        original_count: invoiceOrder?.clothes_count_customer ?? null,
        final_count: invoiceOrder?.clothes_count_vendor ?? null,
        extra_amount: invoiceOrder?.billed_extra_amount ?? 0,
        mismatch_direction: invoiceMismatch?.direction ?? null,
        mismatch_detail: invoiceMismatch?.detail ?? null,
        mismatch_details: invoiceMismatch?.details ?? [],
      }
    })

    const subscriptionPlanSnapshot =
      subscription && subscriptionPlan
        ? {
            ...subscriptionPlan,
            weekly_limit: subscription.weekly_limit_snapshot,
            covers_wash: subscription.covers_wash_snapshot,
            covers_iron: subscription.covers_iron_snapshot,
          }
        : null
    const subscriptionAllowance =
      subscription && subscriptionPlanSnapshot
        ? calculateSubscriptionAllowance(
            {
              weeklyLimit: Number(subscription.weekly_limit_snapshot),
              startDate: subscription.start_date,
              startAt: subscription.created_at,
              endDate: subscription.end_date,
              usedUnits:
                subscriptionUsageTotalsRows?.usedUnits ??
                calculateSubscriptionUnitsApplied(subscriptionUsageOrders ?? [], {
                  id: subscription.id,
                  startDate: subscription.start_date,
                  endDate: subscription.end_date,
                }),
            },
            subscriptionUsageReference,
          )
        : null

    return {
      user: userData.user,
      profile,
      orders: orders ?? [],
      unpaidInvoiceOrderIds: (invoiceRows ?? []).filter((invoice) => invoice.status === 'unpaid').map((invoice) => invoice.order_id),
      invoiceAmountsByOrderId: Object.fromEntries((invoiceRows ?? []).map((invoice) => [invoice.order_id, Number(invoice.amount)])),
      pickupLocations: pickupLocations ?? [],
      orderItems: persistedOrderItems,
      subscriptionAllowance,
      wallet,
      walletTransactions: walletTransactions ?? [],
      payments: payments ?? [],
      transactionError: [paymentsError?.message, invoiceRowsError?.message].filter(Boolean).join(' ') || null,
      customerTransactions: isTransactionsScope
        ? (transactionPageSummary?.transactions ?? []).map((transaction) => ({
            ...transaction,
            date: new Date(transaction.created_at).toLocaleString(),
            sortDate: transaction.created_at,
            amount: `${transaction.direction === 'credit' ? '+' : '-'}₦${Number(transaction.amount).toLocaleString()}`,
          }))
        : null,
      transactionPagination: isTransactionsScope
        ? {
            page: Number(transactionPageSummary?.page ?? 1),
            pageSize: transactionPageSize,
            totalCount: Number(transactionPageSummary?.total_count ?? 0),
          }
        : null,
      invoices: invoicesWithDetails,
      orderMismatches,
      unreadNotificationCount: unreadNotificationCount ?? 0,
      subscription,
      subscriptionPlan: subscriptionPlanSnapshot,
      overviewSummary: overviewSummaryRow
        ? {
            activeOrderCount: Number(overviewSummaryRow.active_order_count),
            pendingPaymentTotal: Number(overviewSummaryRow.pending_payment_total),
            hasPendingInvoiceOrder: Boolean(overviewSummaryRow.has_pending_invoice_order),
            mismatchCount: Number(overviewSummaryRow.mismatch_count),
            latestMismatchDetail: overviewSummaryRow.latest_mismatch_detail,
          }
        : null,
      ordersPagination: isOrdersScope
        ? {
            page: Number(orderPageSummary?.page ?? 1),
            pageSize: orderPageSize,
            totalCount: Number(orderPageSummary?.total_count ?? 0),
            filteredCount: Number(orderPageSummary?.filtered_count ?? 0),
            activeCount: Number(orderPageSummary?.active_count ?? 0),
            deliveredCount: Number(orderPageSummary?.delivered_count ?? 0),
            pageOrderIds: orderPageSummary?.page_order_ids ?? [],
          }
        : null,
      invoicePagination: isInvoiceScope
        ? {
            page: Number(invoicePageSummary?.page ?? 1),
            pageSize: orderPageSize,
            totalCount: Number(invoicePageSummary?.total_count ?? 0),
          }
        : null,
    }
  }

  if (!isCustomerDataRequest) {
    return data(
      {
        user: userData.user,
        profile,
        orders: [],
        unpaidInvoiceOrderIds: [],
        invoiceAmountsByOrderId: {},
        pickupLocations: [],
        orderItems: [],
        subscriptionAllowance: null,
        wallet: null,
        walletTransactions: [],
        payments: [],
        transactionError: null,
        customerTransactions: null,
        transactionPagination: null,
        invoices: [],
        orderMismatches: [],
        unreadNotificationCount: 0,
        subscription: null,
        subscriptionPlan: null,
        overviewSummary: null,
        ordersPagination: null,
        invoicePagination: null,
        customerDataLoading: true,
        customerDataRequestId: crypto.randomUUID(),
        customerDataScope,
        customerDataError: null,
      },
      { headers },
    )
  }

  try {
    const loadedCustomerData = await loadCustomerData(customerDataScope)
    return data(
      {
        ...loadedCustomerData,
        customerDataLoading: false,
        customerDataRequestId: customerDataRequestId,
        customerDataScope,
        customerDataError: null,
      },
      { headers },
    )
  } catch (error) {
    if (!isCustomerDataRequest) throw error
    console.error('Customer portal data could not be loaded:', error)
    return data(
      {
        user: userData.user,
        profile,
        orders: [],
        unpaidInvoiceOrderIds: [],
        invoiceAmountsByOrderId: {},
        pickupLocations: [],
        orderItems: [],
        subscriptionAllowance: null,
        wallet: null,
        walletTransactions: [],
        payments: [],
        transactionError: null,
        customerTransactions: null,
        transactionPagination: null,
        invoices: [],
        orderMismatches: [],
        unreadNotificationCount: 0,
        subscription: null,
        subscriptionPlan: null,
        overviewSummary: null,
        ordersPagination: null,
        invoicePagination: null,
        customerDataLoading: false,
        customerDataRequestId: customerDataRequestId,
        customerDataScope,
        customerDataError: 'Your account data could not be loaded. Please try again.',
      },
      { headers, status: 500 },
    )
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: LoaderFunctionArgs) {
  return loadCustomerLayoutData(request)
}

function PlanSummary({ onNavigate }: { onNavigate?: () => void }) {
  const {
    activePlan,
    subscription,
    subscriptionBalance,
    subscriptionAvailableUnits,
    subscriptionBorrowedUnits,
    subscriptionNextBalanceAfterCredit,
    isDataLoading,
    dataLoadError,
  } = useCustomerStore()
  const displayedAvailableUnits = Math.max(0, subscriptionAvailableUnits ?? 0)
  const balancePercent = activePlan ? Math.min(100, Math.round((displayedAvailableUnits / activePlan.weekly_limit) * 100)) : 0
  const coverageLabel = activePlan
    ? activePlan.covers_wash && activePlan.covers_iron
      ? 'Wash, Iron, and Wash + Iron'
      : activePlan.covers_wash
        ? 'Wash'
        : 'Iron'
    : ''

  return (
    <NavLink
      to="/plans"
      aria-label="View plans"
      onClick={onNavigate}
      className="mt-auto block rounded-2xl border border-[#a7d7d2] bg-[#eef9f7] p-3.5 transition hover:border-[#78beb7] hover:bg-[#e4f5f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00b7d4]"
    >
      <p className="text-[10px] font-semibold capitalize tracking-[0.16em] text-[#418d87]">Current plan</p>
      {isDataLoading ? (
        <CustomerInlineSkeleton className="mt-2 w-32 bg-[#d3ebe8]" />
      ) : (
        <p className="mt-2 text-sm font-semibold capitalize text-slate-800">
          {dataLoadError
            ? 'Plan unavailable'
            : activePlan && subscription
              ? `${subscription.name} ${subscription.billingPeriod}`
              : 'No active plan'}
        </p>
      )}
      {!isDataLoading && !dataLoadError && activePlan && <p className="mt-1 text-xs text-slate-500">Covers: {coverageLabel}</p>}
      {subscriptionBalance < 0 && (
        <p className="mt-1 text-xs text-brand-primary">Subscription debt: ₦{Math.abs(subscriptionBalance).toLocaleString()}</p>
      )}
      {!isDataLoading && !dataLoadError && activePlan && (
        <p className="mt-2 text-xs text-slate-600">
          {displayedAvailableUnits} units available · {activePlan.weekly_limit} added weekly
        </p>
      )}
      {!isDataLoading && !dataLoadError && subscriptionBorrowedUnits > 0 && (
        <p className="mt-1 text-xs text-amber-700">
          {subscriptionBorrowedUnits} units borrowed
          {subscriptionNextBalanceAfterCredit !== null ? ` · ${subscriptionNextBalanceAfterCredit} expected after the next allowance` : ''}
        </p>
      )}
      {!dataLoadError && (
        <div
          className="mt-3 h-1.5 overflow-hidden bg-[#d3ebe8]"
          aria-label={isDataLoading ? 'Loading weekly allowance' : `${balancePercent}% of the weekly allowance is available`}
        >
          {isDataLoading ? (
            <div className="h-full w-1/2 animate-pulse bg-[#b8dcd8]" />
          ) : (
            <div className="h-full bg-[#55aaa3] transition-[width] duration-500" style={{ width: `${balancePercent}%` }} />
          )}
        </div>
      )}
    </NavLink>
  )
}

export default function CustomerLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isOffline = !useSyncExternalStore(subscribeToNetworkStatus, getNetworkStatus, getServerNetworkStatus)
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const loaderData = useLoaderData<typeof loader>()
  const { revalidate } = useRevalidator()
  const customerDataFetcher = useFetcher<typeof loader>()
  const activeCustomerDataScope = getCustomerDataScope(location.pathname)
  const customerDataRequestId = loaderData?.customerDataRequestId
    ? `${loaderData.customerDataRequestId}:${activeCustomerDataScope}${
        activeCustomerDataScope === 'orders' || activeCustomerDataScope === 'invoice' || activeCustomerDataScope === 'transactions'
          ? location.search
          : ''
      }`
    : null
  const shouldLoadCustomerData =
    Boolean(loaderData?.customerDataLoading) || Boolean(loaderData?.profile && loaderData.customerDataScope !== activeCustomerDataScope)
  const loadCustomerData = customerDataFetcher.load
  const fetcherData = customerDataFetcher.data
  const [startedCustomerDataRequestId, setStartedCustomerDataRequestId] = useState<string | null>(null)
  useEffect(() => {
    if (!shouldLoadCustomerData || !customerDataRequestId) return
    if (
      fetcherData?.customerDataRequestId === customerDataRequestId &&
      fetcherData.customerDataScope === activeCustomerDataScope &&
      fetcherData.customerDataLoading === false
    )
      return
    const requestParams = new URLSearchParams(location.search)
    requestParams.set('customerData', '1')
    requestParams.set('requestId', customerDataRequestId)
    requestParams.set('scope', activeCustomerDataScope)
    loadCustomerData(`/?index&${requestParams.toString()}`)
  }, [shouldLoadCustomerData, customerDataRequestId, activeCustomerDataScope, fetcherData, loadCustomerData, location.search])
  useEffect(() => {
    if (customerDataFetcher.state === 'idle' || !customerDataRequestId) return
    const timer = window.setTimeout(() => setStartedCustomerDataRequestId(customerDataRequestId), 0)
    return () => window.clearTimeout(timer)
  }, [customerDataFetcher.state, customerDataRequestId])
  const loadedCustomerData =
    fetcherData &&
    fetcherData.customerDataRequestId === customerDataRequestId &&
    fetcherData.customerDataScope === activeCustomerDataScope &&
    fetcherData.customerDataLoading === false
      ? fetcherData
      : null
  const customerData = loadedCustomerData ?? loaderData
  const customerDataRequestFailed =
    shouldLoadCustomerData &&
    startedCustomerDataRequestId === customerDataRequestId &&
    customerDataFetcher.state === 'idle' &&
    !loadedCustomerData
  const isCustomerDataLoading =
    shouldLoadCustomerData && !loadedCustomerData && !loaderData?.customerDataError && !customerDataRequestFailed
  const customerDataError =
    loadedCustomerData?.customerDataError ??
    loaderData?.customerDataError ??
    (customerDataRequestFailed ? 'Your account data could not be loaded. Please try again.' : null)
  const referralCode = loaderData?.profile?.referral_code ?? null
  const [showReferralModal, setShowReferralModal] = useState(false)
  const unreadNotificationCount = customerData?.unreadNotificationCount ?? 0
  const dismissReferralModal = () => {
    if (referralCode && typeof window !== 'undefined') {
      window.localStorage.setItem(`qaffy-referral-modal:${referralCode}`, '1')
    }
    setShowReferralModal(false)
  }

  useEffect(() => {
    if (!referralCode || typeof window === 'undefined') return
    const key = `qaffy-referral-modal:${referralCode}`
    if (window.localStorage.getItem(key)) return
    setShowReferralModal(true)
  }, [referralCode])

  const pageTitle =
    location.pathname === '/'
      ? 'Overview'
      : location.pathname.startsWith('/notifications')
        ? 'Notifications'
        : location.pathname.startsWith('/invoice')
          ? 'Invoice'
          : (navItems.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))?.label ?? 'Overview')

  const closeMobileMenu = () => setMobileMenuOpen(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    if (supabase) await supabase.auth.signOut()
    navigate('/login')
  }

  useEffect(() => {
    const client = supabase
    if (!client || !loaderData?.profile?.id) return

    let hasConnected = false
    let connectionWasInterrupted = false
    const channel = client
      .channel(`customer-wallet-${loaderData.profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallets', filter: `customer_id=eq.${loaderData.profile.id}` },
        revalidate,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wallet_transactions', filter: `customer_id=eq.${loaderData.profile.id}` },
        revalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `customer_id=eq.${loaderData.profile.id}` },
        revalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${loaderData.profile.id}` },
        revalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `customer_id=eq.${loaderData.profile.id}` },
        revalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notification_events', filter: `customer_id=eq.${loaderData.profile.id}` },
        revalidate,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (hasConnected || connectionWasInterrupted) revalidate()
          hasConnected = true
          connectionWasInterrupted = false
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          connectionWasInterrupted = true
        }
      })

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') revalidate()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      void client.removeChannel(channel)
    }
  }, [loaderData?.profile?.id, revalidate])

  useEffect(() => {
    if (!loaderData?.profile?.id || typeof window === 'undefined') return
    if (/Electron|\bCode\//i.test(navigator.userAgent)) return
    const promptKey = `qaffy-push-prompted:${loaderData.profile.id}`
    if (window.sessionStorage.getItem(promptKey)) return

    const setupFromInteraction = () => {
      window.removeEventListener('pointerdown', setupFromInteraction)
      window.removeEventListener('keydown', setupFromInteraction)
      void ensurePushSubscription()
        .then((subscription) => savePushSubscription(subscription))
        .then(() => window.sessionStorage.setItem(promptKey, '1'))
        .catch((error) => console.info('Push notification setup skipped:', error))
    }

    window.addEventListener('pointerdown', setupFromInteraction, { once: true })
    window.addEventListener('keydown', setupFromInteraction, { once: true })
    return () => {
      window.removeEventListener('pointerdown', setupFromInteraction)
      window.removeEventListener('keydown', setupFromInteraction)
    }
  }, [loaderData?.profile?.id])

  return (
    <CustomerStoreProvider
      key={`${customerData?.profile?.id ?? 'customer'}:${customerData?.profile?.name ?? ''}:${customerData?.profile?.phone ?? ''}:${customerData?.profile?.referral_code ?? ''}:${customerData?.profile?.pickup_location_id ?? ''}:${customerData?.wallet?.updated_at ?? 'no-wallet'}:${customerData?.subscription?.id ?? 'no-subscription'}:${customerData?.subscription?.end_date ?? ''}:${customerData?.ordersPagination?.page ?? ''}:${(customerData?.ordersPagination?.pageOrderIds ?? []).join('|')}:${customerData?.invoicePagination?.page ?? ''}:${customerData?.transactionPagination?.page ?? ''}:${(customerData?.customerTransactions ?? []).map((transaction) => `${transaction.id}-${transaction.title}-${transaction.amount}-${transaction.status}`).join('|')}:${(customerData?.orders ?? []).map((order) => `${order.id}-${order.status}-${order.pickup_otp ?? ''}-${order.delivery_otp ?? ''}-${order.clothes_count_vendor ?? ''}`).join('|')}:${(customerData?.payments ?? []).map((payment) => `${payment.id}-${payment.status}`).join('|')}:${(customerData?.invoices ?? []).map((invoice) => `${invoice.id}-${invoice.payment_method ?? ''}-${invoice.paid_at ?? ''}`).join('|')}`}
      profile={loaderData?.profile ?? undefined}
      persistedOrders={customerData ? (customerData.orders as Order[]) : undefined}
      persistedUnpaidInvoiceOrderIds={customerData?.unpaidInvoiceOrderIds as string[] | undefined}
      invoiceAmountsByOrderId={customerData?.invoiceAmountsByOrderId as Record<string, number> | undefined}
      persistedPickupLocations={customerData ? (customerData.pickupLocations as PickupLocationOption[]) : undefined}
      persistedOrderItems={customerData ? (customerData.orderItems as PersistedOrderItem[]) : undefined}
      persistedOrderMismatches={
        customerData?.orderMismatches as
          Array<{ id: string; order_id: string; direction: 'over' | 'under'; detail: string | null; details: MismatchLine[] }> | undefined
      }
      persistedSubscriptionAllowance={customerData?.subscriptionAllowance}
      persistedOverviewSummary={customerData?.overviewSummary}
      persistedOrdersPagination={customerData?.ordersPagination}
      persistedInvoicePagination={customerData?.invoicePagination}
      persistedWallet={customerData?.wallet as Wallet | null | undefined}
      persistedWalletTransactions={customerData?.walletTransactions as WalletTransaction[] | undefined}
      persistedPayments={customerData?.payments as Payment[] | undefined}
      persistedTransactionError={customerData?.transactionError as string | null | undefined}
      persistedTransactions={customerData?.customerTransactions ?? undefined}
      persistedTransactionPagination={customerData?.transactionPagination}
      persistedInvoices={
        customerData?.invoices as
          | Array<
              Invoice & {
                order_reference?: string
                original_count?: number | null
                final_count?: number | null
                extra_amount?: number | null
                mismatch_direction?: 'over' | 'under' | null
                mismatch_detail?: string | null
                mismatch_details?: MismatchLine[]
              }
            >
          | undefined
      }
      persistedSubscription={
        customerData?.subscription && customerData.subscriptionPlan
          ? { subscription: customerData.subscription as Subscription, plan: customerData.subscriptionPlan as Plan }
          : null
      }
      isDataLoading={isCustomerDataLoading}
      dataLoadError={customerDataError}
    >
      {showReferralModal && referralCode && (
        <div className="referral-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
          <div className="referral-modal-card w-full max-w-md rounded-[30px] border border-slate-200 bg-white p-5 text-center shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-[#dff9fd] via-[#e8fbfd] to-[#d2f4fa] text-brand-primary ring-4 ring-white/60 referral-modal-badge">
              <div className="referral-modal-dot absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-[#18c6d9] shadow-[0_0_0_4px_rgba(24,198,217,0.18)]" />
              <Gift className="h-8 w-8" strokeWidth={2.1} />
            </div>

            <h3 className="mt-5 text-2xl font-bold tracking-[-0.03em] text-slate-900">Refer friends and earn rewards</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              When someone signs up with your referral link, we record it and keep the reward pending until they complete the qualifying
              action.
            </p>

            <ul className="mt-5 space-y-2.5 text-left text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-primary" />
                Share your referral link with friends.
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-primary" />
                Once they join, the referral is tracked.
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-primary" />
                Your reward stays pending until the qualifying action is completed.
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-primary" />
                After qualification, the reward is added to your promotional balance.
              </li>
            </ul>

            <button
              type="button"
              onClick={dismissReferralModal}
              className="mt-6 w-full rounded-2xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(0,183,212,0.24)] transition hover:bg-[#00a7c3]"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <div className="relative min-h-screen bg-[#fafafa] text-[#121212]">
        {isOffline && (
          <div
            role="status"
            className="sticky top-0 z-[60] flex items-center justify-center gap-2 whitespace-nowrap bg-rose-100 px-2 py-2 text-center text-xs font-medium text-rose-800 sm:px-4 sm:text-sm"
          >
            <WifiOff className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
            <span>You’re offline. Reconnect to the internet to continue using Qaffy.</span>
          </div>
        )}
        <div className="relative z-10 min-h-screen lg:flex">
          <aside className="sticky top-0 hidden h-screen max-h-screen w-[221px] shrink-0 overflow-y-auto border-r border-[#f2f3f3] bg-white px-[13px] py-8 shadow-[1px_0_8px_rgba(18,18,18,0.04)] lg:flex lg:flex-col print:hidden">
            <div className="px-3">
              <NavLink
                to="/"
                aria-label="Go to customer home"
                className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
              >
                <QaffyLogo />
              </NavLink>
            </div>

            <nav className="mx-auto mt-12 w-[194px] space-y-[3px]">
              {navItems.map((item) => {
                const Icon = item.icon

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    prefetch="intent"
                    className={({ isActive }) =>
                      `flex h-10 items-center gap-3 rounded-[10px] px-4 text-sm font-medium transition ${
                        isActive ? 'bg-brand-surface text-brand-strong' : 'text-[#121212] hover:bg-[#fafafa]'
                      }`
                    }
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-[5px] text-[#121212]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>

            <div className="mt-auto space-y-1">
              <PwaInstallLink />
              <NavLink
                to="/transactions"
                prefetch="intent"
                className="flex h-10 w-full items-center gap-3 rounded-[10px] px-4 text-sm font-medium text-[#121212] hover:bg-[#fafafa]"
              >
                <ClipboardList className="h-4 w-4" />
                <span>Activity log</span>
              </NavLink>
              <button
                type="button"
                onClick={() => setLogoutConfirmationOpen(true)}
                className="flex h-10 w-full items-center gap-3 rounded-[10px] px-4 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="h-4 w-4 text-red-600" />
                <span>Log out</span>
              </button>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-20 border-b border-[#f2f3f3] bg-white lg:hidden print:hidden">
              <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
                <button
                  type="button"
                  aria-label="Open navigation menu"
                  aria-expanded={mobileMenuOpen}
                  onClick={() => setMobileMenuOpen((open) => !open)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600"
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>

                <NavLink
                  to="/"
                  aria-label="Go to customer home"
                  className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
                >
                  <QaffyLogo className="scale-[0.82]" />
                </NavLink>

                <div className="flex items-center gap-2">
                  <NavLink
                    to="/notifications"
                    prefetch="intent"
                    aria-label="Open notifications"
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-[#f59e0b] px-0.5 text-[9px] font-bold text-white">
                        {unreadNotificationCount}
                      </span>
                    )}
                  </NavLink>
                  <NavLink
                    to="/settings"
                    prefetch="intent"
                    aria-label="Open profile"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600"
                  >
                    <UserCircle2 className="h-5 w-5" />
                  </NavLink>
                </div>
              </div>
            </header>

            {mobileMenuOpen && (
              <div className="fixed inset-0 z-40 lg:hidden print:hidden">
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  className="absolute inset-0 bg-slate-950/35"
                  onClick={closeMobileMenu}
                />

                <aside className="relative z-10 flex h-full w-[82%] max-w-sm flex-col border-r border-[#e7e7e7] bg-white px-4 py-5 shadow-xl">
                  <div className="mb-6 flex items-center justify-between">
                    <NavLink
                      to="/"
                      aria-label="Go to customer home"
                      onClick={closeMobileMenu}
                      className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
                    >
                      <QaffyLogo className="scale-[0.82]" />
                    </NavLink>
                    <button
                      type="button"
                      aria-label="Close navigation menu"
                      onClick={closeMobileMenu}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <nav className="space-y-1">
                    {navItems.map((item) => {
                      const Icon = item.icon

                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.end}
                          prefetch="intent"
                          onClick={closeMobileMenu}
                          className={({ isActive }) =>
                            `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition ${
                              isActive ? 'bg-brand-surface text-brand-strong' : 'text-[#121212] hover:bg-[#fafafa]'
                            }`
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <span
                                className={`flex h-8 w-8 items-center justify-center rounded-md ${isActive ? 'text-brand-strong' : 'text-[#121212]'}`}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <span>{item.label}</span>
                            </>
                          )}
                        </NavLink>
                      )
                    })}
                  </nav>

                  <div className="mt-auto">
                    <PwaInstallLink />
                    <PlanSummary onNavigate={closeMobileMenu} />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      closeMobileMenu()
                      setLogoutConfirmationOpen(true)
                    }}
                    className="mt-3 flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <LogOut className="h-4 w-4 text-red-600" />
                    <span>Log out</span>
                  </button>
                </aside>
              </div>
            )}

            <div className="hidden h-[70px] items-center justify-between gap-4 px-7 pt-[22px] lg:flex">
              <h2 className="text-2xl font-bold tracking-tight text-[#121212]">{pageTitle}</h2>
              <div className="flex items-center gap-4">
                <Form
                  method="get"
                  action="/orders"
                  className="flex h-12 w-[288px] items-center gap-2 rounded-full border border-[#f2f3f3] bg-white px-4 text-sm text-[#505959]"
                >
                  <Search className="h-3.5 w-3.5 text-[#8e9a9a]" />
                  <input
                    name="search"
                    type="search"
                    placeholder="Search orders"
                    aria-label="Search orders"
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#8e9a9a]"
                  />
                </Form>
                <NavLink
                  to="/notifications"
                  prefetch="intent"
                  aria-label="Open notifications"
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#f2f3f3] bg-white text-[#121212]"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotificationCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[#f59e0b] px-1 text-[10px] font-bold text-white">
                      {unreadNotificationCount}
                    </span>
                  )}
                </NavLink>
              </div>
            </div>
            <main className="mx-auto w-full max-w-300 px-4 pb-8 pt-5 sm:px-6 sm:pt-6 lg:pb-10 lg:pt-5">
              {customerDataError && location.pathname !== '/' && (
                <div
                  role="alert"
                  className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                  <span>{customerDataError}</span>
                  <button type="button" onClick={() => revalidate()} className="rounded-lg border border-red-300 px-3 py-1.5 font-semibold">
                    Retry
                  </button>
                </div>
              )}
              <Outlet />
            </main>
          </div>
        </div>
      </div>

      {logoutConfirmationOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={() => !isLoggingOut && setLogoutConfirmationOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[#e7e7e7] bg-white p-6 text-center shadow-2xl"
          >
            <h2 id="logout-title" className="text-xl font-bold text-slate-900">
              Log out of Qaffy?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">You will need to sign in again to access your laundry account.</p>
            <div className="mx-auto mt-6 flex max-w-xs gap-3">
              <button
                type="button"
                onClick={() => setLogoutConfirmationOpen(false)}
                disabled={isLoggingOut}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex-1 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? 'Logging out...' : 'Log out'}
              </button>
            </div>
          </section>
        </div>
      )}
    </CustomerStoreProvider>
  )
}
