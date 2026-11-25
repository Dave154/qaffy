import { useState } from 'react'
import { NavLink, Outlet, data, redirect, useLoaderData, useLocation, useNavigate, useRevalidator } from 'react-router'
import { useEffect } from 'react'
import type { Route } from './+types/VendorLayout'
import { Banknote, ChevronLeft, ChevronRight, ClipboardList, History, LayoutDashboard, LogOut, Menu, Settings, X } from 'lucide-react'
import QaffyLogo from '../../components/QaffyLogo'
import { requireRole } from '../../lib/auth.server'
import { changedRowStatus, createRefreshScheduler } from '../../lib/live-refresh.client'
import { sql } from '../../lib/db.server'
import { normalizeMismatchDetails } from '../../lib/mismatch-details'
import { supabase } from '../../lib/supabase.client'

const vendorOrderPageSize = 20
const vendorOverviewOrderPageSize = 10
const overviewDateModes = ['all', 'today', 'this_week', 'last_week', 'this_month', 'last_month', 'custom'] as const
const overviewSortColumns = ['pickup_date', 'order_type', 'customer', 'customer_id', 'location', 'status'] as const
const vendorOrderSortColumns = ['order', 'customer', 'service', 'location', 'pickup', 'status'] as const
type OverviewDateMode = (typeof overviewDateModes)[number]
type OverviewSortColumn = (typeof overviewSortColumns)[number]
type OverviewSortRule = { column: OverviewSortColumn; direction: 'asc' | 'desc' }
type VendorOrderSortColumn = (typeof vendorOrderSortColumns)[number]
type VendorOrderSortRule = { column: VendorOrderSortColumn; direction: 'asc' | 'desc' }

function validOverviewDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function parseOverviewSortRules(value: string | null): OverviewSortRule[] {
  if (!value) return []
  const seen = new Set<OverviewSortColumn>()
  return value
    .split(',')
    .flatMap((rule): OverviewSortRule[] => {
      const [column, direction] = rule.split(':')
      if (
        !overviewSortColumns.includes(column as OverviewSortColumn) ||
        (direction !== 'asc' && direction !== 'desc') ||
        seen.has(column as OverviewSortColumn)
      ) {
        return []
      }
      seen.add(column as OverviewSortColumn)
      return [{ column: column as OverviewSortColumn, direction }]
    })
    .slice(0, overviewSortColumns.length)
}

