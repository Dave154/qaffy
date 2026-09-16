import { data, useFetcher, useOutletContext, useRevalidator } from 'react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Route } from './+types/Home'
import { sql } from '../../../lib/db.server'
import { requireRole } from '../../../lib/auth.server'
import { isSupabaseServerConfigured } from '../../../lib/supabase.server'
import CopyableOrderId from '../../../components/CopyableOrderId'
import { getDeliveryAction, isReadyForFinalDelivery } from '../../../lib/orderLifecycle'

// Logistics currently runs in dev-friendly mode, so this action uses the trusted
// server connection while still validating both the order and its pickup OTP.
// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  let agentProfileId: string | null = null
  if (isSupabaseServerConfigured) {
    const auth = await requireRole(request, 'logistics')
    if (!auth) return data({ ok: false, message: 'Logistics access is unavailable.' }, { status: 503 })
    agentProfileId = auth.profile.id
  }

  const formData = await request.formData()
  const orderId = String(formData.get('orderId') ?? '')
  const otp = String(formData.get('otp') ?? '').replace(/\D/g, '').slice(-4)
  const intent = String(formData.get('intent') ?? 'pickup')

  if (intent !== 'pickup' && intent !== 'delivery' && intent !== 'final_delivery') {
    return data({ ok: false, message: 'This logistics action is not supported.' }, { status: 400 })
  }

  if (!orderId || otp.length !== 4) {
    return data({ ok: false, message: `A valid ${intent === 'final_delivery' ? 'final delivery' : intent} OTP is required.` }, { status: 400 })
  }

  const [order] = await sql`
    ${intent === 'final_delivery' ? sql`update orders
    set status = 'delivered', delivery_otp = null
    where id = ${orderId}
      and status = 'out_for_delivery'
      and right(regexp_replace(coalesce(delivery_otp, ''), '[^0-9]', '', 'g'), 4) = ${otp}
    returning id, picked_up_date, status` : intent === 'delivery' ? sql`update orders
    set status = 'out_for_delivery'
    where id = ${orderId}
      and status = 'paid'
      and right(regexp_replace(coalesce(delivery_otp, ''), '[^0-9]', '', 'g'), 4) = ${otp}
    returning id, picked_up_date, status` : sql`update orders
    set status = 'picked_up', picked = true, picked_up_date = now(), pickup_otp = null
    where id = ${orderId}
      and status = 'pending_pickup'
      and right(regexp_replace(coalesce(pickup_otp, ''), '[^0-9]', '', 'g'), 4) = ${otp}
    returning id, picked_up_date, status`}
  `

  if (!order) {
    const errorMessage = intent === 'final_delivery' ? 'This order cannot be marked delivered yet.' : intent === 'delivery' ? 'This order cannot be dispatched yet.' : 'This pickup could not be confirmed.'
    return data({ ok: false, message: errorMessage }, { status: 409 })
  }

  if (intent === 'pickup') {
    await sql`
      insert into order_logistics_events (order_id, agent_profile_id, event_type)
      values (${order.id}, ${agentProfileId}, 'picked_up')
    `
  }

  if (intent === 'final_delivery') {
    await sql`
      insert into order_logistics_events (order_id, agent_profile_id, event_type)
      values (${order.id}, ${agentProfileId}, 'delivered')
    `
  }

  return data({ ok: true, orderId: order.id, status: order.status, pickedUpDate: order.picked_up_date })
}

const filters = ['Today', 'Last week', 'Last month'] as const

const presetLabels: Record<(typeof filters)[number], string> = {
  Today: 'Today',
  'Last week': 'Last week',
  'Last month': 'Last month',
}

type OrderRecord = {
  id: string
  public_order_number: string
  status: 'picked_up' | 'delivered' | 'pending_pickup' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'cancelled'
  pickup_otp: string | null
  delivery_otp: string | null
  customer_id: string
  created_at: string
  notes: string | null
  picked: boolean
  picked_up_date: string | null
  customer_name?: string
  customer_uid?: string | null
}

