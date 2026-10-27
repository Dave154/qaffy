import {
  data,
  Form,
  Link,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useRevalidator,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from 'react-router'
import { useEffect, useRef, useState } from 'react'
import { waitUntil } from '@vercel/functions'
import { ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, RefreshCw, SlidersHorizontal, X } from 'lucide-react'
import type { Route } from './+types/Orders'
import { MultiSortManager, SortColumnHeader } from '../../../components/admin/MultiSortControls'
import { requireRole } from '../../../lib/auth.server'
import { getInitialReceivedCounts } from '../../../lib/order-counts'
import { sql } from '../../../lib/db.server'
import { toast } from '../../../lib/toast'
import { isReadyForDispatch, isReadyForFinalDelivery } from '../../../lib/orderLifecycle'
import { sendCustomerNotification } from '../../../lib/notifications.server'
import { issueReferralRewards, sendReferralRewardNotifications } from '../../../lib/wallet.server'
import { loadAdminOrders } from '../../../lib/admin-orders.server'

type AdminOrder = {
  id: string
  public_order_number: string
  created_at: string
  picked_up_date: string | null
  delivery_date: string | null
  pickup_otp?: string | null
  delivery_otp?: string | null
  order_type: 'wash' | 'wash_iron' | 'mixed'
  status: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  clothes_count_customer: number
  item_count: number
  clothes_count_vendor: number | null
  notes: string | null
  is_subscription_order: boolean
  customer: { id: string; name: string | null; qaffy_id: string | null; email: string | null; phone: string | null } | null
  location: { name: string } | null
  items: Array<{
    id: string
    quantity: number
    confirmed_quantity: number | null
    service: 'wash' | 'iron' | 'wash_iron'
    unit_price: number
    category: { name: string } | null
  }>
  invoice: {
    amount: number
    status: 'unpaid' | 'paid'
    payment_method: 'wallet' | 'offline' | null
    paid_at: string | null
    billing_breakdown: BillingBreakdown | null
  } | null
  mismatches: Array<{ id: string; details: unknown }>
}
type BillingBreakdown = { coveredUnits: number; subscriberAmount: number; regularAmount: number }
type SortColumn =
  'created' | 'order' | 'pickup' | 'delivery' | 'customer' | 'qaffy_id' | 'order_type' | 'location' | 'items' | 'payment' | 'status'
type SortRule = { column: SortColumn; direction: 'asc' | 'desc' }

const sortableColumns: Array<{ value: SortColumn; label: string }> = [
  { value: 'created', label: 'Created' },
  { value: 'order', label: 'Order ID' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'customer', label: 'Customer' },
  { value: 'qaffy_id', label: 'Qaffy ID' },
  { value: 'order_type', label: 'Order type' },
  { value: 'location', label: 'Location' },
  { value: 'items', label: 'Items' },
  { value: 'payment', label: 'Payment' },
  { value: 'status', label: 'Status' },
]

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data({ ok: false, message: 'Please sign in again.' }, { status: 401 })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  const orderId = String(formData.get('orderId') ?? '')
  const orderActions = [
    'cancel-order',
    'mark-picked-up',
    'dispatch-order',
    'mark-delivered',
    'record-offline-payment-and-complete',
  ] as const
  if (
    !orderActions.includes(intent as (typeof orderActions)[number]) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)
  ) {
    return data({ ok: false, intent, orderId, message: 'Invalid order action.' }, { status: 400, headers: auth.headers })
  }

  try {
    if (intent === 'mark-picked-up') {
      const [order] = await sql`
        with updated_order as (
          update orders
          set status = 'picked_up',
              picked = true,
              picked_up_date = now(),
              pickup_otp = null
          where id = ${orderId}
            and status = 'pending_pickup'
            and picked = false
          returning id, customer_id, public_order_number
        ),
        handoff_event as (
          insert into order_logistics_events (order_id, agent_profile_id, event_type)
          select id, null, 'picked_up'
          from updated_order
          returning order_id
        ),
        audit_event as (
          insert into admin_audit_events (admin_profile_id, action, entity_type, entity_id, metadata)
          select ${auth.profile.id}, 'admin_order_marked_picked_up', 'order', id,
            jsonb_build_object('from_status', 'pending_pickup', 'to_status', 'picked_up')
          from updated_order
          returning entity_id
        )
        select updated_order.id, updated_order.customer_id, updated_order.public_order_number
        from updated_order
        join handoff_event on handoff_event.order_id = updated_order.id
        join audit_event on audit_event.entity_id = updated_order.id
      `
      if (!order) {
        return data(
          { ok: false, intent, orderId, message: 'This order is no longer awaiting pickup.' },
          { status: 409, headers: auth.headers },
        )
      }

      scheduleAdminOrderNotification(
        sendCustomerNotification({
          eventKey: `pickup:${order.id}:confirmed`,
          customerId: order.customer_id,
          notificationType: 'order_picked_up',
          orderId: order.id,
          payload: {
            title: 'Your order was picked up',
            body: 'Qaffy has collected your laundry.',
            details: [`Order: ${order.public_order_number}`, 'Your laundry is now with Qaffy.'],
            url: `/orders?order=${encodeURIComponent(order.public_order_number)}`,
            tag: `order:${order.id}:pickup`,
          },
        }),
      )
      return data({ ok: true, intent, orderId }, { headers: auth.headers })
    }

    if (intent === 'dispatch-order') {
      const [order] = await sql`
        with updated_order as (
          update orders
          set status = 'out_for_delivery'
          where id = ${orderId}
            and (
              (status = 'paid' and exists (
                select 1 from invoices
                where invoices.order_id = orders.id and invoices.status = 'paid'
              ))
              or
              (status = 'invoiced' and exists (
                select 1 from invoices
                where invoices.order_id = orders.id and invoices.status = 'unpaid'
              ))
            )
          returning id, customer_id, public_order_number
        ),
        audit_event as (
          insert into admin_audit_events (admin_profile_id, action, entity_type, entity_id, metadata)
          select ${auth.profile.id}, 'admin_order_dispatched', 'order', updated_order.id,
            jsonb_build_object('from_status', case when invoice.status = 'paid' then 'paid' else 'invoiced' end,
              'to_status', 'out_for_delivery', 'invoice_status', invoice.status)
          from updated_order
          join invoices invoice on invoice.order_id = updated_order.id
          returning entity_id
        )
        select updated_order.id, updated_order.customer_id, updated_order.public_order_number,
          invoice.status::text as invoice_status
        from updated_order
        join audit_event on audit_event.entity_id = updated_order.id
        join invoices invoice on invoice.order_id = updated_order.id
      `
      if (!order) {
        return data(
          { ok: false, intent, orderId, message: 'This order is not ready for dispatch.' },
          { status: 409, headers: auth.headers },
        )
      }

      const isPaid = order.invoice_status === 'paid'
      scheduleAdminOrderNotification(
        sendCustomerNotification({
          eventKey: `order:${order.id}:ready-for-delivery`,
          customerId: order.customer_id,
          notificationType: 'order_ready_for_delivery',
          orderId: order.id,
          payload: {
            title: isPaid ? 'Your order is ready for delivery' : 'Your order has been dispatched',
            body: isPaid
              ? `Your clean laundry is on the way for ${order.public_order_number}.`
              : `Your order ${order.public_order_number} has been dispatched. Payment is required before handoff.`,
            details: isPaid
              ? [`Order: ${order.public_order_number}`, 'Payment has been confirmed.', 'Your laundry is on its way to you.']
              : [`Order: ${order.public_order_number}`, 'Your laundry has been dispatched.', 'Please pay the invoice before handoff.'],
            url: `/orders?order=${encodeURIComponent(order.public_order_number)}`,
            tag: `order:${order.id}:delivery`,
          },
        }),
      )
      return data({ ok: true, intent, orderId }, { headers: auth.headers })
    }

    if (intent === 'mark-delivered') {
      const [order] = await sql`
        with updated_order as (
          update orders
          set status = 'delivered',
              delivery_otp = null
          where id = ${orderId}
            and status = 'out_for_delivery'
            and exists (
              select 1 from invoices
              where invoices.order_id = orders.id and invoices.status = 'paid'
            )
          returning id, customer_id, public_order_number
        ),
        handoff_event as (
          insert into order_logistics_events (order_id, agent_profile_id, event_type)
          select id, null, 'delivered'
          from updated_order
          returning order_id
        ),
        audit_event as (
          insert into admin_audit_events (admin_profile_id, action, entity_type, entity_id, metadata)
          select ${auth.profile.id}, 'admin_order_marked_delivered', 'order', id,
            jsonb_build_object('from_status', 'out_for_delivery', 'to_status', 'delivered')
          from updated_order
          returning entity_id
        )
        select updated_order.id, updated_order.customer_id, updated_order.public_order_number
        from updated_order
        join handoff_event on handoff_event.order_id = updated_order.id
        join audit_event on audit_event.entity_id = updated_order.id
      `
      if (!order) {
        return data(
          { ok: false, intent, orderId, message: 'This order must be dispatched and fully paid before it can be marked delivered.' },
          { status: 409, headers: auth.headers },
        )
      }

      scheduleAdminOrderNotification(
        sendCustomerNotification({
          eventKey: `delivery:${order.id}:confirmed`,
          customerId: order.customer_id,
          notificationType: 'order_delivered',
          orderId: order.id,
          payload: {
            title: 'Your order was delivered',
            body: 'Your Qaffy laundry order has been delivered.',
            details: [`Order: ${order.public_order_number}`, 'Your laundry has been handed back to you.'],
            url: `/orders?order=${encodeURIComponent(order.public_order_number)}`,
            tag: `order:${order.id}:delivery`,
          },
        }),
      )
      return data({ ok: true, intent, orderId }, { headers: auth.headers })
    }

    if (intent === 'record-offline-payment-and-complete') {
      const result = await sql.begin(async (tx) => {
        const [invoice] = await tx`
          select i.id as invoice_id, i.amount, o.id as order_id, o.customer_id,
            o.public_order_number, o.status::text as order_status
          from orders o
          join invoices i on i.order_id = o.id
          where o.id = ${orderId}
            and o.status in ('invoiced', 'out_for_delivery')
            and o.clothes_count_vendor is not null
            and i.status = 'unpaid'
          for update of o, i
        `
        if (!invoice) return null

        const [paidInvoice] = await tx`
          update invoices
          set status = 'paid', payment_method = 'offline', paid_at = now()
          where id = ${invoice.invoice_id} and status = 'unpaid'
          returning id
        `
        if (!paidInvoice) return null

        const [deliveredOrder] = await tx`
          update orders
          set status = 'delivered', delivery_otp = null
          where id = ${invoice.order_id} and status = ${invoice.order_status}
          returning id
        `
        if (!deliveredOrder) throw new Error('Order status changed while completing offline payment.')

        await tx`
          insert into order_logistics_events (order_id, agent_profile_id, event_type)
          values (${invoice.order_id}, null, 'delivered')
        `
        await tx`
          insert into admin_audit_events (admin_profile_id, action, entity_type, entity_id, metadata)
          values (
            ${auth.profile.id},
            'admin_offline_order_payment_recorded',
            'order',
            ${invoice.order_id},
            ${tx.json({
              fromStatus: invoice.order_status,
              toStatus: 'delivered',
              paymentMethod: 'offline',
              invoiceId: invoice.invoice_id,
              amount: Number(invoice.amount),
            })}
          )
        `
        const referralRewardRecipients = await issueReferralRewards(tx, invoice.customer_id, invoice.order_id, Number(invoice.amount))

        return {
          id: invoice.order_id,
          invoiceId: invoice.invoice_id,
          customerId: invoice.customer_id,
          publicOrderNumber: invoice.public_order_number,
          amount: Number(invoice.amount),
          referralRewardRecipients,
        }
      })

      if (!result) {
        return data(
          {
            ok: false,
            intent,
            orderId,
            message: 'This order needs an unpaid invoice and confirmed vendor counts before offline payment can be recorded.',
          },
          { status: 409, headers: auth.headers },
        )
      }

      scheduleAdminOrderNotification(
        Promise.all([
          sendCustomerNotification({
            eventKey: `invoice:${result.invoiceId}:offline-payment-recorded`,
            customerId: result.customerId,
            notificationType: 'payment_confirmed',
            orderId: result.id,
            payload: {
              title: 'Offline payment recorded',
              body: `An offline payment of ${money(result.amount)} was recorded for order ${result.publicOrderNumber}.`,
              details: [
                `Amount recorded: ${money(result.amount)}`,
                `Order: ${result.publicOrderNumber}`,
                'This payment was handled outside Qaffy; no wallet balance was used.',
              ],
              url: `/orders?order=${encodeURIComponent(result.publicOrderNumber)}`,
              tag: `order:${result.id}:offline-payment`,
            },
          }),
          sendCustomerNotification({
            eventKey: `delivery:${result.id}:confirmed`,
            customerId: result.customerId,
            notificationType: 'order_delivered',
            orderId: result.id,
            payload: {
              title: 'Your order was delivered',
              body: 'Your Qaffy laundry order has been delivered.',
              details: [`Order: ${result.publicOrderNumber}`, 'Your laundry has been handed back to you.'],
              url: `/orders?order=${encodeURIComponent(result.publicOrderNumber)}`,
              tag: `order:${result.id}:delivery`,
            },
          }),
          sendReferralRewardNotifications(result.referralRewardRecipients),
        ]),
      )
      return data({ ok: true, intent, orderId }, { headers: auth.headers })
    }

    const [cancelledOrder] = await sql`
      update orders
      set status = 'cancelled'
      where id = ${orderId}
        and status = 'pending_pickup'
        and picked = false
      returning id
    `
    if (!cancelledOrder) {
      return data(
        { ok: false, intent, orderId, message: 'Only orders still awaiting pickup can be cancelled.' },
        { status: 409, headers: auth.headers },
      )
    }
    return data({ ok: true, intent, orderId }, { headers: auth.headers })
  } catch (error) {
    console.error('[admin-orders] Order action failed', error)
    return data(
      {
        ok: false,
        intent,
        orderId,
        message:
          intent === 'cancel-order'
            ? 'The order could not be cancelled. Please try again.'
            : 'The order update could not be completed. Please try again.',
      },
      { status: 500, headers: auth.headers },
    )
  }
}

