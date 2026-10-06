import { useEffect, useMemo, useRef, useState } from 'react'
import { data, useFetcher, useOutletContext, useRevalidator } from 'react-router'
import { Search } from 'lucide-react'
import { requireRole } from '../../../lib/auth.server'
import { sql } from '../../../lib/db.server'
import { isReadyForDispatch } from '../../../lib/orderLifecycle'
import { sendCustomerNotification } from '../../../lib/notifications.server'
import { toast } from '../../../lib/toast'
import VendorOrderReviewDialog, { getInitialReceivedCounts, type VendorReviewOrder } from '../VendorOrderReviewDialog'
import type { action as vendorHomeAction } from './Home'

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: { request: Request }) {
  const auth = await requireRole(request, 'vendor')
  if (!auth) return data({ ok: false, message: 'Please sign in again.' }, { status: 401 })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  const orderIds = [...new Set(formData.getAll('orderId').map(String).filter(Boolean))]

  if ((intent !== 'claim' && intent !== 'dispatch') || orderIds.length === 0) {
    return data({ ok: false, message: 'Invalid order action.' }, { status: 400, headers: auth.headers })
  }

  const { data: vendor, error: vendorError } = await auth.supabase
    .from('vendors')
    .select('id')
    .eq('profile_id', auth.profile.id)
    .eq('status', 'approved')
    .maybeSingle()
  if (vendorError) return data({ ok: false, message: vendorError.message }, { status: 400, headers: auth.headers })
  if (!vendor)
    return data({ ok: false, message: 'Approved vendor access is required to claim orders.' }, { status: 403, headers: auth.headers })

  try {
    if (intent === 'claim') {
      const [claimedOrder] = await sql`
        update orders
        set status = 'at_vendor', vendor_id = ${vendor.id}
        where id = ${orderIds[0]}
          and status = 'picked_up'
          and vendor_id is null
        returning id
      `
      if (!claimedOrder)
        return data({ ok: false, message: 'This order is no longer available to claim.' }, { status: 409, headers: auth.headers })
    } else {
      const dispatchedOrders = await sql`
        update orders
        set status = 'out_for_delivery'
        where id in ${sql(orderIds)}
          and vendor_id = ${vendor.id}
          and (
            (status = 'paid' and exists (
              select 1 from invoices where invoices.order_id = orders.id and invoices.status = 'paid'
            ))
            or
            (status = 'invoiced' and exists (
              select 1 from invoices where invoices.order_id = orders.id and invoices.status = 'unpaid'
            ))
          )
        returning id, customer_id, public_order_number
      `
      if (dispatchedOrders.length === 0)
        return data({ ok: false, message: 'No selected orders are ready for dispatch.' }, { status: 409, headers: auth.headers })
      const invoiceStatuses = await sql`
        select order_id, status::text as status
        from invoices
        where order_id in ${sql(dispatchedOrders.map((order) => order.id))}
      `
      const invoiceStatusByOrderId = new Map(invoiceStatuses.map((invoice) => [invoice.order_id, invoice.status]))
      await Promise.all(
        dispatchedOrders.map((order) =>
          sendCustomerNotification({
            eventKey: `order:${order.id}:ready-for-delivery`,
            customerId: order.customer_id,
            notificationType: 'order_ready_for_delivery',
            orderId: order.id,
            payload: {
              title:
                invoiceStatusByOrderId.get(order.id) === 'paid'
                  ? 'Your order is ready for delivery'
                  : 'Your order has been dispatched',
              body:
                invoiceStatusByOrderId.get(order.id) === 'paid'
                  ? `Your clean laundry is on the way for ${order.public_order_number}.`
                  : `Your order ${order.public_order_number} has been dispatched. Payment is required before handoff.`,
              details:
                invoiceStatusByOrderId.get(order.id) === 'paid'
                  ? [`Order: ${order.public_order_number}`, 'Payment has been confirmed.', 'Your laundry is on its way to you.']
                  : [`Order: ${order.public_order_number}`, 'Your laundry has been dispatched.', 'Please pay the invoice before handoff.'],
              url: `/orders?order=${encodeURIComponent(order.public_order_number)}`,
              tag: `order:${order.id}:delivery`,
            },
          }),
        ),
      )
    }
  } catch (error) {
    return data(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : intent === 'dispatch' ? 'Orders could not be moved to delivery.' : 'Order claim failed.',
      },
      { status: 400, headers: auth.headers },
    )
  }
  return data({ ok: true, intent }, { headers: auth.headers })
}

