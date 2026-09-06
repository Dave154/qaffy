import { useState } from 'react'
import NewOrder from './NewOrder'
import OrderDetailModal from './OrderDetailModal'
import { type CustomerOrder } from '../customer-store'
import { useCustomerStore } from '../customer-store-hook'

export default function Orders() {
  const { orders } = useCustomerStore()
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null)
  const [activeFilter, setActiveFilter] = useState('All orders')

  const filteredOrders = orders.filter((order) => {
    if (activeFilter === 'Active') return order.status !== 'Delivered'
    if (activeFilter === 'Completed') return order.status === 'Delivered'
    if (activeFilter === 'Pending payment') return order.paymentStatus === 'Pending'
    return true
  })

  const stats = [
    { label: 'Total orders', value: String(orders.length), helper: 'In your history' },
    { label: 'Active', value: String(orders.filter((order) => order.status !== 'Delivered').length).padStart(2, '0'), helper: 'In progress' },
    { label: 'Delivered', value: String(orders.filter((order) => order.status === 'Delivered').length), helper: 'Completed' },
    { label: 'Spend', value: `₦${orders.reduce((total, order) => total + order.total, 0).toLocaleString()}`, helper: 'Across all orders' },
  ]

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Orders</h2>
        </div>
        <button type="button" onClick={() => setIsOrderModalOpen(true)} className="rounded-lg bg-[#00b7d4] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#007f99]">
          New order
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[#e7e7e7] bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{stat.label}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{stat.value}</p>
            <p className="mt-1 text-sm text-slate-500">{stat.helper}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[#e7e7e7] bg-white p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {['All orders', 'Active', 'Completed', 'Pending payment'].map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeFilter === filter
                  ? 'bg-[#e8fbfd] text-[#00b7d4] ring-1 ring-[#a8eaf0]'
                  : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#e7e7e7] bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Recent orders</h3>
            <p className="mt-1 text-sm text-slate-500">Track pickup, delivery, and payment status</p>
          </div>
          <button type="button" className="text-sm font-medium text-[#00b7d4]">Export</button>
        </div>

        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <article key={order.id} className="border-b border-[#eeeeee] bg-white p-4 last:border-b-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-semibold text-slate-900">{order.id}</p>
                    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${order.statusTone}`}>
                      {order.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-700">{order.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{order.date}</p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xl font-bold text-slate-900">₦{order.total.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-500">{order.items} clothes</p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">{order.pickup}</p>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                    className="rounded-lg border border-[#a8eaf0] bg-white px-3.5 py-2 text-sm font-semibold text-[#00b7d4] hover:bg-[#e8fbfd]"
                >
                  {order.action}
                </button>
              </div>
            </article>
          ))}
          {filteredOrders.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No orders match this filter.</p>}
        </div>
      </section>

      {isOrderModalOpen && <NewOrder onClose={() => setIsOrderModalOpen(false)} />}
      {selectedOrder && <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  )
}
