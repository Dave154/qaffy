import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Banknote, Check, ChevronRight, Clock3, MapPin, PackageCheck, Search, SlidersHorizontal, UserRound } from 'lucide-react'
import { data, Link, useFetcher, useLocation, useNavigate, useOutletContext, useRevalidator } from 'react-router'
import type { Route } from './+types/Home'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { toast } from '../../../lib/toast'

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })

  const { supabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const formData = await request.formData()
  const orderId = String(formData.get('orderId') ?? '')
  const receivedCount = Number(formData.get('receivedCount') ?? 0)
  const customerCount = Number(formData.get('customerCount') ?? 0)
  const mismatchDetail = String(formData.get('mismatchDetail') ?? '').trim()

  if (!orderId || !Number.isInteger(receivedCount) || receivedCount < 0) return data({ ok: false, message: 'Received item count is invalid.' }, { status: 400, headers })
  if (receivedCount !== customerCount && !mismatchDetail) return data({ ok: false, message: 'Add mismatch details before submitting.' }, { status: 400, headers })

  const { error: orderError } = await supabase
    .from('orders')
    .update({ clothes_count_vendor: receivedCount, status: 'invoiced' })
    .eq('id', orderId)
  if (orderError) return data({ ok: false, message: orderError.message }, { status: 400, headers })

  if (receivedCount !== customerCount) {
    const { error: mismatchError } = await supabase.from('mismatches').insert({
      order_id: orderId,
      direction: receivedCount > customerCount ? 'over' : 'under',
      detail: mismatchDetail,
    })
    if (mismatchError) return data({ ok: false, message: mismatchError.message }, { status: 400, headers })
  }

  return data({ ok: true }, { headers })
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
  locationAddress: string
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
  location: { name: string; address: string | null } | null
  items: Array<{ id: string; category_id: string; quantity: number; service: VendorOrder['items'][number]['service']; unit_price: number; category: { name: string } | null }>
  invoice: { id: string; amount: number; status: 'unpaid' | 'paid'; created_at: string; paid_at: string | null } | null
  mismatches: Array<{ id: string; direction: 'over' | 'under'; detail: string | null; created_at: string }>
  logisticsEvents: Array<{ event_type: 'picked_up' | 'delivered'; created_at: string }>
}

type VendorLoaderData = { orders: VendorLoaderOrder[] }

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
    locationAddress: order.location?.address ?? 'Address not available',
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

