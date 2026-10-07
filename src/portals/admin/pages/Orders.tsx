import { data, Form, useFetcher, useLoaderData, useNavigate, useNavigation, useSearchParams } from 'react-router'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle, SlidersHorizontal, X } from 'lucide-react'
import type { Route } from './+types/Orders'
import { requireRole } from '../../../lib/auth.server'
import { getInitialReceivedCounts } from '../../../lib/order-counts'
import { sql } from '../../../lib/db.server'
import { toast } from '../../../lib/toast'
import { loadAdminOrders } from '../../../lib/admin-orders.server'

type AdminOrder = {
  id: string
  public_order_number: string
  created_at: string
  picked_up_date: string | null
  order_type: 'wash' | 'wash_iron' | 'mixed'
  status: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  clothes_count_customer: number
  item_count: number
  clothes_count_vendor: number | null
  notes: string | null
  is_subscription_order: boolean
  customer: { name: string | null; qaffy_id: string | null; email: string | null; phone: string | null } | null
  location: { name: string } | null
  items: Array<{
    id: string
    quantity: number
    confirmed_quantity: number | null
    service: 'wash' | 'iron' | 'wash_iron'
    unit_price: number
    category: { name: string } | null
  }>
  invoice: {
    amount: number
    status: 'unpaid' | 'paid'
    paid_at: string | null
    billing_breakdown: BillingBreakdown | null
  } | null
  mismatches: Array<{ id: string; details: unknown }>
}
type BillingBreakdown = { coveredUnits: number; subscriberAmount: number; regularAmount: number }

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data({ ok: false, message: 'Please sign in again.' }, { status: 401 })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  const orderId = String(formData.get('orderId') ?? '')
  if (intent !== 'cancel-order' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    return data({ ok: false, intent, orderId, message: 'Invalid order action.' }, { status: 400, headers: auth.headers })
  }

  try {
    const [cancelledOrder] = await sql`
      update orders
      set status = 'cancelled'
      where id = ${orderId}
        and status = 'pending_pickup'
        and picked = false
      returning id
    `
    if (!cancelledOrder) {
      return data(
        { ok: false, intent, orderId, message: 'Only orders still awaiting pickup can be cancelled.' },
        { status: 409, headers: auth.headers },
      )
    }
    return data({ ok: true, intent, orderId }, { headers: auth.headers })
  } catch (error) {
    console.error('[admin-orders] Cancellation failed', error)
    return data(
      { ok: false, intent, orderId, message: 'The order could not be cancelled. Please try again.' },
      { status: 500, headers: auth.headers },
    )
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  return loadAdminOrders(request)
}

const statusLabels: Record<AdminOrder['status'], string> = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Picked up',
  at_vendor: 'At vendor',
  invoiced: 'Awaiting review',
  paid: 'Paid',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
