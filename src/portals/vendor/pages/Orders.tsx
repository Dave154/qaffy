import { useMemo, useState } from 'react'
import { data, Link, useFetcher, useOutletContext } from 'react-router'
import { Search, SlidersHorizontal } from 'lucide-react'
import { requireRole } from '../../../lib/auth.server'

export async function action({ request }: { request: Request }) {
  const auth = await requireRole(request, 'vendor')
  if (!auth) return data({ ok: false, message: 'Please sign in again.' }, { status: 401 })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  const orderId = String(formData.get('orderId') ?? '')

  if (intent !== 'claim' || !orderId) {
    return data({ ok: false, message: 'Invalid order action.' }, { status: 400, headers: auth.headers })
  }

  const { error } = await auth.supabase
    .from('orders')
    .update({ status: 'at_vendor' })
    .eq('id', orderId)
    .eq('status', 'pending_pickup')

  if (error) return data({ ok: false, message: error.message }, { status: 400, headers: auth.headers })
  return data({ ok: true }, { headers: auth.headers })
}

type VendorOrder = {
  id: string
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
  pending_pickup: 'Pending claim',
  picked_up: 'In progress',
  at_vendor: 'In progress',
  invoiced: 'Awaiting review',
  paid: 'Awaiting review',
  out_for_delivery: 'Awaiting review',
  delivered: 'Completed',
  cancelled: 'Cancelled',
}

const statusStyle: Record<string, string> = {
  'Pending claim': 'bg-amber-50 text-amber-700',
  'In progress': 'bg-brand-soft text-brand-primary',
  'Awaiting review': 'bg-sky-50 text-sky-700',
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

function serviceLabel(order: VendorOrder) {
  const services = [...new Set(order.items.map((item) => item.service))]
  return services.length === 1
    ? { wash: 'Wash only', iron: 'Iron only', wash_iron: 'Wash + Iron' }[services[0]]
    : 'Mixed service'
}

export default function Orders() {
  const { orders } = useOutletContext<VendorLayoutData>()
  const fetcher = useFetcher<typeof action>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')

  const rows = useMemo(() => orders.map((order) => ({
    ...order,
    label: statusLabels[order.status],
    customer: order.customer?.name ?? 'Customer',
    customerId: order.customer?.qaffy_id ?? order.customer_id,
    location: order.location?.name ?? 'Location pending',
    service: serviceLabel(order),
  })), [orders])

  const filteredOrders = rows.filter((order) => {
    const searchText = `${order.id} ${order.customer} ${order.customerId} ${order.location} ${order.service}`.toLowerCase()
    return searchText.includes(query.toLowerCase()) && (filter === 'All' || order.label === filter)
  })

  const count = (label: string) => rows.filter((order) => order.label === label).length

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h2>
        <p className="mt-2 text-sm text-slate-500">Review live customer orders and continue processing work.</p>
      </header>

      <section className="grid gap-3 min-[375px]:grid-cols-2 sm:grid-cols-4">
        {[
          ['Available', count('Pending claim')],
          ['In progress', count('In progress')],
          ['Awaiting review', count('Awaiting review')],
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
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-slate-400" />
            <select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 rounded-[8px] border border-[#dedede] bg-white px-3 text-sm outline-none focus:border-brand-primary">
              <option>All</option>
              <option>Pending claim</option>
              <option>In progress</option>
              <option>Awaiting review</option>
              <option>Completed</option>
              <option>Cancelled</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto p-4 md:p-5">
          <table className="w-full min-w-[1120px] table-fixed text-left">
            <thead>
              <tr className="border-b border-[#ededed] bg-[#f8f8f8] text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="w-32 px-4 py-3 font-semibold">Picked up</th>
                <th className="w-32 px-4 py-3 font-semibold">Created at</th>
                <th className="w-28 px-4 py-3 font-semibold">Service</th>
                <th className="w-48 px-4 py-3 font-semibold">Customer</th>
                <th className="w-32 px-4 py-3 font-semibold">Pickup location</th>
                <th className="w-24 px-4 py-3 font-semibold">Items</th>
                <th className="w-36 px-4 py-3 font-semibold">Status</th>
                <th className="w-28 px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500">{formatDate(order.picked_up_date)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500">{formatDate(order.created_at)}</td>
                  <td className="px-4 py-4 text-sm text-slate-600">{orderTypeLabels[order.order_type]}</td>
                  <td className="px-4 py-4"><p className="font-semibold text-slate-900">{order.customer}</p><p className="mt-1 text-xs text-slate-400">{order.customerId} · {order.id}</p></td>
                  <td className="px-4 py-4 text-sm text-slate-600">{order.location}</td>
                  <td className="px-4 py-4 text-sm text-slate-600">{order.clothes_count_customer}</td>
                  <td className="px-4 py-4"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[order.label]}`}>{order.label}</span></td>
                  <td className="px-4 py-4 text-right">
                    {order.label === 'Pending claim' ? (
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="claim" />
                        <input type="hidden" name="orderId" value={order.id} />
                        <button type="submit" disabled={fetcher.state !== 'idle'} className="rounded-[7px] bg-brand-primary px-3 py-2 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
                          {fetcher.state !== 'idle' ? 'Claiming...' : 'Claim'}
                        </button>
                      </fetcher.Form>
                    ) : (
                      <Link to={`/vendor?orderId=${encodeURIComponent(order.id)}`} className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary">Review</Link>
                    )}
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
