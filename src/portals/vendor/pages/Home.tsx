import { useEffect, useState } from 'react'
import { ArrowRight, Banknote, Check, ChevronRight, Clock3, MapPin, PackageCheck, Search, SlidersHorizontal, UserRound } from 'lucide-react'
import { data, Link, useFetcher, useLocation, useNavigate, useOutletContext, useRevalidator } from 'react-router'
import type { Route } from './+types/Home'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { requireRole } from '../../../lib/auth.server'
import { finalizeVendorOrder } from '../../../lib/wallet.server'
import { toast } from '../../../lib/toast'

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })

  const { supabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'review')
  const orderId = String(formData.get('orderId') ?? '')

  const vendorAuth = await requireRole(request, 'vendor')
  if (!vendorAuth) return data({ ok: false, message: 'Vendor access is unavailable.' }, { status: 503, headers })

  if (intent === 'claim') {
    if (!orderId) return data({ ok: false, message: 'Order ID is required.' }, { status: 400, headers })
    const { data: vendor, error: vendorError } = await supabase.from('vendors').select('id').eq('profile_id', vendorAuth.profile.id).eq('status', 'approved').maybeSingle()
    if (vendorError) return data({ ok: false, message: vendorError.message }, { status: 400, headers })
    if (!vendor) return data({ ok: false, message: 'Approved vendor access is required to claim orders.' }, { status: 403, headers })
    const { data: claimedOrder, error: claimError } = await supabase
      .from('orders')
      .update({ status: 'at_vendor', vendor_id: vendor.id })
      .eq('id', orderId)
      .eq('status', 'pending_pickup')
      .is('vendor_id', null)
      .select('id')
      .maybeSingle()
    if (claimError) return data({ ok: false, message: claimError.message }, { status: 400, headers })
    if (!claimedOrder) return data({ ok: false, message: 'This order is no longer available to claim.' }, { status: 409, headers })
    return data({ ok: true, intent: 'claim' as const }, { headers })
  }

  if (intent !== 'review') return data({ ok: false, message: 'Invalid vendor action.' }, { status: 400, headers })

  const receivedCount = Number(formData.get('receivedCount') ?? 0)
  const customerCount = Number(formData.get('customerCount') ?? 0)
  const mismatchDetail = String(formData.get('mismatchDetail') ?? '').trim()
  let addedItems: Array<{ categoryName: string; service: 'wash' | 'iron' | 'wash_iron'; quantity: number }>
  let receivedItems: Array<{ itemId: string; quantity: number }>
  try {
    receivedItems = JSON.parse(String(formData.get('receivedItems') ?? '[]'))
    addedItems = JSON.parse(String(formData.get('addedItems') ?? '[]'))
  } catch {
    return data({ ok: false, message: 'Received item details are invalid.' }, { status: 400, headers })
  }

  if (!orderId || !Number.isInteger(receivedCount) || receivedCount < 0) return data({ ok: false, message: 'Received item count is invalid.' }, { status: 400, headers })
  if (receivedCount !== customerCount && !mismatchDetail) return data({ ok: false, message: 'Add mismatch details before submitting.' }, { status: 400, headers })

  try {
    const result = await finalizeVendorOrder(orderId, vendorAuth.profile.id, receivedItems, addedItems, mismatchDetail)
    return data({ ok: true, amount: result.amount }, { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order review could not be submitted.'
    return data({ ok: false, message }, { status: 400, headers })
  }
}

type VendorOrder = {
  id: string
  customer: string
  customerId: string
  customerEmail: string
  customerPhone: string
  collectedAt: string
  createdAt: string
  orderType: 'wash' | 'wash_iron' | 'mixed'
  location: string
  status: 'Pending' | 'In progress' | 'Completed' | 'Awaiting review'
  orderStatus: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  clothesCountCustomer: number
  clothesCountVendor: number | null
  pickupOtp: string
  deliveryOtp: string
  pickupLocationId: string
  notes: string
  isSubscriptionOrder: boolean
  billedExtraAmount: number | null
  picked: boolean
  pickedUpDate: string | null
  amountDue: number
  invoice: { id: string; amount: number; status: 'unpaid' | 'paid'; createdAt: string; paidAt: string | null } | null
  payment: { provider: string; reference: string; amount: number; status: 'pending' | 'success' | 'failed'; createdAt: string } | null
  settlement: { id: string; periodStart: string; periodEnd: string; amountDue: number; status: 'pending' | 'paid' } | null
  items: Array<{ id: string; categoryId: string; name: string; quantity: number; service: 'wash' | 'iron' | 'wash_iron'; unitPrice: number }>
  mismatches: Array<{ id: string; direction: 'over' | 'under'; detail: string; createdAt: string }>
  logisticsEvents: Array<{ eventType: 'picked_up' | 'delivered'; createdAt: string; agent: string }>
}

type VendorLoaderOrder = {
  id: string
  customer_id: string
  order_type: VendorOrder['orderType']
  clothes_count_customer: number
  clothes_count_vendor: number | null
  status: VendorOrder['orderStatus']
  pickup_otp: string | null
  delivery_otp: string | null
  pickup_location_id: string | null
  notes: string | null
  is_subscription_order: boolean
  billed_extra_amount: number | null
  picked: boolean
  picked_up_date: string | null
  created_at: string
  customer: { name: string | null; qaffy_id: string | null; email: string | null; phone: string | null } | null
  location: { name: string } | null
  items: Array<{ id: string; category_id: string; quantity: number; service: VendorOrder['items'][number]['service']; unit_price: number; category: { name: string } | null }>
  invoice: { id: string; amount: number; status: 'unpaid' | 'paid'; created_at: string; paid_at: string | null } | null
  mismatches: Array<{ id: string; direction: 'over' | 'under'; detail: string | null; created_at: string }>
  logisticsEvents: Array<{ event_type: 'picked_up' | 'delivered'; created_at: string }>
}

type VendorLoaderData = {
  orders: VendorLoaderOrder[]
  vendorName: string
  rateCard: Array<{ name: string; wash: number | null; iron: number | null; wash_iron: number | null }>
}

function mapLoaderOrder(order: VendorLoaderOrder): VendorOrder {
  const statusMap: Record<VendorLoaderOrder['status'], VendorOrder['status']> = {
    pending_pickup: 'Pending', picked_up: 'In progress', at_vendor: 'In progress', invoiced: 'Awaiting review', paid: 'Awaiting review', out_for_delivery: 'Awaiting review', delivered: 'Completed', cancelled: 'Completed',
  }
  return {
    id: order.id,
    customer: order.customer?.name ?? 'Customer',
    customerId: order.customer?.qaffy_id ?? order.customer_id,
    customerEmail: order.customer?.email ?? 'Not available',
    customerPhone: order.customer?.phone ?? 'Not available',
    collectedAt: order.picked_up_date ? new Date(order.picked_up_date).toLocaleString() : new Date(order.created_at).toLocaleString(),
    createdAt: new Date(order.created_at).toLocaleString(),
    orderType: order.order_type,
    location: order.location?.name ?? 'Pickup location pending',
    status: statusMap[order.status],
    orderStatus: order.status,
    clothesCountCustomer: order.clothes_count_customer,
    clothesCountVendor: order.clothes_count_vendor,
    pickupOtp: order.pickup_otp ?? '',
    deliveryOtp: order.delivery_otp ?? '',
    pickupLocationId: order.pickup_location_id ?? '',
    notes: order.notes ?? '',
    isSubscriptionOrder: order.is_subscription_order,
    billedExtraAmount: order.billed_extra_amount,
    picked: order.picked,
    pickedUpDate: order.picked_up_date,
    amountDue: order.invoice?.amount ?? 0,
    invoice: order.invoice ? { id: order.invoice.id, amount: order.invoice.amount, status: order.invoice.status, createdAt: order.invoice.created_at, paidAt: order.invoice.paid_at } : null,
    payment: null,
    settlement: null,
    items: order.items.map((item) => ({ id: item.id, categoryId: item.category_id, name: item.category?.name ?? 'Laundry item', quantity: item.quantity, service: item.service, unitPrice: Number(item.unit_price) })),
    mismatches: order.mismatches.map((mismatch) => ({ id: mismatch.id, direction: mismatch.direction, detail: mismatch.detail ?? 'Mismatch recorded', createdAt: mismatch.created_at })),
    logisticsEvents: order.logisticsEvents.map((event) => ({ eventType: event.event_type, createdAt: event.created_at, agent: 'Logistics agent' })),
  }
}


const statusStyles: Record<VendorOrder['status'], string> = {
  Pending: 'bg-amber-50 text-amber-700',
  'In progress': 'bg-brand-soft text-brand-primary',
  Completed: 'bg-emerald-50 text-emerald-700',
  'Awaiting review': 'bg-sky-50 text-sky-700',
}

const orderTypeLabels: Record<VendorOrder['orderType'], string> = { wash: 'Wash only', wash_iron: 'Wash + Iron', mixed: 'Mixed service' }
const serviceLabels: Record<VendorOrder['items'][number]['service'], string> = { wash: 'Wash', iron: 'Iron', wash_iron: 'Wash + Iron' }
const orderStatusLabels: Record<VendorOrder['orderStatus'], string> = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Picked up',
  at_vendor: 'At vendor',
  invoiced: 'Invoiced',
  paid: 'Paid',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

function Detail({ label, value }: { label: string; value: string | number | null }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1.5 break-words text-sm font-semibold text-slate-900">{value ?? 'Not recorded'}</p></div>
}

function OrderReviewDialog({ order, received, receivedTotal, mismatchItems, notes, addedItems, categoryNames, isPreClaim, onReceivedChange, onNotesChange, onAddedItemsChange, onClose, onSave, onClaim, saving }: {
  order: VendorOrder
  received: Record<string, number>
  receivedTotal: number
  mismatchItems: VendorOrder['items']
  notes: string
  addedItems: Array<{ categoryName: string; service: 'wash' | 'iron' | 'wash_iron'; quantity: number }>
  categoryNames: string[]
  isPreClaim: boolean
  onReceivedChange: (itemId: string, value: number) => void
  onNotesChange: (value: string) => void
  onAddedItemsChange: (items: Array<{ categoryName: string; service: 'wash' | 'iron' | 'wash_iron'; quantity: number }>) => void
  onClose: () => void
  onSave: () => void
  onClaim: () => void
  saving: boolean
}) {
  const itemTotal = receivedTotal
  const formattedDate = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded'

  return <div className="vendor-review-dialog fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-0 sm:items-center sm:p-4">
    <style>{`.vendor-review-dialog table th:nth-last-child(-n+2), .vendor-review-dialog table td:nth-last-child(-n+2), .vendor-review-dialog > div > section:nth-of-type(4) { display: none; }`}</style>
    <div className="max-h-[calc(100vh-1rem)] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-8">
      <header className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary">{isPreClaim ? 'Order details' : 'Order review'}</p><h3 className="mt-2 text-2xl font-bold text-slate-900">{order.customer}</h3><p className="mt-1.5 text-sm text-slate-500">{order.id} · {orderStatusLabels[order.orderStatus]} · {orderTypeLabels[order.orderType]}</p></div>
        <button type="button" onClick={onClose} aria-label="Close order review" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-xl text-slate-400 shadow-sm transition hover:border-slate-300 hover:text-slate-600 hover:shadow-md">×</button>
      </header>

      {!isPreClaim && <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div><h4 className="font-bold text-slate-900">Found another category?</h4><p className="mt-1 text-sm text-slate-500">Add any cloth type that was not in the customer’s list.</p></div><button type="button" onClick={() => onAddedItemsChange([...addedItems, { categoryName: categoryNames[0] ?? '', service: 'wash', quantity: 1 }])} className="rounded-lg border border-brand-border bg-white px-3 py-2 text-sm font-semibold text-brand-primary">Add category</button></div>{addedItems.length > 0 && <div className="mt-4 space-y-3">{addedItems.map((item, index) => <div key={`${item.categoryName}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_100px_auto]"><select value={item.categoryName} onChange={(event) => onAddedItemsChange(addedItems.map((current, itemIndex) => itemIndex === index ? { ...current, categoryName: event.target.value } : current))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Choose category</option>{categoryNames.map((name) => <option key={name}>{name}</option>)}</select><select value={item.service} onChange={(event) => onAddedItemsChange(addedItems.map((current, itemIndex) => itemIndex === index ? { ...current, service: event.target.value as typeof item.service } : current))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="wash">Wash</option><option value="iron">Iron</option><option value="wash_iron">Wash + Iron</option></select><input type="number" min="1" value={item.quantity} onChange={(event) => onAddedItemsChange(addedItems.map((current, itemIndex) => itemIndex === index ? { ...current, quantity: Math.max(1, Number(event.target.value) || 1) } : current))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label="Added category quantity" /><button type="button" onClick={() => onAddedItemsChange(addedItems.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Remove</button></div>)}</div>}</section>}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-brand-primary" /><h4 className="font-bold text-slate-900">Order summary</h4></div><div className="mt-4 grid gap-4 sm:grid-cols-4"><Detail label="Customer ID" value={order.customerId} /><Detail label="Order type" value={orderTypeLabels[order.orderType]} /><Detail label="Created" value={order.createdAt} /><Detail label="Status" value={orderStatusLabels[order.orderStatus]} /></div><div className="mt-5 border-t border-slate-200 pt-4"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-primary" /><h4 className="font-bold text-slate-900">Pickup details</h4></div><div className="mt-4 grid gap-4 sm:grid-cols-3"><Detail label="Location" value={order.location} />{!isPreClaim && <Detail label="Pickup OTP" value={order.picked ? 'Verified' : order.pickupOtp} />}</div></div></section>

      <section className="mt-6 rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-brand-primary" /><h4 className="font-bold text-slate-900">Items and service</h4></div><p className="mt-1 text-sm text-slate-500">Customer declared {order.clothesCountCustomer}{isPreClaim ? '' : `; vendor received ${receivedTotal}` }.</p></div><span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-primary">{order.items.length} item types</span></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-155 text-left"><thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.14em] text-slate-500"><th className="pb-3 font-semibold">Category</th><th className="pb-3 font-semibold">Service</th><th className="pb-3 font-semibold">Quantity</th>{!isPreClaim && <th className="pb-3 font-semibold">Received</th>}<th className="pb-3 text-right font-semibold">Unit price</th><th className="pb-3 text-right font-semibold">Line total</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="py-3 text-sm font-semibold text-slate-800">{item.name}</td><td className="py-3 text-sm text-slate-600">{serviceLabels[item.service]}</td><td className="py-3 text-sm text-slate-600">{item.quantity}</td>{!isPreClaim && <td className="py-3"><input type="number" min="0" value={received[item.name] ?? item.quantity} onChange={(event) => onReceivedChange(item.name, Math.max(0, Number(event.target.value) || 0))} className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-sm font-semibold outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" aria-label={`Received ${item.name}`} /></td>}<td className="py-3 text-right text-sm text-slate-600">₦{item.unitPrice.toLocaleString()}</td><td className="py-3 text-right text-sm font-semibold text-brand-primary">₦{(item.quantity * item.unitPrice).toLocaleString()}</td></tr>)}</tbody></table></div>{!isPreClaim && <div className="mt-4 grid gap-3 sm:grid-cols-3"><Detail label="Customer count" value={order.clothesCountCustomer} /><Detail label="Vendor count" value={order.clothesCountVendor ?? receivedTotal} /><Detail label="Items total" value={`₦${itemTotal.toLocaleString()}`} /></div>}</section>

      <section className="mt-6 rounded-2xl border border-brand-border bg-brand-soft p-4 shadow-sm sm:p-5"><div className="flex items-center gap-2"><Banknote className="h-4 w-4 text-brand-primary" /><h4 className="font-bold text-slate-900">Order total</h4></div><div className="mt-4 grid gap-4 sm:grid-cols-4"><Detail label="Amount due" value={`₦${order.amountDue.toLocaleString()}`} /><Detail label="Invoice status" value={order.invoice?.status ?? 'Not invoiced'} /><Detail label="Payment status" value={order.payment?.status ?? (order.invoice?.status === 'paid' ? 'Paid' : 'Pending')} /><Detail label="Subscription" value={order.isSubscriptionOrder ? 'Yes' : 'No'} /></div>{order.billedExtraAmount !== null && <p className="mt-4 text-sm font-semibold text-brand-strong">Extra billed: ₦{order.billedExtraAmount.toLocaleString()}</p>}</section>

      <section className="mt-6 rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5"><h4 className="font-bold text-slate-900">Notes and verification</h4><Detail label="Customer notes" value={order.notes || 'No notes added'} />{!isPreClaim && mismatchItems.length > 0 && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><p className="font-semibold text-amber-800">Mismatch detected</p><p className="mt-1.5 text-sm text-amber-700">Add itemized details for Admin review.</p><textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="e.g. 1 red shirt missing" className="mt-3 min-h-24 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></div>}{order.mismatches.length > 0 && <div className="mt-4 space-y-2">{order.mismatches.map((mismatch) => <div key={mismatch.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><strong className="text-amber-800">{mismatch.direction === 'over' ? 'Overage' : 'Shortage'}</strong><span className="ml-2 text-amber-700">{mismatch.detail}</span><p className="mt-1 text-xs text-amber-600">{formattedDate(mismatch.createdAt)}</p></div>)}</div>}</section>

      <button type="button" onClick={isPreClaim ? onClaim : onSave} disabled={saving || (!isPreClaim && mismatchItems.length > 0 && !notes.trim())} className="mt-6 w-full rounded-2xl bg-brand-primary px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">{saving ? (isPreClaim ? 'Claiming...' : 'Confirming count...') : isPreClaim ? 'Claim order' : 'Confirm final count'}</button>
    </div>
  </div>
}

export default function Home() {
  const { orders: loadedOrders, vendorName, rateCard } = useOutletContext<VendorLoaderData>()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()
  const location = useLocation()
  const navigate = useNavigate()
  const orders = loadedOrders.map(mapLoaderOrder)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [detailsDismissed, setDetailsDismissed] = useState(false)
  const [received, setReceived] = useState<Record<string, Record<string, number>>>({})
  const [addedItems, setAddedItems] = useState<Array<{ categoryName: string; service: 'wash' | 'iron' | 'wash_iron'; quantity: number }>>([])
  const [notes, setNotes] = useState('')
  const [dateRange, setDateRange] = useState('Today')
  const requestedOrderId = new URLSearchParams(location.search).get('orderId')
  const returnPath = new URLSearchParams(location.search).get('returnTo') === 'orders' ? '/vendor/orders' : '/vendor'
  const selectedOrder = detailsDismissed
    ? null
    : orders.find((order) => order.id === (selectedOrderId ?? requestedOrderId)) ?? null

  useEffect(() => {
    if (!fetcher.data) return
    if (fetcher.data.ok) {
      toast.success('intent' in fetcher.data && fetcher.data.intent === 'claim' ? 'Order claimed.' : 'Order review submitted.')
      // Navigation changes the URL, but local modal state still needs clearing.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedOrderId(null)
      setNotes('')
      revalidator.revalidate()
    } else if ('message' in fetcher.data) {
      toast.error(String(fetcher.data.message))
    }
  }, [fetcher.data, revalidator])

  const visibleOrders = orders.filter((order) => {
    if (dateRange === 'All time') return true

    const referenceDate = order.pickedUpDate ?? loadedOrders.find((loadedOrder) => loadedOrder.id === order.id)?.created_at
    if (!referenceDate) return false

    const orderDate = new Date(referenceDate)
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    if (dateRange === 'Today') return orderDate >= startOfToday

    const startOfWeek = new Date(startOfToday)
    startOfWeek.setDate(startOfWeek.getDate() - 6)
    return orderDate >= startOfWeek
  })

  const metrics = [
    { label: 'Pending', value: orders.filter((order) => order.status === 'Pending').length, helper: 'Available to claim', icon: Clock3, tone: 'bg-amber-50 text-amber-700' },
    { label: 'In progress', value: orders.filter((order) => order.status === 'In progress').length, helper: 'Being processed', icon: PackageCheck, tone: 'bg-brand-soft text-brand-primary' },
    { label: 'Completed', value: orders.filter((order) => order.status === 'Completed').length, helper: 'Completed orders', icon: Check, tone: 'bg-emerald-50 text-emerald-700' },
  ]

  const claimOrder = (orderId: string) => {
    fetcher.submit({ intent: 'claim', orderId }, { method: 'post' })
  }

  const openOrderDetails = (order: VendorOrder) => {
    setDetailsDismissed(false)
    setSelectedOrderId(order.id)
    setAddedItems([])
    setReceived({ [order.id]: Object.fromEntries(order.items.map((item) => [item.id, item.quantity])) })
  }

  const receivedTotal = selectedOrder ? Object.values(received[selectedOrder.id] ?? {}).reduce((total, count) => total + count, 0) : 0
  const mismatchItems = selectedOrder?.items.filter((item) => (received[selectedOrder.id]?.[item.id] ?? 0) !== item.quantity) ?? []

  const closeOrderDetails = () => {
    setDetailsDismissed(true)
    setSelectedOrderId(null)
    setNotes('')
    setAddedItems([])
    if (returnPath === '/vendor/orders') {
      navigate(returnPath, { replace: true })
      return
    }
    window.history.replaceState(null, '', returnPath)
  }

  const saveOrder = () => {
    if (!selectedOrder) return
    fetcher.submit({
      intent: 'review',
      orderId: selectedOrder.id,
      receivedCount: String(receivedTotal),
      customerCount: String(selectedOrder.clothesCountCustomer),
      receivedItems: JSON.stringify(Object.entries(received[selectedOrder.id] ?? {}).map(([itemId, quantity]) => ({ itemId, quantity }))),
      addedItems: JSON.stringify(addedItems),
      mismatchDetail: notes,
    }, { method: 'post' })
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Good morning, {vendorName}</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-500">Claim incoming orders, record what arrived, and flag any mismatch for review.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 items-center gap-2 rounded-[8px] border border-[#dedede] bg-white px-3 text-sm text-slate-700">
            <span className="font-medium">Date</span>
            <select value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="bg-transparent font-semibold outline-none">
              <option>Today</option>
              <option>This week</option>
              <option>All time</option>
            </select>
          </label>
          <Link to="/vendor/orders" className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#dedede] bg-white px-3 text-sm font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary">
            View all orders <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, icon: Icon, tone }) => (
          <div key={label} className="rounded-[10px] border border-[#e9e9e9] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>
              <Icon size={17} className="text-slate-400" />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-[10px] border border-[#e9e9e9] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#ededed] p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Order queue</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">Orders needing attention</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search size={15} className="absolute left-3 top-3 text-slate-400" />
              <span className="flex h-9 w-44 items-center rounded-[8px] border border-[#e1e1e1] pl-9 text-xs text-slate-400">Search orders</span>
            </div>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#e1e1e1] text-slate-500 hover:border-brand-primary hover:text-brand-primary" aria-label="Filter orders">
              <SlidersHorizontal size={15} />
            </button>
            <Link to="/vendor/orders" className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#e1e1e1] text-slate-500 hover:border-brand-primary hover:text-brand-primary" aria-label="Open all orders">
              <ChevronRight size={17} />
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto p-4 md:p-5">
          <table className="w-full min-w-[1240px] table-fixed text-left">
            <thead>
              <tr className="border-b border-[#ededed] text-[10px] uppercase tracking-[0.16em] text-slate-400">
                <th className="w-40 px-4 py-3 font-semibold">Picked up date</th><th className="w-40 px-4 py-3 font-semibold">Created at</th><th className="w-36 px-4 py-3 font-semibold">Order type</th><th className="w-56 px-4 py-3 font-semibold">Customer</th><th className="w-40 px-4 py-3 font-semibold">Customer ID</th><th className="w-40 px-4 py-3 font-semibold">Pickup location</th><th className="w-24 px-4 py-3 font-semibold">Items</th><th className="w-40 px-4 py-3 font-semibold">Status</th><th className="w-32 px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-500" title={order.collectedAt}>{order.collectedAt}</td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-500" title={order.createdAt}>{order.createdAt}</td>
                  <td className="max-w-36 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600" title={orderTypeLabels[order.orderType]}>{orderTypeLabels[order.orderType]}</td>
                  <td className="max-w-56 px-4 py-4"><p className="truncate whitespace-nowrap font-semibold text-slate-900" title={order.customer}>{order.customer}</p><p className="mt-1 truncate whitespace-nowrap text-xs text-slate-400" title={order.id}>{order.id}</p></td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600" title={order.customerId}>{order.customerId}</td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600" title={order.location}>{order.location}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{order.clothesCountCustomer}</td>
                  <td className="px-4 py-4"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>{order.status}</span></td>
                  <td className="whitespace-nowrap px-4 py-4 text-right"><button type="button" onClick={() => openOrderDetails(order)} className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary">View details</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleOrders.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {dateRange === 'Today' ? 'No orders today.' : 'No orders in this date range.'}
            </p>
          )}
        </div>
      </section>

      {selectedOrder && <OrderReviewDialog order={selectedOrder} received={received[selectedOrder.id] ?? {}} receivedTotal={receivedTotal} mismatchItems={mismatchItems} notes={notes} addedItems={addedItems} categoryNames={rateCard.map((rate) => rate.name)} isPreClaim={selectedOrder.orderStatus === 'pending_pickup'} onReceivedChange={(itemId, value) => setReceived((current) => ({ ...current, [selectedOrder.id]: { ...current[selectedOrder.id], [itemId]: value } }))} onNotesChange={setNotes} onAddedItemsChange={setAddedItems} onClose={closeOrderDetails} onSave={saveOrder} onClaim={() => claimOrder(selectedOrder.id)} saving={fetcher.state !== 'idle'} />}
    </div>
  )
}
