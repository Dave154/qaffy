import { Check } from 'lucide-react'
import { data, useFetcher, useOutletContext, useRevalidator } from 'react-router'
import { useEffect, useMemo, useState } from 'react'
import type { Route } from './+types/Delivery'
import { sql } from '../../../lib/db.server'
import CopyableOrderId from '../../../components/CopyableOrderId'

type DeliveryOrder = {
  id: string
  status: string
  delivery_otp: string | null
  customer_name?: string
  customer_uid?: string | null
}

// Logistics currently runs in dev-friendly mode, so this action uses the trusted
// server connection while validating the delivery OTP and current order state.
// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const orderId = String(formData.get('orderId') ?? '')
  const otp = String(formData.get('otp') ?? '').replace(/\D/g, '').slice(-4)

  if (!orderId || otp.length !== 4) {
    return data({ ok: false, message: 'A valid delivery OTP is required.' }, { status: 400 })
  }

  const [order] = await sql`
    update orders
    set status = 'delivered'
    where id = ${orderId}
      and status in ('picked_up', 'at_vendor', 'invoiced', 'paid', 'out_for_delivery')
      and right(regexp_replace(coalesce(delivery_otp, ''), '[^0-9]', '', 'g'), 4) = ${otp}
    returning id
  `

  if (!order) return data({ ok: false, message: 'This delivery could not be confirmed.' }, { status: 409 })
  await sql`
    insert into order_logistics_events (order_id, event_type)
    values (${order.id}, 'delivered')
  `
  return data({ ok: true, orderId: order.id })
}

export default function Delivery() {
  const { orders, logisticsEvents } = useOutletContext<{
    orders: DeliveryOrder[]
    logisticsEvents: Array<{ order_id: string; event_type: 'picked_up' | 'delivered'; created_at: string }>
  }>()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()
  const [otp, setOtp] = useState(['', '', '', ''])
  const [message, setMessage] = useState('')
  const enteredOtp = otp.join('')
  const isDelivering = fetcher.state !== 'idle'

  useEffect(() => {
    if (fetcher.data?.ok) revalidator.revalidate()
  }, [fetcher.data, revalidator])

  const normaliseOtp = (value: string | null | undefined) => {
    const digits = (value ?? '').replace(/\D/g, '')
    return digits.length > 4 ? digits.slice(-4) : digits
  }

  const matchedOrder = useMemo(() => {
    if (enteredOtp.length !== 4) return null
    return orders.find((order) => normaliseOtp(order.delivery_otp) === enteredOtp) ?? null
  }, [enteredOtp, orders])

  const deliveredOrderIds = new Set(logisticsEvents.filter((event) => event.event_type === 'delivered').map((event) => event.order_id))
  const deliveredEvents = logisticsEvents.filter((event) => event.event_type === 'delivered')

  const updateCode = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[index] = sanitized
    setOtp(next)
    setMessage('')
    if (sanitized && index < otp.length - 1) document.getElementById(`delivery-otp-${index + 1}`)?.focus()
  }

  const confirmDelivery = () => {
    if (!matchedOrder || isDelivering) {
      setMessage(enteredOtp.length === 4 ? 'No delivery was found for that OTP.' : 'Enter a customer OTP to search.')
      return
    }
    const formData = new FormData()
    formData.set('orderId', matchedOrder.id)
    formData.set('otp', enteredOtp)
    fetcher.submit(formData, { method: 'post' })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[24px] border border-[#e7e7e7] bg-white p-4 shadow-sm shadow-slate-100">
          <div className="inline-flex rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-primary">Delivered</div>
          <p className="mt-4 text-3xl font-bold text-slate-900">{deliveredEvents.length}</p>
        </div>
        <div className="rounded-[24px] border border-[#e7e7e7] bg-white p-4 shadow-sm shadow-slate-100">
          <div className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">Pending</div>
          <p className="mt-4 text-3xl font-bold text-slate-900">{orders.filter((order) => !deliveredOrderIds.has(order.id) && order.delivery_otp).length}</p>
        </div>
      </div>

      <section className="rounded-[28px] border border-[#e7e7e7] bg-white p-4 shadow-sm shadow-slate-100 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Search OTP</h2>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-primary">Delivery</span>
        </div>
        <div className="rounded-[24px] border border-[#e7e7e7] bg-[#fafafa] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Customer OTP</p>
          <div className="mt-4 flex justify-center gap-2 sm:gap-3">
            {otp.map((digit, index) => <input key={index} id={`delivery-otp-${index}`} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={(event) => updateCode(index, event.target.value)} className="h-14 w-12 rounded-xl border border-brand-border bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus sm:h-16 sm:w-14" />)}
          </div>
        </div>
        <div className="mt-4 min-h-[76px] rounded-[22px] border border-[#e7e7e7] bg-slate-50 p-4">
          {matchedOrder ? <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{matchedOrder.customer_name ?? 'Customer'}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">UID: {matchedOrder.customer_uid ? <CopyableOrderId id={matchedOrder.customer_uid} label="Customer UID" /> : 'Not available'}</div>
            </div>
            {deliveredOrderIds.has(matchedOrder.id) ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><Check size={14} /> Delivered</span> : <button type="button" onClick={confirmDelivery} disabled={isDelivering} className="rounded-full bg-brand-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{isDelivering ? 'Saving...' : 'Deliver'}</button>}
          </div> : <p className="text-sm text-slate-500">{message || 'Search with a valid delivery OTP.'}</p>}
        </div>
        {fetcher.data && !fetcher.data.ok && 'message' in fetcher.data && <p role="alert" className="mt-3 text-sm text-red-600">{fetcher.data.message}</p>}
      </section>

      <section className="rounded-[28px] border border-[#e7e7e7] bg-white p-4 shadow-sm shadow-slate-100 md:p-5">
        <h2 className="text-xl font-bold text-slate-900">Delivered orders</h2>
        <div className="mt-4 space-y-2">
          {deliveredEvents.length === 0 ? <p className="text-sm text-slate-500">No delivery events recorded yet.</p> : deliveredEvents.slice(0, 10).map((event) => {
            const order = orders.find((item) => item.id === event.order_id)
            return <div key={event.order_id + event.created_at} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm"><span className="font-semibold text-slate-800">{order?.customer_name ?? 'Customer'}</span><span className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</span></div>
          })}
        </div>
      </section>
    </div>
  )
}
