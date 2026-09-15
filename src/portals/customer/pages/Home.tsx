import { useState } from 'react'
import { data } from 'react-router'
import type { Route } from './+types/Home'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { creditWallet } from '../../../lib/wallet.server'
import { ArrowUpRight, ClipboardList, CreditCard, FileText, Gift, Settings2, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import NewOrder from './NewOrder'
import TopUpModal from './TopUpModal'
import CopyableOrderId from '../../../components/CopyableOrderId'
import { useCustomerStore } from '../customer-store-hook'
import BubblyBackground from '../../../components/BubblyBackground'
import PlanEndingBanner from '../../../components/PlanEndingBanner'

// Creates a pending top-up payment, then credits the wallet server-side.
// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })

  const { supabase: serverSupabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await serverSupabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const formData = await request.formData()
  const amount = Number(formData.get('amount'))
  if (!Number.isFinite(amount) || amount < 1000) return data({ ok: false, message: 'Minimum top-up is ₦1,000.' }, { status: 400, headers })

  const reference = `topup_${crypto.randomUUID()}`
  try {
    const result = await creditWallet(userData.user.id, 'one_off', amount, reference)
    return data({ ok: true, newBalance: result.newBalance }, { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Top-up failed.'
    return data({ ok: false, message }, { status: 500, headers })
  }
}

export default function Home() {
  const { balance, subscriptionBalance, customerName, orders, subscription, subscriptionEndDate } = useCustomerStore()
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false)
  const activeOrderCount = orders.filter((order) => order.status !== 'Delivered').length
  const pendingOrders = orders
    .filter((order) => order.paymentStatus === 'Pending' && !order.isSubscriptionOrder)
    .map((order) => ({ id: order.id, amount: order.total }))
  const getVisibleOtp = (order: typeof orders[number]) => {
    if (order.status === 'Awaiting pickup') return order.pickupOtp
    if (order.status === 'In progress') return order.deliveryOtp ?? ''
    return ''
  }
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())

  const handleTopUp = async (amount: number) => {
    const response = await fetch('/?index', { method: 'POST', body: new URLSearchParams({ amount: String(amount) }) })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.ok) throw new Error(result?.message ?? 'Top-up failed.')
    window.location.reload()
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="relative flex flex-col justify-end gap-1 overflow-hidden pb-5 sm:flex-row sm:items-end sm:justify-between">
        <BubblyBackground contained count={22} opacity={0.42} scale={1.8} />
        <div>
          <p className="relative text-base font-semibold text-brand-primary">Good morning, {customerName}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Overview</h2>
          <p className="mt-1 text-sm text-[#505959]">Your laundry, sorted.</p>
        </div>
        <p className="text-sm text-slate-500">{today}</p>
      </div>

      {subscription && <PlanEndingBanner planName={`${subscription.name} ${subscription.billingPeriod}`} endDate={subscriptionEndDate} />}

      <section className="relative rounded-2xl overflow-hidden border border-[#e7e7e7] bg-[#f8f8f8] p-5 sm:p-6">
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{subscription ? 'Subscription' : 'Available balance'}</p>
              {subscription ? (
                <>
                  <p className="mt-3 text-3xl font-semibold capitalize tracking-tight text-slate-900 sm:text-4xl">
                    {subscription.name} {subscription.billingPeriod}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-600">Available balance: ₦{balance < 0 ? '-' : ''}{Math.abs(balance).toLocaleString()}</p>
                </>
              ) : (
                <>
                  <p className={`mt-3 text-3xl font-semibold tracking-tight sm:text-4xl ${balance < 0 ? 'text-brand-primary' : 'text-slate-900'}`}>₦{balance < 0 ? '-' : ''}{Math.abs(balance).toLocaleString()}</p>
                  {balance < 0 && <p className="mt-1 text-sm font-medium text-brand-primary">Outstanding order balance</p>}
                </>
              )}
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e1e1e1] bg-white text-sm">{subscription ? '✦' : '₦'}</span>
          </div>

          {subscriptionBalance < 0 && <p className="mt-2 text-sm font-medium text-brand-primary">Subscription debt: ₦{Math.abs(subscriptionBalance).toLocaleString()}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span>Active orders <strong className="ml-1 text-slate-800">{activeOrderCount}</strong></span>
          </div>

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setIsTopUpModalOpen(true)} className="flex-1 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-primary-hover">
              Top up
            </button>
            <button type="button" onClick={() => setIsOrderModalOpen(true)} className="flex-1 rounded-lg border border-brand-primary bg-white px-4 py-2.5 text-sm font-semibold text-brand-primary transition hover:bg-brand-soft">
              New order
            </button>
          </div>
        </div>
      </section>

        <section className="rounded-2xl border border-[#e7e7e7] bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Recent orders</h3>
              <p className="mt-1 text-sm text-slate-500">Track pickup, delivery, and payment status</p>
            </div>
            <Link to="/orders" className="text-sm font-medium text-brand-primary">View all</Link>
          </div>

          <div className="space-y-3">
            {orders.slice(0, 3).map((order) => (
              <article key={order.id} className="relative border-b border-[#eeeeee] bg-white p-4 last:border-b-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="pr-28">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-slate-900"><CopyableOrderId id={order.id} /></p>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${order.statusTone}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
                        <span>{order.status}</span>
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-700">{order.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{order.date}</p>
                  </div>

                  <div className="absolute right-4 top-4 text-right">
                    {getVisibleOtp(order) ? (
                      <>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-primary">{order.status === 'Awaiting pickup' ? 'Pickup OTP' : 'Delivery OTP'}</p>
                        <p className="mt-2 text-xl font-bold tracking-[0.12em] text-brand-primary">{getVisibleOtp(order)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-slate-900">₦{order.total.toLocaleString()}</p>
                        <p className="mt-1 text-xs text-slate-500">{order.items} clothes</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600">{order.pickup}</p>
                  <Link to="/orders" className="rounded-lg border border-brand-border bg-white px-3.5 py-2 text-center text-sm font-semibold text-brand-primary hover:bg-brand-soft">View order</Link>
                </div>
              </article>
            ))}
            {orders.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No recent orders yet.</p>}
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

            return <Link key={item.to} to={item.to} className="flex min-h-20 flex-col justify-between rounded-2xl border border-slate-200 bg-[#fafafa] p-3 text-left transition hover:border-brand-border hover:bg-brand-soft-hover"><Icon className="h-4 w-4 text-brand-primary" /><span className="text-xs font-semibold text-slate-700">{item.label}</span></Link>
          })}
        </div>
      </section>

      {isOrderModalOpen && <NewOrder onClose={() => setIsOrderModalOpen(false)} />}
      {isTopUpModalOpen && <TopUpModal currentBalance={balance} subscriptionBalance={subscriptionBalance} pendingOrders={pendingOrders} onTopUp={handleTopUp} onClose={() => setIsTopUpModalOpen(false)} />}
    </div>
  )
}
