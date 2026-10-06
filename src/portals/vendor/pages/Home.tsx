import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronRight, Clock3, PackageCheck, Search } from 'lucide-react'
import { data, Link, useFetcher, useLocation, useNavigate, useOutletContext, useRevalidator } from 'react-router'
import type { Route } from './+types/Home'
import { sql } from '../../../lib/db.server'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { requireRole } from '../../../lib/auth.server'
import { finalizeVendorOrder } from '../../../lib/wallet.server'
import { toast } from '../../../lib/toast'
import { sendCustomerNotification, walletInvoicePaidNotification } from '../../../lib/notifications.server'
import VendorOrderReviewDialog, {
  getInitialReceivedCounts,
  type VendorReviewAddedItem,
  type VendorReviewOrder,
} from '../VendorOrderReviewDialog'

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })

  const { supabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'review')
  const orderId = String(formData.get('orderId') ?? '')

  const vendorAuth = await requireRole(request, 'vendor')
  if (!vendorAuth) return data({ ok: false, message: 'Vendor access is unavailable.' }, { status: 503, headers })

  if (intent === 'claim') {
    if (!orderId) return data({ ok: false, message: 'Order ID is required.' }, { status: 400, headers })
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id')
      .eq('profile_id', vendorAuth.profile.id)
      .eq('status', 'approved')
      .maybeSingle()
    if (vendorError) return data({ ok: false, message: vendorError.message }, { status: 400, headers })
    if (!vendor) return data({ ok: false, message: 'Approved vendor access is required to claim orders.' }, { status: 403, headers })
    let claimedOrder
    try {
      ;[claimedOrder] = await sql`
        update orders
        set status = 'at_vendor', vendor_id = ${vendor.id}
        where id = ${orderId}
          and status = 'picked_up'
          and vendor_id is null
        returning id
      `
    } catch (error) {
      return data({ ok: false, message: error instanceof Error ? error.message : 'Order claim failed.' }, { status: 400, headers })
    }
    if (!claimedOrder) return data({ ok: false, message: 'This order is no longer available to claim.' }, { status: 409, headers })
    return data({ ok: true, intent: 'claim' as const }, { headers })
  }

  if (intent !== 'review') return data({ ok: false, message: 'Invalid vendor action.' }, { status: 400, headers })

  const mismatchDetail = String(formData.get('mismatchDetail') ?? '').trim()
  let addedItems: Array<{ categoryName: string; service: 'wash' | 'iron' | 'wash_iron'; quantity: number }>
  let receivedItems: Array<{ itemId: string; quantity: number }>
  try {
    receivedItems = JSON.parse(String(formData.get('receivedItems') ?? '[]'))
    addedItems = JSON.parse(String(formData.get('addedItems') ?? '[]'))
  } catch {
    return data({ ok: false, message: 'Received item details are invalid.' }, { status: 400, headers })
  }

  if (!orderId) return data({ ok: false, message: 'Order ID is required.' }, { status: 400, headers })

  try {
    const result = await finalizeVendorOrder(orderId, vendorAuth.profile.id, receivedItems, addedItems, mismatchDetail)
    if (result.mismatchDirection) {
      await sendCustomerNotification({
        eventKey: `mismatch:${orderId}:confirmed`,
        customerId: result.customerId,
        notificationType: 'mismatch_confirmed',
        orderId,
        payload: {
          title: 'Order count updated',
          body: `A different item count was confirmed for ${result.publicOrderNumber}. Review the updated invoice.`,
          details: [
            `Order: ${result.publicOrderNumber}`,
            `Count change: ${result.mismatchDirection === 'over' ? 'More items were confirmed' : 'Fewer items were confirmed'}`,
            'Review the updated invoice for the final amount.',
          ],
          url: `/orders?order=${encodeURIComponent(result.publicOrderNumber)}`,
          tag: `order:${orderId}:mismatch`,
        },
      })
    }
    if (result.invoiceStatus === 'unpaid') {
      await sendCustomerNotification({
        eventKey: `invoice:${result.invoiceId}:payment-required`,
        customerId: result.customerId,
        notificationType: 'payment_required',
        orderId,
        payload: {
          title: 'Payment required',
          body: `Payment is needed before ${result.publicOrderNumber} can be delivered.`,
          details: [`Order: ${result.publicOrderNumber}`, 'The invoice is still unpaid.', 'Top up your wallet to make delivery available.'],
          url: `/invoice?order=${encodeURIComponent(result.publicOrderNumber)}`,
          tag: `order:${orderId}:payment`,
        },
      })
    }
    if (result.invoiceStatus === 'paid') {
      await sendCustomerNotification({
        eventKey: `invoice:${result.invoiceId}:paid`,
        customerId: result.customerId,
        notificationType: 'payment_confirmed',
        orderId,
        payload: walletInvoicePaidNotification(result.amount, result.publicOrderNumber, orderId),
      })
    }
    return data({ ok: true, amount: result.amount, invoiceStatus: result.invoiceStatus }, { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order review could not be submitted.'
    return data({ ok: false, message }, { status: 400, headers })
  }
}

type VendorOrder = {
  id: string
  publicOrderNumber: string
  customer: string
  customerId: string
  customerEmail: string
  customerPhone: string
  collectedAt: string
  createdAt: string
  orderType: 'wash' | 'wash_iron' | 'mixed'
  location: string
  status: 'Pending' | 'Processing' | 'Ready to dispatch' | 'Out for delivery' | 'Completed' | 'Cancelled'
  orderStatus: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  clothesCountVendor: number | null
  pickupOtp: string
  deliveryOtp: string
  pickupLocationId: string
  notes: string
  billedExtraAmount: number | null
  picked: boolean
  pickedUpDate: string | null
  amountDue: number
  invoice: { id: string; amount: number; status: 'unpaid' | 'paid'; createdAt: string; paidAt: string | null } | null
  payment: { provider: string; reference: string; amount: number; status: 'pending' | 'success' | 'failed'; createdAt: string } | null
  settlement: { id: string; periodStart: string; periodEnd: string; amountDue: number; status: 'pending' | 'paid' } | null
  items: Array<{
    id: string
    categoryId: string
    name: string
    quantity: number
    confirmedQuantity: number | null
    service: 'wash' | 'iron' | 'wash_iron'
    unitPrice: number
  }>
  mismatches: Array<{
    id: string
    direction: 'over' | 'under'
    detail: string
    createdAt: string
    lines: VendorReviewOrder['mismatches'][number]['lines']
  }>
  logisticsEvents: Array<{ eventType: 'picked_up' | 'delivered'; createdAt: string; agent: string }>
}

type VendorLoaderOrder = {
  id: string
  public_order_number: string
  customer_id: string
  order_type: VendorOrder['orderType']
  clothes_count_vendor: number | null
  status: VendorOrder['orderStatus']
  pickup_otp: string | null
  delivery_otp: string | null
  pickup_location_id: string | null
  notes: string | null
  is_subscription_order: boolean
  billed_extra_amount: number | null
  picked: boolean
  picked_up_date: string | null
  created_at: string
  customer: { name: string | null; qaffy_id: string | null; email: string | null; phone: string | null } | null
  location: { name: string } | null
  items: Array<{
    id: string
    category_id: string
    quantity: number
    confirmed_quantity: number | null
    service: VendorOrder['items'][number]['service']
    unit_price: number
    category: { name: string } | null
  }>
  invoice: { id: string; amount: number; status: 'unpaid' | 'paid'; created_at: string; paid_at: string | null } | null
  mismatches: Array<{
    id: string
    direction: 'over' | 'under'
    detail: string | null
    details: VendorReviewOrder['mismatches'][number]['lines']
    created_at: string
  }>
  logisticsEvents: Array<{ event_type: 'picked_up' | 'delivered'; created_at: string }>
}

type VendorLoaderData = {
  orders: VendorLoaderOrder[]
  vendorName: string
  rateCard: Array<{ name: string; wash: number | null; iron: number | null; wash_iron: number | null }>
}

function mapLoaderOrder(order: VendorLoaderOrder): VendorOrder {
  const statusMap: Record<VendorLoaderOrder['status'], VendorOrder['status']> = {
    pending_pickup: 'Pending',
    picked_up: 'Pending',
    at_vendor: 'Processing',
    invoiced: 'Processing',
    paid: 'Processing',
    out_for_delivery: 'Processing',
    delivered: 'Completed',
    cancelled: 'Cancelled',
  }
  return {
    id: order.id,
    publicOrderNumber: order.public_order_number,
    customer: order.customer?.name ?? 'Customer',
    customerId: order.customer?.qaffy_id ?? order.customer_id,
    customerEmail: order.customer?.email ?? 'Not available',
    customerPhone: order.customer?.phone ?? 'Not available',
    collectedAt: order.picked_up_date ? new Date(order.picked_up_date).toLocaleString() : new Date(order.created_at).toLocaleString(),
    createdAt: new Date(order.created_at).toLocaleString(),
    orderType: order.order_type,
    location: order.location?.name ?? 'Pickup location pending',
    status: statusMap[order.status],
    orderStatus: order.status,
    clothesCountVendor: order.clothes_count_vendor,
    pickupOtp: order.pickup_otp ?? '',
    deliveryOtp: order.delivery_otp ?? '',
    pickupLocationId: order.pickup_location_id ?? '',
    notes: order.notes ?? '',
    billedExtraAmount: order.billed_extra_amount,
    picked: order.picked,
    pickedUpDate: order.picked_up_date,
    amountDue: order.invoice?.amount ?? 0,
    invoice: order.invoice
      ? {
          id: order.invoice.id,
          amount: order.invoice.amount,
          status: order.invoice.status,
          createdAt: order.invoice.created_at,
          paidAt: order.invoice.paid_at,
        }
      : null,
    payment: null,
    settlement: null,
    items: order.items.map((item) => ({
      id: item.id,
      categoryId: item.category_id,
      name: item.category?.name ?? 'Laundry item',
      quantity: item.quantity,
      confirmedQuantity: item.confirmed_quantity,
      service: item.service,
      unitPrice: Number(item.unit_price),
    })),
    mismatches: order.mismatches.map((mismatch) => ({
      id: mismatch.id,
      direction: mismatch.direction,
      detail: mismatch.detail ?? 'Mismatch recorded',
      createdAt: mismatch.created_at,
      lines: mismatch.details ?? [],
    })),
    logisticsEvents: order.logisticsEvents.map((event) => ({
      eventType: event.event_type,
      createdAt: event.created_at,
      agent: 'Logistics agent',
    })),
  }
}

const statusStyles: Record<VendorOrder['status'], string> = {
  Pending: 'bg-amber-50 text-amber-700',
  Processing: 'bg-brand-soft text-brand-primary',
  'Ready to dispatch': 'bg-sky-50 text-sky-700',
  'Out for delivery': 'bg-teal-50 text-teal-700',
  Completed: 'bg-emerald-50 text-emerald-700',
  Cancelled: 'bg-red-50 text-red-700',
}

const orderTypeLabels: Record<VendorOrder['orderType'], string> = { wash: 'Wash only', wash_iron: 'Wash + Iron', mixed: 'Mixed service' }
export default function Home() {
  const { orders: loadedOrders, vendorName, rateCard } = useOutletContext<VendorLoaderData>()
  const fetcher = useFetcher<typeof action>()
  const { revalidate } = useRevalidator()
  const location = useLocation()
  const navigate = useNavigate()
  const orders = loadedOrders.map(mapLoaderOrder)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [detailsDismissed, setDetailsDismissed] = useState(false)
  const [received, setReceived] = useState<Record<string, Record<string, number | undefined>>>({})
  const [addedItems, setAddedItems] = useState<VendorReviewAddedItem[]>([])
  const [notes, setNotes] = useState('')
  const [dateRange, setDateRange] = useState('Today')
  const handledFetcherData = useRef<typeof fetcher.data>(null)
  const isClaimingOrder = (orderId: string) =>
    fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'claim' && fetcher.formData?.get('orderId') === orderId
  const requestedOrderId = new URLSearchParams(location.search).get('orderId')
  const returnPath = new URLSearchParams(location.search).get('returnTo') === 'orders' ? '/vendor/orders' : '/vendor'
  const selectedOrder = detailsDismissed
    ? null
    : (orders.find((order) => order.id === (selectedOrderId ?? requestedOrderId) && order.orderStatus !== 'pending_pickup') ?? null)
  const selectedReceived = selectedOrder
    ? (received[selectedOrder.id] ??
      getInitialReceivedCounts(selectedOrder.items, selectedOrder.mismatches, selectedOrder.clothesCountVendor))
    : {}
  const reviewOrder: VendorReviewOrder | null = selectedOrder
    ? {
        id: selectedOrder.id,
        publicOrderNumber: selectedOrder.publicOrderNumber,
        customer: selectedOrder.customer,
        orderType: selectedOrder.orderType,
        orderStatus: selectedOrder.orderStatus,
        confirmedCount: selectedOrder.clothesCountVendor,
        notes: selectedOrder.notes,
        items: selectedOrder.items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          confirmedQuantity: item.confirmedQuantity,
          service: item.service,
          unitPrice: item.unitPrice,
        })),
        mismatches: selectedOrder.mismatches,
      }
    : null

  useEffect(() => {
    if (!fetcher.data || handledFetcherData.current === fetcher.data) return
    handledFetcherData.current = fetcher.data
    if (fetcher.data.ok) {
      toast.success('intent' in fetcher.data && fetcher.data.intent === 'claim' ? 'Order claimed.' : 'Order review submitted.')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedOrderId(null)
      setNotes('')
      revalidate()
    } else if ('message' in fetcher.data) {
      toast.error(String(fetcher.data.message))
    }
  }, [fetcher.data, revalidate])

  const visibleOrders = orders.filter((order) => {
    if (dateRange === 'All time') return true

    const referenceDate = order.pickedUpDate ?? loadedOrders.find((loadedOrder) => loadedOrder.id === order.id)?.created_at
    if (!referenceDate) return false

    const orderDate = new Date(referenceDate)
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    if (dateRange === 'Today') return orderDate >= startOfToday

    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfWeek.getDate() - 6)
    return orderDate >= startOfWeek
  })
  const attentionOrders = visibleOrders.filter((order) => order.orderStatus === 'picked_up')

  const metrics = [
    {
      label: 'Pending',
      value: visibleOrders.filter((order) => order.orderStatus === 'picked_up').length,
      helper: 'Available to claim',
      icon: Clock3,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Active orders',
      value: visibleOrders.filter((order) => ['at_vendor', 'invoiced', 'paid', 'out_for_delivery'].includes(order.orderStatus)).length,
      helper: 'In progress or awaiting delivery',
      icon: PackageCheck,
      tone: 'bg-brand-soft text-brand-primary',
    },
    {
      label: 'Completed',
      value: visibleOrders.filter((order) => order.orderStatus === 'delivered').length,
      helper: 'Completed orders',
      icon: Check,
      tone: 'bg-emerald-50 text-emerald-700',
    },
  ]

  const claimOrder = (orderId: string) => {
    fetcher.submit({ intent: 'claim', orderId }, { method: 'post' })
  }

  const openOrderDetails = (order: VendorOrder) => {
    setDetailsDismissed(false)
    setSelectedOrderId(order.id)
    setAddedItems([])
    setReceived({
      [order.id]: getInitialReceivedCounts(order.items, order.mismatches, order.clothesCountVendor),
    })
  }

  const mismatchItems =
    selectedOrder?.items.filter((item) => {
      const receivedCount = selectedReceived[item.id]
      return receivedCount !== undefined && receivedCount !== item.quantity
    }) ?? []
  const hasMismatch = mismatchItems.length > 0 || addedItems.length > 0

  const closeOrderDetails = () => {
    setDetailsDismissed(true)
    setSelectedOrderId(null)
    setNotes('')
    setAddedItems([])
    if (returnPath === '/vendor/orders') {
      navigate(returnPath, { replace: true })
      return
    }
    window.history.replaceState(null, '', returnPath)
  }

  const saveOrder = () => {
    if (!selectedOrder) return
    fetcher.submit(
      {
        intent: 'review',
        orderId: selectedOrder.id,
        receivedItems: JSON.stringify(Object.entries(selectedReceived).map(([itemId, quantity]) => ({ itemId, quantity }))),
        addedItems: JSON.stringify(addedItems),
        mismatchDetail: notes,
      },
      { method: 'post' },
    )
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Good morning, {vendorName}</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            Claim incoming orders, record what arrived, and flag any mismatch for review.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 items-center gap-2 rounded-[8px] border border-[#dedede] bg-white px-3 text-sm text-slate-700">
            <span className="font-medium">Date</span>
            <select
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value)}
              className="bg-transparent font-semibold outline-none"
            >
              <option>Today</option>
              <option>This week</option>
              <option>All time</option>
            </select>
          </label>
          <Link
            to="/vendor/orders"
            className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#dedede] bg-white px-3 text-sm font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary"
          >
            View all orders <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, helper, icon: Icon, tone }) => (
          <div key={label} className="rounded-[10px] border border-[#e9e9e9] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>
              <Icon size={17} className="text-slate-400" />
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{helper}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[10px] border border-[#e9e9e9] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#ededed] p-4 md:p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Orders needing attention</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search size={15} className="absolute left-3 top-3 text-slate-400" />
              <span className="flex h-9 w-44 items-center rounded-[8px] border border-[#e1e1e1] pl-9 text-xs text-slate-400">
                Search orders
              </span>
            </div>
            <Link
              to="/vendor/orders"
              className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#e1e1e1] text-slate-500 hover:border-brand-primary hover:text-brand-primary"
              aria-label="Open all orders"
            >
              <ChevronRight size={17} />
            </Link>
          </div>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {attentionOrders.map((order) => (
            <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{order.customer}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">{order.publicOrderNumber}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[order.status]}`}>
                  {order.status}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-slate-100 py-3 text-xs min-[520px]:grid-cols-3">
                <div>
                  <dt className="text-slate-400">Order type</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-700">{orderTypeLabels[order.orderType]}</dd>
                </div>
                <div className="col-span-2 min-[520px]:col-span-1">
                  <dt className="text-slate-400">Pickup location</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-700">{order.location}</dd>
                </div>
                <div className="col-span-2 min-[520px]:col-span-1">
                  <dt className="text-slate-400">Picked up</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-700">{order.collectedAt}</dd>
                </div>
              </dl>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => (order.orderStatus === 'picked_up' ? claimOrder(order.id) : openOrderDetails(order))}
                  disabled={fetcher.state !== 'idle'}
                  className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary disabled:cursor-wait disabled:opacity-60"
                >
                  {order.orderStatus === 'picked_up' ? (isClaimingOrder(order.id) ? 'Claiming...' : 'Claim') : 'View details'}
                </button>
              </div>
            </article>
          ))}
          {attentionOrders.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {dateRange === 'Today' ? 'No orders today.' : 'No orders in this date range.'}
            </p>
          )}
        </div>
        <div className="hidden overflow-x-auto p-4 md:block md:p-5">
          <table className="w-full min-w-[1240px] table-fixed text-left">
            <thead>
              <tr className="border-b border-[#ededed] text-[10px] capitalize tracking-[0.16em] text-slate-400">
                <th className="w-40 px-4 py-3 font-semibold">Picked up date</th>
                <th className="w-40 px-4 py-3 font-semibold">Created at</th>
                <th className="w-36 px-4 py-3 font-semibold">Order type</th>
                <th className="w-56 px-4 py-3 font-semibold">Customer</th>
                <th className="w-40 px-4 py-3 font-semibold">Customer ID</th>
                <th className="w-40 px-4 py-3 font-semibold">Pickup location</th>
                <th className="w-40 px-4 py-3 font-semibold">Status</th>
                <th className="w-32 px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {attentionOrders.map((order) => (
                <tr key={order.id} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-500" title={order.collectedAt}>
                    {order.collectedAt}
                  </td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-500" title={order.createdAt}>
                    {order.createdAt}
                  </td>
                  <td
                    className="max-w-36 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600"
                    title={orderTypeLabels[order.orderType]}
                  >
                    {orderTypeLabels[order.orderType]}
                  </td>
                  <td className="max-w-56 px-4 py-4">
                    <p className="truncate whitespace-nowrap font-semibold text-slate-900" title={order.customer}>
                      {order.customer}
                    </p>
                    <p className="mt-1 truncate whitespace-nowrap text-xs text-slate-400" title={order.publicOrderNumber}>
                      {order.publicOrderNumber}
                    </p>
                  </td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600" title={order.customerId}>
                    {order.customerId}
                  </td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600" title={order.location}>
                    {order.location}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => (order.orderStatus === 'picked_up' ? claimOrder(order.id) : openOrderDetails(order))}
                      disabled={fetcher.state !== 'idle'}
                      className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary disabled:cursor-wait disabled:opacity-60"
                    >
                      {order.orderStatus === 'picked_up' ? (isClaimingOrder(order.id) ? 'Claiming...' : 'Claim') : 'View details'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {attentionOrders.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {dateRange === 'Today' ? 'No orders today.' : 'No orders in this date range.'}
            </p>
          )}
        </div>
      </section>

      {selectedOrder && reviewOrder && (
        <VendorOrderReviewDialog
          order={reviewOrder}
          received={selectedReceived}
          hasMismatch={hasMismatch}
          notes={notes}
          addedItems={addedItems}
          categoryNames={rateCard.map((rate) => rate.name)}
          isPreClaim={selectedOrder.orderStatus === 'pending_pickup'}
          canEdit={selectedOrder.orderStatus === 'at_vendor'}
          onReceivedChange={(itemId, value) =>
            setReceived((current) => ({ ...current, [selectedOrder.id]: { ...selectedReceived, [itemId]: value } }))
          }
          onNotesChange={setNotes}
          onAddedItemsChange={setAddedItems}
          onClose={closeOrderDetails}
          onSave={saveOrder}
          onClaim={() => claimOrder(selectedOrder.id)}
          saving={fetcher.state !== 'idle'}
        />
      )}
    </div>
  )
}