type VendorOrder = {
  id: string
  public_order_number: string
  publicOrderNumber: string
  customer_id: string
  order_type: 'wash' | 'wash_iron' | 'mixed'
  status: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  invoice: { status: 'unpaid' | 'paid' } | null
  clothes_count_vendor: number | null
  created_at: string
  picked_up_date: string | null
  notes: string | null
  customer: { name: string | null; qaffy_id: string | null; email: string | null; phone: string | null } | null
  location: { name: string } | null
  items: Array<{
    id: string
    category_id: string
    quantity: number
    confirmed_quantity: number | null
    service: 'wash' | 'iron' | 'wash_iron'
    unit_price: number
    category: { name: string } | null
  }>
  mismatches: Array<{
    id: string
    direction: 'over' | 'under'
    detail: string | null
    details: VendorReviewOrder['mismatches'][number]['lines']
    created_at: string
  }>
}

type VendorLayoutData = {
  orders: VendorOrder[]
  rateCard: Array<{ name: string; wash: number | null; iron: number | null; wash_iron: number | null }>
}

const statusLabels: Record<VendorOrder['status'], string> = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Pending claim',
  at_vendor: 'Processing',
  invoiced: 'Processing',
  paid: 'Processing',
  out_for_delivery: 'Processing',
  delivered: 'Completed',
  cancelled: 'Cancelled',
}

const statusStyle: Record<string, string> = {
  'Pending claim': 'bg-amber-50 text-amber-700',
  Processing: 'bg-brand-soft text-brand-primary',
  'Ready to dispatch': 'bg-sky-50 text-sky-700',
  Dispatched: 'bg-teal-50 text-teal-700',
  Completed: 'bg-emerald-50 text-emerald-700',
  Cancelled: 'bg-red-50 text-red-700',
}

const orderTypeLabels: Record<VendorOrder['order_type'], string> = {
  wash: 'Wash only',
  wash_iron: 'Wash + Iron',
  mixed: 'Mixed service',
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not collected'
}