function scheduleAdminOrderNotification(notification: Promise<unknown>) {
  try {
    waitUntil(notification)
  } catch (error) {
    console.error('[admin-orders] Background notification scheduling failed', error)
    void notification.catch((notificationError) => {
      console.error('[admin-orders] Notification dispatch failed', notificationError)
    })
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  return loadAdminOrders(request)
}

function searchWithoutOrderId(url: URL) {
  const params = new URLSearchParams(url.searchParams)
  params.delete('orderId')
  return params.toString()
}

function getOrderDetailsReturnPath(state: unknown) {
  if (!state || typeof state !== 'object' || !('returnTo' in state) || typeof state.returnTo !== 'string') return null
  return /^\/admin\/(?:users\/[^/?#]+|partners\/vendor\/[^/?#]+)(?:\?[^#]*)?$/.test(state.returnTo)
    ? state.returnTo
    : null
}

export function shouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const onlyOrderSelectionChanged =
    !formMethod &&
    currentUrl.pathname === '/admin/orders' &&
    nextUrl.pathname === '/admin/orders' &&
    currentUrl.searchParams.get('orderId') !== nextUrl.searchParams.get('orderId') &&
    searchWithoutOrderId(currentUrl) === searchWithoutOrderId(nextUrl)

  return onlyOrderSelectionChanged ? false : defaultShouldRevalidate
}

const statusLabels: Record<AdminOrder['status'], string> = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Picked up',
  at_vendor: 'At vendor',
  invoiced: 'Awaiting review',
  paid: 'Paid',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
const statusStyles: Record<AdminOrder['status'], string> = {
  pending_pickup: 'bg-amber-50 text-amber-700',
  picked_up: 'bg-sky-50 text-sky-700',
  at_vendor: 'bg-brand-soft text-brand-primary',
  invoiced: 'bg-violet-50 text-violet-700',
  paid: 'bg-emerald-50 text-emerald-700',
  out_for_delivery: 'bg-cyan-50 text-cyan-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
}
const orderTypeLabels = { wash: 'Wash only', wash_iron: 'Wash + Iron', mixed: 'Mixed service' }
const serviceLabels = { wash: 'Wash', iron: 'Iron', wash_iron: 'Wash + Iron' }
const getCustomerItemCount = (order: AdminOrder) => order.items.reduce((total, item) => total + item.quantity, 0)
const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not recorded'
const money = (value: number) => `\u20A6${value.toLocaleString()}`
const inputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function OrderDetails({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const cancelFetcher = useFetcher<typeof action>()
  const handledCancelResponse = useRef<typeof cancelFetcher.data>(null)
  const workflowFetcher = useFetcher<typeof action>()
  const handledWorkflowResponse = useRef<typeof workflowFetcher.data>(null)
  const location = useLocation()
  const revalidator = useRevalidator()
  const [confirmOfflinePayment, setConfirmOfflinePayment] = useState(false)
  const receivedCounts = getInitialReceivedCounts(
    order.items.map((item) => ({
      id: item.id,
      name: item.category?.name ?? 'Laundry item',
      service: item.service,
      quantity: item.quantity,
      confirmedQuantity: item.confirmed_quantity,
    })),
    order.mismatches.map((mismatch) => ({ id: mismatch.id, lines: mismatch.details })),
    order.clothes_count_vendor,
  )
  const hasCompleteReceivedCounts = order.items.every((item) => receivedCounts[item.id] !== undefined)
  const oneTimeInvoiceLineTotal =
    !order.is_subscription_order && hasCompleteReceivedCounts
      ? order.items.reduce((total, item) => total + Number(receivedCounts[item.id]) * item.unit_price, 0)
      : null

  useEffect(() => {
    const result = cancelFetcher.data
    if (cancelFetcher.state !== 'idle' || !result || handledCancelResponse.current === result) return
    handledCancelResponse.current = result

    if (result.ok) {
      toast.success('Order cancelled.')
      onClose()
      return
    }

    toast.error('message' in result && typeof result.message === 'string' ? result.message : 'The order could not be cancelled.')
  }, [cancelFetcher.data, cancelFetcher.state, onClose])

  useEffect(() => {
    const result = workflowFetcher.data
    if (workflowFetcher.state !== 'idle' || !result || handledWorkflowResponse.current === result) return
    handledWorkflowResponse.current = result

    if (!result.ok) {
      toast.error('message' in result && typeof result.message === 'string' ? result.message : 'The order update could not be completed.')
      return
    }

    const successMessages: Record<string, string> = {
      'mark-picked-up': 'Order marked as picked up.',
      'dispatch-order': 'Order dispatched.',
      'mark-delivered': 'Order marked as delivered.',
      'record-offline-payment-and-complete': 'Offline payment recorded and order completed.',
    }
    const completedIntent = 'intent' in result ? result.intent : ''
    toast.success(successMessages[completedIntent] ?? 'Order updated.')
    revalidator.revalidate()
  }, [workflowFetcher.data, workflowFetcher.state, revalidator])

  const submitWorkflowAction = (intent: 'mark-picked-up' | 'dispatch-order' | 'mark-delivered' | 'record-offline-payment-and-complete') => {
    workflowFetcher.submit({ intent, orderId: order.id }, { method: 'post' })
  }
  const submitOfflinePaymentAction = () => {
    setConfirmOfflinePayment(true)
  }
  const workflowActionPending = workflowFetcher.state !== 'idle'
  const pendingWorkflowIntent = workflowActionPending ? String(workflowFetcher.formData?.get('intent') ?? '') : ''
  const canDispatch = isReadyForDispatch(order.status, order.invoice?.status)
  const canDeliver = isReadyForFinalDelivery(order.status, order.invoice?.status)
  const canRecordOfflinePayment =
    order.invoice?.status === 'unpaid' && order.clothes_count_vendor !== null && ['invoiced', 'out_for_delivery'].includes(order.status)
  const workflowGuidance =
    order.status === 'pending_pickup'
      ? 'Confirm the order has been collected, then mark it as picked up.'
      : canRecordOfflinePayment
        ? canDispatch
          ? 'Choose the normal dispatch flow or record payment if the order was already paid and delivered outside Qaffy.'
          : 'If the customer has already paid and received the order outside Qaffy, record it as complete.'
        : canDispatch
          ? order.invoice?.status === 'paid'
            ? 'This order is ready to go out for delivery.'
            : 'This order can be dispatched now. Delivery can be completed after the invoice is paid.'
          : canDeliver
            ? 'Confirm the handoff to the customer to complete this order.'
            : null

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[calc(100vh-1rem)] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-bold text-slate-900">{order.customer?.name ?? 'Customer'}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {order.public_order_number} {'\u00B7'} {statusLabels[order.status]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close order details"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-400"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {workflowGuidance && (
          <section className="mt-5 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-4" aria-label="Next order action">
            {canRecordOfflinePayment ? (
              <>
                <h4 className="font-bold text-slate-900">Choose next step</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {canDispatch && (
                    <div className="flex flex-col items-start rounded-xl border border-slate-200 bg-white p-4">
                      <p className="font-semibold text-slate-900">Dispatch order</p>
                      <p className="mt-1 flex-1 text-sm text-slate-600">Payment remains due at handoff.</p>
                      <button
                        type="button"
                        onClick={() => submitWorkflowAction('dispatch-order')}
                        disabled={workflowActionPending || cancelFetcher.state !== 'idle'}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pendingWorkflowIntent === 'dispatch-order' && <LoaderCircle size={15} className="animate-spin" />}
                        {pendingWorkflowIntent === 'dispatch-order' ? 'Saving...' : 'Dispatch order'}
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col items-start rounded-xl border border-brand-border bg-brand-soft/60 p-4">
                    <p className="font-semibold text-slate-900">Already paid and delivered?</p>
                    <p className="mt-1 flex-1 text-sm text-slate-600">Record the offline payment to complete the order.</p>
                    <button
                      type="button"
                      onClick={submitOfflinePaymentAction}
                      disabled={workflowActionPending || cancelFetcher.state !== 'idle'}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg border border-brand-primary/40 bg-white px-4 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingWorkflowIntent === 'record-offline-payment-and-complete' && (
                        <LoaderCircle size={15} className="animate-spin" />
                      )}
                      {pendingWorkflowIntent === 'record-offline-payment-and-complete' ? 'Recording...' : 'Record & complete'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="font-bold text-slate-900">Next step</h4>
                  <p className="mt-1 text-sm text-slate-600">{workflowGuidance}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {order.status === 'pending_pickup' && (
                    <button
                      type="button"
                      onClick={() => submitWorkflowAction('mark-picked-up')}
                      disabled={workflowActionPending || cancelFetcher.state !== 'idle'}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingWorkflowIntent === 'mark-picked-up' && <LoaderCircle size={15} className="animate-spin" />}
                      {pendingWorkflowIntent === 'mark-picked-up' ? 'Saving...' : 'Mark picked up'}
                    </button>
                  )}
                  {canDispatch && (
                    <button
                      type="button"
                      onClick={() => submitWorkflowAction('dispatch-order')}
                      disabled={workflowActionPending || cancelFetcher.state !== 'idle'}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingWorkflowIntent === 'dispatch-order' && <LoaderCircle size={15} className="animate-spin" />}
                      {pendingWorkflowIntent === 'dispatch-order' ? 'Saving...' : 'Dispatch order'}
                    </button>
                  )}
                  {canDeliver && (
                    <button
                      type="button"
                      onClick={() => submitWorkflowAction('mark-delivered')}
                      disabled={workflowActionPending || cancelFetcher.state !== 'idle'}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingWorkflowIntent === 'mark-delivered' && <LoaderCircle size={15} className="animate-spin" />}
                      {pendingWorkflowIntent === 'mark-delivered' ? 'Saving...' : 'Mark delivered'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
        <section className="mt-6 grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Customer ID</p>
            {order.customer?.id ? (
              <Link
                to={`/admin/users/${encodeURIComponent(order.customer.id)}`}
                state={{ returnTo: `${location.pathname}${location.search}` }}
                className="mt-1 inline-block break-words text-sm font-semibold text-brand-primary hover:underline"
              >
                {order.customer.qaffy_id ?? 'Unavailable'}
              </Link>
            ) : (
              <p className="mt-1 break-words text-sm font-semibold text-slate-900">{order.customer?.qaffy_id ?? 'Unavailable'}</p>
            )}
          </div>
          <Detail label="Order type" value={orderTypeLabels[order.order_type]} />
          <Detail label="Created" value={formatDate(order.created_at)} />
          <Detail label="Location" value={order.location?.name ?? 'Location pending'} />
        </section>
        <section className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Order OTPs">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pickup OTP</p>
            <p
              className={`mt-2 text-slate-900 ${order.pickup_otp ? 'font-mono text-2xl font-bold tracking-[0.2em]' : 'text-sm font-medium'}`}
            >
              {order.pickup_otp ?? (order.status === 'pending_pickup' ? 'Not available' : 'Pickup confirmed')}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Delivery OTP</p>
            <p
              className={`mt-2 text-slate-900 ${order.delivery_otp ? 'font-mono text-2xl font-bold tracking-[0.2em]' : 'text-sm font-medium'}`}
            >
              {order.delivery_otp ??
                (order.status === 'delivered'
                  ? 'Delivery confirmed'
                  : order.status === 'cancelled'
                    ? 'Not available'
                    : 'Not generated yet')}
            </p>
          </div>
        </section>
        <section className="mt-5 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900">Items</h4>
            <div className="text-right text-xs text-slate-500 sm:text-sm">
              <p>Customer count: {order.items.length > 0 ? getCustomerItemCount(order) : 'Not recorded'}</p>
              <p>Vendor count: {order.clothes_count_vendor ?? 'Not confirmed'}</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            {order.items.length === 0 ? (
              <p className="text-sm text-slate-500">No item details recorded.</p>
            ) : (
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="px-2 py-2 font-semibold">Item / service</th>
                    <th className="px-2 py-2 text-right font-semibold">Customer</th>
                    <th className="px-2 py-2 text-right font-semibold">Vendor received</th>
                    <th className="px-2 py-2 text-right font-semibold">Unit price</th>
                    <th className="px-2 py-2 text-right font-semibold">Invoice line</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => {
                    const confirmedQuantity = receivedCounts[item.id]
                    const lineAmount =
                      order.is_subscription_order || confirmedQuantity === undefined ? null : confirmedQuantity * item.unit_price
                    return (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-2 py-3 font-semibold text-slate-800">
                          {item.category?.name ?? 'Laundry item'} {'\u00B7'} {serviceLabels[item.service]}
                        </td>
                        <td className="px-2 py-3 text-right text-slate-600">{item.quantity}</td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-800">{confirmedQuantity ?? 'Not recorded'}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{money(item.unit_price)}</td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-800">
                          {lineAmount === null ? (order.is_subscription_order ? 'Plan breakdown' : 'Not available') : money(lineAmount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {!order.is_subscription_order && oneTimeInvoiceLineTotal !== null && (
                  <tfoot>
                    <tr className="border-t border-slate-200">
                      <th colSpan={4} className="px-2 pt-3 text-right text-sm font-bold text-slate-700">
                        Calculated invoice total
                      </th>
                      <td className="px-2 pt-3 text-right text-sm font-bold text-slate-900">{money(oneTimeInvoiceLineTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </section>
        <section className="mt-5 grid gap-4 rounded-2xl border border-violet-100 bg-violet-50 p-4 sm:grid-cols-4">
          <Detail label="Vendor count" value={order.clothes_count_vendor ?? 'Not confirmed'} />
          <Detail label="Invoice" value={order.invoice ? money(Number(order.invoice.amount)) : 'Not created'} />
          <Detail
            label="Payment"
            value={order.invoice?.status !== 'paid' ? 'Pending' : order.invoice.payment_method === 'offline' ? 'Paid offline' : 'Paid'}
          />
          <Detail label="Service mode" value={order.is_subscription_order ? 'Subscription' : 'One-time'} />
        </section>
        {order.is_subscription_order && order.invoice?.billing_breakdown && (
          <section className="mt-3 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <Detail label="Covered units" value={order.invoice.billing_breakdown.coveredUnits} />
            <Detail label="Subscriber-rate charges" value={money(order.invoice.billing_breakdown.subscriberAmount)} />
            <Detail label="Regular-rate charges" value={money(order.invoice.billing_breakdown.regularAmount)} />
          </section>
        )}
        {order.is_subscription_order && order.invoice && !order.invoice.billing_breakdown && (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            A detailed subscription billing breakdown is not available for this invoice.
          </p>
        )}
        <section className="mt-5 rounded-2xl border border-slate-200 p-4">
          <h4 className="font-bold text-slate-900">Notes</h4>
          <p className="mt-2 text-sm text-slate-600">{order.notes || 'No notes recorded.'}</p>
        </section>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {order.status === 'pending_pickup' && (
            <cancelFetcher.Form
              method="post"
              onSubmit={(event) => {
                if (!window.confirm('Are you sure you want to cancel this order?')) event.preventDefault()
              }}
            >
              <input type="hidden" name="intent" value="cancel-order" />
              <input type="hidden" name="orderId" value={order.id} />
              <button
                type="submit"
                disabled={cancelFetcher.state !== 'idle'}
                className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {cancelFetcher.state !== 'idle' ? 'Cancelling…' : 'Cancel order'}
              </button>
            </cancelFetcher.Form>
          )}
          {order.status !== 'pending_pickup' && <span />}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
      {confirmOfflinePayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="offline-payment-confirm-title"
            aria-describedby="offline-payment-confirm-description"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl"
          >
            <div className="flex flex-col items-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
                <CircleAlert size={20} aria-hidden="true" />
              </span>
              <div className="mt-3">
                <h3 id="offline-payment-confirm-title" className="text-lg font-bold text-slate-900">
                  Confirm offline payment
                </h3>
                <p id="offline-payment-confirm-description" className="mt-2 text-sm leading-6 text-slate-600">
                  Confirm <span className="font-semibold text-slate-900">{money(Number(order.invoice?.amount ?? 0))}</span> was paid offline
                  and <span className="font-semibold text-slate-900">{order.public_order_number}</span> delivered.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => setConfirmOfflinePayment(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOfflinePayment(false)
                  submitWorkflowAction('record-offline-payment-and-complete')
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary-hover"
              >
                Confirm &amp; complete
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function OrderFilterDrawer({
  isOpen,
  onClose,
  onApply,
  onClear,
  statusFilter,
  setStatusFilter,
  paymentFilter,
  setPaymentFilter,
  dateType,
  setDateType,
  dateMode,
  setDateMode,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: {
  isOpen: boolean
  onClose: () => void
  onApply: () => void
  onClear: () => void
  statusFilter: string
  setStatusFilter: (value: string) => void
  paymentFilter: 'all' | 'pending' | 'paid'
  setPaymentFilter: (value: 'all' | 'pending' | 'paid') => void
  dateType: 'created' | 'pickup' | 'delivery'
  setDateType: (value: 'created' | 'pickup' | 'delivery') => void
  dateMode: 'all' | 'today' | 'this_month' | 'last_month' | 'custom'
  setDateMode: (value: 'all' | 'today' | 'this_month' | 'last_month' | 'custom') => void
  startDate: string
  setStartDate: (value: string) => void
  endDate: string
  setEndDate: (value: string) => void
}) {
  if (!isOpen) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/35" role="presentation" onMouseDown={onClose}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          aria-label="Cancel filters"
          className="absolute top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900"
          style={{ right: 'min(572px, calc(100vw - 36px))' }}
        >
          <X size={17} />
        </button>
      </div>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-filter-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-48px)] max-w-[560px] flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
      >
        <header className="border-b border-slate-100 px-6 py-5 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <h2 id="order-filter-title" className="text-xl font-bold text-slate-900">
              Filter orders
            </h2>
            <button
              type="button"
              onClick={onClear}
              className="whitespace-nowrap text-sm font-semibold text-brand-primary hover:text-brand-primary-hover"
            >
              Clear filters
            </button>
          </div>
        </header>
        <div className="flex min-h-[calc(100vh-81px)] flex-1 flex-col px-6 py-6 sm:px-8">
          <div className="space-y-6">
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              >
                <option value="all">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">Payment status</span>
              <select
                value={paymentFilter}
                onChange={(event) => setPaymentFilter(event.target.value as typeof paymentFilter)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              >
                <option value="all">All payment statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">Date applies to</span>
              <select
                value={dateType}
                onChange={(event) => setDateType(event.target.value as typeof dateType)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              >
                <option value="created">Order created</option>
                <option value="pickup">Pickup date</option>
                <option value="delivery">Delivery date</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">Date range</span>
              <select
                value={dateMode}
                onChange={(event) => setDateMode(event.target.value as typeof dateMode)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              >
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {dateMode === 'custom' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2.5 block text-xs font-semibold text-slate-500">From</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
                  />
                </label>
                <label className="block">
                  <span className="mb-2.5 block text-xs font-semibold text-slate-500">To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
                  />
                </label>
              </div>
            )}
          </div>
          <div className="sticky bottom-0 mt-auto flex gap-3 border-t border-slate-100 bg-white pt-6">
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              className="h-11 flex-1 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover"
            >
              Apply filters
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

export default function Orders() {
  const {
    orders,
    selectedOrder: loadedSelectedOrder,
    page,
    pageSize,
    total,
    query,
    statusFilter,
    paymentFilter,
    dateType,
    sortRules,
    dateMode,
    startDate,
    endDate,
  } = useLoaderData<typeof loader>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const revalidator = useRevalidator()
  const location = useLocation()
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [draftStatusFilter, setDraftStatusFilter] = useState(statusFilter)
  const [draftPaymentFilter, setDraftPaymentFilter] = useState(paymentFilter)
  const [draftDateType, setDraftDateType] = useState(dateType)
  const [draftDateMode, setDraftDateMode] = useState(dateMode)
  const [draftStartDate, setDraftStartDate] = useState(startDate)
  const [draftEndDate, setDraftEndDate] = useState(endDate)
  const requestedOrderId = searchParams.get('orderId')
  const orderDetailsReturnPath = getOrderDetailsReturnPath(location.state)
  const selectedOrder = requestedOrderId
    ? (orders.find((order) => order.id === requestedOrderId) ?? (loadedSelectedOrder?.id === requestedOrderId ? loadedSelectedOrder : null))
    : null
  const isOnlyOrderSelectionNavigation =
    navigation.location?.pathname === '/admin/orders' &&
    location.pathname === '/admin/orders' &&
    navigation.location.search !== location.search &&
    searchWithoutOrderId(new URL(`${location.pathname}${location.search}`, 'http://localhost')) ===
      searchWithoutOrderId(new URL(`${navigation.location.pathname}${navigation.location.search}`, 'http://localhost'))
  const isLoadingPage =
    navigation.state === 'loading' && navigation.location?.pathname === '/admin/orders' && !isOnlyOrderSelectionNavigation
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const buildSearch = (values: {
    page: number
    query?: string
    statusFilter?: string
    paymentFilter?: typeof paymentFilter
    dateType?: typeof dateType
    sortRules?: SortRule[]
    dateMode?: typeof dateMode
    startDate?: string
    endDate?: string
  }) => {
    const params = new URLSearchParams()
    if (values.page > 1) params.set('page', String(values.page))
    if (values.query) params.set('q', values.query)
    if (values.statusFilter && values.statusFilter !== 'all') params.set('status', values.statusFilter)
    if (values.paymentFilter && values.paymentFilter !== 'all') params.set('payment', values.paymentFilter)
    if (values.dateType && values.dateType !== 'created') params.set('dateType', values.dateType)
    if (values.sortRules) {
      if (values.sortRules.length === 0) {
        params.set('sort', '')
      } else if (values.sortRules.length !== 1 || values.sortRules[0].column !== 'created' || values.sortRules[0].direction !== 'desc') {
        params.set('sort', values.sortRules.map((rule) => `${rule.column}:${rule.direction}`).join(','))
      }
    }
    if (values.dateMode && values.dateMode !== 'all') params.set('date', values.dateMode)
    if (values.startDate) params.set('from', values.startDate)
    if (values.endDate) params.set('to', values.endDate)
    return `?${params.toString()}`
  }
  const updateFilters = (filters: {
    statusFilter?: string
    paymentFilter?: typeof paymentFilter
    dateType?: typeof dateType
    dateMode?: typeof dateMode
    startDate?: string
    endDate?: string
  }) => {
    navigate(
      buildSearch({
        page: 1,
        query,
        statusFilter: filters.statusFilter ?? statusFilter,
        paymentFilter: filters.paymentFilter ?? paymentFilter,
        dateType: filters.dateType ?? dateType,
        sortRules,
        dateMode: filters.dateMode ?? dateMode,
        startDate: filters.startDate !== undefined ? filters.startDate : startDate,
        endDate: filters.endDate !== undefined ? filters.endDate : endDate,
      }),
    )
  }
  const changeColumnSort = (column: SortColumn, direction: SortRule['direction']) => {
    const updatedRules = [{ column, direction }, ...sortRules.filter((rule) => rule.column !== column)]
    navigate(
      buildSearch({
        page: 1,
        query,
        statusFilter,
        paymentFilter,
        dateType,
        sortRules: updatedRules,
        dateMode,
        startDate,
        endDate,
      }),
    )
  }
  const renderSortHeader = (column: SortColumn, label: string) => {
    const activeRule = sortRules.find((rule) => rule.column === column)
    return (
      <SortColumnHeader
        label={label}
        direction={activeRule?.direction ?? null}
        onSort={(direction) => changeColumnSort(column, direction)}
      />
    )
  }
  const updateDraftDateMode = (value: typeof dateMode) => {
    const today = new Date()
    setDraftDateMode(value)
    if (value === 'today') {
      const todayDate = inputDate(today)
      setDraftStartDate(todayDate)
      setDraftEndDate(todayDate)
    } else if (value === 'this_month') {
      setDraftStartDate(inputDate(new Date(today.getFullYear(), today.getMonth(), 1)))
      setDraftEndDate(inputDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)))
    } else if (value === 'last_month') {
      setDraftStartDate(inputDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)))
      setDraftEndDate(inputDate(new Date(today.getFullYear(), today.getMonth(), 0)))
    } else if (value === 'all' || value === 'custom') {
      setDraftStartDate('')
      setDraftEndDate('')
    }
  }
  const openFilterDrawer = () => {
    setDraftStatusFilter(statusFilter)
    setDraftPaymentFilter(paymentFilter)
    setDraftDateType(dateType)
    setDraftDateMode(dateMode)
    setDraftStartDate(startDate)
    setDraftEndDate(endDate)
    setIsFilterOpen(true)
  }
  const applyDraftFilters = () => {
    updateFilters({
      statusFilter: draftStatusFilter,
      paymentFilter: draftPaymentFilter,
      dateType: draftDateType,
      dateMode: draftDateMode,
      startDate: draftStartDate,
      endDate: draftEndDate,
    })
    setIsFilterOpen(false)
  }
  const clearDraftFilters = () => {
    setDraftStatusFilter('all')
    setDraftPaymentFilter('all')
    setDraftDateType('created')
    setDraftDateMode('all')
    setDraftStartDate('')
    setDraftEndDate('')
  }
  const applySortRules = (nextSortRules: SortRule[]) => {
    navigate(
      buildSearch({
        page: 1,
        query,
        statusFilter,
        paymentFilter,
        dateType,
        sortRules: nextSortRules,
        dateMode,
        startDate,
        endDate,
      }),
    )
  }
  const exportParams = new URLSearchParams(location.search)
  exportParams.delete('page')
  exportParams.delete('orderId')
  const csvExportUrl = `/admin/orders/export?${exportParams.toString()}`

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Form method="get" className="w-full lg:max-w-lg">
              <input type="hidden" name="status" value={statusFilter} />
              <input type="hidden" name="payment" value={paymentFilter} />
              <input type="hidden" name="dateType" value={dateType} />
              <input type="hidden" name="sort" value={sortRules.map((rule) => `${rule.column}:${rule.direction}`).join(',')} />
              <input type="hidden" name="date" value={dateMode} />
              <input type="hidden" name="from" value={startDate} />
              <input type="hidden" name="to" value={endDate} />
              <input
                key={query}
                name="q"
                defaultValue={query}
                placeholder="Search order, customer, Qaffy ID, email, or phone"
                aria-label="Search orders"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary"
              />
            </Form>
            <div className="flex items-center gap-2 self-end lg:self-auto">
              <MultiSortManager columns={sortableColumns} rules={sortRules} onApply={applySortRules} />
              <button
                type="button"
                onClick={openFilterDrawer}
                aria-label="Open order filters"
                title="Filter orders"
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-brand-primary hover:text-brand-primary"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {(statusFilter !== 'all' || paymentFilter !== 'all' || dateMode !== 'all' || dateType !== 'created') && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-primary" aria-label="Filters active" />
                )}
              </button>
              <button
                type="button"
                onClick={() => revalidator.revalidate()}
                disabled={revalidator.state !== 'idle'}
                aria-label="Refresh orders"
                title="Refresh orders"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-brand-primary hover:text-brand-primary disabled:cursor-wait disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${revalidator.state !== 'idle' ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = csvExportUrl
                  link.download = 'qaffy-admin-orders.csv'
                  link.click()
                }}
                disabled={total === 0 || navigation.state !== 'idle'}
                title={navigation.state !== 'idle' ? 'Wait for the current filters to finish applying.' : `Export all ${total} filtered orders`}
                className="h-10 rounded-full bg-brand-primary px-5 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto p-4 md:p-5">
          <table className="w-full min-w-[1520px] table-fixed text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] capitalize tracking-[0.12em] text-slate-500">
                <th className="w-40 px-4 py-3 font-semibold">{renderSortHeader('created', 'Created')}</th>
                <th className="w-36 px-4 py-3 font-semibold">{renderSortHeader('order', 'Order ID')}</th>
                <th className="w-40 px-4 py-3 font-semibold">{renderSortHeader('pickup', 'Pickup')}</th>
                <th className="w-40 px-4 py-3 font-semibold">{renderSortHeader('delivery', 'Delivery')}</th>
                <th className="w-48 px-4 py-3 font-semibold">{renderSortHeader('customer', 'Customer')}</th>
                <th className="w-36 px-4 py-3 font-semibold">{renderSortHeader('qaffy_id', 'Qaffy ID')}</th>
                <th className="w-36 px-4 py-3 font-semibold">{renderSortHeader('order_type', 'Order type')}</th>
                <th className="w-40 px-4 py-3 font-semibold">{renderSortHeader('location', 'Location')}</th>
                <th className="w-24 px-4 py-3 font-semibold">{renderSortHeader('items', 'Items')}</th>
                <th className="w-40 px-4 py-3 font-semibold">{renderSortHeader('payment', 'Payment')}</th>
                <th className="w-36 px-4 py-3 font-semibold">{renderSortHeader('status', 'Status')}</th>
                <th className="w-28 px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingPage ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500" role="status">
                      <LoaderCircle size={18} className="animate-spin text-brand-primary" />
                      Loading orders…
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-sm text-slate-500">
                    No orders found.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-4 py-4 text-sm text-slate-700">{formatDate(order.created_at)}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-700">{order.public_order_number}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{formatDate(order.picked_up_date)}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{formatDate(order.delivery_date)}</td>
                    <td className="px-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{order.customer?.name ?? 'Customer'}</p>
                        <p className="truncate text-xs text-slate-500">{order.customer?.phone ?? 'Phone unavailable'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">{order.customer?.qaffy_id ?? 'Unavailable'}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{orderTypeLabels[order.order_type]}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{order.location?.name ?? 'Location pending'}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">
                      {order.items.length > 0 ? getCustomerItemCount(order) : 'Not recorded'}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">{order.invoice?.status === 'paid' ? 'Paid' : 'Pending'}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize tracking-[0.12em] ${statusStyles[order.status]}`}
                      >
                        {statusLabels[order.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSearchParams((current) => {
                            const next = new URLSearchParams(current)
                            next.set('orderId', order.id)
                            return next
                          })
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <OrderFilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={applyDraftFilters}
        onClear={clearDraftFilters}
        statusFilter={draftStatusFilter}
        setStatusFilter={setDraftStatusFilter}
        paymentFilter={draftPaymentFilter}
        setPaymentFilter={setDraftPaymentFilter}
        dateType={draftDateType}
        setDateType={setDraftDateType}
        dateMode={draftDateMode}
        setDateMode={updateDraftDateMode}
        startDate={draftStartDate}
        setStartDate={(value) => {
          setDraftDateMode('custom')
          setDraftStartDate(value)
        }}
        endDate={draftEndDate}
        setEndDate={(value) => {
          setDraftDateMode('custom')
          setDraftEndDate(value)
        }}
      />
      {total > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()} orders
          </p>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() =>
                navigate(
                  buildSearch({ page: page - 1, query, statusFilter, paymentFilter, dateType, sortRules, dateMode, startDate, endDate }),
                )
              }
              disabled={page === 1 || isLoadingPage}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span className="whitespace-nowrap text-sm text-slate-600">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() =>
                navigate(
                  buildSearch({ page: page + 1, query, statusFilter, paymentFilter, dateType, sortRules, dateMode, startDate, endDate }),
                )
              }
              disabled={page === pageCount || isLoadingPage}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
      {selectedOrder && (
        <OrderDetails
          order={selectedOrder}
          onClose={() => {
            if (orderDetailsReturnPath) {
              navigate(orderDetailsReturnPath)
              return
            }
            setSearchParams((current) => {
              const next = new URLSearchParams(current)
              next.delete('orderId')
              return next
            })
          }}
        />
      )}
    </div>
  )
}
