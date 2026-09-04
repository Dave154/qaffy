import { useState } from 'react'
import NewOrder from './NewOrder'
import TopUpModal from './TopUpModal'

const recentOrders = [
  { id: 'QF-1042', status: 'Picked up', total: '₦4,800', date: 'Today' },
  { id: 'QF-1038', status: 'Ready for delivery', total: '₦7,200', date: 'Yesterday' },
  { id: 'QF-1027', status: 'Delivered', total: '₦5,500', date: 'Mon' },
]

export default function Home() {
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false)
  const balance = 18750

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">Good morning, Aisha</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Your laundry, sorted.</h2>
        </div>
        <p className="text-sm text-slate-500">Tuesday, 4 Sep 2026</p>
      </div>

      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-sky-900 to-sky-700 p-5 text-white shadow-lg shadow-slate-200 sm:p-6">
        <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full border-[22px] border-white/10" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-100">Available balance</p>
              <p className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">₦18,750</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-lg backdrop-blur-sm">💳</span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-sky-100">
            <span>Added this month <strong className="ml-1 text-white">₦25,000</strong></span>
            <span>Spent <strong className="ml-1 text-white">₦12,000</strong></span>
          </div>

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setIsTopUpModalOpen(true)} className="flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 shadow-sm">
              Top up
            </button>
            <button type="button" onClick={() => setIsOrderModalOpen(true)} className="flex-1 rounded-full border border-white/40 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm">
              New order
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[22px] border border-sky-100 bg-white p-4 shadow-sm shadow-sky-50">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Plan</p>
          <p className="mt-3 text-lg font-bold text-slate-900">Weekly Plus</p>
          <p className="mt-1 text-sm text-slate-500">4 bags remaining</p>
        </div>

        <div className="rounded-[22px] border border-sky-100 bg-white p-4 shadow-sm shadow-sky-50">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Pickup</p>
          <p className="mt-3 text-lg font-bold text-slate-900">Tomorrow</p>
          <p className="mt-1 text-sm text-slate-500">7:00 AM</p>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">New order</h3>
          <button type="button" onClick={() => setIsOrderModalOpen(true)} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">Start</button>
        </div>

        <div className="mt-4 flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-900">Ready for a fresh start?</p>
            <p className="mt-1 text-sm text-slate-500">Choose a service and tell us how many clothes you have.</p>
          </div>
          <button type="button" onClick={() => setIsOrderModalOpen(true)} className="shrink-0 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-slate-200">
            Create order
          </button>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Recent orders</h3>
          <button type="button" className="text-sm font-medium text-sky-700">View all</button>
        </div>

        <div className="space-y-3">
          {recentOrders.map((order) => (
            <div key={order.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="font-semibold text-slate-900">{order.id}</p>
                <p className="text-xs text-slate-500">{order.date}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-900">{order.total}</p>
                <p className="text-[11px] font-medium text-emerald-600">{order.status}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {isOrderModalOpen && <NewOrder onClose={() => setIsOrderModalOpen(false)} />}
      {isTopUpModalOpen && <TopUpModal currentBalance={balance} onClose={() => setIsTopUpModalOpen(false)} />}
    </div>
  )
}