const initialOrders: VendorOrder[] = [
  { id: 'QF-1048', customer: 'David Okpe', customerId: 'ID-1048', customerEmail: 'david@example.com', customerPhone: '+234 801 234 5678', collectedAt: 'Today, 09:40', createdAt: 'Today, 08:20', orderType: 'wash_iron', location: 'Yaba', locationAddress: 'Yaba pickup point', status: 'Pending', orderStatus: 'pending_pickup', clothesCountCustomer: 8, clothesCountVendor: null, pickupOtp: '4821', deliveryOtp: '7394', pickupLocationId: 'loc-yaba', notes: 'Separate whites from coloured items.', isSubscriptionOrder: false, billedExtraAmount: null, picked: false, pickedUpDate: null, amountDue: 4480, invoice: { id: 'INV-1048', amount: 4480, status: 'unpaid', createdAt: 'Today, 08:20', paidAt: null }, payment: null, settlement: null, items: [{ id: 'item-1048-1', categoryId: 'shirts', name: 'Shirts', quantity: 3, service: 'wash_iron', unitPrice: 350 }, { id: 'item-1048-2', categoryId: 'trousers', name: 'Trousers', quantity: 2, service: 'wash_iron', unitPrice: 350 }, { id: 'item-1048-3', categoryId: 'polos', name: 'Polos', quantity: 3, service: 'wash_iron', unitPrice: 350 }], mismatches: [], logisticsEvents: [] },
  { id: 'QF-1047', customer: 'Amaka Nwosu', customerId: 'ID-1047', customerEmail: 'amaka@example.com', customerPhone: '+234 802 345 6789', collectedAt: 'Today, 08:15', createdAt: 'Today, 07:30', orderType: 'wash', location: 'Lekki', locationAddress: 'Lekki pickup point', status: 'In progress', orderStatus: 'at_vendor', clothesCountCustomer: 12, clothesCountVendor: null, pickupOtp: '5310', deliveryOtp: '8462', pickupLocationId: 'loc-lekki', notes: '', isSubscriptionOrder: true, billedExtraAmount: null, picked: true, pickedUpDate: 'Today, 08:15', amountDue: 5760, invoice: { id: 'INV-1047', amount: 5760, status: 'paid', createdAt: 'Today, 07:30', paidAt: 'Today, 08:00' }, payment: { provider: 'paystack', reference: 'PAY-1047', amount: 5760, status: 'success', createdAt: 'Today, 08:00' }, settlement: { id: 'SET-SEP-01', periodStart: 'Sep 1, 2026', periodEnd: 'Sep 30, 2026', amountDue: 5760, status: 'pending' }, items: [{ id: 'item-1047-1', categoryId: 'shirts', name: 'Shirts', quantity: 5, service: 'wash', unitPrice: 200 }, { id: 'item-1047-2', categoryId: 'trousers', name: 'Trousers', quantity: 4, service: 'wash', unitPrice: 200 }, { id: 'item-1047-3', categoryId: 'dresses', name: 'Dresses', quantity: 3, service: 'wash', unitPrice: 200 }], mismatches: [], logisticsEvents: [{ eventType: 'picked_up', createdAt: 'Today, 08:15', agent: 'Logistics agent' }] },
  { id: 'QF-1042', customer: 'Tomi Adeyemi', customerId: 'ID-1042', customerEmail: 'tomi@example.com', customerPhone: '+234 803 456 7890', collectedAt: 'Yesterday, 16:20', createdAt: 'Yesterday, 14:10', orderType: 'wash_iron', location: 'Ikeja', locationAddress: 'Ikeja pickup point', status: 'Awaiting review', orderStatus: 'invoiced', clothesCountCustomer: 6, clothesCountVendor: 6, pickupOtp: '6724', deliveryOtp: '1950', pickupLocationId: 'loc-ikeja', notes: 'Handle the polos carefully.', isSubscriptionOrder: false, billedExtraAmount: 0, picked: true, pickedUpDate: 'Yesterday, 16:20', amountDue: 3360, invoice: { id: 'INV-1042', amount: 3360, status: 'paid', createdAt: 'Yesterday, 14:10', paidAt: 'Yesterday, 15:00' }, payment: { provider: 'paystack', reference: 'PAY-1042', amount: 3360, status: 'success', createdAt: 'Yesterday, 15:00' }, settlement: { id: 'SET-AUG-02', periodStart: 'Sep 1, 2026', periodEnd: 'Sep 30, 2026', amountDue: 3360, status: 'pending' }, items: [{ id: 'item-1042-1', categoryId: 'shirts', name: 'Shirts', quantity: 2, service: 'wash_iron', unitPrice: 350 }, { id: 'item-1042-2', categoryId: 'trousers', name: 'Trousers', quantity: 2, service: 'wash_iron', unitPrice: 350 }, { id: 'item-1042-3', categoryId: 'polos', name: 'Polos', quantity: 2, service: 'wash_iron', unitPrice: 350 }], mismatches: [], logisticsEvents: [{ eventType: 'picked_up', createdAt: 'Yesterday, 16:20', agent: 'Logistics agent' }] },
  { id: 'QF-1038', customer: 'Bola Ajayi', customerId: 'ID-1038', customerEmail: 'bola@example.com', customerPhone: '+234 804 567 8901', collectedAt: 'Aug 28, 14:10', createdAt: 'Aug 28, 12:40', orderType: 'mixed', location: 'Surulere', locationAddress: 'Surulere pickup point', status: 'Completed', orderStatus: 'delivered', clothesCountCustomer: 10, clothesCountVendor: 10, pickupOtp: '2148', deliveryOtp: '9037', pickupLocationId: 'loc-surulere', notes: 'No starch.', isSubscriptionOrder: false, billedExtraAmount: 0, picked: true, pickedUpDate: 'Aug 28, 14:10', amountDue: 5040, invoice: { id: 'INV-1038', amount: 5040, status: 'paid', createdAt: 'Aug 28, 12:40', paidAt: 'Aug 28, 13:00' }, payment: { provider: 'paystack', reference: 'PAY-1038', amount: 5040, status: 'success', createdAt: 'Aug 28, 13:00' }, settlement: { id: 'SET-AUG-01', periodStart: 'Aug 1, 2026', periodEnd: 'Aug 31, 2026', amountDue: 5040, status: 'paid' }, items: [{ id: 'item-1038-1', categoryId: 'shirts', name: 'Shirts', quantity: 4, service: 'iron', unitPrice: 200 }, { id: 'item-1038-2', categoryId: 'trousers', name: 'Trousers', quantity: 4, service: 'wash', unitPrice: 200 }, { id: 'item-1038-3', categoryId: 'dresses', name: 'Dresses', quantity: 2, service: 'wash_iron', unitPrice: 320 }], mismatches: [], logisticsEvents: [{ eventType: 'picked_up', createdAt: 'Aug 28, 14:10', agent: 'Logistics agent' }, { eventType: 'delivered', createdAt: 'Aug 30, 12:00', agent: 'Logistics agent' }] },
]

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

