import { useState } from 'react'
import { ArrowUpRight, ClipboardList, CreditCard, FileText, Gift, Settings2, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import NewOrder from './NewOrder'
import TopUpModal from './TopUpModal'
import { useCustomerStore } from '../customer-store-hook'
import BubblyBackground from '../../../components/BubblyBackground'

export default function Home() {
  const { balance, customerName, orders, subscription } = useCustomerStore()
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false)
  const activeOrderCount = orders.filter((order) => order.status !== 'Delivered').length

  return (
    <div className="space-y-6 pb-8">
      <div className="relative flex flex-col justify-end gap-1 overflow-hidden pb-5 sm:flex-row sm:items-end sm:justify-between">
        <BubblyBackground contained count={22} opacity={0.42} scale={1.8} />
        <div>
          <p className="relative text-base font-semibold text-[#00b7d4]">Good morning, {customerName}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Overview</h2>
          <p className="mt-1 text-sm text-[#505959]">Your laundry, sorted.</p>
        </div>
        <p className="text-sm text-slate-500">Tuesday, 4 Sep 2026</p>
      </div>

      <section className="relative rounded-2xl overflow-hidden border border-[#e7e7e7] bg-[#f8f8f8] p-5 sm:p-6">
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{subscription ? 'Subscription' : 'Available balance'}</p>
              {subscription ? (
                <p className="mt-3 text-3xl font-semibold capitalize tracking-tight text-slate-900 sm:text-4xl">
                  {subscription.name} {subscription.billingPeriod}
                </p>
              ) : (
                <>
                  <p className={`mt-3 text-3xl font-semibold tracking-tight sm:text-4xl ${balance < 0 ? 'text-[#d9364e]' : 'text-slate-900'}`}>₦{Math.abs(balance).toLocaleString()}</p>
                  {balance < 0 && <p className="mt-1 text-sm font-medium text-[#d9364e]">Outstanding order balance</p>}
                </>
              )}
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e1e1e1] bg-white text-sm">{subscription ? '✦' : '₦'}</span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span>Added this month <strong className="ml-1 text-slate-800">₦25,000</strong></span>
            <span>Spent <strong className="ml-1 text-slate-800">₦12,000</strong></span>
          </div>

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setIsTopUpModalOpen(true)} className="flex-1 rounded-lg bg-[#00b7d4] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#007f99]">
              Top up
            </button>
            <button type="button" onClick={() => setIsOrderModalOpen(true)} className="flex-1 rounded-lg border border-[#00b7d4] bg-white px-4 py-2.5 text-sm font-semibold text-[#00b7d4] transition hover:bg-[#e8fbfd]">
              New order
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="border rounded-2xl border-[#e7e7e7] bg-white p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Plan</p>
          <p className="mt-3 text-lg font-semibold text-slate-900">Weekly Plus</p>
          <p className="mt-1 text-sm text-slate-500">4 bags remaining</p>
        </div>

        <div className="border rounded-2xl border-[#e7e7e7] bg-white p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Active orders</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{activeOrderCount}</p>
          <p className="mt-1 text-sm text-slate-500">In progress</p>
        </div>

        <div className="border rounded-2xl border-[#e7e7e7] bg-white p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Pickup</p>
          <p className="mt-3 text-lg font-bold text-slate-900">Tomorrow</p>
          <p className="mt-1 text-sm text-slate-500">7:00 AM</p>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e7e7e7] bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Quick access</h3>
            <p className="mt-1 text-sm text-slate-500">Go straight to any part of your laundry account.</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-[#8e9a9a]" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { to: '/orders', label: 'Orders', icon: ClipboardList },
            { to: '/transactions', label: 'Transactions', icon: CreditCard },
            { to: '/plans', label: 'Plans', icon: Sparkles },
            { to: '/invoice', label: 'Invoice', icon: FileText },
            { to: '/otp', label: 'Pickup OTP', icon: Gift },
            { to: '/settings', label: 'Settings', icon: Settings2 },
          ].map((item) => {
            const Icon = item.icon

            return <Link key={item.to} to={item.to} className="flex min-h-20 flex-col justify-between rounded-2xl border border-slate-200 bg-[#fafafa] p-3 text-left transition hover:border-[#a8eaf0] hover:bg-[#f0fcfd]"><Icon className="h-4 w-4 text-[#00b7d4]" /><span className="text-xs font-semibold text-slate-700">{item.label}</span></Link>
          })}
        </div>
      </section>

      <section className="border rounded-2xl border-[#e7e7e7] bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">New order</h3>
          <button type="button" onClick={() => setIsOrderModalOpen(true)} className="rounded-lg bg-[#e8fbfd] px-2.5 py-1 text-xs font-medium text-[#00b7d4]">Start</button>
        </div>

        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-[#e7e7e7] bg-[#fafafa] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-900">Ready for a fresh start?</p>
            <p className="mt-1 text-sm text-slate-500">Choose a service and tell us how many clothes you have.</p>
          </div>
          <button type="button" onClick={() => setIsOrderModalOpen(true)} className="shrink-0 rounded-lg bg-[#00b7d4] px-4 py-3 text-sm font-semibold text-white">
            Create order
          </button>
        </div>
      </section>

      <section className="border rounded-2xl border-[#e7e7e7] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Recent orders</h3>
          <button type="button" className="text-sm font-medium text-[#00b7d4]">View all</button>
        </div>

        <div className="space-y-3">
          {orders.slice(0, 3).map((order) => (
            <div key={order.id} className="flex items-center justify-between border-b border-[#eeeeee] p-3 last:border-b-0">
              <div>
                <p className="font-semibold text-slate-900">{order.id}</p>
                <p className="text-xs text-slate-500">{order.date}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-900">₦{order.total.toLocaleString()}</p>
                <p className="text-[11px] font-medium text-[#418d87]">{order.status}</p>
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
