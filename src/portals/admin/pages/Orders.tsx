import { data, useLoaderData, useSearchParams } from 'react-router'
import { useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import type { Route } from './+types/Orders'
import { requireRole } from '../../../lib/auth.server'

type AdminOrder = {
  id: string
  public_order_number: string
  created_at: string
  picked_up_date: string | null
  order_type: 'wash' | 'wash_iron' | 'mixed'
  status: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  clothes_count_customer: number
  clothes_count_vendor: number | null
  notes: string | null
  is_subscription_order: boolean
  customer: { name: string | null; qaffy_id: string | null; email: string | null; phone: string | null } | null
  location: { name: string } | null
  items: Array<{ id: string; quantity: number; service: 'wash' | 'iron' | 'wash_iron'; unit_price: number; category: { name: string } | null }>
  invoice: { amount: number; status: 'unpaid' | 'paid'; paid_at: string | null } | null
}

type AdminOrdersData = { orders: AdminOrder[] }

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data<AdminOrdersData>({ orders: [] }, { status: 200 })
  const { supabase, headers } = auth
  const { data: orders } = await supabase.from('orders').select('*').order('created_at', { ascending: false })
  const orderRows = orders ?? []
  const orderIds = orderRows.map((order) => order.id)
  const customerIds = [...new Set(orderRows.map((order) => order.customer_id))]
  const locationIds = [...new Set(orderRows.map((order) => order.pickup_location_id).filter(Boolean))] as string[]
  const [{ data: profiles }, { data: locations }, { data: items }, { data: invoices }] = await Promise.all([
    customerIds.length ? supabase.from('profiles').select('id, name, qaffy_id, email, phone').in('id', customerIds) : Promise.resolve({ data: [] }),
    locationIds.length ? supabase.from('pickup_locations').select('id, name').in('id', locationIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from('order_items').select('id, order_id, category_id, quantity, service, unit_price').in('order_id', orderIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from('invoices').select('order_id, amount, status, paid_at').in('order_id', orderIds) : Promise.resolve({ data: [] }),
  ])
  const categoryIds = [...new Set((items ?? []).map((item) => item.category_id))]
  const { data: categories } = categoryIds.length ? await supabase.from('cloth_categories').select('id, name').in('id', categoryIds) : { data: [] }

  return data<AdminOrdersData>({ orders: orderRows.map((order) => ({
    ...order,
    customer: (profiles ?? []).find((profile) => profile.id === order.customer_id) ?? null,
    location: (locations ?? []).find((location) => location.id === order.pickup_location_id) ?? null,
    items: (items ?? []).filter((item) => item.order_id === order.id).map((item) => ({ ...item, unit_price: Number(item.unit_price), category: (categories ?? []).find((category) => category.id === item.category_id) ?? null })),
    invoice: (invoices ?? []).find((invoice) => invoice.order_id === order.id) ?? null,
  })) }, { headers, status: 200 })
}

const statusLabels: Record<AdminOrder['status'], string> = { pending_pickup: 'Pending pickup', picked_up: 'Picked up', at_vendor: 'At vendor', invoiced: 'Awaiting review', paid: 'Paid', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' }
const statusStyles: Record<AdminOrder['status'], string> = { pending_pickup: 'bg-amber-50 text-amber-700', picked_up: 'bg-sky-50 text-sky-700', at_vendor: 'bg-brand-soft text-brand-primary', invoiced: 'bg-violet-50 text-violet-700', paid: 'bg-emerald-50 text-emerald-700', out_for_delivery: 'bg-cyan-50 text-cyan-700', delivered: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-red-50 text-red-700' }
const orderTypeLabels = { wash: 'Wash only', wash_iron: 'Wash + Iron', mixed: 'Mixed service' }
const serviceLabels = { wash: 'Wash', iron: 'Iron', wash_iron: 'Wash + Iron' }
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded'
const money = (value: number) => `â‚¦${value.toLocaleString()}`
const csvValue = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`
const inputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function Detail({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p></div>
}

function OrderDetails({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  return <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-0 sm:items-center sm:p-4"><div className="max-h-[calc(100vh-1rem)] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-8"><header className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Admin order details</p><h3 className="mt-2 text-2xl font-bold text-slate-900">{order.customer?.name ?? 'Customer'}</h3><p className="mt-1 text-sm text-slate-500">{order.id} Â· {statusLabels[order.status]}</p></div><button type="button" onClick={onClose} aria-label="Close order details" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-400">Ã—</button></header><section className="mt-6 grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-4"><Detail label="Customer ID" value={order.customer?.qaffy_id ?? 'Unavailable'} /><Detail label="Order type" value={orderTypeLabels[order.order_type]} /><Detail label="Created" value={formatDate(order.created_at)} /><Detail label="Location" value={order.location?.name ?? 'Location pending'} /></section><section className="mt-5 rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><h4 className="font-bold text-slate-900">Items</h4><span className="text-sm text-slate-500">Customer count: {order.clothes_count_customer}</span></div><div className="mt-4 space-y-2">{order.items.length === 0 ? <p className="text-sm text-slate-500">No item details recorded.</p> : order.items.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm"><span className="font-semibold text-slate-800">{item.category?.name ?? 'Laundry item'} Â· {serviceLabels[item.service]}</span><span className="text-slate-600">{item.quantity} Ã— {money(item.unit_price)}</span></div>)}</div></section><section className="mt-5 grid gap-4 rounded-2xl border border-violet-100 bg-violet-50 p-4 sm:grid-cols-4"><Detail label="Vendor count" value={order.clothes_count_vendor ?? 'Not confirmed'} /><Detail label="Invoice" value={order.invoice ? money(Number(order.invoice.amount)) : 'Not created'} /><Detail label="Payment" value={order.invoice?.status === 'paid' ? 'Paid' : 'Pending'} /><Detail label="Service mode" value={order.is_subscription_order ? 'Subscription' : 'One-time'} /></section><section className="mt-5 rounded-2xl border border-slate-200 p-4"><h4 className="font-bold text-slate-900">Notes</h4><p className="mt-2 text-sm text-slate-600">{order.notes || 'No notes recorded.'}</p></section></div></div>
}

function OrderFilterDrawer({ isOpen, onClose, statusFilter, setStatusFilter, dateMode, setDateMode, startDate, setStartDate, endDate, setEndDate }: { isOpen: boolean; onClose: () => void; statusFilter: string; setStatusFilter: (value: string) => void; dateMode: 'all' | 'this_month' | 'last_month' | 'custom'; setDateMode: (value: 'all' | 'this_month' | 'last_month' | 'custom') => void; startDate: string; setStartDate: (value: string) => void; endDate: string; setEndDate: (value: string) => void }) {
  if (!isOpen) return null
  return <><div className="fixed inset-0 z-40 bg-slate-950/35" role="presentation" onMouseDown={onClose}><button type="button" onClick={(event) => { event.stopPropagation(); onClose() }} aria-label="Cancel filters" className="absolute top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900" style={{ right: 'min(572px, calc(100vw - 36px))' }}><X size={17} /></button></div><aside role="dialog" aria-modal="true" aria-labelledby="order-filter-title" onMouseDown={(event) => event.stopPropagation()} className="fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-48px)] max-w-[560px] flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"><header className="border-b border-slate-100 px-6 py-5 sm:px-7"><h2 id="order-filter-title" className="text-xl font-bold text-slate-900">Filter orders</h2></header><div className="flex min-h-[calc(100vh-81px)] flex-1 flex-col px-6 py-6 sm:px-8"><div className="space-y-6"><label className="block"><span className="mb-2.5 block text-xs font-semibold text-slate-500">Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block"><span className="mb-2.5 block text-xs font-semibold text-slate-500">Date range</span><select value={dateMode} onChange={(event) => setDateMode(event.target.value as typeof dateMode)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"><option value="all">All time</option><option value="this_month">This month</option><option value="last_month">Last month</option><option value="custom">Custom</option></select></label>{dateMode === 'custom' && <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-2.5 block text-xs font-semibold text-slate-500">From</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label><label className="block"><span className="mb-2.5 block text-xs font-semibold text-slate-500">To</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label></div>}</div><div className="sticky bottom-0 mt-auto flex gap-3 border-t border-slate-100 bg-white pt-6"><button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</button><button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover">Apply filters</button></div></div></aside></>
}

export default function Orders() {
  const { orders } = useLoaderData<typeof loader>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dateMode, setDateMode] = useState<'all' | 'this_month' | 'last_month' | 'custom'>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const dateRange = useMemo(() => {
    if (dateMode === 'custom') return { start: startDate, end: endDate }
    if (dateMode === 'all') return { start: '', end: '' }

    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    if (dateMode === 'this_month') return { start: inputDate(monthStart), end: inputDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)) }
    return { start: inputDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)), end: inputDate(new Date(today.getFullYear(), today.getMonth(), 0)) }
  }, [dateMode, endDate, startDate])
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const text = `${order.public_order_number} ${order.customer?.name ?? ''} ${order.customer?.qaffy_id ?? ''} ${order.customer?.email ?? ''} ${order.customer?.phone ?? ''} ${order.location?.name ?? ''}`.toLowerCase()
    const createdDate = order.created_at.slice(0, 10)
    return (statusFilter === 'all' || order.status === statusFilter)
      && text.includes(query.toLowerCase())
      && (!dateRange.start || createdDate >= dateRange.start)
      && (!dateRange.end || createdDate <= dateRange.end)
  }), [dateRange, orders, query, statusFilter])

  useEffect(() => {
    const targetOrderId = searchParams.get('orderId')
    if (!targetOrderId) {
      setSelectedOrder(null)
      return
    }

    const matchedOrder = orders.find((order) => order.id === targetOrderId)
    setSelectedOrder(matchedOrder ?? null)
  }, [orders, searchParams])

  const exportCsv = () => {
    const header = ['Order', 'Created', 'Pickup', 'Customer', 'Qaffy ID', 'Order type', 'Location', 'Items', 'Payment', 'Status']
    const lines = filteredOrders.map((order) => [
      order.public_order_number,
      formatDate(order.created_at),
      formatDate(order.picked_up_date),
      order.customer?.name ?? 'Customer',
      order.customer?.qaffy_id ?? 'Unavailable',
      orderTypeLabels[order.order_type],
      order.location?.name ?? 'Location pending',
      order.clothes_count_customer,
      order.invoice?.status === 'paid' ? 'Paid' : 'Pending',
      statusLabels[order.status],
    ].map(csvValue).join(','))
    const blob = new Blob([[header.map(csvValue).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'qaffy-admin-orders.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, Qaffy ID, email, or phone" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary lg:max-w-lg" />
            <div className="flex items-center gap-2 self-end lg:self-auto">
              <button type="button" onClick={() => setIsFilterOpen(true)} aria-label="Open order filters" title="Filter orders" className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-brand-primary hover:text-brand-primary">
                <SlidersHorizontal className="h-4 w-4" />
                {(statusFilter !== 'all' || dateMode !== 'all') && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-primary" aria-label="Filters active" />}
              </button>
              <button type="button" onClick={exportCsv} disabled={filteredOrders.length === 0} className="h-10 rounded-full bg-brand-primary px-5 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Export CSV</button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto p-4 md:p-5">
          <table className="w-full min-w-[1280px] table-fixed text-left">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><th className="w-40 px-4 py-3 font-semibold">Created</th><th className="w-40 px-4 py-3 font-semibold">Pickup</th><th className="w-48 px-4 py-3 font-semibold">Customer</th><th className="w-36 px-4 py-3 font-semibold">Qaffy ID</th><th className="w-36 px-4 py-3 font-semibold">Order type</th><th className="w-40 px-4 py-3 font-semibold">Location</th><th className="w-24 px-4 py-3 font-semibold">Items</th><th className="w-40 px-4 py-3 font-semibold">Payment</th><th className="w-36 px-4 py-3 font-semibold">Status</th><th className="w-28 px-4 py-3 text-right font-semibold">Action</th></tr></thead>
            <tbody>{filteredOrders.length === 0 ? <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">No orders found.</td></tr> : filteredOrders.map((order) => <tr key={order.id} className="border-b border-slate-100 align-top last:border-0"><td className="px-4 py-4 text-sm text-slate-700">{formatDate(order.created_at)}</td><td className="px-4 py-4 text-sm text-slate-700">{formatDate(order.picked_up_date)}</td><td className="px-4 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{order.customer?.name ?? 'Customer'}</p><p className="truncate text-xs text-slate-500">{order.customer?.email ?? 'Email unavailable'}</p></div></td><td className="px-4 py-4 text-sm text-slate-700">{order.customer?.qaffy_id ?? 'Unavailable'}</td><td className="px-4 py-4 text-sm text-slate-700">{orderTypeLabels[order.order_type]}</td><td className="px-4 py-4 text-sm text-slate-700">{order.location?.name ?? 'Location pending'}</td><td className="px-4 py-4 text-sm text-slate-700">{order.clothes_count_customer}</td><td className="px-4 py-4 text-sm text-slate-700">{order.invoice?.status === 'paid' ? 'Paid' : 'Pending'}</td><td className="px-4 py-4"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusStyles[order.status]}`}>{statusLabels[order.status]}</span></td><td className="whitespace-nowrap px-4 py-4 text-right"><button type="button" onClick={() => { setSelectedOrder(order); setSearchParams((current) => { const next = new URLSearchParams(current); next.set('orderId', order.id); return next }) }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50">View</button></td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <OrderFilterDrawer isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} statusFilter={statusFilter} setStatusFilter={setStatusFilter} dateMode={dateMode} setDateMode={setDateMode} startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate} />
      {selectedOrder && <OrderDetails order={selectedOrder} onClose={() => { setSelectedOrder(null); setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('orderId'); return next }) }} />}
    </div>
  )
}