function isWithinRange(dateIso: string, range: (typeof filters)[number]) {
  const date = new Date(dateIso)
  const now = new Date()

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  if (range === 'Today') return date >= startOfToday && date <= endOfToday

  if (range === 'Last week') {
    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfToday.getDate() - 6)
    return date >= startOfWeek && date <= endOfToday
  }

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return date >= startOfMonth && date <= endOfToday
}

export default function Home() {
  const { orders, logisticsEvents, activeTab, setActiveTab } = useOutletContext<{ orders: OrderRecord[]; logisticsEvents: Array<{ order_id: string; event_type: 'picked_up' | 'delivered'; created_at: string }>; activeTab: 'pickup' | 'delivery'; setActiveTab: (tab: 'pickup' | 'delivery') => void }>()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()
  const [selectedRange, setSelectedRange] = useState<(typeof filters)[number]>('Today')
  const [otp, setOtp] = useState(['', '', '', ''])
  const [message, setMessage] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const isPickingUp = fetcher.state !== 'idle'
  const completedOrderId = fetcher.data && fetcher.data.ok && 'orderId' in fetcher.data ? fetcher.data.orderId : null

  useEffect(() => {
    if (fetcher.data?.ok && 'orderId' in fetcher.data) {
      revalidator.revalidate()
      window.setTimeout(() => {
        setOtp(['', '', '', ''])
        setMessage('')
      }, 0)
    }
  }, [fetcher.data, revalidator])

  const normaliseOtp = (value: string | null | undefined) => {
    const digits = (value ?? '').replace(/\D/g, '')
    if (!digits) return ''
    return digits.length > 4 ? digits.slice(-4) : digits
  }

  const enteredOtp = otp.join('').trim()
  const matchedOrder = useMemo(() => {
    if (enteredOtp.length !== 4) return null

    return (
      orders.find((order) => {
        const storedOtp = normaliseOtp(order.pickup_otp)
        return storedOtp === enteredOtp
      }) ?? null
    )
  }, [enteredOtp, orders])

  const pickedUpOrders = useMemo(
    () => orders.filter((order) => order.picked && isWithinRange(order.picked_up_date ?? order.created_at, selectedRange)),
    [orders, selectedRange],
  )

  const pendingOrders = useMemo(
    () => orders.filter((order) => !order.picked && isWithinRange(order.created_at, selectedRange)),
    [orders, selectedRange],
  )
  const pickedUpEvents = logisticsEvents.filter((event) => event.event_type === 'picked_up')
  const deliveredEvents = logisticsEvents.filter((event) => event.event_type === 'delivered')
  const pendingDeliveryOrders = useMemo(
    () => orders.filter((order) => ['paid', 'out_for_delivery'].includes(order.status) && isWithinRange(order.created_at, selectedRange)),
    [orders, selectedRange],
  )
  const deliveryEnteredOtp = otp.join('').trim()
  const deliveryMatchedOrder = useMemo(() => {
    if (deliveryEnteredOtp.length !== 4) return null
    return orders.find((order) => normaliseOtp(order.delivery_otp) === deliveryEnteredOtp) ?? null
  }, [deliveryEnteredOtp, orders])

  const focusInput = (index: number) => {
    const nextInput = inputRefs.current[index]
    nextInput?.focus()
    nextInput?.select()
  }

  const updateCode = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '')
    const next = [...otp]

    if (!sanitized) {
      next[index] = ''
      setOtp(next)
      setIsSearching(false)
      setMessage('')
      return
    }

    next[index] = sanitized.slice(-1)
    setOtp(next)
    setMessage('')

    if (index < otp.length - 1) {
      focusInput(index + 1)
    }

    const nextOtp = next.join('').replace(/\D/g, '')
    if (nextOtp.length === otp.length) {
      setIsSearching(true)
      window.setTimeout(() => {
        setIsSearching(false)
      }, 350)
    }
  }

  const handleOtpKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      if (otp[index]) {
        event.preventDefault()
        const next = [...otp]
        next[index] = ''
        setOtp(next)
        return
      }

      if (index > 0) {
        event.preventDefault()
        const next = [...otp]
        next[index - 1] = ''
        setOtp(next)
        focusInput(index - 1)
      }
      return
    }

    if (event.key === 'Delete') {
      event.preventDefault()
      const next = [...otp]
      next[index] = ''
      setOtp(next)
      return
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusInput(index - 1)
    }

    if (event.key === 'ArrowRight' && index < otp.length - 1) {
      event.preventDefault()
      focusInput(index + 1)
    }
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, otp.length)
    if (!pasted) return

    const next = [...otp]
    pasted.split('').forEach((digit, offset) => {
      if (offset < next.length) {
        next[offset] = digit
      }
    })

    setOtp(next)

    const nextIndex = Math.min(pasted.length, otp.length - 1)
    focusInput(nextIndex)
  }

  const pickUpOrder = () => {
    if (!matchedOrder || isPickingUp) return
    const formData = new FormData()
    formData.set('orderId', matchedOrder.id)
    formData.set('otp', enteredOtp)
    fetcher.submit(formData, { method: 'post' })
  }

  const deliverOrder = () => {
    if (!deliveryMatchedOrder || isPickingUp) return
    const actionIntent = getDeliveryAction(deliveryMatchedOrder.status)
    const formData = new FormData()
    formData.set('intent', actionIntent)
    formData.set('orderId', deliveryMatchedOrder.id)
    formData.set('otp', deliveryEnteredOtp)
    fetcher.submit(formData, { method: 'post' })
  }

  const summary = {
    Today: {
      pickedUp: pickedUpOrders.filter((order) => isWithinRange(order.created_at, 'Today')).length,
      pending: pendingOrders.filter((order) => isWithinRange(order.created_at, 'Today')).length,
      delivered: deliveredEvents.filter((event) => isWithinRange(event.created_at, 'Today')).length,
      pendingDelivery: pendingDeliveryOrders.filter((order) => isWithinRange(order.created_at, 'Today')).length,
    },
    'Last week': {
      pickedUp: pickedUpOrders.filter((order) => isWithinRange(order.created_at, 'Last week')).length,
      pending: pendingOrders.filter((order) => isWithinRange(order.created_at, 'Last week')).length,
      delivered: deliveredEvents.filter((event) => isWithinRange(event.created_at, 'Last week')).length,
      pendingDelivery: pendingDeliveryOrders.filter((order) => isWithinRange(order.created_at, 'Last week')).length,
    },
    'Last month': {
      pickedUp: pickedUpOrders.filter((order) => isWithinRange(order.created_at, 'Last month')).length,
      pending: pendingOrders.filter((order) => isWithinRange(order.created_at, 'Last month')).length,
      delivered: deliveredEvents.filter((event) => isWithinRange(event.created_at, 'Last month')).length,
      pendingDelivery: pendingDeliveryOrders.filter((order) => isWithinRange(order.created_at, 'Last month')).length,
    },
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-row items-center justify-between gap-2 px-1">
        <div className="shrink-0 rounded-full border border-brand-border bg-brand-soft p-1 shadow-sm">
          <div className="flex gap-1">
            <button type="button" onClick={() => setActiveTab('pickup')} className={`rounded-full px-2.5 py-1 text-xs font-medium transition sm:px-3 sm:py-1.5 sm:text-sm ${activeTab === 'pickup' ? 'bg-brand-primary text-white shadow-sm' : 'text-slate-600 hover:text-brand-primary'}`}>Pickup</button>
            <button type="button" onClick={() => setActiveTab('delivery')} className={`rounded-full px-2.5 py-1 text-xs font-medium transition sm:px-3 sm:py-1.5 sm:text-sm ${activeTab === 'delivery' ? 'bg-brand-primary text-white shadow-sm' : 'text-slate-600 hover:text-brand-primary'}`}>Delivery</button>
          </div>
        </div>
        <label className="flex min-w-0 items-center gap-1 rounded-full border border-[#e7e7e7] bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm sm:gap-2 sm:px-3 sm:py-2 sm:text-sm">
          <span className="whitespace-nowrap font-medium">{activeTab === 'delivery' ? 'Delivery' : 'Pickup'}</span>
          <select
            value={selectedRange}
            onChange={(event) => setSelectedRange(event.target.value as (typeof filters)[number])}
            className="min-w-0 rounded-full border border-slate-200 bg-transparent px-1.5 py-0.5 text-xs font-medium text-slate-700 outline-none focus:border-brand-primary sm:px-2 sm:py-1 sm:text-sm"
            aria-label="Picked up date range"
          >
            {filters.map((filter) => (
              <option key={filter} value={filter}>
                {presetLabels[filter]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[24px] border border-[#e7e7e7] bg-white p-4 shadow-sm shadow-slate-100">
          <div className="inline-flex rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-primary">{activeTab === 'delivery' ? 'Delivered' : 'Picked up'}</div>
          <p className="mt-4 text-3xl font-bold text-slate-900">{activeTab === 'delivery' ? summary[selectedRange].delivered : summary[selectedRange].pickedUp}</p>
          <p className="mt-1 text-sm text-slate-500">{activeTab === 'delivery' ? 'Orders delivered' : 'Orders picked up'} in {selectedRange.toLowerCase()}</p>
        </div>

        <div className="rounded-[24px] border border-[#e7e7e7] bg-white p-4 shadow-sm shadow-slate-100">
          <div className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{activeTab === 'delivery' ? 'Pending delivery' : 'Pending'}</div>
          <p className="mt-4 text-3xl font-bold text-slate-900">{activeTab === 'delivery' ? summary[selectedRange].pendingDelivery : summary[selectedRange].pending}</p>
          <p className="mt-1 text-sm text-slate-500">{activeTab === 'delivery' ? 'Orders awaiting delivery' : 'Orders still pending'} in {selectedRange.toLowerCase()}</p>
        </div>
      </div>

      <div className="rounded-[28px] border border-[#e7e7e7] bg-white p-4 shadow-sm shadow-slate-100 md:p-5">
        {activeTab === 'delivery' ? (
          <>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Search OTP</h2><span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-primary">Delivery</span></div>
            <div className="rounded-[24px] border border-[#e7e7e7] bg-[#fafafa] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Customer OTP</p><div className="mt-4 flex justify-center gap-2 sm:gap-3">{otp.map((digit, index) => <input key={index} ref={(element) => { inputRefs.current[index] = element }} id={`delivery-otp-${index}`} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={(event) => updateCode(index, event.target.value)} onKeyDown={(event) => handleOtpKeyDown(index, event)} onPaste={handlePaste} className="h-14 w-12 rounded-xl border border-brand-border bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus sm:h-16 sm:w-14" />)}</div></div>
            <div className="mt-4 min-h-[76px] rounded-[22px] border border-[#e7e7e7] bg-slate-50 p-4">{deliveryMatchedOrder ? <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3"><div><p className="text-sm font-semibold text-slate-800">{deliveryMatchedOrder.customer_name ?? 'Customer'}</p><p className="mt-1 text-xs font-semibold text-brand-primary">{deliveryMatchedOrder.public_order_number}</p><p className="mt-1 text-xs text-slate-500">{deliveryMatchedOrder.customer_uid ?? 'UID unavailable'}</p><p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{deliveryMatchedOrder.status === 'out_for_delivery' ? 'Ready to complete' : 'Ready to dispatch'}</p></div><button type="button" onClick={deliverOrder} disabled={isPickingUp} className="rounded-full bg-brand-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{isPickingUp ? 'Saving...' : isReadyForFinalDelivery(deliveryMatchedOrder.status) ? 'Complete delivery' : 'Dispatch'}</button></div> : <p className="text-sm text-slate-500">{deliveryEnteredOtp ? 'No order matches this OTP.' : 'Search for a customer OTP to find the order.'}</p>}</div>
            <section className="mt-5"><h2 className="text-xl font-bold text-slate-900">Delivered orders</h2><div className="mt-4 space-y-2">{deliveredEvents.length === 0 ? <p className="text-sm text-slate-500">No delivery events recorded yet.</p> : deliveredEvents.slice(0, 10).map((event) => { const deliveredOrder = orders.find((item) => item.id === event.order_id); return <div key={event.order_id + event.created_at} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm"><div><p className="font-semibold text-slate-800">{deliveredOrder?.public_order_number ?? 'Order unavailable'}</p><p className="mt-1 text-xs text-slate-500">{deliveredOrder?.customer_name ?? 'Customer'}</p></div><span className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</span></div> })}</div></section>
          </>
        ) : (
        <>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Search OTP</h2>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-primary">Pickup</span>
        </div>

        <div className="rounded-[24px] border border-[#e7e7e7] bg-[#fafafa] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Customer OTP</p>
          <div className="mt-4 flex justify-center gap-2 sm:gap-3">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputRefs.current[index] = element
                }}
                id={`pickup-otp-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(event) => updateCode(index, event.target.value)}
                onKeyDown={(event) => handleOtpKeyDown(index, event)}
                onPaste={handlePaste}
                className="h-14 w-12 rounded-xl border border-brand-border bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus sm:h-16 sm:w-14"
              />
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-[22px] border border-[#e7e7e7] bg-slate-50 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Result</p>
          <div className="mt-3 min-h-[72px]">
            {isSearching ? (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                Searching OTP...
              </div>
            ) : matchedOrder ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{matchedOrder.public_order_number}</p>
                  <p className="mt-1 text-xs font-medium text-slate-600">{matchedOrder.customer_name ?? 'Customer'}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>UID:</span>
                    {matchedOrder.customer_uid ? <CopyableOrderId id={matchedOrder.customer_uid} label="Customer UID" /> : <span>Not available</span>}
                  </div>
                </div>
                {matchedOrder.picked ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                    Picked
                  </span>
                ) : (
                  <button type="button" onClick={pickUpOrder} disabled={isPickingUp} className="rounded-full bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-wait disabled:opacity-60">
                    {isPickingUp ? 'Saving...' : 'Pick up'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{enteredOtp ? 'No order matches this OTP.' : 'Search for a customer OTP to find the order.'}</p>
            )}
          </div>
        </div>

        {(message || completedOrderId || (fetcher.data && !fetcher.data.ok && 'message' in fetcher.data)) && (
          <p role="status" className="mt-3 text-sm text-slate-600">
            {completedOrderId ? 'Pickup confirmed successfully.' : fetcher.data && !fetcher.data.ok && 'message' in fetcher.data ? fetcher.data.message : message}
          </p>
        )}
        <section className="mt-5"><h2 className="text-xl font-bold text-slate-900">Picked up orders</h2><div className="mt-4 space-y-2">{pickedUpEvents.length === 0 ? <p className="text-sm text-slate-500">No pickup events recorded yet.</p> : pickedUpEvents.slice(0, 10).map((event) => { const pickedOrder = orders.find((item) => item.id === event.order_id); return <div key={event.order_id + event.created_at} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm"><div><p className="font-semibold text-slate-800">{pickedOrder?.public_order_number ?? 'Order unavailable'}</p><p className="mt-1 text-xs text-slate-500">{pickedOrder?.customer_name ?? 'Customer'}</p></div><span className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</span></div> })}</div></section>
        </>
        )}
      </div>
    </div>
  )
}
