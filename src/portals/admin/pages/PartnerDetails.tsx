import { ArrowLeft } from 'lucide-react'
import { data, Link, useLoaderData, useLocation, useSearchParams } from 'react-router'
import type { Route } from './+types/PartnerDetails'
import { requireRole } from '../../../lib/auth.server'
import type { OrderInvoiceStatus, OrderLifecycleStatus } from '../../../lib/orderLifecycle'
import { sql } from '../../../lib/db.server'

type PartnerType = 'vendor' | 'logistics'
const VENDOR_ORDERS_PAGE_SIZE = 10
const statsPeriods = ['all', 'today', 'this_month', 'last_month', 'this_year'] as const
type PartnerOrder = {
  id: string
  publicOrderNumber: string
  status: OrderLifecycleStatus
  createdAt: string
  customerItems: number
  confirmedItems: number | null
  invoiceAmount: number | null
  invoiceStatus: OrderInvoiceStatus
  settlementStatus: string | null
  payoutAmount: number
}
type PartnerEvent = {
  id: string
  orderId: string
  publicOrderNumber: string
  eventType: string
  createdAt: string
}
type PartnerDetailsData = {
  type: PartnerType
  partner: {
    id: string
    profileId: string
    name: string | null
    email: string | null
    phone: string | null
    createdAt: string
    status: string
    businessName: string | null
    bankName: string | null
    accountName: string | null
    accountStatus: string | null
    recipientReady: boolean
  }
  stats: {
    totalOrders: number
    activeOrders: number
    completedOrders: number
    confirmedItems: number
    payoutEarned: number
    paidOut: number
    unreleasedPayout: number
    processing: number
    readyToDispatch: number
    dispatched: number
    delivered: number
    totalEvents: number
    pickups: number
    deliveries: number
  }
  orders: PartnerOrder[]
  orderPagination: { page: number; pageSize: number; totalOrders: number }
  statsPeriod: StatsPeriod
  events: PartnerEvent[]
}

const statusStyles: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  suspended: 'bg-slate-100 text-slate-600',
  rejected: 'bg-red-50 text-red-700',
  paid: 'bg-emerald-50 text-emerald-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
}

function money(value: number) {
  return `₦${value.toLocaleString()}`
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded'
}