function parseVendorOrderSortRules(value: string | null): VendorOrderSortRule[] {
  if (!value) return []
  const seen = new Set<VendorOrderSortColumn>()
  return value
    .split(',')
    .flatMap((rule): VendorOrderSortRule[] => {
      const [column, direction] = rule.split(':')
      if (
        !vendorOrderSortColumns.includes(column as VendorOrderSortColumn) ||
        (direction !== 'asc' && direction !== 'desc') ||
        seen.has(column as VendorOrderSortColumn)
      ) {
        return []
      }
      seen.add(column as VendorOrderSortColumn)
      return [{ column: column as VendorOrderSortColumn, direction }]
    })
    .slice(0, vendorOrderSortColumns.length)
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'vendor')
  if (!auth) throw redirect('/vendor/login')
  const { supabase, headers } = auth
  const requestUrl = new URL(request.url)

  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id, payout_account_status, payout_recipient_code')
    .eq('profile_id', auth.profile.id)
    .eq('status', 'approved')
    .maybeSingle()
  if (vendorError) throw new Error(`Vendor account could not be loaded: ${vendorError.message}`)

  const isOrdersPage = requestUrl.pathname === '/vendor/orders'
  const isOverviewPage = requestUrl.pathname === '/vendor' || requestUrl.pathname === '/vendor/'
  const requestedTab = requestUrl.searchParams.get('tab') ?? 'processing'
  const allowedTabs = ['unclaimed', 'processing', 'ready', 'dispatched', 'delivered']
  const activeTab = allowedTabs.includes(requestedTab) ? requestedTab : 'processing'
  const orderSearch = (requestUrl.searchParams.get('search') ?? '').trim().slice(0, 100)
  const ordersSortRules = parseVendorOrderSortRules(requestUrl.searchParams.get('sort'))
  const requestedPage = Number.parseInt(requestUrl.searchParams.get('page') ?? '1', 10)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const legacyOverviewRange = requestUrl.searchParams.get('range')
  const legacyOverviewMode =
    legacyOverviewRange === 'Today' ? 'today' : legacyOverviewRange === 'This week' ? 'this_week' : legacyOverviewRange === 'All time' ? 'all' : null
  const requestedOverviewMode = requestUrl.searchParams.get('date') ?? legacyOverviewMode ?? 'today'
  const overviewDateMode: OverviewDateMode = overviewDateModes.includes(requestedOverviewMode as OverviewDateMode)
    ? (requestedOverviewMode as OverviewDateMode)
    : 'today'
  const overviewFromDate = validOverviewDate(requestUrl.searchParams.get('from'))
  const overviewToDate = validOverviewDate(requestUrl.searchParams.get('to'))
  const overviewSortRules: OverviewSortRule[] = requestUrl.searchParams.has('sort')
    ? parseOverviewSortRules(requestUrl.searchParams.get('sort'))
    : [{ column: 'pickup_date', direction: 'desc' }]
  let pageOrderIds: string[] = []
  let overviewOrderIds: string[] | null = null
  let ordersPagination: {
    page: number
    pageSize: number
    totalCount: number
    tabCounts: { unclaimed: number; processing: number; ready: number; dispatched: number; delivered: number }
  } | null = null
  let overviewMetrics: Record<string, { pending: number; active: number; dispatched: number; completed: number }> | null = null
  let overviewPagination: { page: number; pageSize: number; totalCount: number; pageCount: number } | null = null

  if (vendor?.id && isOrdersPage) {
    const orderSortExpression = (column: VendorOrderSortColumn) => {
      switch (column) {
        case 'order':
          return sql`public_order_number`
        case 'customer':
          return sql`customer_name`
        case 'service':
          return sql`service_name`
        case 'location':
          return sql`location_name`
        case 'pickup':
          return sql`picked_up_date`
        case 'status':
          return sql`order_status`
      }
    }
    const ordersOrderBy = ordersSortRules.length
      ? ordersSortRules.slice(1).reduce(
          (order, rule) => sql`
            ${order}, ${orderSortExpression(rule.column)} ${rule.direction === 'asc' ? sql`asc` : sql`desc`} nulls last
          `,
          sql`${orderSortExpression(ordersSortRules[0].column)} ${ordersSortRules[0].direction === 'asc' ? sql`asc` : sql`desc`} nulls last`,
        )
      : sql`created_at desc`
    const [pageSummary] = await sql<
      {
        order_ids: string[]
        total_count: number
        page: number
        unclaimed_count: number
        processing_count: number
        ready_count: number
        dispatched_count: number
        delivered_count: number
      }[]
    >`
      with vendor_orders as (
        select
          order_row.id,
          order_row.vendor_id,
          order_row.status,
          order_row.created_at,
          coalesce(invoice.status::text, 'none') as invoice_status
        from orders order_row
        left join lateral (
          select status
          from invoices
          where order_id = order_row.id
          order by created_at desc, id desc
          limit 1
        ) invoice on true
        where order_row.status <> 'cancelled'
          and (
            order_row.vendor_id = ${vendor.id}
            or (order_row.vendor_id is null and order_row.status = 'picked_up')
          )
      ),
      tab_counts as (
        select
          count(*) filter (where status = 'picked_up' and vendor_id is null)::int as unclaimed_count,
          count(*) filter (where vendor_id = ${vendor.id} and status in ('at_vendor', 'invoiced', 'paid'))::int as processing_count,
          count(*) filter (
            where vendor_id = ${vendor.id}
              and ((status = 'paid' and invoice_status = 'paid') or (status = 'invoiced' and invoice_status = 'unpaid'))
          )::int as ready_count,
          count(*) filter (where vendor_id = ${vendor.id} and status = 'out_for_delivery')::int as dispatched_count,
          count(*) filter (where vendor_id = ${vendor.id} and status = 'delivered')::int as delivered_count
        from vendor_orders
      ),
      matching_orders as (
        select
          vendor_orders.id,
          vendor_orders.created_at,
          order_row.public_order_number,
          order_row.picked_up_date,
          order_row.status::text as order_status,
          case order_row.order_type
            when 'wash' then 'Wash only'
            when 'wash_iron' then 'Wash + Iron'
            else 'Mixed service'
          end as service_name,
          customer.name as customer_name,
          location.name as location_name
        from vendor_orders
        join orders order_row on order_row.id = vendor_orders.id
        left join profiles customer on customer.id = order_row.customer_id
        left join pickup_locations location on location.id = order_row.pickup_location_id
        where (
          (${activeTab} = 'unclaimed' and vendor_orders.status = 'picked_up' and vendor_orders.vendor_id is null)
          or (${activeTab} = 'processing' and vendor_orders.vendor_id = ${vendor.id} and vendor_orders.status in ('at_vendor', 'invoiced', 'paid'))
          or (
            ${activeTab} = 'ready'
            and vendor_orders.vendor_id = ${vendor.id}
            and ((vendor_orders.status = 'paid' and vendor_orders.invoice_status = 'paid')
              or (vendor_orders.status = 'invoiced' and vendor_orders.invoice_status = 'unpaid'))
          )
          or (${activeTab} = 'dispatched' and vendor_orders.vendor_id = ${vendor.id} and vendor_orders.status = 'out_for_delivery')
          or (${activeTab} = 'delivered' and vendor_orders.vendor_id = ${vendor.id} and vendor_orders.status = 'delivered')
        )
        and (
          ${orderSearch} = ''
          or position(lower(${orderSearch}) in lower(concat_ws(
            ' ',
            order_row.public_order_number,
            (select name from profiles where id = order_row.customer_id),
            (select qaffy_id from profiles where id = order_row.customer_id),
            (select name from pickup_locations where id = order_row.pickup_location_id),
            case order_row.order_type when 'wash' then 'Wash only' when 'wash_iron' then 'Wash + Iron' else 'Mixed service' end
          ))) > 0
        )
      ),
      total as (
        select count(*)::int as total_count from matching_orders
      ),
      page_info as (
        select case
          when total.total_count = 0 then 1
          else least(${page}, ceil(total.total_count::numeric / ${vendorOrderPageSize})::int)
        end as page
        from total
      )
      select
        coalesce(array(
          select id
          from matching_orders
          order by ${ordersOrderBy}, created_at desc, id desc
          offset ((select page from page_info) - 1) * ${vendorOrderPageSize}
          limit ${vendorOrderPageSize}
        ), '{}'::uuid[]) as order_ids,
        total.total_count,
        page_info.page,
        tab_counts.unclaimed_count,
        tab_counts.processing_count,
        tab_counts.ready_count,
        tab_counts.dispatched_count,
        tab_counts.delivered_count
      from total, page_info, tab_counts
    `
    pageOrderIds = pageSummary?.order_ids ?? []
    ordersPagination = {
      page: Number(pageSummary?.page ?? 1),
      pageSize: vendorOrderPageSize,
      totalCount: Number(pageSummary?.total_count ?? 0),
      tabCounts: {
        unclaimed: Number(pageSummary?.unclaimed_count ?? 0),
        processing: Number(pageSummary?.processing_count ?? 0),
        ready: Number(pageSummary?.ready_count ?? 0),
        dispatched: Number(pageSummary?.dispatched_count ?? 0),
        delivered: Number(pageSummary?.delivered_count ?? 0),
      },
    }
  } else if (vendor?.id && isOverviewPage) {
    const overviewDateFilter = (() => {
      switch (overviewDateMode) {
        case 'today':
          return sql`
            o.picked_up_date >= (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')
            and o.picked_up_date < ((date_trunc('day', now() at time zone 'Africa/Lagos') + interval '1 day') at time zone 'Africa/Lagos')
          `
        case 'this_week':
          return sql`
            o.picked_up_date >= (date_trunc('week', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')
            and o.picked_up_date < ((date_trunc('week', now() at time zone 'Africa/Lagos') + interval '1 week') at time zone 'Africa/Lagos')
          `
        case 'last_week':
          return sql`
            o.picked_up_date >= ((date_trunc('week', now() at time zone 'Africa/Lagos') - interval '1 week') at time zone 'Africa/Lagos')
            and o.picked_up_date < (date_trunc('week', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')
          `
        case 'this_month':
          return sql`
            o.picked_up_date >= (date_trunc('month', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')
            and o.picked_up_date < ((date_trunc('month', now() at time zone 'Africa/Lagos') + interval '1 month') at time zone 'Africa/Lagos')
          `
        case 'last_month':
          return sql`
            o.picked_up_date >= ((date_trunc('month', now() at time zone 'Africa/Lagos') - interval '1 month') at time zone 'Africa/Lagos')
            and o.picked_up_date < (date_trunc('month', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')
          `
        case 'custom':
          return sql`
            (${overviewFromDate}::date is null or o.picked_up_date >= (${overviewFromDate}::date::timestamp at time zone 'Africa/Lagos'))
            and (${overviewToDate}::date is null or o.picked_up_date < ((${overviewToDate}::date + 1)::timestamp at time zone 'Africa/Lagos'))
          `
        default:
          return sql`true`
      }
    })()
    const sortExpression = (column: OverviewSortColumn) => {
      switch (column) {
        case 'pickup_date':
          return sql`picked_up_date`
        case 'order_type':
          return sql`order_type`
        case 'customer':
          return sql`customer_name`
        case 'customer_id':
          return sql`customer_qaffy_id`
        case 'location':
          return sql`location_name`
        case 'status':
          return sql`order_status`
      }
    }
    const overviewOrderBy = overviewSortRules.length
      ? overviewSortRules.slice(1).reduce(
          (order, rule) => sql`
            ${order}, ${sortExpression(rule.column)} ${rule.direction === 'asc' ? sql`asc` : sql`desc`} nulls last
          `,
          sql`${sortExpression(overviewSortRules[0].column)} ${overviewSortRules[0].direction === 'asc' ? sql`asc` : sql`desc`} nulls last`,
        )
      : sql`id desc`
    const [metrics] = await sql<
      {
        pending: number
        active: number
        dispatched: number
        completed: number
      }[]
    >`
      select
        count(*) filter (where o.status = 'picked_up')::int as pending,
        count(*) filter (where o.status in ('at_vendor', 'invoiced', 'paid'))::int as active,
        count(*) filter (where o.status = 'out_for_delivery')::int as dispatched,
        count(*) filter (where o.status = 'delivered')::int as completed
      from orders o
      where o.status <> 'cancelled'
        and (o.vendor_id = ${vendor.id} or (o.vendor_id is null and o.status = 'picked_up'))
        and ${overviewDateFilter}
    `
    overviewMetrics = {
      [overviewDateMode]: {
        pending: Number(metrics?.pending ?? 0),
        active: Number(metrics?.active ?? 0),
        dispatched: Number(metrics?.dispatched ?? 0),
        completed: Number(metrics?.completed ?? 0),
      },
    }
    const [overviewOrderPage] = await sql<{ order_ids: string[]; total_count: number; page: number; page_count: number }[]>`
      with matching_orders as (
        select
          o.id,
          o.picked_up_date,
          o.order_type::text as order_type,
          o.status::text as order_status,
          customer.name as customer_name,
          coalesce(customer.qaffy_id, o.customer_id::text) as customer_qaffy_id,
          location.name as location_name
        from orders o
        left join profiles customer on customer.id = o.customer_id
        left join pickup_locations location on location.id = o.pickup_location_id
        where o.status = 'picked_up'
          and o.vendor_id is null
          and ${overviewDateFilter}
      ),
      total as (
        select count(*)::int as total_count from matching_orders
      ),
      page_info as (
        select
          case
            when total.total_count = 0 then 1
            else least(${page}, ceil(total.total_count::numeric / ${vendorOverviewOrderPageSize})::int)
          end as page,
          greatest(1, ceil(total.total_count::numeric / ${vendorOverviewOrderPageSize})::int) as page_count
        from total
      )
      select
        coalesce(array(
          select id
          from matching_orders
          order by ${overviewOrderBy}, picked_up_date desc nulls last, id desc
          offset ((select page from page_info) - 1) * ${vendorOverviewOrderPageSize}
          limit ${vendorOverviewOrderPageSize}
        ), '{}'::uuid[]) as order_ids,
        total.total_count,
        page_info.page,
        page_info.page_count
      from total, page_info
    `
    pageOrderIds = overviewOrderPage?.order_ids ?? []
    overviewOrderIds = [...pageOrderIds]
    overviewPagination = {
      page: Number(overviewOrderPage?.page ?? 1),
      pageSize: vendorOverviewOrderPageSize,
      totalCount: Number(overviewOrderPage?.total_count ?? 0),
      pageCount: Number(overviewOrderPage?.page_count ?? 1),
    }
    const requestedOrderId = requestUrl.searchParams.get('orderId')
    if (requestedOrderId) {
      const { data: selectedOrder, error: selectedOrderError } = await supabase
        .from('orders')
        .select('id')
        .eq('id', requestedOrderId)
        .or(`vendor_id.eq.${vendor.id},and(vendor_id.is.null,status.eq.picked_up)`)
        .maybeSingle()
      if (selectedOrderError) throw new Error(`Selected vendor order could not be loaded: ${selectedOrderError.message}`)
      if (selectedOrder?.id) pageOrderIds = [...new Set([...pageOrderIds, selectedOrder.id])]
    }
  }

  const { data: orders, error: ordersError } = pageOrderIds.length
    ? await supabase
        .from('orders')
        .select(
          'id, public_order_number, customer_id, order_type, clothes_count_vendor, status, pickup_otp, delivery_otp, pickup_location_id, notes, is_subscription_order, billed_extra_amount, picked, picked_up_date, created_at',
        )
        .in('id', pageOrderIds)
    : { data: [], error: null }
  if (ordersError) throw new Error(`Vendor orders could not be loaded: ${ordersError.message}`)
  const orderById = new Map((orders ?? []).map((order) => [order.id, order]))
  const orderedOrders = pageOrderIds.map((id) => orderById.get(id)).filter((order) => order !== undefined)
  const orderIds = orderedOrders.map((order) => order.id)
  const customerIds = [...new Set(orderedOrders.map((order) => order.customer_id))]
  const locationIds = [...new Set(orderedOrders.map((order) => order.pickup_location_id).filter(Boolean))] as string[]

  const [
    { data: profiles, error: profilesError },
    { data: locations, error: locationsError },
    { data: items, error: itemsError },
    { data: invoices, error: invoicesError },
    { data: mismatches, error: mismatchesError },
    { data: logisticsEvents, error: logisticsEventsError },
  ] = await Promise.all([
    customerIds.length
      ? supabase.from('profiles').select('id, name, qaffy_id, email, phone').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? supabase.from('pickup_locations').select('id, name').in('id', locationIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from('order_items')
          .select('id, order_id, category_id, quantity, confirmed_quantity, service, unit_price')
          .in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase.from('invoices').select('id, order_id, amount, status, created_at, paid_at').in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from('mismatches')
          .select('id, order_id, direction, detail, details, created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from('order_logistics_events')
          .select('id, order_id, event_type, created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])
  const enrichmentError = profilesError ?? locationsError ?? itemsError ?? invoicesError ?? mismatchesError ?? logisticsEventsError
  if (enrichmentError) throw new Error(`Vendor order details could not be loaded: ${enrichmentError.message}`)
  const [{ data: categories }, { data: categoryRates }] = await Promise.all([
    supabase.from('cloth_categories').select('id, name').order('name', { ascending: true }),
    supabase.from('cloth_category_rates').select('category_id, vendor_wash_price, vendor_iron_price, vendor_wash_iron_price'),
  ])

  const rateCard = new Map<string, { name: string; wash: number | null; iron: number | null; wash_iron: number | null }>()

  for (const category of categories ?? []) {
    const current = rateCard.get(category.name) ?? { name: category.name, wash: null, iron: null, wash_iron: null }
    const rate = (categoryRates ?? []).find((row) => row.category_id === category.id)

    current.wash = rate && rate.vendor_wash_price != null ? Number(rate.vendor_wash_price) : null
    current.iron = rate && rate.vendor_iron_price != null ? Number(rate.vendor_iron_price) : null
    current.wash_iron = rate && rate.vendor_wash_iron_price != null ? Number(rate.vendor_wash_iron_price) : null
    rateCard.set(category.name, current)
  }

  return data(
    {
      orders: orderedOrders.map((order) => ({
        ...order,
        customer: (profiles ?? []).find((profile) => profile.id === order.customer_id) ?? null,
        location: (locations ?? []).find((location) => location.id === order.pickup_location_id) ?? null,
        items: (items ?? [])
          .filter((item) => item.order_id === order.id)
          .map((item) => ({ ...item, category: (categories ?? []).find((category) => category.id === item.category_id) ?? null })),
        invoice: (invoices ?? []).find((invoice) => invoice.order_id === order.id) ?? null,
        mismatches: (mismatches ?? [])
          .filter((mismatch) => mismatch.order_id === order.id)
          .map((mismatch) => ({ ...mismatch, details: normalizeMismatchDetails(mismatch.details) })),
        logisticsEvents: (logisticsEvents ?? []).filter((event) => event.order_id === order.id),
      })),
      vendorName: auth.profile.name ?? 'Vendor',
      rateCard: [...rateCard.values()],
      payoutAccountReady: !vendor || (vendor.payout_account_status === 'verified' && Boolean(vendor.payout_recipient_code)),
      ordersPagination,
      ordersSortRules,
      overviewMetrics,
      overviewOrderIds,
      overviewPagination,
    },
    { headers, status: 200 },
  )
}

const navigation = [
  { to: '/vendor', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/vendor/orders', label: 'Orders', icon: ClipboardList },
  { to: '/vendor/finance', label: 'Finance', icon: History },
  { to: '/vendor/settings', label: 'Settings', icon: Settings },
]

export default function VendorLayout() {
  const loaderData = useLoaderData<typeof loader>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [payoutPromptDismissed, setPayoutPromptDismissed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { revalidate } = useRevalidator()

  useEffect(() => {
    const client = supabase
    if (!client) return

    // Each revalidation re-runs the layout and page loaders (~15 Supabase requests), so events are
    // debounced, skipped while the tab is hidden, and polling only runs while Realtime is down.
    const refresher = createRefreshScheduler(revalidate, { connectedPollMs: 5 * 60_000 })
    const channel = client
      .channel('vendor-order-feed')
      // Logistics events are always written together with an order status change, so the orders
      // feed alone covers them. Orders still awaiting pickup are never shown to vendors.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (changedRowStatus(payload) === 'pending_pickup') return
        refresher.schedule()
      })
      .subscribe((status) => refresher.setChannelStatus(status))

    return () => {
      refresher.dispose()
      void client.removeChannel(channel)
    }
  }, [revalidate])
  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/vendor/login', { replace: true })
  }
  const pageTitle =
    location.pathname === '/vendor'
      ? 'Overview'
      : (navigation.find((item) => item.to !== '/vendor' && location.pathname.startsWith(item.to))?.label ?? 'Overview')

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900">
      {!loaderData.payoutAccountReady && !payoutPromptDismissed && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[3px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPayoutPromptDismissed(true)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="vendor-payout-setup-title"
            className="relative w-full max-w-110 rounded-2xl border border-white bg-white px-6 py-8 shadow-2xl sm:px-9 sm:py-9"
          >
            <button
              type="button"
              aria-label="Remind me later"
              onClick={() => setPayoutPromptDismissed(true)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <X size={18} />
            </button>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-primary ring-4 ring-brand-soft/50">
              <Banknote size={25} strokeWidth={1.8} />
            </div>
            <div className="mt-5 text-center">
              <h2 id="vendor-payout-setup-title" className="mt-2 text-2xl font-bold leading-tight text-slate-900">
                Set up your payout account
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
                Add your bank account details so we can send your payouts. Complete your setup to be included in settlements.
              </p>
            </div>
            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setPayoutPromptDismissed(true)
                  navigate('/vendor/settings')
                }}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover"
              >
                <Settings size={17} /> Set up payout details
              </button>
              <button
                type="button"
                onClick={() => setPayoutPromptDismissed(true)}
                className="h-11 w-full rounded-xl px-4 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
              >
                Remind me later
              </button>
            </div>
          </section>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-[#f2f3f3] bg-white lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open vendor navigation"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600"
          >
            <Menu size={18} />
          </button>
          <div className="flex flex-1 flex-col items-center gap-1">
            <NavLink
              to="/vendor"
              aria-label="Go to vendor home"
              className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
            >
              <QaffyLogo className="scale-[0.82]" />
            </NavLink>
            <p className="text-[10px] font-semibold capitalize tracking-[0.18em] text-brand-primary">Vendor</p>
          </div>
          <div className="h-9 w-9" aria-hidden="true" />
        </div>
      </header>

      <div className="min-h-screen">
        <aside
          className={`fixed left-0 top-0 z-30 hidden h-screen max-h-screen shrink-0 self-start flex-col overflow-visible border-r border-[#f2f3f3] bg-white py-7 shadow-[1px_0_8px_rgba(18,18,18,0.04)] transition-[width] duration-300 lg:flex ${isCollapsed ? 'w-[76px] px-3' : 'w-[221px] px-[13px]'}`}
        >
          <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className={`mb-8 flex flex-col gap-3 ${isCollapsed ? 'items-center text-center' : ''}`}>
              {isCollapsed ? (
                <NavLink
                  to="/vendor"
                  aria-label="Go to vendor home"
                  title="Vendor home"
                  className="mt-2 rounded-sm text-3xl leading-[33px] text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
                  style={{ fontFamily: 'Pacifico, cursive' }}
                >
                  Q
                </NavLink>
              ) : (
                <NavLink
                  to="/vendor"
                  aria-label="Go to vendor home"
                  className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
                >
                  <QaffyLogo className="mt-2 origin-left px-3 scale-[0.78]" />
                </NavLink>
              )}
              <p className={`text-[10px] font-semibold capitalize tracking-[0.22em] text-brand-primary ${isCollapsed ? 'sr-only' : 'px-3'}`}>
                Vendor
              </p>
            </div>
            <nav className={`mx-auto space-y-2 ${isCollapsed ? 'w-full' : 'w-[194px]'}`}>
              {navigation.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  prefetch="intent"
                  className={({ isActive }) =>
                    `group relative flex h-11 items-center rounded-xl text-sm font-medium transition ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} ${isActive ? 'bg-brand-soft text-brand-primary' : 'text-[#121212] hover:bg-brand-soft hover:text-brand-primary'}`
                  }
                >
                  <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span className={isCollapsed ? 'sr-only' : ''}>{label}</span>
                  {isCollapsed && (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute left-[calc(100%+12px)] z-20 hidden whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block"
                    >
                      {label}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              onClick={() => void handleLogout()}
              aria-label="Log out"
              className={`group relative mt-auto flex h-10 w-full items-center rounded-[10px] text-left text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}
            >
              <LogOut size={17} strokeWidth={1.8} aria-hidden="true" className="text-red-600 group-hover:text-red-700" />
              <span className={`${isCollapsed ? 'sr-only' : ''} text-red-600 group-hover:text-red-700`}>Log out</span>
              {isCollapsed && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-[calc(100%+12px)] z-20 hidden whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block"
                >
                  Log out
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute -right-3 top-7 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-[#f0eeee] bg-white text-slate-400 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition hover:text-brand-primary"
          >
            {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close vendor navigation overlay"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/35"
            />
            <aside className="relative z-10 flex h-full w-[84%] max-w-sm flex-col overflow-y-auto border-r border-[#e7e7e7] bg-white px-[13px] py-5 shadow-xl">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex flex-1 flex-col items-start gap-3">
                  <NavLink
                    to="/vendor"
                    aria-label="Go to vendor home"
                    onClick={() => setMenuOpen(false)}
                    className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
                  >
                    <QaffyLogo className="origin-left scale-[0.78] px-0" />
                  </NavLink>
                  <p className="text-[10px] font-semibold capitalize tracking-[0.22em] text-brand-primary">Vendor</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close vendor navigation"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600"
                >
                  <X size={17} />
                </button>
              </div>
              <nav className="space-y-2">
                {navigation.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    prefetch="intent"
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-medium transition ${isActive ? 'bg-brand-soft text-brand-primary' : 'text-[#121212] hover:bg-brand-soft hover:text-brand-primary'}`
                    }
                  >
                    <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                    {label}
                  </NavLink>
                ))}
              </nav>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  void handleLogout()
                }}
                aria-label="Log out"
                className="mt-auto flex h-10 w-full items-center rounded-[10px] px-4 text-left text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut size={17} strokeWidth={1.8} aria-hidden="true" className="mr-3" />
                Log out
              </button>
            </aside>
          </div>
        )}

        <div className={`min-w-0 transition-[margin] duration-300 ${isCollapsed ? 'lg:ml-[76px]' : 'lg:ml-[221px]'}`}>
          <header className="hidden h-[70px] items-center justify-between gap-4 border-b border-[#f2f3f3] bg-white px-7 pt-[22px] lg:sticky lg:top-0 lg:z-10 lg:flex">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
            </div>
          </header>
          <main className="mx-auto w-full max-w-300 px-4 pb-8 pt-5 sm:px-6 sm:pt-6 lg:px-7 lg:pb-10 lg:pt-5">
            <Outlet context={loaderData} />
          </main>
        </div>
      </div>
    </div>
  )
}