export default function Orders() {
  const { orders, rateCard } = useOutletContext<VendorLayoutData>()
  const fetcher = useFetcher<typeof action>()
  const reviewFetcher = useFetcher<typeof vendorHomeAction>()
  const { revalidate } = useRevalidator()
  const handledFetcherData = useRef<typeof fetcher.data>(null)
  const handledReviewData = useRef<typeof reviewFetcher.data>(null)
  const isClaimingOrder = (orderId: string) =>
    fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'claim' && fetcher.formData?.get('orderId') === orderId
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'unclaimed' | 'processing' | 'ready' | 'dispatched' | 'delivered'>('processing')
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null)
  const [received, setReceived] = useState<Record<string, Record<string, number | undefined>>>({})
  const [reviewAddedItems, setReviewAddedItems] = useState<Array<{ categoryName: string; service: 'wash' | 'iron' | 'wash_iron'; quantity: number }>>([])
  const [reviewNotes, setReviewNotes] = useState('')

  useEffect(() => {
    if (!fetcher.data || handledFetcherData.current === fetcher.data) return
    handledFetcherData.current = fetcher.data
    if (fetcher.data.ok) {
      setSelectedOrderIds([])
      if ('intent' in fetcher.data && fetcher.data.intent === 'claim') setActiveTab('processing')
      revalidate()
    }
  }, [fetcher.data, revalidate])

  useEffect(() => {
    if (!reviewFetcher.data || handledReviewData.current === reviewFetcher.data) return
    handledReviewData.current = reviewFetcher.data
    if (reviewFetcher.data.ok && 'amount' in reviewFetcher.data) {
      setReviewOrderId(null)
      setReviewAddedItems([])
      setReviewNotes('')
      toast.success('Order review submitted.')
      if ('invoiceStatus' in reviewFetcher.data && reviewFetcher.data.invoiceStatus === 'paid') setActiveTab('ready')
      revalidate()
    } else if ('message' in reviewFetcher.data) {
      toast.error(String(reviewFetcher.data.message))
    }
  }, [reviewFetcher.data, revalidate])

  const rows = useMemo(
    () =>
      orders.map((order) => ({
        ...order,
        publicOrderNumber: order.public_order_number,
        label: statusLabels[order.status],
        customer: order.customer?.name ?? 'Customer',
        customerId: order.customer?.qaffy_id ?? 'QF unavailable',
        location: order.location?.name ?? 'Location pending',
      })),
    [orders],
  )

  const orderCounts = {
    available: rows.filter((order) => order.status === 'picked_up').length,
    processing: rows.filter((order) => ['at_vendor', 'invoiced', 'paid', 'out_for_delivery'].includes(order.status)).length,
    ready: rows.filter((order) => isReadyForDispatch(order.status, order.invoice?.status)).length,
    dispatched: rows.filter((order) => order.status === 'out_for_delivery').length,
    delivered: rows.filter((order) => order.status === 'delivered').length,
  }

  const reviewOrder = useMemo<VendorReviewOrder | null>(() => {
    const order = orders.find((candidate) => candidate.id === reviewOrderId)
    if (!order) return null
    return {
      id: order.id,
      publicOrderNumber: order.publicOrderNumber,
      customer: order.customer?.name ?? 'Customer',
      orderType: order.order_type,
      orderStatus: order.status,
      confirmedCount: order.clothes_count_vendor,
      notes: order.notes ?? '',
      items: order.items.map((item) => ({
        id: item.id,
        name: item.category?.name ?? 'Laundry item',
        quantity: Number(item.quantity),
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
    }
  }, [orders, reviewOrderId])

  const filteredOrders = rows.filter((order) => {
    const searchText =
      `${order.publicOrderNumber} ${order.customer} ${order.customerId} ${order.location} ${orderTypeLabels[order.order_type]}`.toLowerCase()
    const inTab =
      activeTab === 'unclaimed'
        ? order.status === 'picked_up'
        : activeTab === 'processing'
          ? ['at_vendor', 'invoiced', 'paid', 'out_for_delivery'].includes(order.status)
          : activeTab === 'ready'
            ? isReadyForDispatch(order.status, order.invoice?.status)
            : activeTab === 'dispatched'
              ? order.status === 'out_for_delivery'
              : order.status === 'delivered'
    return searchText.includes(query.toLowerCase()) && inTab
  })
  const selectableOrders = filteredOrders.filter((order) => isReadyForDispatch(order.status, order.invoice?.status))
  const allSelectableOrdersSelected = selectableOrders.length > 0 && selectableOrders.every((order) => selectedOrderIds.includes(order.id))

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((current) => (current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]))
  }

  const toggleAllSelectableOrders = () => {
    setSelectedOrderIds((current) =>
      allSelectableOrdersSelected
        ? current.filter((id) => !selectableOrders.some((order) => order.id === id))
        : [...new Set([...current, ...selectableOrders.map((order) => order.id)])],
    )
  }

  const dispatchOrders = (orderIds: string[]) => {
    if (orderIds.length === 0 || fetcher.state !== 'idle') return
    const formData = new FormData()
    formData.set('intent', 'dispatch')
    orderIds.forEach((orderId) => formData.append('orderId', orderId))
    fetcher.submit(formData, { method: 'post' })
  }

  const dispatchSelectedOrders = () => dispatchOrders(selectedOrderIds)

  const openOrderDetails = (orderId: string) => {
    const order = orders.find((candidate) => candidate.id === orderId)
    if (!order) return
    setReviewOrderId(orderId)
    setReceived({
      [orderId]: getInitialReceivedCounts(
        order.items.map((item) => ({
          id: item.id,
          name: item.category?.name ?? 'Laundry item',
          service: item.service,
          quantity: item.quantity,
          confirmedQuantity: item.confirmed_quantity,
        })),
        order.mismatches.map((mismatch) => ({
          id: mismatch.id,
          direction: mismatch.direction,
          detail: mismatch.detail ?? 'Mismatch recorded',
          createdAt: mismatch.created_at,
          lines: mismatch.details ?? [],
        })),
        order.clothes_count_vendor,
      ),
    })
    setReviewAddedItems([])
    setReviewNotes('')
  }

  const openCountReview = (orderId: string) => {
    const order = orders.find((candidate) => candidate.id === orderId)
    if (order?.status === 'at_vendor') openOrderDetails(orderId)
  }

  const saveCountReview = () => {
    if (!reviewOrder || reviewFetcher.state !== 'idle') return
    const formData = new FormData()
    formData.set('intent', 'review')
    formData.set('orderId', reviewOrder.id)
    formData.set(
      'receivedItems',
      JSON.stringify(
        Object.entries(received[reviewOrder.id] ?? {}).map(([itemId, quantity]) => ({ itemId, quantity })),
      ),
    )
    formData.set('addedItems', JSON.stringify(reviewAddedItems))
    formData.set('mismatchDetail', reviewNotes)
    reviewFetcher.submit(formData, { method: 'post', action: '/vendor' })
  }

  const reviewReceived = reviewOrder ? (received[reviewOrder.id] ?? {}) : {}
  const reviewHasMismatch =
    (reviewOrder?.items.some((item) => {
      const receivedCount = reviewReceived[item.id]
      return receivedCount !== undefined && receivedCount !== item.quantity
    }) ?? false) || reviewAddedItems.length > 0

  const changeTab = (tab: typeof activeTab) => {
    setActiveTab(tab)
    setSelectedOrderIds([])
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 lg:hidden">Orders</h2>
        <p className="mt-2 text-sm text-slate-500">Review live customer orders and continue processing work.</p>
      </header>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ['Available', orderCounts.available],
          ['Processing', orderCounts.processing],
          ['Completed', orderCounts.delivered],
        ].map(([label, value]) => (
          <div key={label} className="min-h-24 min-w-0 rounded-[10px] border border-[#e9e9e9] bg-white p-2.5 sm:min-h-0 sm:p-4">
            <p className="break-words text-[10px] leading-4 text-slate-500 sm:text-xs">{label}</p>
            <p className="mt-1.5 text-xl font-bold text-slate-900 sm:mt-3 sm:text-2xl">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[10px] border border-[#e9e9e9] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#ededed] p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div className="relative w-full md:max-w-sm">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders or customers"
              className="h-10 w-full rounded-[8px] border border-[#dedede] pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
            />
          </div>
          <div className="scrollbar-hidden flex flex-nowrap gap-2 overflow-x-auto pb-1">
            {[
              ['unclaimed', 'Unclaimed', orderCounts.available],
              ['processing', 'Processing', orderCounts.processing],
              ['ready', 'Ready to dispatch', orderCounts.ready],
              ['dispatched', 'Dispatched', orderCounts.dispatched],
              ['delivered', 'Delivered', orderCounts.delivered],
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeTab(value as typeof activeTab)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === value ? 'bg-brand-primary text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-primary hover:text-brand-primary'}`}
              >
                {label}
                <span className={activeTab === value ? 'text-white/80' : 'text-slate-400'}>{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 md:hidden">
          {fetcher.data && !fetcher.data.ok && 'message' in fetcher.data && (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              {String(fetcher.data.message)}
            </p>
          )}
          {fetcher.data?.ok && (
            <p
              role="status"
              className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700"
            >
              {'intent' in fetcher.data && fetcher.data.intent === 'claim' ? 'Order claimed successfully.' : 'Dispatch complete.'}
            </p>
          )}
          {selectableOrders.length > 0 && (
            <div className="mb-4 space-y-3 rounded-xl border border-brand-border bg-brand-soft p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-brand-strong">
                <input
                  type="checkbox"
                  checked={allSelectableOrdersSelected}
                  onChange={toggleAllSelectableOrders}
                  aria-label="Select all orders ready for dispatch"
                  className="h-4 w-4 accent-brand-primary"
                />
                Select all ready for dispatch ({selectableOrders.length})
              </label>
              <button
                type="button"
                onClick={dispatchSelectedOrders}
                disabled={selectedOrderIds.length === 0 || fetcher.state !== 'idle'}
                className="w-full rounded-lg bg-brand-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {fetcher.state !== 'idle'
                  ? 'Dispatching...'
                  : selectedOrderIds.length > 0
                    ? `Dispatch ${selectedOrderIds.length} selected`
                    : 'Dispatch selected orders'}
              </button>
            </div>
          )}
          <div className="space-y-3">
            {filteredOrders.map((order) => (
              <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{order.publicOrderNumber}</p>
                    <p className="mt-1 truncate text-sm text-slate-600">{order.customer}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyle[order.label]}`}>
                    {order.label}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <dt className="text-slate-400">Service</dt>
                    <dd className="mt-0.5 truncate font-medium text-slate-700">{orderTypeLabels[order.order_type]}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-400">Pickup location</dt>
                    <dd className="mt-0.5 truncate font-medium text-slate-700">{order.location}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-400">Picked up</dt>
                    <dd className="mt-0.5 truncate font-medium text-slate-700">{formatDate(order.picked_up_date)}</dd>
                  </div>
                </dl>
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                  {isReadyForDispatch(order.status, order.invoice?.status) && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.includes(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                        aria-label={`Select ${order.publicOrderNumber}`}
                        className="h-4 w-4 accent-brand-primary"
                      />
                      Select for dispatch
                    </label>
                  )}
                  {order.status === 'at_vendor' ? (
                    <button
                      type="button"
                      onClick={() => openCountReview(order.id)}
                      className="w-full rounded-[7px] bg-brand-primary px-3 py-2.5 text-xs font-semibold text-white hover:bg-brand-primary-hover"
                    >
                      Review final count
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      {order.status === 'picked_up' ? (
                      <button
                        type="button"
                        onClick={() => fetcher.submit({ intent: 'claim', orderId: order.id }, { method: 'post' })}
                        disabled={fetcher.state !== 'idle'}
                        className="flex-1 rounded-[7px] border border-[#dedede] px-3 py-2.5 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary disabled:cursor-wait disabled:opacity-60"
                      >
                        {isClaimingOrder(order.id) ? 'Claiming...' : 'Claim'}
                      </button>
                      ) : isReadyForDispatch(order.status, order.invoice?.status) ? (
                        <button
                          type="button"
                          onClick={() => dispatchOrders([order.id])}
                          disabled={fetcher.state !== 'idle'}
                          className="flex-1 rounded-[7px] bg-brand-primary px-3 py-2.5 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-wait disabled:opacity-60"
                        >
                          {fetcher.state !== 'idle' ? 'Dispatching...' : 'Dispatch'}
                        </button>
                      ) : null}
                      {order.status !== 'picked_up' && (
                        <button
                          type="button"
                          onClick={() => openOrderDetails(order.id)}
                          className="flex-1 rounded-[7px] border border-[#dedede] px-3 py-2.5 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary"
                        >
                          View details
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
            {filteredOrders.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No matching orders.</p>}
          </div>
        </div>
        <div className="hidden overflow-x-auto p-4 md:block md:p-5">
          {fetcher.data && !fetcher.data.ok && 'message' in fetcher.data && (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              {String(fetcher.data.message)}
            </p>
          )}
          {fetcher.data?.ok && (
            <p
              role="status"
              className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700"
            >
              {'intent' in fetcher.data && fetcher.data.intent === 'claim' ? 'Order claimed successfully.' : 'Dispatch complete.'}
            </p>
          )}
          {selectableOrders.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-border bg-brand-soft px-3 py-2.5">
              <label className="flex items-center gap-2 text-sm font-semibold text-brand-strong">
                <input
                  type="checkbox"
                  checked={allSelectableOrdersSelected}
                  onChange={toggleAllSelectableOrders}
                  className="h-4 w-4 accent-brand-primary"
                />
                Select orders ready for dispatch ({selectableOrders.length})
              </label>
              <button
                type="button"
                onClick={dispatchSelectedOrders}
                disabled={selectedOrderIds.length === 0 || fetcher.state !== 'idle'}
                className="rounded-[7px] bg-brand-primary px-3 py-2 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {fetcher.state !== 'idle'
                  ? 'Dispatching...'
                  : selectedOrderIds.length > 0
                    ? `Dispatch ${selectedOrderIds.length} selected`
                    : 'Dispatch selected orders'}
              </button>
            </div>
          )}
          <table className="w-full min-w-[1240px] table-fixed text-left">
            <thead>
              <tr className="border-b border-[#ededed] bg-[#f8f8f8] text-[10px] capitalize tracking-[0.12em] text-slate-500">
                <th className="w-12 px-4 py-3 font-semibold">
                  <span className="sr-only">Select</span>
                </th>
                <th className="w-36 px-4 py-3 font-semibold">Order</th>
                <th className="w-56 px-4 py-3 font-semibold">Customer</th>
                <th className="w-36 px-4 py-3 font-semibold">Service</th>
                <th className="w-40 px-4 py-3 font-semibold">Pickup location</th>
                <th className="w-40 px-4 py-3 font-semibold">Picked up</th>
                <th className="w-40 px-4 py-3 font-semibold">Status</th>
                <th className="w-32 px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="px-4 py-4">
                    {isReadyForDispatch(order.status, order.invoice?.status) && (
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.includes(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                        aria-label={`Select ${order.publicOrderNumber}`}
                        className="h-4 w-4 accent-brand-primary"
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-900" title={order.publicOrderNumber}>
                    {order.publicOrderNumber}
                  </td>
                  <td className="max-w-56 truncate whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-900" title={order.customer}>
                    {order.customer}
                  </td>
                  <td
                    className="max-w-36 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600"
                    title={orderTypeLabels[order.order_type]}
                  >
                    {orderTypeLabels[order.order_type]}
                  </td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600" title={order.location}>
                    {order.location}
                  </td>
                  <td
                    className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-500"
                    title={formatDate(order.picked_up_date)}
                  >
                    {formatDate(order.picked_up_date)}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[order.label]}`}
                    >
                      {order.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    {order.status === 'at_vendor' ? (
                      <button
                        type="button"
                        onClick={() => openCountReview(order.id)}
                        className="rounded-[7px] bg-brand-primary px-3 py-2 text-xs font-semibold text-white hover:bg-brand-primary-hover"
                      >
                        Review count
                      </button>
                    ) : order.status === 'picked_up' ? (
                      <button
                        type="button"
                        onClick={() => fetcher.submit({ intent: 'claim', orderId: order.id }, { method: 'post' })}
                        disabled={fetcher.state !== 'idle'}
                        className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary disabled:cursor-wait disabled:opacity-60"
                      >
                        {isClaimingOrder(order.id) ? 'Claiming...' : 'Claim'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openOrderDetails(order.id)}
                        className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary"
                      >
                        View details
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredOrders.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No matching orders.</p>}
        </div>
      </section>
      {reviewOrder && (
        <VendorOrderReviewDialog
          order={reviewOrder}
          received={reviewReceived}
          hasMismatch={reviewHasMismatch}
          notes={reviewNotes}
          addedItems={reviewAddedItems}
          categoryNames={rateCard.map((rate) => rate.name)}
          isPreClaim={false}
          canEdit={reviewOrder.orderStatus === 'at_vendor'}
          onReceivedChange={(itemId, value) =>
            setReceived((current) => ({ ...current, [reviewOrder.id]: { ...current[reviewOrder.id], [itemId]: value } }))
          }
          onNotesChange={setReviewNotes}
          onAddedItemsChange={setReviewAddedItems}
          onClose={() => setReviewOrderId(null)}
          onSave={saveCountReview}
          onClaim={() => {}}
          saving={reviewFetcher.state !== 'idle'}
        />
      )}
    </div>
  )
}