const statusStyles: Record<AdminOrder['status'], string> = {
  pending_pickup: 'bg-amber-50 text-amber-700',
  picked_up: 'bg-sky-50 text-sky-700',
  at_vendor: 'bg-brand-soft text-brand-primary',
  invoiced: 'bg-violet-50 text-violet-700',
  paid: 'bg-emerald-50 text-emerald-700',
  out_for_delivery: 'bg-cyan-50 text-cyan-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
}
const orderTypeLabels = { wash: 'Wash only', wash_iron: 'Wash + Iron', mixed: 'Mixed service' }
const serviceLabels = { wash: 'Wash', iron: 'Iron', wash_iron: 'Wash + Iron' }
const getCustomerItemCount = (order: AdminOrder) => order.items.reduce((total, item) => total + item.quantity, 0)
const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not recorded'
const money = (value: number) => `\u20A6${value.toLocaleString()}`
const inputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function OrderDetails({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const cancelFetcher = useFetcher<typeof action>()
  const handledCancelResponse = useRef<typeof cancelFetcher.data>(null)
  const receivedCounts = getInitialReceivedCounts(
    order.items.map((item) => ({
      id: item.id,
      name: item.category?.name ?? 'Laundry item',
      service: item.service,
      quantity: item.quantity,
      confirmedQuantity: item.confirmed_quantity,
    })),
    order.mismatches.map((mismatch) => ({ id: mismatch.id, lines: mismatch.details })),
    order.clothes_count_vendor,
  )
  const hasCompleteReceivedCounts = order.items.every((item) => receivedCounts[item.id] !== undefined)
  const oneTimeInvoiceLineTotal =
    !order.is_subscription_order && hasCompleteReceivedCounts
      ? order.items.reduce((total, item) => total + Number(receivedCounts[item.id]) * item.unit_price, 0)
      : null

  useEffect(() => {
    const result = cancelFetcher.data
    if (cancelFetcher.state !== 'idle' || !result || handledCancelResponse.current === result) return
    handledCancelResponse.current = result

    if (result.ok) {
      toast.success('Order cancelled.')
      onClose()
      return
    }

    toast.error('message' in result && typeof result.message === 'string' ? result.message : 'The order could not be cancelled.')
  }, [cancelFetcher.data, cancelFetcher.state, onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[calc(100vh-1rem)] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-bold text-slate-900">{order.customer?.name ?? 'Customer'}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {order.public_order_number} {'\u00B7'} {statusLabels[order.status]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close order details"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-400"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <section className="mt-6 grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-4">
          <Detail label="Customer ID" value={order.customer?.qaffy_id ?? 'Unavailable'} />
          <Detail label="Order type" value={orderTypeLabels[order.order_type]} />
          <Detail label="Created" value={formatDate(order.created_at)} />
          <Detail label="Location" value={order.location?.name ?? 'Location pending'} />
        </section>
        <section className="mt-5 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900">Items</h4>
            <div className="text-right text-xs text-slate-500 sm:text-sm">
              <p>Customer count: {order.items.length > 0 ? getCustomerItemCount(order) : 'Not recorded'}</p>
              <p>Vendor count: {order.clothes_count_vendor ?? 'Not confirmed'}</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            {order.items.length === 0 ? (
              <p className="text-sm text-slate-500">No item details recorded.</p>
            ) : (
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="px-2 py-2 font-semibold">Item / service</th>
                    <th className="px-2 py-2 text-right font-semibold">Customer</th>
                    <th className="px-2 py-2 text-right font-semibold">Vendor received</th>
                    <th className="px-2 py-2 text-right font-semibold">Unit price</th>
                    <th className="px-2 py-2 text-right font-semibold">Invoice line</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => {
                    const confirmedQuantity = receivedCounts[item.id]
                    const lineAmount =
                      order.is_subscription_order || confirmedQuantity === undefined
                        ? null
                        : confirmedQuantity * item.unit_price
                    return (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-2 py-3 font-semibold text-slate-800">
                          {item.category?.name ?? 'Laundry item'} {'\u00B7'} {serviceLabels[item.service]}
                        </td>
                        <td className="px-2 py-3 text-right text-slate-600">{item.quantity}</td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-800">
                          {confirmedQuantity ?? 'Not recorded'}
                        </td>
                        <td className="px-2 py-3 text-right text-slate-600">{money(item.unit_price)}</td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-800">
                          {lineAmount === null ? (order.is_subscription_order ? 'Plan breakdown' : 'Not available') : money(lineAmount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {!order.is_subscription_order && oneTimeInvoiceLineTotal !== null && (
                  <tfoot>
                    <tr className="border-t border-slate-200">
                      <th colSpan={4} className="px-2 pt-3 text-right text-sm font-bold text-slate-700">
                        Calculated invoice total
                      </th>
                      <td className="px-2 pt-3 text-right text-sm font-bold text-slate-900">{money(oneTimeInvoiceLineTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </section>
        <section className="mt-5 grid gap-4 rounded-2xl border border-violet-100 bg-violet-50 p-4 sm:grid-cols-4">
          <Detail label="Vendor count" value={order.clothes_count_vendor ?? 'Not confirmed'} />
          <Detail label="Invoice" value={order.invoice ? money(Number(order.invoice.amount)) : 'Not created'} />
          <Detail label="Payment" value={order.invoice?.status === 'paid' ? 'Paid' : 'Pending'} />
          <Detail label="Service mode" value={order.is_subscription_order ? 'Subscription' : 'One-time'} />
        </section>
        {order.is_subscription_order && order.invoice?.billing_breakdown && (
          <section className="mt-3 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <Detail label="Covered units" value={order.invoice.billing_breakdown.coveredUnits} />
            <Detail label="Subscriber-rate charges" value={money(order.invoice.billing_breakdown.subscriberAmount)} />
            <Detail label="Regular-rate charges" value={money(order.invoice.billing_breakdown.regularAmount)} />
          </section>
        )}
        {order.is_subscription_order && order.invoice && !order.invoice.billing_breakdown && (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            A detailed subscription billing breakdown is not available for this invoice.
          </p>
        )}
        <section className="mt-5 rounded-2xl border border-slate-200 p-4">
          <h4 className="font-bold text-slate-900">Notes</h4>
          <p className="mt-2 text-sm text-slate-600">{order.notes || 'No notes recorded.'}</p>
        </section>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {order.status === 'pending_pickup' && (
            <cancelFetcher.Form
              method="post"
              onSubmit={(event) => {
                if (!window.confirm('Are you sure you want to cancel this order?')) event.preventDefault()
              }}
            >
              <input type="hidden" name="intent" value="cancel-order" />
              <input type="hidden" name="orderId" value={order.id} />
              <button
                type="submit"
                disabled={cancelFetcher.state !== 'idle'}
                className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {cancelFetcher.state !== 'idle' ? 'Cancelling…' : 'Cancel order'}
              </button>
            </cancelFetcher.Form>
          )}
          {order.status !== 'pending_pickup' && <span />}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function OrderFilterDrawer({
  isOpen,
  onClose,
  statusFilter,
  setStatusFilter,
  dateMode,
  setDateMode,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: {
  isOpen: boolean
  onClose: () => void
  statusFilter: string
  setStatusFilter: (value: string) => void
  dateMode: 'all' | 'this_month' | 'last_month' | 'custom'
  setDateMode: (value: 'all' | 'this_month' | 'last_month' | 'custom') => void
  startDate: string
  setStartDate: (value: string) => void
  endDate: string
  setEndDate: (value: string) => void
}) {
  if (!isOpen) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/35" role="presentation" onMouseDown={onClose}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          aria-label="Cancel filters"
          className="absolute top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900"
          style={{ right: 'min(572px, calc(100vw - 36px))' }}
        >
          <X size={17} />
        </button>
      </div>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-filter-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-48px)] max-w-[560px] flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
      >
        <header className="border-b border-slate-100 px-6 py-5 sm:px-7">
          <h2 id="order-filter-title" className="text-xl font-bold text-slate-900">
            Filter orders
          </h2>
        </header>
        <div className="flex min-h-[calc(100vh-81px)] flex-1 flex-col px-6 py-6 sm:px-8">
          <div className="space-y-6">
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              >
                <option value="all">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">Date range</span>
              <select
                value={dateMode}
                onChange={(event) => setDateMode(event.target.value as typeof dateMode)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              >
                <option value="all">All time</option>
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {dateMode === 'custom' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2.5 block text-xs font-semibold text-slate-500">From</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
                  />
                </label>
                <label className="block">
                  <span className="mb-2.5 block text-xs font-semibold text-slate-500">To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
                  />
                </label>
              </div>
            )}
          </div>
          <div className="sticky bottom-0 mt-auto flex gap-3 border-t border-slate-100 bg-white pt-6">
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover"
            >
              Apply filters
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

export default function Orders() {
  const { orders, selectedOrder, page, pageSize, total, query, statusFilter, dateMode, startDate, endDate } = useLoaderData<typeof loader>()
  const [, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const isLoadingPage = navigation.state === 'loading' && navigation.location?.pathname === '/admin/orders'
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const buildSearch = (values: {
    page: number
    query?: string
    statusFilter?: string
    dateMode?: typeof dateMode
    startDate?: string
    endDate?: string
  }) => {
    const params = new URLSearchParams()
    if (values.page > 1) params.set('page', String(values.page))
    if (values.query) params.set('q', values.query)
    if (values.statusFilter && values.statusFilter !== 'all') params.set('status', values.statusFilter)
    if (values.dateMode && values.dateMode !== 'all') params.set('date', values.dateMode)
    if (values.startDate) params.set('from', values.startDate)
    if (values.endDate) params.set('to', values.endDate)
    return `?${params.toString()}`
  }
  const updateFilters = (filters: {
    statusFilter?: string
    dateMode?: typeof dateMode
    startDate?: string
    endDate?: string
  }) => {
    navigate(
      buildSearch({
        page: 1,
        query,
        statusFilter: filters.statusFilter ?? statusFilter,
        dateMode: filters.dateMode ?? dateMode,
        startDate: filters.startDate ?? startDate,
        endDate: filters.endDate ?? endDate,
      }),
    )
  }
  const exportParams = new URLSearchParams(
    buildSearch({ page: 1, query, statusFilter, dateMode, startDate, endDate }).slice(1),
  )
  const csvExportUrl = `/admin/orders/export?${exportParams.toString()}`

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Form method="get" className="w-full lg:max-w-lg">
              <input type="hidden" name="status" value={statusFilter} />
              <input type="hidden" name="date" value={dateMode} />
              <input type="hidden" name="from" value={startDate} />
              <input type="hidden" name="to" value={endDate} />
              <input
                key={query}
                name="q"
                defaultValue={query}
                placeholder="Search order, customer, Qaffy ID, email, or phone"
                aria-label="Search orders"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary"
              />
            </Form>
            <div className="flex items-center gap-2 self-end lg:self-auto">
              <button
                type="button"
                onClick={() => setIsFilterOpen(true)}
                aria-label="Open order filters"
                title="Filter orders"
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-brand-primary hover:text-brand-primary"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {(statusFilter !== 'all' || dateMode !== 'all') && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-primary" aria-label="Filters active" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = csvExportUrl
                  link.download = 'qaffy-admin-orders.csv'
                  link.click()
                }}
                disabled={total === 0}
                className="h-10 rounded-full bg-brand-primary px-5 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto p-4 md:p-5">
          <table className="w-full min-w-[1400px] table-fixed text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] capitalize tracking-[0.12em] text-slate-500">
                <th className="w-40 px-4 py-3 font-semibold">Created</th>
                <th className="w-36 px-4 py-3 font-semibold">Order ID</th>
                <th className="w-40 px-4 py-3 font-semibold">Pickup</th>
                <th className="w-48 px-4 py-3 font-semibold">Customer</th>
                <th className="w-36 px-4 py-3 font-semibold">Qaffy ID</th>
                <th className="w-36 px-4 py-3 font-semibold">Order type</th>
                <th className="w-40 px-4 py-3 font-semibold">Location</th>
                <th className="w-24 px-4 py-3 font-semibold">Items</th>
                <th className="w-40 px-4 py-3 font-semibold">Payment</th>
                <th className="w-36 px-4 py-3 font-semibold">Status</th>
                <th className="w-28 px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingPage ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500" role="status">
                      <LoaderCircle size={18} className="animate-spin text-brand-primary" />
                      Loading orders…
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">
                    No orders found.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-4 py-4 text-sm text-slate-700">{formatDate(order.created_at)}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-700">{order.public_order_number}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{formatDate(order.picked_up_date)}</td>
                    <td className="px-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{order.customer?.name ?? 'Customer'}</p>
                        <p className="truncate text-xs text-slate-500">{order.customer?.email ?? 'Email unavailable'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">{order.customer?.qaffy_id ?? 'Unavailable'}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{orderTypeLabels[order.order_type]}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{order.location?.name ?? 'Location pending'}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">
                      {order.items.length > 0 ? getCustomerItemCount(order) : 'Not recorded'}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">{order.invoice?.status === 'paid' ? 'Paid' : 'Pending'}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize tracking-[0.12em] ${statusStyles[order.status]}`}
                      >
                        {statusLabels[order.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSearchParams((current) => {
                            const next = new URLSearchParams(current)
                            next.set('orderId', order.id)
                            return next
                          })
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <OrderFilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        statusFilter={statusFilter}
        setStatusFilter={(value) => updateFilters({ statusFilter: value })}
        dateMode={dateMode}
        setDateMode={(value) => {
          const today = new Date()
          if (value === 'this_month')
            updateFilters({
              dateMode: value,
              startDate: inputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
              endDate: inputDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
            })
          else if (value === 'last_month')
            updateFilters({
              dateMode: value,
              startDate: inputDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
              endDate: inputDate(new Date(today.getFullYear(), today.getMonth(), 0)),
            })
          else updateFilters({ dateMode: value, startDate: '', endDate: '' })
        }}
        startDate={startDate}
        setStartDate={(value) => updateFilters({ dateMode: 'custom', startDate: value })}
        endDate={endDate}
        setEndDate={(value) => updateFilters({ dateMode: 'custom', endDate: value })}
      />
      {total > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()} orders
          </p>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => navigate(buildSearch({ page: page - 1, query, statusFilter, dateMode, startDate, endDate }))}
              disabled={page === 1 || isLoadingPage}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span className="whitespace-nowrap text-sm text-slate-600">Page {page} of {pageCount}</span>
            <button
              type="button"
              onClick={() => navigate(buildSearch({ page: page + 1, query, statusFilter, dateMode, startDate, endDate }))}
              disabled={page === pageCount || isLoadingPage}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
      {selectedOrder && (
        <OrderDetails
          order={selectedOrder}
          onClose={() => {
            setSearchParams((current) => {
              const next = new URLSearchParams(current)
              next.delete('orderId')
              return next
            })
          }}
        />
      )}
    </div>
  )
}
