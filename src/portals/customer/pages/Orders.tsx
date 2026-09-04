import { useState } from 'react'
import NewOrder from './NewOrder'
import OrderDetailModal from './OrderDetailModal'

type CustomerOrder = {
  id: string
  customerId: string
  title: string
  status: 'Picked up' | 'In progress' | 'Delivered'
  statusTone: string
  date: string
  pickup: string
  total: string
  items: string
  action: string
  pickupOtp: string
  deliveryOtp?: string
  pickedUp: boolean
  pickupDate?: string
  notes: string
  service: string
  paymentStatus: 'Paid' | 'Pending'
}

const orders: CustomerOrder[] = [
  {
    id: 'QF-1042',
    customerId: 'ID-1042',
    title: 'Wash + Iron',
    status: 'Picked up',
    statusTone: 'bg-emerald-50 text-emerald-700',
    date: 'Today, 09:10 AM',
    pickup: 'Pickup scheduled for Fri, 8:00 AM',
    total: '₦4,800',
    items: '6 clothes',
    action: 'Track order',
    pickupOtp: 'QF-2048',
    deliveryOtp: 'QF-4187',
    pickedUp: true,
    pickupDate: 'Today, 09:10 AM',
    notes: 'Separate whites and handle the silk top carefully. Please keep the bag zipped and avoid any fabric softener.',
    service: 'Wash + Iron',
    paymentStatus: 'Paid',
  },
  {
    id: 'QF-1038',
    customerId: 'ID-1038',
    title: 'Wash only',
    status: 'In progress',
    statusTone: 'bg-amber-50 text-amber-700',
    date: 'Yesterday, 04:18 PM',
    pickup: 'Ready for delivery today',
    total: '₦7,200',
    items: '9 clothes',
    action: 'View details',
    pickupOtp: 'QF-3219',
    deliveryOtp: undefined,
    pickedUp: false,
    pickupDate: undefined,
    notes: 'Please check the denim and towels separately. One pair of white jeans needs extra care.',
    service: 'Wash only',
    paymentStatus: 'Pending',
  },
  {
    id: 'QF-1027',
    customerId: 'ID-1027',
    title: 'Wash + Iron',
    status: 'Delivered',
    statusTone: 'bg-slate-100 text-slate-700',
    date: 'Mon, 11:40 AM',
    pickup: 'Delivered to your address',
    total: '₦5,500',
    items: '7 clothes',
    action: 'Reorder',
    pickupOtp: 'QF-9081',
    deliveryOtp: 'QF-7703',
    pickedUp: true,
    pickupDate: 'Mon, 11:40 AM',
    notes: 'Customer collected the order successfully and the delivery OTP was verified on arrival.',
    service: 'Wash + Iron',
    paymentStatus: 'Paid',
  },
]

const stats = [
  { label: 'Total orders', value: '24', helper: 'This year' },
  { label: 'Active', value: '02', helper: 'In progress' },
  { label: 'Delivered', value: '18', helper: 'Completed' },
  { label: 'Spend', value: '₦118k', helper: 'Across all orders' },
]

export default function Orders() {
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null)

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Customer orders</h2>
        </div>
        <button type="button" onClick={() => setIsOrderModalOpen(true)} className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-slate-200 transition hover:bg-slate-800">
          New order
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[22px] border border-sky-100 bg-white p-4 shadow-sm shadow-sky-50">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{stat.label}</p>
            <p className="mt-3 text-2xl font-bold text-slate-900">{stat.value}</p>
            <p className="mt-1 text-sm text-slate-500">{stat.helper}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-100 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {['All orders', 'Active', 'Completed', 'Pending payment'].map((filter, index) => (
            <button
              key={filter}
              type="button"
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                index === 0
                  ? 'bg-slate-900 text-white shadow-sm shadow-slate-200'
                  : 'bg-slate-50 text-slate-500 hover:bg-sky-50 hover:text-sky-700'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Recent orders</h3>
            <p className="mt-1 text-sm text-slate-500">Track pickup, delivery, and payment status</p>
          </div>
          <button type="button" className="text-sm font-medium text-sky-700">Export</button>
        </div>

        <div className="space-y-3">
          {orders.map((order) => (
            <article key={order.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-slate-900">{order.id}</p>
                    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${order.statusTone}`}>
                      {order.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-700">{order.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{order.date}</p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xl font-bold text-slate-900">{order.total}</p>
                  <p className="mt-1 text-xs text-slate-500">{order.items}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">{order.pickup}</p>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className="rounded-full border border-sky-200 bg-white px-3.5 py-2 text-sm font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-50"
                >
                  {order.action}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {isOrderModalOpen && <NewOrder onClose={() => setIsOrderModalOpen(false)} />}
      {selectedOrder && <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  )
}
