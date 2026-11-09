import { useState } from 'react'
import { NavLink, Outlet, data, redirect, useLoaderData, useLocation, useNavigate, useRevalidator } from 'react-router'
import { useEffect } from 'react'
import type { Route } from './+types/VendorLayout'
import { Banknote, ClipboardList, History, LayoutDashboard, LogOut, Menu, Settings, X } from 'lucide-react'
import QaffyLogo from '../../components/QaffyLogo'
import { requireRole } from '../../lib/auth.server'
import { sql } from '../../lib/db.server'
import { supabase } from '../../lib/supabase.client'

const vendorOrderPageSize = 20
const vendorOverviewOrderPageSize = 10

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
  const requestedPage = Number.parseInt(requestUrl.searchParams.get('page') ?? '1', 10)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const requestedOverviewRange = requestUrl.searchParams.get('range') ?? 'Today'
  const overviewRange = ['Today', 'This week', 'All time'].includes(requestedOverviewRange) ? requestedOverviewRange : 'Today'
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
        select vendor_orders.id, vendor_orders.created_at
        from vendor_orders
        join orders order_row on order_row.id = vendor_orders.id
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
          order by created_at desc, id desc
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
    const [metrics] = await sql<
      {
        today_pending: number
        today_active: number
        today_dispatched: number
        today_completed: number
        week_pending: number
        week_active: number
        week_dispatched: number
        week_completed: number
        all_pending: number
        all_active: number
        all_dispatched: number
        all_completed: number
      }[]
    >`
      select
        count(*) filter (where status = 'picked_up' and coalesce(picked_up_date, created_at) >= (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'))::int as today_pending,
        count(*) filter (where status in ('at_vendor', 'invoiced', 'paid') and coalesce(picked_up_date, created_at) >= (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'))::int as today_active,
        count(*) filter (where status = 'out_for_delivery' and coalesce(picked_up_date, created_at) >= (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'))::int as today_dispatched,
        count(*) filter (where status = 'delivered' and coalesce(picked_up_date, created_at) >= (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'))::int as today_completed,
        count(*) filter (where status = 'picked_up' and coalesce(picked_up_date, created_at) >= ((date_trunc('day', now() at time zone 'Africa/Lagos') - interval '6 days') at time zone 'Africa/Lagos'))::int as week_pending,
        count(*) filter (where status in ('at_vendor', 'invoiced', 'paid') and coalesce(picked_up_date, created_at) >= ((date_trunc('day', now() at time zone 'Africa/Lagos') - interval '6 days') at time zone 'Africa/Lagos'))::int as week_active,
        count(*) filter (where status = 'out_for_delivery' and coalesce(picked_up_date, created_at) >= ((date_trunc('day', now() at time zone 'Africa/Lagos') - interval '6 days') at time zone 'Africa/Lagos'))::int as week_dispatched,
        count(*) filter (where status = 'delivered' and coalesce(picked_up_date, created_at) >= ((date_trunc('day', now() at time zone 'Africa/Lagos') - interval '6 days') at time zone 'Africa/Lagos'))::int as week_completed,
        count(*) filter (where status = 'picked_up')::int as all_pending,
        count(*) filter (where status in ('at_vendor', 'invoiced', 'paid'))::int as all_active,
        count(*) filter (where status = 'out_for_delivery')::int as all_dispatched,
        count(*) filter (where status = 'delivered')::int as all_completed
      from orders
      where status <> 'cancelled'
        and (vendor_id = ${vendor.id} or (vendor_id is null and status = 'picked_up'))
    `
    overviewMetrics = {
      Today: {
        pending: Number(metrics?.today_pending ?? 0),
        active: Number(metrics?.today_active ?? 0),
        dispatched: Number(metrics?.today_dispatched ?? 0),
        completed: Number(metrics?.today_completed ?? 0),
      },
      'This week': {
        pending: Number(metrics?.week_pending ?? 0),
        active: Number(metrics?.week_active ?? 0),
        dispatched: Number(metrics?.week_dispatched ?? 0),
        completed: Number(metrics?.week_completed ?? 0),
      },
      'All time': {
        pending: Number(metrics?.all_pending ?? 0),
        active: Number(metrics?.all_active ?? 0),
        dispatched: Number(metrics?.all_dispatched ?? 0),
        completed: Number(metrics?.all_completed ?? 0),
      },
    }
    const [overviewOrderPage] = await sql<{ order_ids: string[]; total_count: number; page: number; page_count: number }[]>`
      with matching_orders as (
        select id, coalesce(picked_up_date, created_at) as order_date, created_at
        from orders
        where status = 'picked_up'
          and vendor_id is null
          and (
            ${overviewRange} = 'All time'
            or (
              ${overviewRange} = 'Today'
              and coalesce(picked_up_date, created_at) >= (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')
            )
            or (
              ${overviewRange} = 'This week'
              and coalesce(picked_up_date, created_at) >= ((date_trunc('day', now() at time zone 'Africa/Lagos') - interval '6 days') at time zone 'Africa/Lagos')
            )
          )
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
          order by order_date desc, created_at desc, id desc
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
        mismatches: (mismatches ?? []).filter((mismatch) => mismatch.order_id === order.id),
        logisticsEvents: (logisticsEvents ?? []).filter((event) => event.order_id === order.id),
      })),
      vendorName: auth.profile.name ?? 'Vendor',
      rateCard: [...rateCard.values()],
      payoutAccountReady: !vendor || (vendor.payout_account_status === 'verified' && Boolean(vendor.payout_recipient_code)),
      ordersPagination,
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
  const [payoutPromptDismissed, setPayoutPromptDismissed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { revalidate } = useRevalidator()

  useEffect(() => {
    const client = supabase
    if (!client) return

    const channel = client
      .channel('vendor-order-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => revalidate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_logistics_events' }, () => revalidate())
      .subscribe()

    const refreshVisibleState = window.setInterval(() => {
      if (document.visibilityState === 'visible') revalidate()
    }, 5000)

    return () => {
      window.clearInterval(refreshVisibleState)
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
    <div className="min-h-screen bg-[#f8f8f8] text-[#121212]">
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
          <div className="flex flex-col items-center gap-3">
            <NavLink
              to="/vendor"
              aria-label="Go to vendor home"
              className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
            >
              <QaffyLogo className="inline-flex" />
            </NavLink>
            <p className="text-[10px] font-semibold capitalize tracking-[0.18em] text-brand-primary">Vendor</p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Open vendor menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <div className="min-h-screen">
        <aside
          className={`${menuOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-30 flex w-[221px] flex-col overflow-y-auto border-r border-[#ececec] bg-white px-[13px] py-7 transition-transform lg:translate-x-0`}
        >
          <div className="flex flex-col items-center gap-3 px-3">
            <NavLink
              to="/vendor"
              aria-label="Go to vendor home"
              onClick={() => setMenuOpen(false)}
              className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
            >
              <QaffyLogo className="inline-flex" />
            </NavLink>
            <p className="text-[10px] font-semibold capitalize tracking-[0.18em] text-brand-primary">Vendor</p>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 lg:hidden"
              aria-label="Close vendor menu"
            >
              <X size={16} />
            </button>
          </div>
          <nav className="mx-auto mt-12 w-[194px] space-y-1">
            {navigation.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                prefetch="intent"
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex h-10 items-center gap-3 rounded-[8px] px-4 text-sm font-medium transition ${isActive ? 'bg-brand-surface text-brand-strong' : 'text-[#121212] hover:bg-[#f8f8f8]'}`
                }
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-[5px]">
                  <Icon size={16} />
                </span>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto space-y-1">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex h-10 w-full items-center gap-3 rounded-[8px] px-4 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut size={16} />
              <span>Log out</span>
            </button>
          </div>
        </aside>

        {menuOpen && (
          <button
            type="button"
            aria-label="Close vendor menu overlay"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-20 bg-slate-950/20 lg:hidden"
          />
        )}

        <div className="min-w-0 lg:ml-[221px]">
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
