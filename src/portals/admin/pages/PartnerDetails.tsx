import { ArrowLeft, Banknote, CheckCircle2, CircleDollarSign, Package, Truck } from 'lucide-react'
import { data, Link, useLoaderData } from 'react-router'
import { useState } from 'react'
import type { Route } from './+types/PartnerDetails'
import { requireRole } from '../../../lib/auth.server'

type PartnerType = 'vendor' | 'logistics'
type PartnerOrder = {
  id: string
  publicOrderNumber: string
  status: string
  createdAt: string
  customerItems: number
  confirmedItems: number | null
  invoiceAmount: number | null
  invoiceStatus: string | null
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
    totalEvents: number
    pickups: number
    deliveries: number
  }
  orders: PartnerOrder[]
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

type StatsPeriod = 'all' | 'today' | 'this_month' | 'last_month' | 'this_year'

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

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  const type = params.type === 'vendor' || params.type === 'logistics' ? params.type : null
  const partnerId = params.id
  if (!auth || !type || !partnerId) return data<PartnerDetailsData | null>(null, { status: 404 })

  const { supabase, headers } = auth
  if (type === 'vendor') {
    const [{ data: vendor }, { data: orders }, { data: settlements }, { data: settlementItems }] = await Promise.all([
      supabase
        .from('vendors')
        .select(
          'id, profile_id, business_name, status, created_at, payout_bank_name, payout_account_name, payout_account_number, payout_account_status, payout_recipient_code',
        )
        .eq('id', partnerId)
        .maybeSingle(),
      supabase
        .from('orders')
        .select('id, public_order_number, status, created_at, clothes_count_customer, clothes_count_vendor')
        .eq('vendor_id', partnerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('vendor_settlements')
        .select('id, amount_due, status, created_at')
        .eq('vendor_id', partnerId)
        .order('created_at', { ascending: false }),
      supabase.from('vendor_settlement_items').select('settlement_id, order_item_id, confirmed_quantity, amount'),
    ])
    if (!vendor) return data<PartnerDetailsData | null>(null, { headers, status: 404 })

    const profile = (await supabase.from('profiles').select('id, name, email, phone, created_at').eq('id', vendor.profile_id).maybeSingle())
      .data
    const orderIds = (orders ?? []).map((order) => order.id)
    const [{ data: invoices }, { data: settlementOrders }] = await Promise.all([
      orderIds.length
        ? supabase.from('invoices').select('order_id, amount, status').in('order_id', orderIds)
        : Promise.resolve({ data: [] as Array<{ order_id: string; amount: number; status: string }> }),
      settlements?.length
        ? supabase
            .from('vendor_settlement_orders')
            .select('settlement_id, order_id')
            .in(
              'settlement_id',
              settlements.map((settlement) => settlement.id),
            )
        : Promise.resolve({ data: [] as Array<{ settlement_id: string; order_id: string }> }),
    ])
    const settlementItemIds = (settlementItems ?? []).map((item) => item.order_item_id)
    const { data: settlementOrderItems } = settlementItemIds.length
      ? await supabase.from('order_items').select('id, order_id').in('id', settlementItemIds)
      : { data: [] as Array<{ id: string; order_id: string }> }
    const orderIdByItemId = new Map((settlementOrderItems ?? []).map((item) => [item.id, item.order_id]))
    const payoutByOrder = new Map<string, number>()
    for (const item of settlementItems ?? []) {
      const orderId = orderIdByItemId.get(item.order_item_id)
      if (orderId) payoutByOrder.set(orderId, (payoutByOrder.get(orderId) ?? 0) + Number(item.amount ?? 0))
    }
    const invoiceByOrder = new Map((invoices ?? []).map((invoice) => [invoice.order_id, invoice]))
    const settlementByOrder = new Map(
      (settlementOrders ?? []).map((entry) => [entry.order_id, settlements?.find((settlement) => settlement.id === entry.settlement_id)]),
    )
    const payoutEarned = (settlementItems ?? [])
      .filter((item) => settlements?.some((settlement) => settlement.id === item.settlement_id))
      .reduce((sum, item) => sum + Number(item.amount ?? 0), 0)
    const paidOut = (settlements ?? [])
      .filter((settlement) => settlement.status === 'paid')
      .reduce((sum, settlement) => sum + Number(settlement.amount_due ?? 0), 0)
    const unreleasedPayout = (settlements ?? [])
      .filter((settlement) => settlement.status === 'pending')
      .reduce((sum, settlement) => sum + Number(settlement.amount_due ?? 0), 0)
    const partnerOrders: PartnerOrder[] = (orders ?? []).map((order) => ({
      id: order.id,
      publicOrderNumber: order.public_order_number ?? 'QO-UNKNOWN',
      status: order.status,
      createdAt: order.created_at,
      customerItems: Number(order.clothes_count_customer ?? 0),
      confirmedItems: order.clothes_count_vendor === null ? null : Number(order.clothes_count_vendor),
      invoiceAmount: invoiceByOrder.get(order.id) ? Number(invoiceByOrder.get(order.id)?.amount) : null,
      invoiceStatus: invoiceByOrder.get(order.id)?.status ?? null,
      settlementStatus: settlementByOrder.get(order.id)?.status ?? null,
      payoutAmount: payoutByOrder.get(order.id) ?? 0,
    }))
    const confirmedItems = partnerOrders.reduce((sum, order) => sum + (order.confirmedItems ?? 0), 0)
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
          totalOrders: partnerOrders.length,
          activeOrders: partnerOrders.filter((order) => !['delivered', 'cancelled'].includes(order.status)).length,
          completedOrders: partnerOrders.filter((order) => order.status === 'delivered').length,
          confirmedItems,
          payoutEarned,
          paidOut,
          unreleasedPayout,
          totalEvents: 0,
          pickups: 0,
          deliveries: 0,
        },
        orders: partnerOrders,
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
        totalEvents: partnerEvents.length,
        pickups,
        deliveries,
      },
      orders: [],
      events: partnerEvents,
    },
    { headers, status: 200 },
  )
}

