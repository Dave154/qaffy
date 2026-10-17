import { data, useFetcher, useOutletContext, useRevalidator } from 'react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { waitUntil } from '@vercel/functions'
import type { Route } from './+types/Home'
import { sql } from '../../../lib/db.server'
import { requireRole } from '../../../lib/auth.server'
import { isSupabaseServerConfigured } from '../../../lib/supabase.server'
import CopyableOrderId from '../../../components/CopyableOrderId'
import { sendCustomerNotification } from '../../../lib/notifications.server'
import { toast } from '../../../lib/toast'

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  let agentProfileId: string | null = null
  let agentName = 'Logistics agent'
  if (isSupabaseServerConfigured) {
    const auth = await requireRole(request, 'logistics')
    if (!auth) return data({ ok: false, message: 'Logistics access is unavailable.' }, { status: 503 })
    agentProfileId = auth.profile.id
    agentName = auth.profile.name ?? agentName
  }

  const formData = await request.formData()
  const orderId = String(formData.get('orderId') ?? '')
  const otp = String(formData.get('otp') ?? '')
    .replace(/\D/g, '')
    .slice(-4)
  const intent = String(formData.get('intent') ?? 'pickup')

  if (intent === 'search') {
    if (otp.length !== 4) return data({ ok: false, intent, otp, message: 'Enter all four digits.' }, { status: 400 })
    try {
      const matches = await sql`
        select
          'active'::text as kind,
          o.id as order_id,
          o.public_order_number,
          coalesce(customer.name, 'Customer') as customer_name,
          customer.qaffy_id as customer_uid,
          location.name as pickup_location_name,
          case when o.status = 'pending_pickup' then 'pickup' else 'delivery' end as handoff_type,
          null::timestamptz as confirmed_at,
          null::text as agent_name
        from orders o
        left join profiles customer on customer.id = o.customer_id
        left join pickup_locations location on location.id = o.pickup_location_id
        where (
          o.status = 'pending_pickup'
          and right(regexp_replace(coalesce(o.pickup_otp, ''), '[^0-9]', '', 'g'), 4) = ${otp}
        ) or (
          o.status = 'out_for_delivery'
          and exists (select 1 from invoices i where i.order_id = o.id and i.status = 'paid')
          and right(regexp_replace(coalesce(o.delivery_otp, ''), '[^0-9]', '', 'g'), 4) = ${otp}
        )
        union all
        select
          'used'::text as kind,
          o.id as order_id,
          o.public_order_number,
          coalesce(customer.name, 'Customer') as customer_name,
          customer.qaffy_id as customer_uid,
          location.name as pickup_location_name,
          used.handoff_type as handoff_type,
          used.confirmed_at,
          used.agent_name
        from logistics_used_otps used
        join orders o on o.id = used.order_id
        left join profiles customer on customer.id = o.customer_id
        left join pickup_locations location on location.id = o.pickup_location_id
        where used.otp_hash = (
            select encode(extensions.hmac(convert_to(${otp}, 'UTF8'), secret, 'sha256'), 'hex')
            from private.logistics_otp_lookup_key
          )
          and used.expires_at > now()
        order by confirmed_at desc nulls first
      `
      return data({ ok: true, intent, otp, matches })
    } catch (error) {
      console.error('Logistics OTP lookup failed:', error)
      return data({ ok: false, intent, otp, message: 'OTP search failed. Please try again.' }, { status: 500 })
    }
  }

  if (intent !== 'pickup' && intent !== 'final_delivery') {
    return data({ ok: false, message: 'This logistics action is not supported.' }, { status: 400 })
  }

  if (!orderId || otp.length !== 4) {
    return data(
      { ok: false, message: `A valid ${intent === 'final_delivery' ? 'final delivery' : intent} OTP is required.` },
      { status: 400 },
    )
  }

  const isPickup = intent === 'pickup'
  const [order] = await sql`
    with matched_order as materialized (
      ${
        isPickup
          ? sql`select id,
                       (select encode(extensions.hmac(
                         convert_to(right(regexp_replace(coalesce(pickup_otp, ''), '[^0-9]', '', 'g'), 4), 'UTF8'),
                         secret, 'sha256'
                       ), 'hex') from private.logistics_otp_lookup_key) as used_otp_hash
                from orders
                where id = ${orderId}
                  and status = 'pending_pickup'
                  and right(regexp_replace(coalesce(pickup_otp, ''), '[^0-9]', '', 'g'), 4) = ${otp}
                for update`
          : sql`select id,
                       (select encode(extensions.hmac(
                         convert_to(right(regexp_replace(coalesce(delivery_otp, ''), '[^0-9]', '', 'g'), 4), 'UTF8'),
                         secret, 'sha256'
                       ), 'hex') from private.logistics_otp_lookup_key) as used_otp_hash
                from orders
                where id = ${orderId}
                  and status = 'out_for_delivery'
                  and exists (
                    select 1 from invoices
                    where invoices.order_id = orders.id
                      and invoices.status = 'paid'
                  )
                  and right(regexp_replace(coalesce(delivery_otp, ''), '[^0-9]', '', 'g'), 4) = ${otp}
                for update`
      }
    ),
    updated_order as (
      update orders o
      set status = ${isPickup ? 'picked_up' : 'delivered'},
          picked = case when ${isPickup} then true else o.picked end,
          picked_up_date = case when ${isPickup} then now() else o.picked_up_date end,
          pickup_otp = case when ${isPickup} then null else o.pickup_otp end,
          delivery_otp = case when ${isPickup} then o.delivery_otp else null end
      from matched_order matched
      where o.id = matched.id
      returning o.id, o.customer_id, o.public_order_number, o.picked_up_date, o.status
    ),
    logged_event as (
      insert into order_logistics_events (order_id, agent_profile_id, event_type)
      select id, ${agentProfileId}, ${isPickup ? 'picked_up' : 'delivered'}
      from updated_order
      returning order_id
    ),
    used_code as (
      insert into logistics_used_otps (
        otp_hash, order_id, handoff_type, agent_profile_id, agent_name, confirmed_at, expires_at
      )
      select matched.used_otp_hash, updated.id, ${isPickup ? 'picked_up' : 'delivered'},
        ${agentProfileId}, ${agentName}, now(), now() + interval '24 hours'
      from matched_order matched
      join updated_order updated on updated.id = matched.id
      returning order_id
    )
    select updated_order.id, updated_order.customer_id, updated_order.public_order_number,
      updated_order.picked_up_date, updated_order.status
    from updated_order
    inner join logged_event on logged_event.order_id = updated_order.id
    inner join used_code on used_code.order_id = updated_order.id
  `

  if (!order) {
    const [used] = await sql`
      select handoff_type, public_order_number
      from logistics_used_otps
      join orders on orders.id = logistics_used_otps.order_id
      where otp_hash = (
          select encode(extensions.hmac(convert_to(${otp}, 'UTF8'), secret, 'sha256'), 'hex')
          from private.logistics_otp_lookup_key
        )
        and logistics_used_otps.order_id = ${orderId}
        and expires_at > now()
      order by confirmed_at desc
      limit 1
    `
    if (used) {
      const usedStatus = used.handoff_type === 'picked_up' ? 'already picked up' : 'already delivered'
      return data({ ok: false, alreadyUsed: true, message: `${usedStatus}: ${used.public_order_number}.` }, { status: 409 })
    }
    const errorMessage = intent === 'final_delivery' ? 'This order cannot be marked delivered yet.' : 'This pickup could not be confirmed.'
    return data({ ok: false, message: errorMessage }, { status: 409 })
  }

  const notification = sendCustomerNotification({
    eventKey: `${isPickup ? 'pickup' : 'delivery'}:${order.id}:confirmed`,
    customerId: order.customer_id,
    notificationType: isPickup ? 'order_picked_up' : 'order_delivered',
    orderId: order.id,
    payload: {
      title: isPickup ? 'Your order was picked up' : 'Your order was delivered',
      body: isPickup ? 'Qaffy has collected your laundry.' : 'Your Qaffy laundry order has been delivered.',
      details: [
        `Order: ${order.public_order_number}`,
        isPickup ? 'Your laundry is now with Qaffy.' : 'Your laundry has been handed back to you.',
      ],
      url: `/orders?order=${encodeURIComponent(order.public_order_number)}`,
      tag: `order:${order.id}:${isPickup ? 'pickup' : 'delivery'}`,
    },
  }).catch((error) => {
    console.error('Customer notification dispatch failed:', error)
  })
  try {
    waitUntil(notification)
  } catch (error) {
    console.error('Background notification scheduling is unavailable:', error)
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
  pickup_location_id: string | null
  pickup_location_name?: string | null
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
  const { orders, logisticsEvents } = useOutletContext<{
    orders: OrderRecord[]
    logisticsEvents: Array<{ order_id: string; event_type: 'picked_up' | 'delivered'; created_at: string }>
  }>()
  const fetcher = useFetcher<typeof action>()
  const lookupFetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()
  const [selectedRange, setSelectedRange] = useState<(typeof filters)[number]>('Today')
  const [selectedLocation, setSelectedLocation] = useState('All locations')
  const [selectedHistory, setSelectedHistory] = useState<'picked_up' | 'delivered'>('picked_up')
  const [otp, setOtp] = useState(['', '', '', ''])
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const locationOptions = useMemo(
    () => ['All locations', ...new Set(orders.map((order) => order.pickup_location_name).filter((name): name is string => Boolean(name)))],
    [orders],
  )

  const matchesSelectedLocation = (order: OrderRecord) => {
    if (selectedLocation === 'All locations') return true
    return order.pickup_location_name === selectedLocation
  }

  const isPickingUp = fetcher.state !== 'idle'
  const pendingOrderId = isPickingUp ? String(fetcher.formData?.get('orderId') ?? '') : null

  useEffect(() => {
    if (fetcher.data?.ok && 'orderId' in fetcher.data) {
      revalidator.revalidate()
      setOtp(['', '', '', ''])
      toast.success('Handoff confirmed successfully.')
      window.requestAnimationFrame(() => inputRefs.current[0]?.focus())
    } else if (fetcher.data && !fetcher.data.ok && 'message' in fetcher.data) {
      toast.error(fetcher.data.message)
    }
  }, [fetcher.data, revalidator.revalidate])

  const enteredOtp = otp.join('').trim()
  const lookupResponse =
    lookupFetcher.data &&
    'intent' in lookupFetcher.data &&
    lookupFetcher.data.intent === 'search' &&
    lookupFetcher.data.otp === enteredOtp
      ? lookupFetcher.data
      : null
  const lookupMatches = lookupResponse?.ok && 'matches' in lookupResponse ? lookupResponse.matches : []
  const activeMatches = lookupMatches.filter((match) => match.kind === 'active')
  const usedMatches = lookupMatches.filter((match) => match.kind === 'used')

  const pendingOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status === 'pending_pickup' && matchesSelectedLocation(order) && isWithinRange(order.created_at, selectedRange),
      ),
    [orders, selectedLocation, selectedRange],
  )

  const pickedUpEvents = useMemo(
    () =>
      logisticsEvents.filter((event) => {
        if (event.event_type !== 'picked_up') return false
        const order = orders.find((item) => item.id === event.order_id)
        return order ? matchesSelectedLocation(order) && isWithinRange(event.created_at, selectedRange) : false
      }),
    [logisticsEvents, orders, selectedLocation, selectedRange],
  )

  const deliveredEvents = useMemo(
    () =>
      logisticsEvents.filter((event) => {
        if (event.event_type !== 'delivered') return false
        const order = orders.find((item) => item.id === event.order_id)
        return order ? matchesSelectedLocation(order) && isWithinRange(event.created_at, selectedRange) : false
      }),
    [logisticsEvents, orders, selectedLocation, selectedRange],
  )

  const pendingDeliveryOrders = useMemo(
    () =>
      orders.filter(
        (order) => order.status === 'out_for_delivery' && matchesSelectedLocation(order) && isWithinRange(order.created_at, selectedRange),
      ),
    [orders, selectedLocation, selectedRange],
  )
  const focusInput = (index: number) => {
    const nextInput = inputRefs.current[index]
    nextInput?.focus()
    nextInput?.select()
  }

  const searchOtp = (code: string) => {
    if (code.length !== 4) return
    lookupFetcher.submit({ intent: 'search', otp: code }, { method: 'post' })
  }

  const updateCode = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '')
    const next = [...otp]

    if (!sanitized) {
      next[index] = ''
      setOtp(next)
      return
    }

    next[index] = sanitized.slice(-1)
    setOtp(next)

    if (index < otp.length - 1) {
      focusInput(index + 1)
    }

    const nextOtp = next.join('').replace(/\D/g, '')
    if (nextOtp.length === otp.length) searchOtp(nextOtp)
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
    if (pasted.length === otp.length) searchOtp(next.join(''))

    const nextIndex = Math.min(pasted.length, otp.length - 1)
    focusInput(nextIndex)
  }

  const submitOrderAction = (orderId: string, action: 'pickup' | 'delivery') => {
    if (isPickingUp) return
    const formData = new FormData()
    formData.set('intent', action === 'delivery' ? 'final_delivery' : 'pickup')
    formData.set('orderId', orderId)
    formData.set('otp', enteredOtp)
    fetcher.submit(formData, { method: 'post' })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex min-w-0 items-center gap-1 rounded-full border border-[#e7e7e7] bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm sm:gap-2 sm:px-3 sm:py-2 sm:text-sm">
          <span className="whitespace-nowrap font-medium">Activity</span>
          <select
            value={selectedRange}
            onChange={(event) => setSelectedRange(event.target.value as (typeof filters)[number])}
            className="min-w-0 rounded-full border border-slate-200 bg-transparent px-1.5 py-0.5 text-xs font-medium text-slate-700 outline-none focus:border-brand-primary sm:px-2 sm:py-1 sm:text-sm"
            aria-label="Activity date range"
          >
            {filters.map((filter) => (
              <option key={filter} value={filter}>
                {presetLabels[filter]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 items-center gap-1 rounded-full border border-[#e7e7e7] bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm sm:gap-2 sm:px-3 sm:py-2 sm:text-sm">
          <span className="whitespace-nowrap font-medium">Location</span>
          <select
            value={selectedLocation}
            onChange={(event) => setSelectedLocation(event.target.value)}
            className="min-w-0 rounded-full border border-slate-200 bg-transparent px-1.5 py-0.5 text-xs font-medium text-slate-700 outline-none focus:border-brand-primary sm:px-2 sm:py-1 sm:text-sm"
            aria-label="Pickup location filter"
          >
            {locationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-[#e7e7e7] bg-white px-4 py-3 text-sm shadow-sm shadow-slate-100 sm:grid-cols-4">
        {[
          { label: 'Picked up', count: pickedUpEvents.length },
          { label: 'Pending pickup', count: pendingOrders.length },
          { label: 'Delivered', count: deliveredEvents.length },
          { label: 'Pending delivery', count: pendingDeliveryOrders.length },
        ].map((metric) => (
          <div key={metric.label} className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-slate-500">{metric.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{metric.count}</span>
          </div>
        ))}
      </div>

      <div className="rounded-[28px] border border-[#e7e7e7] bg-white p-4 shadow-sm shadow-slate-100 md:p-5">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">Search OTP</h2>
        </div>
        <div className="rounded-[24px] border border-[#e7e7e7] bg-[#fafafa] p-4">
          <p className="text-[10px] font-semibold capitalize tracking-[0.22em] text-slate-400">Customer OTP</p>
          <div className="mt-4 flex justify-center gap-2 sm:gap-3">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputRefs.current[index] = element
                }}
                id={`logistics-otp-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(event) => updateCode(index, event.target.value)}
                onKeyDown={(event) => handleOtpKeyDown(index, event)}
                onPaste={handlePaste}
                aria-label={`OTP digit ${index + 1}`}
                className="h-14 w-12 rounded-xl border border-brand-border bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus sm:h-16 sm:w-14"
              />
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-[22px] border border-[#e7e7e7] bg-slate-50 p-4">
          <p className="text-[10px] capitalize tracking-[0.18em] text-slate-400">Result</p>
          <div className="mt-3 space-y-3">
            {lookupFetcher.state !== 'idle' ? (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                Searching OTP...
              </div>
            ) : lookupResponse && !lookupResponse.ok && 'message' in lookupResponse ? (
              <p className="text-sm text-rose-700">
                {typeof lookupResponse.message === 'string' ? lookupResponse.message : 'OTP search failed. Please try again.'}
              </p>
            ) : usedMatches.length > 0 && activeMatches.length === 0 ? (
              usedMatches.map((match) => (
                <div key={`${match.order_id}-${match.confirmed_at}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <p className="text-sm font-semibold text-amber-900">
                    Already {match.handoff_type === 'picked_up' ? 'picked up' : 'delivered'}
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    {match.public_order_number} · {match.customer_name}
                  </p>
                </div>
              ))
            ) : activeMatches.length > 1 || (activeMatches.length > 0 && usedMatches.length > 0) ? (
              <>
                <p className="text-sm text-amber-800">
                  {usedMatches.length > 0
                    ? 'Code conflict. Verify the order, then choose the active match to proceed.'
                    : 'Multiple matches. Confirm the order before proceeding.'}
                </p>
                {[...activeMatches, ...usedMatches].map((match) => (
                  <div key={`${match.kind}-${match.order_id}-${match.handoff_type}`} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{match.public_order_number}</p>
                      <p className="mt-1 text-xs font-medium text-slate-600">{match.customer_name}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Pickup: {match.pickup_location_name ?? 'Location pending'}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Qaffy ID: {match.customer_uid ?? 'Not available'}</p>
                      {match.kind === 'used' ? (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700">
                          Already {match.handoff_type === 'picked_up' ? 'picked up' : 'delivered'} by {match.agent_name}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] font-semibold text-brand-primary">
                          {match.handoff_type === 'pickup' ? 'Pickup confirmation' : 'Delivery confirmation'}
                        </p>
                      )}
                    </div>
                    {match.kind === 'active' && (
                      <button
                        type="button"
                        onClick={() => submitOrderAction(match.order_id, match.handoff_type)}
                        disabled={isPickingUp}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pendingOrderId === match.order_id ? (
                          <>
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Saving...
                          </>
                        ) : match.handoff_type === 'pickup' ? 'Confirm pickup' : 'Complete delivery'}
                      </button>
                    )}
                  </div>
                ))}
              </>
            ) : activeMatches.length === 1 ? (
              activeMatches.map((match) => (
                <div key={`${match.order_id}-${match.handoff_type}`} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{match.public_order_number}</p>
                    <p className="mt-1 text-xs font-medium text-slate-600">{match.customer_name}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Pickup: {match.pickup_location_name ?? 'Location pending'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>UID:</span>
                      {match.customer_uid ? <CopyableOrderId id={match.customer_uid} label="Customer UID" /> : <span>Not available</span>}
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-brand-primary">
                      {match.handoff_type === 'pickup' ? 'Pickup confirmation' : 'Delivery confirmation'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => submitOrderAction(match.order_id, match.handoff_type)}
                    disabled={isPickingUp}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingOrderId === match.order_id ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Saving...
                      </>
                    ) : match.handoff_type === 'pickup' ? 'Confirm pickup' : 'Complete delivery'}
                  </button>
                </div>
              ))
            ) : enteredOtp && lookupResponse ? (
              <p className="text-sm text-slate-500">No active or recently used OTP matches this code.</p>
            ) : (
              <p className="text-sm text-slate-500">Search for a customer OTP to find the order.</p>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-[28px] border border-[#e7e7e7] bg-white p-4 shadow-sm shadow-slate-100 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="whitespace-nowrap font-bold text-slate-900 text-sm sm:text-xl">Handoff history</h2>
          <div className="flex shrink-0 rounded-full text-sm border border-brand-border bg-brand-soft p-px" role="group" aria-label="Handoff history type">
            <button
              type="button"
              onClick={() => setSelectedHistory('picked_up')}
              aria-pressed={selectedHistory === 'picked_up'}
              className={`rounded-full px-1.5 py-0.5  font-semibold transition ${
                selectedHistory === 'picked_up' ? 'bg-brand-primary text-white shadow-sm' : 'text-slate-600 hover:text-brand-primary'
              }`}
            >
              Pickups ({pickedUpEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedHistory('delivered')}
              aria-pressed={selectedHistory === 'delivered'}
              className={`rounded-full px-2 py-1 text-xs font-semibold transition ${
                selectedHistory === 'delivered' ? 'bg-brand-primary text-white shadow-sm' : 'text-slate-600 hover:text-brand-primary'
              }`}
            >
              Deliveries ({deliveredEvents.length})
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {selectedHistory === 'picked_up' ? (
            pickedUpEvents.length === 0 ? (
              <p className="text-sm text-slate-500">No pickup events recorded for this period.</p>
            ) : (
              pickedUpEvents.slice(0, 10).map((event) => {
                const pickedOrder = orders.find((item) => item.id === event.order_id)
                return (
                  <div key={event.order_id + event.created_at} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">{pickedOrder?.public_order_number ?? 'Order unavailable'}</p>
                      <p className="mt-1 text-xs text-slate-500">{pickedOrder?.customer_name ?? 'Customer'}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Pickup: {pickedOrder?.pickup_location_name ?? 'Location pending'}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</span>
                  </div>
                )
              })
            )
          ) : deliveredEvents.length === 0 ? (
            <p className="text-sm text-slate-500">No delivery events recorded for this period.</p>
          ) : (
            deliveredEvents.slice(0, 10).map((event) => {
              const deliveredOrder = orders.find((item) => item.id === event.order_id)
              return (
                <div key={event.order_id + event.created_at} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-800">{deliveredOrder?.public_order_number ?? 'Order unavailable'}</p>
                    <p className="mt-1 text-xs text-slate-500">{deliveredOrder?.customer_name ?? 'Customer'}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</span>
                </div>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
