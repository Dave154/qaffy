import { useEffect, useMemo, useState } from 'react'
import { data, Link, useFetcher, useOutletContext, useRevalidator } from 'react-router'
import { Search } from 'lucide-react'
import { requireRole } from '../../../lib/auth.server'
import { sql } from '../../../lib/db.server'
import { useRef } from 'react'

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: { request: Request }) {
  const auth = await requireRole(request, 'vendor')
  if (!auth) return data({ ok: false, message: 'Please sign in again.' }, { status: 401 })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  const orderIds = [...new Set(formData.getAll('orderId').map(String).filter(Boolean))]

  if (!['claim', 'dispatch'].includes(intent) || orderIds.length === 0) {
    return data({ ok: false, message: 'Invalid order action.' }, { status: 400, headers: auth.headers })
  }

  const { data: vendor, error: vendorError } = await auth.supabase.from('vendors').select('id').eq('profile_id', auth.profile.id).eq('status', 'approved').maybeSingle()
  if (vendorError) return data({ ok: false, message: vendorError.message }, { status: 400, headers: auth.headers })
  if (!vendor) return data({ ok: false, message: 'Approved vendor access is required to claim orders.' }, { status: 403, headers: auth.headers })

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
      if (!claimedOrder) return data({ ok: false, message: 'This order is no longer available to claim.' }, { status: 409, headers: auth.headers })
    } else {
      const dispatchedOrders = await sql`
        update orders
        set status = 'out_for_delivery'
        where id in ${sql(orderIds)}
          and vendor_id = ${vendor.id}
          and status = 'paid'
        returning id
      `
      if (dispatchedOrders.length === 0) return data({ ok: false, message: 'No selected orders are ready for dispatch.' }, { status: 409, headers: auth.headers })
    }
  } catch (error) {
    return data({ ok: false, message: error instanceof Error ? error.message : intent === 'dispatch' ? 'Orders could not be moved to delivery.' : 'Order claim failed.' }, { status: 400, headers: auth.headers })
  }
  return data({ ok: true }, { headers: auth.headers })
}

type VendorOrder = {
  id: string
  public_order_number: string
  publicOrderNumber: string
  customer_id: string
  order_type: 'wash' | 'wash_iron' | 'mixed'
  clothes_count_customer: number
  status: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  created_at: string
  picked_up_date: string | null
  customer: { name: string | null; qaffy_id: string | null } | null
  location: { name: string } | null
  items: Array<{ service: 'wash' | 'iron' | 'wash_iron' }>
}

type VendorLayoutData = { orders: VendorOrder[] }

const statusLabels: Record<VendorOrder['status'], string> = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Pending claim',
  at_vendor: 'Vendor processing',
  invoiced: 'Awaiting payment',
  paid: 'Processing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Completed',
  cancelled: 'Cancelled',
}