function StatCard({ label: title, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Package; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
        <Icon size={17} />
      </div>
      <p className="mt-4 text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

export default function PartnerDetails() {
  const details = useLoaderData<typeof loader>()
  if (!details)
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Partner not found.</div>
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all')
  const { partner, type } = details
  const isVendor = type === 'vendor'
  const visibleOrders = details.orders.filter((order) => inStatsPeriod(order.createdAt, statsPeriod))
  const visibleEvents = details.events.filter((event) => inStatsPeriod(event.createdAt, statsPeriod))
  const stats = isVendor
    ? {
        totalOrders: visibleOrders.length,
        activeOrders: visibleOrders.filter((order) => !['delivered', 'cancelled'].includes(order.status)).length,
        completedOrders: visibleOrders.filter((order) => order.status === 'delivered').length,
        confirmedItems: visibleOrders.reduce((sum, order) => sum + (order.confirmedItems ?? 0), 0),
        payoutEarned: visibleOrders.reduce((sum, order) => sum + order.payoutAmount, 0),
        paidOut: visibleOrders.filter((order) => order.settlementStatus === 'paid').reduce((sum, order) => sum + order.payoutAmount, 0),
        unreleasedPayout: visibleOrders
          .filter((order) => order.settlementStatus !== 'paid')
          .reduce((sum, order) => sum + order.payoutAmount, 0),
        totalEvents: 0,
        pickups: 0,
        deliveries: 0,
      }
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
    <div className="flex flex-col space-y-6 pb-10 [&>section:nth-of-type(1)]:order-3 [&>section:nth-of-type(2)]:order-2 [&>section:nth-of-type(3)]:order-4">
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
          onChange={(event) => setStatsPeriod(event.target.value as StatsPeriod)}
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
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isVendor ? (
          <>
            <StatCard label="Total orders" value={String(stats.totalOrders)} icon={Package} tone="bg-blue-50 text-blue-700" />
            <StatCard label="Active orders" value={String(stats.activeOrders)} icon={Truck} tone="bg-amber-50 text-amber-700" />
            <StatCard
              label="Payout earned"
              value={money(stats.payoutEarned)}
              icon={CircleDollarSign}
              tone="bg-emerald-50 text-emerald-700"
            />
            <StatCard label="Unreleased payout" value={money(stats.unreleasedPayout)} icon={Banknote} tone="bg-orange-50 text-orange-700" />
          </>
        ) : (
          <>
            <StatCard label="Orders handled" value={String(stats.totalOrders)} icon={Package} tone="bg-blue-50 text-blue-700" />
            <StatCard label="Total events" value={String(stats.totalEvents)} icon={Truck} tone="bg-violet-50 text-violet-700" />
            <StatCard label="Pickups" value={String(stats.pickups)} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" />
            <StatCard label="Deliveries" value={String(stats.deliveries)} icon={CheckCircle2} tone="bg-amber-50 text-amber-700" />
          </>
        )}
      </section>
      {isVendor ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Vendor orders</h2>
              <p className="mt-1 text-sm text-slate-500">Orders assigned to this vendor and their settlement state.</p>
            </div>
            <span className="text-sm text-slate-500">{details.orders.length} records</span>
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
                {details.orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                      No orders assigned yet.
                    </td>
                  </tr>
                ) : (
                  details.orders.map((order) => (
                    <tr key={order.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">{order.publicOrderNumber}</p>
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
                )}
              </tbody>
            </table>
          </div>
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
