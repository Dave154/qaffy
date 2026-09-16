import { useState } from 'react'
import NewOrder from './NewOrder'
import OrderDetailModal from './OrderDetailModal'
import CopyableOrderId from '../../../components/CopyableOrderId'
import ProtectedOtp from '../../../components/ProtectedOtp'
import { type CustomerOrder } from '../customer-store'
import { useCustomerStore } from '../customer-store-hook'
import { data, useSearchParams } from 'react-router'
import type { Route } from './+types/Orders'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { chargeSubscriptionInvoice, debitOneOffInvoice, InsufficientBalanceError } from '../../../lib/wallet.server'

// Charges subscription overflow from the authenticated customer's subscription balance.
// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })

  const { supabase: serverSupabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await serverSupabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const formData = await request.formData()
  const invoiceId = String(formData.get('invoiceId') ?? '')
  const balanceType = String(formData.get('balanceType') ?? 'subscription')
  if (!invoiceId) return data({ ok: false, message: 'Invoice is missing.' }, { status: 400, headers })

  try {
    if (balanceType === 'one_off') {
      await debitOneOffInvoice(userData.user.id, invoiceId)
      return data({ ok: true }, { headers })
    }
    await chargeSubscriptionInvoice(userData.user.id, invoiceId)
    return data({ ok: true }, { headers })
  } catch (error) {
    if (error instanceof InsufficientBalanceError) return data({ ok: false, message: 'Your subscription balance is too low for the extra units.' }, { status: 402, headers })
    const message = error instanceof Error ? error.message : 'Unknown wallet error'
    return data({ ok: false, message: `The extra charge could not be paid from your wallet: ${message}` }, { status: 500, headers })
  }
}

export default function Orders() {
  const { orders } = useCustomerStore()
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeFilter, setActiveFilter] = useState(() => searchParams.get('filter') ?? 'All orders')
  const requestedOrderId = searchParams.get('order')
  const requestedOrder = requestedOrderId ? orders.find((order) => order.publicOrderNumber === requestedOrderId || order.id === requestedOrderId) ?? null : null
  const orderDetails = requestedOrder ?? selectedOrder

  const closeOrderDetails = () => {
    setSelectedOrder(null)
    if (searchParams.has('order')) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('order')
      setSearchParams(nextParams, { replace: true })
    }
  }

  const filteredOrders = orders.filter((order) => {
    if (activeFilter === 'Active') return order.status !== 'Delivered'
    if (activeFilter === 'Delivered') return order.status === 'Delivered'
    if (activeFilter === 'Pending payment') return order.paymentStatus === 'Pending'
    if (activeFilter === 'Needs attention') return Boolean(order.mismatch) && order.paymentStatus === 'Pending'
    return true
  })

  const stats = [
    { label: 'Total orders', value: String(orders.length), helper: 'In your history' },
    { label: 'Active', value: String(orders.filter((order) => order.status !== 'Delivered').length).padStart(2, '0'), helper: 'In progress' },
    { label: 'Delivered', value: String(orders.filter((order) => order.status === 'Delivered').length), helper: 'Completed' },
    // { label: 'Spend', value: `₦${orders.reduce((total, order) => total + order.total, 0).toLocaleString()}`, helper: 'Across all orders' },
  ]

  const getAmountLabel = (order: typeof orders[number]) => {
    if (order.total > 0) return `₦${order.total.toLocaleString()}`
    if (order.status === 'In progress') return 'Final billing pending'
    if (order.isSubscriptionOrder && ['Ready for delivery', 'Delivered'].includes(order.status)) return 'Covered by plan'
    return 'No charge yet'
  }
  const getVisibleOtp = (order: typeof orders[number]) => {
    if (order.status === 'Awaiting pickup') return order.pickupOtp
    if (order.status !== 'Delivered') return order.deliveryOtp ?? ''
    return ''
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Orders</h2>
        </div>
        <button type="button" onClick={() => setIsOrderModalOpen(true)} className="rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-primary-hover">
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

      <section className="rounded-2xl border border-[#e7e7e7] bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4">
          <div className="scrollbar-hidden flex flex-nowrap gap-2 overflow-x-auto pb-1">
            {['All orders', 'Active', 'Delivered', 'Pending payment', 'Needs attention'].map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                aria-pressed={activeFilter === filter}
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                  activeFilter === filter
                    ? 'border-brand-primary text-brand-primary'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {activeFilter === filter && <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" aria-hidden="true" />}
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <article key={order.id} className="border-b border-[#eeeeee] bg-white p-4 last:border-b-0">
              <div className="flex flex-row flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-slate-900"><CopyableOrderId id={order.publicOrderNumber} /></p>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${order.statusTone}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
                      {order.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-700">{order.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{order.date}</p>
                  {order.mismatch && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left"><p className="text-xs font-semibold text-amber-800">{order.mismatch.direction === 'over' ? 'Extra items confirmed' : 'Fewer items confirmed'}</p><p className="mt-1 text-xs text-amber-700">{order.mismatch.detail}</p></div>}
                </div>

                <div className="ml-auto shrink-0 text-right">
                  {getVisibleOtp(order) ? (
                    <div className="flex flex-col items-start sm:items-end">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-primary">{order.status === 'Awaiting pickup' ? 'Pickup OTP' : 'Delivery OTP'}</p>
                      <div className="mt-2">
                        <ProtectedOtp value={getVisibleOtp(order)} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="max-w-40 text-right text-sm font-bold text-slate-900">{getAmountLabel(order)}</p>
                      <p className="mt-1 text-xs text-slate-500">{order.items} clothes</p>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-row flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <p className="text-sm text-slate-600">{order.pickup}</p>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                    className="rounded-lg border border-brand-border bg-white px-3.5 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-soft"
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
      {orderDetails && <OrderDetailModal order={orderDetails} onClose={closeOrderDetails} />}
    </div>
  )
}