const statusStyle: Record<string, string> = {
  'Pending claim': 'bg-amber-50 text-amber-700',
  'Vendor processing': 'bg-brand-soft text-brand-primary',
  Processing: 'bg-brand-soft text-brand-primary',
  'Out for delivery': 'bg-teal-50 text-teal-700',
  'Awaiting payment': 'bg-sky-50 text-sky-700',
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
  const { orders } = useOutletContext<VendorLayoutData>()
  const fetcher = useFetcher<typeof action>()
  const { revalidate } = useRevalidator()
  const handledFetcherData = useRef<typeof fetcher.data>(null)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'unclaimed' | 'claimed' | 'processing' | 'delivered'>('processing')
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])

  useEffect(() => {
    if (!fetcher.data || handledFetcherData.current === fetcher.data) return
    handledFetcherData.current = fetcher.data
    if (fetcher.data.ok) {
      setSelectedOrderIds([])
      revalidate()
    }
  }, [fetcher.data, revalidate])

  const rows = useMemo(() => orders.map((order) => ({
    ...order,
    publicOrderNumber: order.public_order_number,
    label: statusLabels[order.status],
    customer: order.customer?.name ?? 'Customer',
    customerId: order.customer?.qaffy_id ?? 'QF unavailable',
    location: order.location?.name ?? 'Location pending',
  })), [orders])

  const filteredOrders = rows.filter((order) => {
    const searchText = `${order.publicOrderNumber} ${order.customer} ${order.customerId} ${order.location} ${orderTypeLabels[order.order_type]}`.toLowerCase()
    const inTab = activeTab === 'unclaimed'
      ? order.status === 'picked_up'
      : activeTab === 'processing'
        ? order.status === 'paid'
      : activeTab === 'claimed'
        ? ['at_vendor', 'invoiced', 'out_for_delivery'].includes(order.status)
        : order.status === 'delivered'
    return searchText.includes(query.toLowerCase()) && inTab
  })
  const selectableOrders = filteredOrders.filter((order) => order.status === 'paid')
  const allSelectableOrdersSelected = selectableOrders.length > 0 && selectableOrders.every((order) => selectedOrderIds.includes(order.id))

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((current) => current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId])
  }

  const toggleAllSelectableOrders = () => {
    setSelectedOrderIds((current) => allSelectableOrdersSelected
      ? current.filter((id) => !selectableOrders.some((order) => order.id === id))
      : [...new Set([...current, ...selectableOrders.map((order) => order.id)])])
  }

  const dispatchSelectedOrders = () => {
    if (selectedOrderIds.length === 0 || fetcher.state !== 'idle') return
    const formData = new FormData()
    formData.set('intent', 'dispatch')
    selectedOrderIds.forEach((orderId) => formData.append('orderId', orderId))
    fetcher.submit(formData, { method: 'post' })
  }

  const changeTab = (tab: typeof activeTab) => {
    setActiveTab(tab)
    setSelectedOrderIds([])
  }

  const count = (label: string) => rows.filter((order) => order.label === label).length

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h2>
        <p className="mt-2 text-sm text-slate-500">Review live customer orders and continue processing work.</p>
      </header>

      <section className="grid gap-3 min-[375px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ['Available', count('Pending claim')],
          ['Vendor processing', count('Vendor processing')],
          ['Processing', count('Processing')],
          ['Awaiting payment', count('Awaiting payment')],
          ['Out for delivery', count('Out for delivery')],
          ['Completed', count('Completed')],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[10px] border border-[#e9e9e9] bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[10px] border border-[#e9e9e9] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#ededed] p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div className="relative w-full md:max-w-sm">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search orders or customers" className="h-10 w-full rounded-[8px] border border-[#dedede] pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </div>
          <div className="scrollbar-hidden flex flex-nowrap gap-2 overflow-x-auto pb-1">
            {[
              ['unclaimed', 'Unclaimed', rows.filter((order) => order.status === 'picked_up').length],
              ['processing', 'Processing', rows.filter((order) => order.status === 'paid').length],
              ['claimed', 'Dispatched', rows.filter((order) => ['at_vendor', 'invoiced', 'out_for_delivery'].includes(order.status)).length],
              ['delivered', 'Delivered', rows.filter((order) => order.status === 'delivered').length],
            ].map(([value, label, count]) => (
              <button key={value} type="button" onClick={() => changeTab(value as typeof activeTab)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === value ? 'bg-brand-primary text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-primary hover:text-brand-primary'}`}>
                {label}<span className={activeTab === value ? 'text-white/80' : 'text-slate-400'}>{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto p-4 md:p-5">
          {fetcher.data && !fetcher.data.ok && 'message' in fetcher.data && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">{String(fetcher.data.message)}</p>}
          {fetcher.data?.ok && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">Selected orders dispatched successfully.</p>}
          {selectableOrders.length > 0 && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-border bg-brand-soft px-3 py-2.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-brand-strong">
              <input type="checkbox" checked={allSelectableOrdersSelected} onChange={toggleAllSelectableOrders} className="h-4 w-4 accent-brand-primary" />
              Select orders ready for dispatch ({selectableOrders.length})
            </label>
            <button type="button" onClick={dispatchSelectedOrders} disabled={selectedOrderIds.length === 0 || fetcher.state !== 'idle'} className="rounded-[7px] bg-brand-primary px-3 py-2 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              {fetcher.state !== 'idle' ? 'Dispatching...' : selectedOrderIds.length > 0 ? `Dispatch ${selectedOrderIds.length} selected` : 'Dispatch selected orders'}
            </button>
          </div>}
          <table className="w-full min-w-[1240px] table-fixed text-left">
            <thead>
              <tr className="border-b border-[#ededed] bg-[#f8f8f8] text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="w-12 px-4 py-3 font-semibold"><span className="sr-only">Select</span></th>
                <th className="w-36 px-4 py-3 font-semibold">Order</th>
                <th className="w-56 px-4 py-3 font-semibold">Customer</th>
                <th className="w-36 px-4 py-3 font-semibold">Service</th>
                <th className="w-24 px-4 py-3 font-semibold">Items</th>
                <th className="w-40 px-4 py-3 font-semibold">Pickup location</th>
                <th className="w-40 px-4 py-3 font-semibold">Picked up</th>
                <th className="w-40 px-4 py-3 font-semibold">Status</th>
                <th className="w-32 px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="px-4 py-4">{order.status === 'paid' && <input type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={() => toggleOrderSelection(order.id)} aria-label={`Select ${order.publicOrderNumber}`} className="h-4 w-4 accent-brand-primary" />}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-900" title={order.publicOrderNumber}>{order.publicOrderNumber}</td>
                  <td className="max-w-56 truncate whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-900" title={order.customer}>{order.customer}</td>
                  <td className="max-w-36 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600" title={orderTypeLabels[order.order_type]}>{orderTypeLabels[order.order_type]}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{order.clothes_count_customer}</td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600" title={order.location}>{order.location}</td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-500" title={formatDate(order.picked_up_date)}>{formatDate(order.picked_up_date)}</td>
                  <td className="px-4 py-4"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[order.label]}`}>{order.label}</span></td>
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    {order.status === 'picked_up' ? <button type="button" onClick={() => fetcher.submit({ intent: 'claim', orderId: order.id }, { method: 'post' })} disabled={fetcher.state !== 'idle'} className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary disabled:cursor-wait disabled:opacity-60">{fetcher.state !== 'idle' ? 'Claiming...' : 'Claim'}</button> : <Link to={`/vendor?orderId=${encodeURIComponent(order.id)}&returnTo=orders`} className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary">View details</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredOrders.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No matching orders.</p>}
        </div>
      </section>
    </div>
  )
}