function label(value: string) {
  const formatted = value.replaceAll('_', ' ')
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function maskAccount(value: string | null) {
  if (!value) return 'Not provided'
  return `••••••${value.slice(-4)}`
}

function toOrderInvoiceStatus(value: string | null | undefined): OrderInvoiceStatus {
  if (value === 'paid' || value === 'unpaid') return value
  return null
}

type StatsPeriod = (typeof statsPeriods)[number]

function inStatsPeriod(value: string, period: StatsPeriod) {
  if (period === 'all') return true
  const dateValue = new Date(value)
  const now = new Date()
  if (period === 'today') return dateValue.toDateString() === now.toDateString()
  if (period === 'this_year') return dateValue.getFullYear() === now.getFullYear()
  if (period === 'this_month') return dateValue.getFullYear() === now.getFullYear() && dateValue.getMonth() === now.getMonth()
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return dateValue.getFullYear() === previousMonth.getFullYear() && dateValue.getMonth() === previousMonth.getMonth()
}

function getStatsPeriodBounds(period: StatsPeriod, now = new Date()) {
  if (period === 'all') return { start: null, end: null }
  const lagosNow = new Date(now.getTime() + 60 * 60 * 1000)
  const year = lagosNow.getUTCFullYear()
  const month = lagosNow.getUTCMonth()
  const lagosDate = lagosNow.getUTCDate()
  let start: Date
  let end: Date
  if (period === 'today') {
    start = new Date(Date.UTC(year, month, lagosDate) - 60 * 60 * 1000)
    end = new Date(Date.UTC(year, month, lagosDate + 1) - 60 * 60 * 1000)
  } else if (period === 'this_year') {
    start = new Date(Date.UTC(year, 0, 1) - 60 * 60 * 1000)
    end = new Date(Date.UTC(year + 1, 0, 1) - 60 * 60 * 1000)
  } else if (period === 'this_month') {
    start = new Date(Date.UTC(year, month, 1) - 60 * 60 * 1000)
    end = new Date(Date.UTC(year, month + 1, 1) - 60 * 60 * 1000)
  } else {
    start = new Date(Date.UTC(year, month - 1, 1) - 60 * 60 * 1000)
    end = new Date(Date.UTC(year, month, 1) - 60 * 60 * 1000)
  }
  return { start: start.toISOString(), end: end.toISOString() }
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  const type = params.type === 'vendor' || params.type === 'logistics' ? params.type : null
  const partnerId = params.id
  if (!auth || !type || !partnerId) return data<PartnerDetailsData | null>(null, { status: 404 })

  const { supabase, headers } = auth
  const url = new URL(request.url)
  const requestedPeriod = url.searchParams.get('period')
  const statsPeriod = statsPeriods.find((period) => period === requestedPeriod) ?? 'all'
  const requestedPage = Number(url.searchParams.get('page') ?? 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  if (type === 'vendor') {
    const { data: vendor } = await supabase
      .from('vendors')
      .select(
        'id, profile_id, business_name, status, created_at, payout_bank_name, payout_account_name, payout_account_number, payout_account_status, payout_recipient_code',
      )
      .eq('id', partnerId)
      .maybeSingle()
    if (!vendor) return data<PartnerDetailsData | null>(null, { headers, status: 404 })

    const bounds = getStatsPeriodBounds(statsPeriod)
    const [profileResult, [vendorOrderResult]] = await Promise.all([
      supabase.from('profiles').select('id, name, email, phone, created_at').eq('id', vendor.profile_id).maybeSingle(),
      sql<
        {
          total_orders: number
          active_orders: number
          completed_orders: number
          confirmed_items: number
          payout_earned: number | string
          paid_out: number | string
          unreleased_payout: number | string
          processing: number
          ready_to_dispatch: number
          dispatched: number
          delivered: number
          all_order_count: number
          orders: PartnerOrder[] | null
        }[]
      >`
        with vendor_orders as (
          select
            o.id,
            o.public_order_number,
            o.status::text as status,
            o.created_at,
            (select coalesce(sum(oi.quantity), 0)::int from order_items oi where oi.order_id = o.id) as customer_items,
            o.clothes_count_vendor::int as confirmed_items,
            invoice.amount as invoice_amount,
            invoice.status as invoice_status,
            settlement.status as settlement_status,
            coalesce(settlement.payout_amount, 0)::numeric as payout_amount
          from orders o
          left join lateral (
            select i.amount, i.status::text as status
            from invoices i
            where i.order_id = o.id
            order by i.created_at desc
            limit 1
          ) invoice on true
          left join lateral (
            select vs.status::text as status, coalesce(sum(vsi.amount), 0) as payout_amount
            from vendor_settlement_orders vso
            join vendor_settlements vs on vs.id = vso.settlement_id
            left join order_items oi on oi.order_id = vso.order_id
            left join vendor_settlement_items vsi on vsi.order_item_id = oi.id and vsi.settlement_id = vs.id
            where vso.order_id = o.id and vs.vendor_id = o.vendor_id
            group by vs.id, vs.status, vs.created_at
            order by vs.created_at desc
            limit 1
          ) settlement on true
          where o.vendor_id = ${partnerId}
        ),
        summary as (
          select
            count(*) filter (where (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz))::int as total_orders,
            count(*) filter (where status not in ('delivered', 'cancelled')
              and (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz))::int as active_orders,
            count(*) filter (where status = 'delivered'
              and (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz))::int as completed_orders,
            coalesce(sum(confirmed_items) filter (where (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz)), 0)::int as confirmed_items,
            coalesce(sum(payout_amount) filter (where (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz)), 0) as payout_earned,
            coalesce(sum(payout_amount) filter (where settlement_status = 'paid'
              and (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz)), 0) as paid_out,
            coalesce(sum(payout_amount) filter (where settlement_status is distinct from 'paid'
              and (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz)), 0) as unreleased_payout,
            count(*) filter (where status = 'at_vendor'
              and (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz))::int as processing,
            count(*) filter (where ((status = 'paid' and invoice_status = 'paid') or (status = 'invoiced' and invoice_status = 'unpaid'))
              and (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz))::int as ready_to_dispatch,
            count(*) filter (where status = 'out_for_delivery'
              and (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz))::int as dispatched,
            count(*) filter (where status = 'delivered'
              and (${bounds.start}::timestamptz is null or created_at >= ${bounds.start}::timestamptz)
              and (${bounds.end}::timestamptz is null or created_at < ${bounds.end}::timestamptz))::int as delivered
          from vendor_orders
        ),
        paged_orders as (
          select * from vendor_orders order by created_at desc, id desc
          limit ${VENDOR_ORDERS_PAGE_SIZE} offset ${(page - 1) * VENDOR_ORDERS_PAGE_SIZE}
        )
        select
          summary.*,
          (select count(*)::int from vendor_orders) as all_order_count,
          coalesce((select jsonb_agg(jsonb_build_object(
            'id', id,
            'publicOrderNumber', coalesce(public_order_number, 'QO-UNKNOWN'),
            'status', status,
            'createdAt', created_at,
            'customerItems', customer_items,
            'confirmedItems', confirmed_items,
            'invoiceAmount', invoice_amount,
            'invoiceStatus', invoice_status,
            'settlementStatus', settlement_status,
            'payoutAmount', payout_amount
          ) order by created_at desc, id desc) from paged_orders), '[]'::jsonb) as orders
        from summary
      `,
    ])
    const profile = profileResult.data
    const statsRow = vendorOrderResult
    const partnerOrders: PartnerOrder[] = (statsRow.orders ?? []).map((order) => ({
      ...order,
      status: order.status,
      invoiceStatus: toOrderInvoiceStatus(order.invoiceStatus),
      customerItems: Number(order.customerItems),
      confirmedItems: order.confirmedItems === null ? null : Number(order.confirmedItems),
      invoiceAmount: order.invoiceAmount === null ? null : Number(order.invoiceAmount),
      payoutAmount: Number(order.payoutAmount),
    }))
    return data<PartnerDetailsData>(
      {
        type,
        partner: {
          id: vendor.id,
          profileId: vendor.profile_id,
          name: profile?.name ?? vendor.business_name,
          email: profile?.email ?? null,
          phone: profile?.phone ?? null,
          createdAt: vendor.created_at,
          status: vendor.status,
          businessName: vendor.business_name,
          bankName: vendor.payout_bank_name ?? null,
          accountName: vendor.payout_account_name ?? null,
          accountStatus: vendor.payout_account_status ?? null,
          recipientReady: Boolean(vendor.payout_recipient_code),
        },
        stats: {
          totalOrders: Number(statsRow.total_orders),
          activeOrders: Number(statsRow.active_orders),
          completedOrders: Number(statsRow.completed_orders),
          confirmedItems: Number(statsRow.confirmed_items),
          payoutEarned: Number(statsRow.payout_earned),
          paidOut: Number(statsRow.paid_out),
          unreleasedPayout: Number(statsRow.unreleased_payout),
          processing: Number(statsRow.processing),
          readyToDispatch: Number(statsRow.ready_to_dispatch),
          dispatched: Number(statsRow.dispatched),
          delivered: Number(statsRow.delivered),
          totalEvents: 0,
          pickups: 0,
          deliveries: 0,
        },
        orders: partnerOrders,
        orderPagination: { page, pageSize: VENDOR_ORDERS_PAGE_SIZE, totalOrders: Number(statsRow.all_order_count) },
        statsPeriod,
        events: [],
      },
      { headers, status: 200 },
    )
  }

  const { data: agent } = await supabase
    .from('logistics_agents')
    .select('id, profile_id, status, created_at')
    .eq('id', partnerId)
    .maybeSingle()
  if (!agent) return data<PartnerDetailsData | null>(null, { headers, status: 404 })
  const { data: events } = await supabase
    .from('order_logistics_events')
    .select('id, order_id, event_type, created_at')
    .eq('agent_profile_id', agent.profile_id)
    .order('created_at', { ascending: false })
  const profile = (await supabase.from('profiles').select('id, name, email, phone, created_at').eq('id', agent.profile_id).maybeSingle())
    .data
  const eventOrderIds = [...new Set((events ?? []).map((event) => event.order_id))]
  const { data: eventOrders } = eventOrderIds.length
    ? await supabase.from('orders').select('id, public_order_number').in('id', eventOrderIds)
    : { data: [] as Array<{ id: string; public_order_number: string | null }> }
  const publicOrderById = new Map((eventOrders ?? []).map((order) => [order.id, order.public_order_number ?? 'QO-UNKNOWN']))
  const partnerEvents: PartnerEvent[] = (events ?? []).map((event) => ({
    id: event.id,
    orderId: event.order_id,
    publicOrderNumber: publicOrderById.get(event.order_id) ?? 'QO-UNKNOWN',
    eventType: event.event_type,
    createdAt: event.created_at,
  }))
  const pickups = partnerEvents.filter((event) => event.eventType === 'picked_up').length
  const deliveries = partnerEvents.filter((event) => event.eventType === 'delivered').length
  return data<PartnerDetailsData>(
    {
      type,
      partner: {
        id: agent.id,
        profileId: agent.profile_id,
        name: profile?.name ?? 'Unnamed agent',
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        createdAt: agent.created_at,
        status: agent.status,
        businessName: null,
        bankName: null,
        accountName: null,
        accountStatus: null,
        recipientReady: false,
      },
      stats: {
        totalOrders: eventOrderIds.length,
        activeOrders: 0,
        completedOrders: 0,
        confirmedItems: 0,
        payoutEarned: 0,
        paidOut: 0,
        unreleasedPayout: 0,
        processing: 0,
        readyToDispatch: 0,
        dispatched: 0,
        delivered: 0,
        totalEvents: partnerEvents.length,
        pickups,
        deliveries,
      },
      orders: [],
      orderPagination: { page: 1, pageSize: VENDOR_ORDERS_PAGE_SIZE, totalOrders: 0 },
      statsPeriod,
      events: partnerEvents,
    },
    { headers, status: 200 },
  )
}

function StatCard({ label: title, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-1 first:pl-0 last:pr-0">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  )
}

export default function PartnerDetails() {
  const details = useLoaderData<typeof loader>()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  if (!details)
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Partner not found.</div>
  const { partner, type } = details
  const isVendor = type === 'vendor'
  const statsPeriod = details.statsPeriod
  const currentPage = details.orderPagination.page
  const totalOrderPages = Math.max(1, Math.ceil(details.orderPagination.totalOrders / details.orderPagination.pageSize))
  const firstOrderNumber = details.orderPagination.totalOrders === 0 ? 0 : (currentPage - 1) * details.orderPagination.pageSize + 1
  const lastOrderNumber = Math.min(currentPage * details.orderPagination.pageSize, details.orderPagination.totalOrders)
  const pageHref = (page: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(page))
    return `?${params.toString()}`
  }
  const visibleEvents = details.events.filter((event) => inStatsPeriod(event.createdAt, statsPeriod))
  const stats = isVendor
    ? details.stats
    : {
        totalOrders: new Set(visibleEvents.map((event) => event.orderId)).size,
        activeOrders: 0,
        completedOrders: 0,
        confirmedItems: 0,
        payoutEarned: 0,
        paidOut: 0,
        unreleasedPayout: 0,
        totalEvents: visibleEvents.length,
        pickups: visibleEvents.filter((event) => event.eventType === 'picked_up').length,
        deliveries: visibleEvents.filter((event) => event.eventType === 'delivered').length,
      }
  return (
    <div className="flex flex-col space-y-6 pb-10 [&>section:nth-of-type(1)]:order-3 [&>section:nth-of-type(2)]:order-2 [&>section:nth-of-type(3)]:order-4 [&>section:nth-of-type(4)]:order-5">
      <Link
        to={isVendor ? '/admin/partners/vendors' : '/admin/partners/logistics'}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-brand-primary"
      >
        <ArrowLeft size={16} /> Back to {isVendor ? 'vendors' : 'logistics'}
      </Link>
      <div className="order-1 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">Overview</h2>
        <select
          aria-label="Stats period"
          value={statsPeriod}
          onChange={(event) =>
            setSearchParams((current) => {
              const next = new URLSearchParams(current)
              next.set('period', event.target.value)
              next.delete('page')
              return next
            })
          }
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
        >
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="this_year">This year</option>
        </select>
      </div>
      <section className="border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">{isVendor ? 'Vendor' : 'Logistics agent'}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{partner.name ?? 'Unnamed partner'}</h1>
            <div className="mt-4 grid gap-x-8 gap-y-2 text-sm text-slate-600 sm:grid-cols-2">
              <p>
                <span className="font-medium text-slate-900">Email</span> {partner.email ?? 'Not provided'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Phone</span> {partner.phone ?? 'Not provided'}
              </p>
              <p>
                <span className="font-medium text-slate-900">Joined</span> {date(partner.createdAt)}
              </p>
              <p>
                <span className="font-medium text-slate-900">Profile ID</span>{' '}
                <span className="font-mono text-xs">{partner.profileId}</span>
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles[partner.status] ?? 'bg-slate-100 text-slate-600'}`}
          >
            {label(partner.status)}
          </span>
        </div>
        {isVendor && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-900">Business and payout account</p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-slate-500">Business</p>
                <p className="font-medium text-slate-900">{partner.businessName ?? 'Not provided'}</p>
              </div>
              <div>
                <p className="text-slate-500">Bank account</p>
                <p className="font-medium text-slate-900">
                  {partner.bankName ?? 'Not provided'} · {maskAccount(partner.accountName)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Payout readiness</p>
                <p className={`font-medium ${partner.recipientReady ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {partner.recipientReady ? 'Ready for payout' : 'Account not ready'}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="grid grid-cols-2 gap-y-5 border-y border-slate-200 bg-white py-4 sm:grid-cols-4 sm:divide-x sm:divide-slate-200">
        {isVendor ? (
          <>
            <StatCard label="Total orders" value={String(stats.totalOrders)} />
            <StatCard label="Active orders" value={String(stats.activeOrders)} />
            <StatCard label="Payout earned" value={money(stats.payoutEarned)} />
            <StatCard label="Unreleased payout" value={money(stats.unreleasedPayout)} />
          </>
        ) : (
          <>
            <StatCard label="Orders handled" value={String(stats.totalOrders)} />
            <StatCard label="Total events" value={String(stats.totalEvents)} />
            <StatCard label="Pickups" value={String(stats.pickups)} />
            <StatCard label="Deliveries" value={String(stats.deliveries)} />
          </>
        )}
      </section>
      {isVendor && (
        <section aria-labelledby="vendor-workload-heading" className="border-b border-slate-200 pb-5">
          <div className="mb-4">
            <h2 id="vendor-workload-heading" className="text-base font-semibold text-slate-900">
              Vendor order workload
            </h2>
            <p className="mt-1 text-sm text-slate-500">Orders assigned to this vendor in the selected period.</p>
          </div>
          <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:divide-x sm:divide-slate-200">
            <StatCard label="Processing" value={String(details.stats.processing)} />
            <StatCard label="Ready to dispatch" value={String(details.stats.readyToDispatch)} />
            <StatCard label="Dispatched" value={String(details.stats.dispatched)} />
            <StatCard label="Delivered" value={String(details.stats.delivered)} />
          </div>
        </section>
      )}
      {isVendor ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Vendor orders</h2>
              <p className="mt-1 text-sm text-slate-500">Orders assigned to this vendor and their settlement state.</p>
            </div>
            <span className="text-sm text-slate-500">{details.orderPagination.totalOrders} records</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] capitalize tracking-[0.12em] text-slate-500">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Settlement</th>
                </tr>
              </thead>
              <tbody>
                {details.orderPagination.totalOrders === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                      No orders assigned yet.
                    </td>
                  </tr>
                ) : details.orders.length > 0 ? (
                  details.orders.map((order) => (
                    <tr key={order.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-4">
                        <Link
                          to={`/admin/orders?orderId=${encodeURIComponent(order.id)}`}
                          state={{ returnTo: `${location.pathname}${location.search}` }}
                          className="font-semibold text-brand-primary hover:underline"
                        >
                          {order.publicOrderNumber}
                        </Link>
                        <p className="mt-1 text-xs capitalize text-slate-500">{label(order.status)}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">{date(order.createdAt)}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {order.confirmedItems ?? order.customerItems} confirmed / {order.customerItems} customer
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {order.invoiceAmount === null ? 'Not invoiced' : `${money(order.invoiceAmount)} · ${order.invoiceStatus}`}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.settlementStatus ?? 'unreleased'] ?? 'bg-amber-50 text-amber-700'}`}
                        >
                          {label(order.settlementStatus ?? 'unreleased')}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                      No orders on this page.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {details.orderPagination.totalOrders > details.orderPagination.pageSize && (
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Showing {firstOrderNumber}–{lastOrderNumber} of {details.orderPagination.totalOrders} orders
              </p>
              <nav aria-label="Vendor order pagination" className="flex items-center gap-2">
                <Link
                  to={pageHref(Math.max(1, currentPage - 1))}
                  aria-disabled={currentPage <= 1}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    currentPage <= 1
                      ? 'pointer-events-none border-slate-200 text-slate-400'
                      : 'border-slate-300 text-slate-700 hover:border-brand-primary hover:text-brand-primary'
                  }`}
                >
                  Previous
                </Link>
                <span className="px-2 text-sm text-slate-600">
                  Page {currentPage} of {totalOrderPages}
                </span>
                <Link
                  to={pageHref(Math.min(totalOrderPages, currentPage + 1))}
                  aria-disabled={currentPage >= totalOrderPages}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    currentPage >= totalOrderPages
                      ? 'pointer-events-none border-slate-200 text-slate-400'
                      : 'border-slate-300 text-slate-700 hover:border-brand-primary hover:text-brand-primary'
                  }`}
                >
                  Next
                </Link>
              </nav>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Logistics activity</h2>
              <p className="mt-1 text-sm text-slate-500">Pickup and delivery events recorded for this agent.</p>
            </div>
            <span className="text-sm text-slate-500">{details.events.length} events</span>
          </div>
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {details.events.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">No logistics events recorded yet.</p>
            ) : (
              details.events.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-semibold text-slate-900">{event.publicOrderNumber}</p>
                    <p className="mt-1 text-xs capitalize text-slate-500">{label(event.eventType)}</p>
                  </div>
                  <p className="text-xs text-slate-500">{date(event.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  )
}