function OrderReviewDialog({ order, received, receivedTotal, mismatchItems, notes, onReceivedChange, onNotesChange, onClose, onSave, saving }: {
  order: VendorOrder
  received: Record<string, number>
  receivedTotal: number
  mismatchItems: VendorOrder['items']
  notes: string
  onReceivedChange: (itemName: string, value: number) => void
  onNotesChange: (value: string) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
}) {
  const itemTotal = order.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0)
  const formattedDate = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded'

  return <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-0 sm:items-center sm:p-4">
    <div className="max-h-[calc(100vh-1rem)] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-8">
      <header className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary">Order review</p><h3 className="mt-2 text-2xl font-bold text-slate-900">{order.customer}</h3><p className="mt-1.5 text-sm text-slate-500">{order.id} · {orderStatusLabels[order.orderStatus]} · {orderTypeLabels[order.orderType]}</p></div>
        <button type="button" onClick={onClose} aria-label="Close order review" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-xl text-slate-400 shadow-sm transition hover:border-slate-300 hover:text-slate-600 hover:shadow-md">×</button>
      </header>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-brand-primary" /><h4 className="font-bold text-slate-900">Order summary</h4></div><div className="mt-4 grid gap-4 sm:grid-cols-4"><Detail label="Customer ID" value={order.customerId} /><Detail label="Order type" value={orderTypeLabels[order.orderType]} /><Detail label="Created" value={order.createdAt} /><Detail label="Status" value={orderStatusLabels[order.orderStatus]} /></div><div className="mt-5 border-t border-slate-200 pt-4"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-primary" /><h4 className="font-bold text-slate-900">Pickup details</h4></div><div className="mt-4 grid gap-4 sm:grid-cols-3"><Detail label="Location" value={order.location} /><Detail label="Address" value={order.locationAddress} /><Detail label="Pickup OTP" value={order.picked ? 'Verified' : order.pickupOtp} /></div></div></section>

      <section className="mt-6 rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-brand-primary" /><h4 className="font-bold text-slate-900">Items and service</h4></div><p className="mt-1 text-sm text-slate-500">Customer declared {order.clothesCountCustomer}; vendor received {receivedTotal}.</p></div><span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-primary">{order.items.length} item types</span></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-155 text-left"><thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.14em] text-slate-500"><th className="pb-3 font-semibold">Category</th><th className="pb-3 font-semibold">Service</th><th className="pb-3 font-semibold">Quantity</th><th className="pb-3 font-semibold">Received</th><th className="pb-3 text-right font-semibold">Unit price</th><th className="pb-3 text-right font-semibold">Line total</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="py-3 text-sm font-semibold text-slate-800">{item.name}</td><td className="py-3 text-sm text-slate-600">{serviceLabels[item.service]}</td><td className="py-3 text-sm text-slate-600">{item.quantity}</td><td className="py-3"><input type="number" min="0" value={received[item.name] ?? item.quantity} onChange={(event) => onReceivedChange(item.name, Math.max(0, Number(event.target.value) || 0))} className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-sm font-semibold outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" aria-label={`Received ${item.name}`} /></td><td className="py-3 text-right text-sm text-slate-600">₦{item.unitPrice.toLocaleString()}</td><td className="py-3 text-right text-sm font-semibold text-brand-primary">₦{(item.quantity * item.unitPrice).toLocaleString()}</td></tr>)}</tbody></table></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Detail label="Customer count" value={order.clothesCountCustomer} /><Detail label="Vendor count" value={order.clothesCountVendor ?? receivedTotal} /><Detail label="Items total" value={`₦${itemTotal.toLocaleString()}`} /></div></section>

      <section className="mt-6 rounded-2xl border border-brand-border bg-brand-soft p-4 shadow-sm sm:p-5"><div className="flex items-center gap-2"><Banknote className="h-4 w-4 text-brand-primary" /><h4 className="font-bold text-slate-900">Order total</h4></div><div className="mt-4 grid gap-4 sm:grid-cols-4"><Detail label="Amount due" value={`₦${order.amountDue.toLocaleString()}`} /><Detail label="Invoice status" value={order.invoice?.status ?? 'Not invoiced'} /><Detail label="Payment status" value={order.payment?.status ?? (order.invoice?.status === 'paid' ? 'Paid' : 'Pending')} /><Detail label="Subscription" value={order.isSubscriptionOrder ? 'Yes' : 'No'} /></div>{order.billedExtraAmount !== null && <p className="mt-4 text-sm font-semibold text-brand-strong">Extra billed: ₦{order.billedExtraAmount.toLocaleString()}</p>}</section>

      <section className="mt-6 rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5"><h4 className="font-bold text-slate-900">Notes and verification</h4><Detail label="Customer notes" value={order.notes || 'No notes added'} />{mismatchItems.length > 0 && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><p className="font-semibold text-amber-800">Mismatch detected</p><p className="mt-1.5 text-sm text-amber-700">Add itemized details for Admin review.</p><textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="e.g. 1 red shirt missing" className="mt-3 min-h-24 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></div>}{order.mismatches.length > 0 && <div className="mt-4 space-y-2">{order.mismatches.map((mismatch) => <div key={mismatch.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><strong className="text-amber-800">{mismatch.direction === 'over' ? 'Overage' : 'Shortage'}</strong><span className="ml-2 text-amber-700">{mismatch.detail}</span><p className="mt-1 text-xs text-amber-600">{formattedDate(mismatch.createdAt)}</p></div>)}</div>}</section>

      <button type="button" onClick={onSave} disabled={saving || (mismatchItems.length > 0 && !notes.trim())} className="mt-6 w-full rounded-2xl bg-brand-primary px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Submitting...' : 'Submit for admin review'}</button>
    </div>
  </div>
}

export default function Home() {
  const { orders: loadedOrders } = useOutletContext<VendorLoaderData>()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()
  const location = useLocation()
  const navigate = useNavigate()
  const [orders, setOrders] = useState(() => loadedOrders.length > 0 ? loadedOrders.map(mapLoaderOrder) : initialOrders)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [received, setReceived] = useState<Record<string, Record<string, number>>>({})
  const [notes, setNotes] = useState('')
  const [dateRange, setDateRange] = useState('Today')
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null

  useEffect(() => {
    const requestedOrderId = new URLSearchParams(location.search).get('orderId')
    if (requestedOrderId && orders.some((order) => order.id === requestedOrderId)) setSelectedOrderId(requestedOrderId)
  }, [location.search, orders])

  useEffect(() => {
    if (!fetcher.data) return
    if (fetcher.data.ok) {
      toast.success('Order review submitted.')
      setSelectedOrderId(null)
      setNotes('')
      navigate('/vendor', { replace: true })
      revalidator.revalidate()
    } else if ('message' in fetcher.data) {
      toast.error(String(fetcher.data.message))
    }
  }, [fetcher.data, navigate, revalidator])

  const visibleOrders = orders.filter((order) => {
    if (dateRange === 'Today') return order.collectedAt.startsWith('Today')
    if (dateRange === 'This week') return !order.collectedAt.startsWith('Aug')
    return true
  })

  const metrics = useMemo(() => [
    { label: 'Pending', value: orders.filter((order) => order.status === 'Pending').length, helper: 'Available to claim', icon: Clock3, tone: 'bg-amber-50 text-amber-700' },
    { label: 'In progress', value: orders.filter((order) => order.status === 'In progress').length, helper: 'Being processed', icon: PackageCheck, tone: 'bg-brand-soft text-brand-primary' },
    { label: 'Completed', value: orders.filter((order) => order.status === 'Completed').length, helper: 'Completed orders', icon: Check, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Amount due', value: `₦${visibleOrders.reduce((total, order) => total + order.amountDue, 0).toLocaleString()}`, helper: `For ${dateRange.toLowerCase()}`, icon: Banknote, tone: 'bg-sky-50 text-sky-700' },
  ], [dateRange, orders, visibleOrders])

  const claimOrder = (orderId: string) => {
    setOrders((current) => current.map((order) => order.id === orderId ? { ...order, status: 'In progress' } : order))
  }

  const openReview = (order: VendorOrder) => {
    setSelectedOrderId(order.id)
    setReceived({ [order.id]: Object.fromEntries(order.items.map((item) => [item.name, item.quantity])) })
  }

  const receivedTotal = selectedOrder ? Object.values(received[selectedOrder.id] ?? {}).reduce((total, count) => total + count, 0) : 0
  const mismatchItems = selectedOrder?.items.filter((item) => (received[selectedOrder.id]?.[item.name] ?? 0) !== item.quantity) ?? []

  const saveOrder = () => {
    if (!selectedOrder) return
    if (loadedOrders.length > 0) {
      fetcher.submit({
        orderId: selectedOrder.id,
        receivedCount: String(receivedTotal),
        customerCount: String(selectedOrder.clothesCountCustomer),
        mismatchDetail: notes,
      }, { method: 'post' })
      return
    }
    const mismatch = mismatchItems.length > 0 && notes.trim()
      ? { id: `mismatch-${selectedOrder.id}-${Date.now()}`, direction: receivedTotal > selectedOrder.clothesCountCustomer ? 'over' as const : 'under' as const, detail: notes.trim(), createdAt: new Date().toISOString() }
      : null
    setOrders((current) => current.map((order) => order.id === selectedOrder.id
      ? { ...order, status: 'Awaiting review', orderStatus: 'invoiced', clothesCountVendor: receivedTotal, mismatches: mismatch ? [...order.mismatches, mismatch] : order.mismatches }
      : order))
    setSelectedOrderId(null)
    setNotes('')
    navigate('/vendor', { replace: true })
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Good morning, vendor</h2>
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
        {metrics.map(({ label, value, helper, icon: Icon, tone }) => (
          <div key={label} className="rounded-[10px] border border-[#e9e9e9] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>
              <Icon size={17} className="text-slate-400" />
            </div>
            <p className="mt-5 text-3xl font-bold text-slate-900">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{helper}</p>
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
          <table className="w-full min-w-[1160px] table-fixed text-left">
            <thead>
              <tr className="border-b border-[#ededed] text-[10px] uppercase tracking-[0.16em] text-slate-400">
                <th className="w-28 pb-3 pr-5 font-semibold">Picked up date</th><th className="w-28 pb-3 pr-5 font-semibold">Created at</th><th className="w-24 pb-3 pr-5 font-semibold">Order type</th><th className="w-44 pb-3 pr-5 font-semibold">Customer</th><th className="w-28 pb-3 pr-5 font-semibold">Customer ID</th><th className="w-28 pb-3 pr-5 font-semibold">Pickup location</th><th className="w-32 pb-3 pr-5 font-semibold">Clothes count</th><th className="w-32 pb-3 pr-5 font-semibold">Status</th><th className="w-24 pb-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="whitespace-nowrap py-4 pr-5 text-sm text-slate-500">{order.collectedAt}</td>
                  <td className="whitespace-nowrap py-4 pr-5 text-sm text-slate-500">{order.createdAt}</td>
                  <td className="py-4 pr-5 text-sm text-slate-600">{orderTypeLabels[order.orderType]}</td>
                  <td className="py-4 pr-5"><p className="font-semibold text-slate-900">{order.customer}</p><p className="mt-1 text-xs text-slate-400">{order.id}</p></td>
                  <td className="whitespace-nowrap py-4 pr-5 text-sm text-slate-600">{order.customerId}</td>
                  <td className="py-4 pr-5 text-sm text-slate-600">{order.location}</td>
                  <td className="py-4 pr-5 text-sm text-slate-600">{order.clothesCountCustomer}</td>
                  <td className="py-4 pr-5"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>{order.status}</span></td>
                  <td className="py-4 text-right">{order.status === 'Pending' ? <button type="button" onClick={() => claimOrder(order.id)} className="rounded-[7px] bg-brand-primary px-3 py-2 text-xs font-semibold text-white hover:bg-brand-primary-hover">Claim</button> : <button type="button" onClick={() => openReview(order)} className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary">Review</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleOrders.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No orders in this date range.</p>}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[10px] bg-brand-primary p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-50">Awaiting admin review</p>
          <p className="mt-4 text-3xl font-bold">₦18,640</p>
          <p className="mt-2 text-sm text-cyan-50">Estimated value of submitted work</p>
          <Link to="/vendor/clearing-history" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white">View clearing history <ArrowRight size={16} /></Link>
        </div>
        <div className="rounded-[10px] border border-[#e9e9e9] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Vendor rate card</p>
            <span className="text-xs text-slate-400">Per item</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { name: 'Shirts', wash: '₦200', washIron: '₦350', iron: '₦200' },
              { name: 'Trousers', wash: '₦200', washIron: '₦350', iron: '₦200' },
              { name: 'Blouses', wash: '₦200', washIron: '₦350', iron: '₦200' },
              { name: 'Bedsheet', wash: '₦600', washIron: '₦900', iron: '₦600' },
              { name: 'Towel', wash: '₦600', washIron: '₦900', iron: '₦600' },
              { name: 'Suit', wash: '₦2,000', washIron: '₦2,000', iron: '₦2,000' },
            ].map((item) => (
              <div key={item.name} className="rounded-[8px] bg-[#f8f8f8] p-2.5">
                <p className="truncate text-xs font-semibold text-slate-800">{item.name}</p>
                <div className="mt-2 space-y-1 text-[10px] text-slate-500">
                  <p className="flex justify-between gap-2"><span>Wash</span><strong className="text-brand-primary">{item.wash}</strong></p>
                  <p className="flex justify-between gap-2"><span>Wash &amp; iron</span><strong className="text-brand-primary">{item.washIron}</strong></p>
                  <p className="flex justify-between gap-2"><span>Iron</span><strong className="text-brand-primary">{item.iron}</strong></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {selectedOrder && <OrderReviewDialog order={selectedOrder} received={received[selectedOrder.id] ?? {}} receivedTotal={receivedTotal} mismatchItems={mismatchItems} notes={notes} onReceivedChange={(itemName, value) => setReceived((current) => ({ ...current, [selectedOrder.id]: { ...current[selectedOrder.id], [itemName]: value } }))} onNotesChange={setNotes} onClose={() => { setSelectedOrderId(null); navigate('/vendor', { replace: true }) }} onSave={saveOrder} saving={fetcher.state !== 'idle'} />}
    </div>
  )
}
