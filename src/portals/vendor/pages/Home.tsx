import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronRight, Clock3, LoaderCircle, PackageCheck, Search, Truck } from 'lucide-react'
import { data, Link, useFetcher, useLocation, useNavigate, useNavigation, useOutletContext, useRevalidator } from 'react-router'
import type { Route } from './+types/Home'
import { sql } from '../../../lib/db.server'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { requireRole } from '../../../lib/auth.server'
import { finalizeVendorOrder } from '../../../lib/wallet.server'
import { toast } from '../../../lib/toast'
import { sendCustomerNotification, walletInvoicePaidNotification } from '../../../lib/notifications.server'
import { MultiSortManager, SortColumnHeader } from '../../../components/admin/MultiSortControls'
import type { MultiSortOption, MultiSortRule } from '../../../components/admin/MultiSortControls'
import VendorOrderReviewDialog, {
  getInitialReceivedCounts,
  type VendorReviewAddedItem,
  type VendorReviewOrder,
} from '../VendorOrderReviewDialog'

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
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id')
      .eq('profile_id', vendorAuth.profile.id)
      .eq('status', 'approved')
      .maybeSingle()
    if (vendorError) return data({ ok: false, message: vendorError.message }, { status: 400, headers })
    if (!vendor) return data({ ok: false, message: 'Approved vendor access is required to claim orders.' }, { status: 403, headers })
    let claimedOrder
    try {
      ;[claimedOrder] = await sql`
        update orders
        set status = 'at_vendor', vendor_id = ${vendor.id}
        where id = ${orderId}
          and status = 'picked_up'
          and vendor_id is null
        returning id
      `
    } catch (error) {
      return data({ ok: false, message: error instanceof Error ? error.message : 'Order claim failed.' }, { status: 400, headers })
    }
    if (!claimedOrder) return data({ ok: false, message: 'This order is no longer available to claim.' }, { status: 409, headers })
    return data({ ok: true, intent: 'claim' as const }, { headers })
  }

  if (intent !== 'review') return data({ ok: false, message: 'Invalid vendor action.' }, { status: 400, headers })

  const mismatchDetail = String(formData.get('mismatchDetail') ?? '').trim()
  let addedItems: Array<{ categoryName: string; service: 'wash' | 'iron' | 'wash_iron'; quantity: number }>
  let receivedItems: Array<{ itemId: string; quantity: number }>
  try {
    receivedItems = JSON.parse(String(formData.get('receivedItems') ?? '[]'))
    addedItems = JSON.parse(String(formData.get('addedItems') ?? '[]'))
  } catch {
    return data({ ok: false, message: 'Received item details are invalid.' }, { status: 400, headers })
  }

  if (!orderId) return data({ ok: false, message: 'Order ID is required.' }, { status: 400, headers })

  try {
    const result = await finalizeVendorOrder(orderId, vendorAuth.profile.id, receivedItems, addedItems, mismatchDetail)
    if (result.subscriptionId && result.subscriptionUnitsBorrowed > 0) {
      const borrowedUnits = result.subscriptionUnitsBorrowed
      const nextBalance = result.subscriptionBalanceAfterNextCredit ?? 0
      await sendCustomerNotification({
        eventKey: `subscription:${result.subscriptionId}:order:${orderId}:allowance-borrowed`,
        customerId: result.customerId,
        notificationType: 'subscription_allowance_borrowed',
        subscriptionId: result.subscriptionId,
        orderId,
        payload: {
          title: 'Upcoming plan allowance used',
          body: `${borrowedUnits} units were borrowed from an upcoming weekly allowance for ${result.publicOrderNumber}. ${nextBalance} units will remain after that allowance is added.`,
          details: [
            `Order: ${result.publicOrderNumber}`,
            `Borrowed from the upcoming allowance: ${borrowedUnits} units`,
            `Expected balance after the next allowance: ${nextBalance} units`,
          ],
          url: '/plans',
          tag: `subscription:${result.subscriptionId}:allowance-borrowed`,
        },
      })
    }
    if (result.mismatchDirection) {
      await sendCustomerNotification({
        eventKey: `mismatch:${orderId}:confirmed`,
        customerId: result.customerId,
        notificationType: 'mismatch_confirmed',
        orderId,
        payload: {
          title: 'Order count updated',
          body: `A different item count was confirmed for ${result.publicOrderNumber}. Review the updated invoice.`,
          details: [
            `Order: ${result.publicOrderNumber}`,
            `Count change: ${result.mismatchDirection === 'over' ? 'More items were confirmed' : 'Fewer items were confirmed'}`,
            'Review the updated invoice for the final amount.',
          ],
          url: `/orders?order=${encodeURIComponent(result.publicOrderNumber)}`,
          tag: `order:${orderId}:mismatch`,
        },
      })
    }
    if (result.invoiceStatus === 'unpaid') {
      await sendCustomerNotification({
        eventKey: `invoice:${result.invoiceId}:payment-required`,
        customerId: result.customerId,
        notificationType: 'payment_required',
        orderId,
        payload: {
          title: 'Payment required',
          body: `Payment is needed before ${result.publicOrderNumber} can be delivered.`,
          details: [`Order: ${result.publicOrderNumber}`, 'The invoice is still unpaid.', 'Top up your wallet to make delivery available.'],
          url: `/invoice?order=${encodeURIComponent(result.publicOrderNumber)}`,
          tag: `order:${orderId}:payment`,
        },
      })
    }
    if (result.invoiceStatus === 'paid') {
      await sendCustomerNotification({
        eventKey: `invoice:${result.invoiceId}:paid`,
        customerId: result.customerId,
        notificationType: 'payment_confirmed',
        orderId,
        payload: walletInvoicePaidNotification(result.amount, result.publicOrderNumber, orderId),
      })
    }
    return data({ ok: true, amount: result.amount, invoiceStatus: result.invoiceStatus }, { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order review could not be submitted.'
    return data({ ok: false, message }, { status: 400, headers })
  }
}

type VendorOrder = {
  id: string
  publicOrderNumber: string
  customer: string
  customerId: string
  customerEmail: string
  customerPhone: string
  collectedAt: string
  orderType: 'wash' | 'wash_iron' | 'mixed'
  location: string
  status: 'Pending' | 'Processing' | 'Ready to dispatch' | 'Out for delivery' | 'Completed' | 'Cancelled'
  orderStatus: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  clothesCountVendor: number | null
  pickupOtp: string
  deliveryOtp: string
  pickupLocationId: string
  notes: string
  billedExtraAmount: number | null
  picked: boolean
  pickedUpDate: string | null
  amountDue: number
  invoice: { id: string; amount: number; status: 'unpaid' | 'paid'; createdAt: string; paidAt: string | null } | null
  payment: { provider: string; reference: string; amount: number; status: 'pending' | 'success' | 'failed'; createdAt: string } | null
  settlement: { id: string; periodStart: string; periodEnd: string; amountDue: number; status: 'pending' | 'paid' } | null
  items: Array<{
    id: string
    categoryId: string
    name: string
    quantity: number
    confirmedQuantity: number | null
    service: 'wash' | 'iron' | 'wash_iron'
    unitPrice: number
  }>
  mismatches: Array<{
    id: string
    direction: 'over' | 'under'
    detail: string
    createdAt: string
    lines: VendorReviewOrder['mismatches'][number]['lines']
  }>
  logisticsEvents: Array<{ eventType: 'picked_up' | 'delivered'; createdAt: string; agent: string }>
}

type VendorLoaderOrder = {
  id: string
  public_order_number: string
  customer_id: string
  order_type: VendorOrder['orderType']
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
  items: Array<{
    id: string
    category_id: string
    quantity: number
    confirmed_quantity: number | null
    service: VendorOrder['items'][number]['service']
    unit_price: number
    category: { name: string } | null
  }>
  invoice: { id: string; amount: number; status: 'unpaid' | 'paid'; created_at: string; paid_at: string | null } | null
  mismatches: Array<{
    id: string
    direction: 'over' | 'under'
    detail: string | null
    details: VendorReviewOrder['mismatches'][number]['lines']
    created_at: string
  }>
  logisticsEvents: Array<{ event_type: 'picked_up' | 'delivered'; created_at: string }>
}

type VendorLoaderData = {
  orders: VendorLoaderOrder[]
  vendorName: string
  rateCard: Array<{ name: string; wash: number | null; iron: number | null; wash_iron: number | null }>
  overviewMetrics: Record<string, { pending: number; active: number; dispatched: number; completed: number }> | null
  overviewOrderIds: string[] | null
  overviewPagination: { page: number; pageSize: number; totalCount: number; pageCount: number } | null
}

function mapLoaderOrder(order: VendorLoaderOrder): VendorOrder {
  const statusMap: Record<VendorLoaderOrder['status'], VendorOrder['status']> = {
    pending_pickup: 'Pending',
    picked_up: 'Pending',
    at_vendor: 'Processing',
    invoiced: 'Processing',
    paid: 'Processing',
    out_for_delivery: 'Out for delivery',
    delivered: 'Completed',
    cancelled: 'Cancelled',
  }
  return {
    id: order.id,
    publicOrderNumber: order.public_order_number,
    customer: order.customer?.name ?? 'Customer',
    customerId: order.customer?.qaffy_id ?? order.customer_id,
    customerEmail: order.customer?.email ?? 'Not available',
    customerPhone: order.customer?.phone ?? 'Not available',
    collectedAt: order.picked_up_date ? new Date(order.picked_up_date).toLocaleString() : 'Not recorded',
    orderType: order.order_type,
    location: order.location?.name ?? 'Pickup location pending',
    status: statusMap[order.status],
    orderStatus: order.status,
    clothesCountVendor: order.clothes_count_vendor,
    pickupOtp: order.pickup_otp ?? '',
    deliveryOtp: order.delivery_otp ?? '',
    pickupLocationId: order.pickup_location_id ?? '',
    notes: order.notes ?? '',
    billedExtraAmount: order.billed_extra_amount,
    picked: order.picked,
    pickedUpDate: order.picked_up_date,
    amountDue: order.invoice?.amount ?? 0,
    invoice: order.invoice
      ? {
          id: order.invoice.id,
          amount: order.invoice.amount,
          status: order.invoice.status,
          createdAt: order.invoice.created_at,
          paidAt: order.invoice.paid_at,
        }
      : null,
    payment: null,
    settlement: null,
    items: order.items.map((item) => ({
      id: item.id,
      categoryId: item.category_id,
      name: item.category?.name ?? 'Laundry item',
      quantity: item.quantity,
      confirmedQuantity: item.confirmed_quantity,
      service: item.service,
      unitPrice: Number(item.unit_price),
    })),
    mismatches: order.mismatches.map((mismatch) => ({
      id: mismatch.id,
      direction: mismatch.direction,
      detail: mismatch.detail ?? 'Mismatch recorded',
      createdAt: mismatch.created_at,
      lines: mismatch.details ?? [],
    })),
    logisticsEvents: order.logisticsEvents.map((event) => ({
      eventType: event.event_type,
      createdAt: event.created_at,
      agent: 'Logistics agent',
    })),
  }
}

const statusStyles: Record<VendorOrder['status'], string> = {
  Pending: 'bg-amber-50 text-amber-700',
  Processing: 'bg-brand-soft text-brand-primary',
  'Ready to dispatch': 'bg-sky-50 text-sky-700',
  'Out for delivery': 'bg-teal-50 text-teal-700',
  Completed: 'bg-emerald-50 text-emerald-700',
  Cancelled: 'bg-red-50 text-red-700',
}

const orderTypeLabels: Record<VendorOrder['orderType'], string> = { wash: 'Wash only', wash_iron: 'Wash + Iron', mixed: 'Mixed service' }
type OverviewDateMode = 'all' | 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'
type OverviewSortColumn = 'pickup_date' | 'order_type' | 'customer' | 'customer_id' | 'location' | 'status'
type OverviewSortRule = MultiSortRule<OverviewSortColumn>

const overviewDateOptions: Array<{ value: OverviewDateMode; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
]

const overviewSortableColumns: MultiSortOption<OverviewSortColumn>[] = [
  { value: 'pickup_date', label: 'Picked up date' },
  { value: 'order_type', label: 'Order type' },
  { value: 'customer', label: 'Customer' },
  { value: 'customer_id', label: 'Customer ID' },
  { value: 'location', label: 'Pickup location' },
  { value: 'status', label: 'Status' },
]

function parseOverviewSortRules(value: string | null): OverviewSortRule[] {
  if (!value) return []
  const seen = new Set<OverviewSortColumn>()
  return value.split(',').flatMap((rule): OverviewSortRule[] => {
    const [column, direction] = rule.split(':')
    if (
      !overviewSortableColumns.some((option) => option.value === column) ||
      (direction !== 'asc' && direction !== 'desc') ||
      seen.has(column as OverviewSortColumn)
    ) {
      return []
    }
    seen.add(column as OverviewSortColumn)
    return [{ column: column as OverviewSortColumn, direction }]
  })
}

export default function Home() {
  const {
    orders: loadedOrders,
    vendorName,
    rateCard,
    overviewMetrics,
    overviewOrderIds,
    overviewPagination,
  } = useOutletContext<VendorLoaderData>()
  const fetcher = useFetcher<typeof action>()
  const { revalidate } = useRevalidator()
  const location = useLocation()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const orders = loadedOrders.map(mapLoaderOrder)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [detailsDismissed, setDetailsDismissed] = useState(false)
  const [received, setReceived] = useState<Record<string, Record<string, number | undefined>>>({})
  const [addedItems, setAddedItems] = useState<VendorReviewAddedItem[]>([])
  const [notes, setNotes] = useState('')
  const searchParams = new URLSearchParams(location.search)
  const legacyRange = searchParams.get('range')
  const legacyMode =
    legacyRange === 'Today' ? 'today' : legacyRange === 'This week' ? 'this_week' : legacyRange === 'All time' ? 'all' : null
  const requestedDateMode = searchParams.get('date') ?? legacyMode ?? 'today'
  const dateMode: OverviewDateMode = overviewDateOptions.some((option) => option.value === requestedDateMode)
    ? (requestedDateMode as OverviewDateMode)
    : 'today'
  const startDate = searchParams.get('from') ?? ''
  const endDate = searchParams.get('to') ?? ''
  const sortRules = searchParams.has('sort')
    ? parseOverviewSortRules(searchParams.get('sort'))
    : [{ column: 'pickup_date', direction: 'desc' } satisfies OverviewSortRule]
  const [customRangeOpen, setCustomRangeOpen] = useState(false)
  const [draftStartDate, setDraftStartDate] = useState(startDate)
  const [draftEndDate, setDraftEndDate] = useState(endDate)
  const handledFetcherData = useRef<typeof fetcher.data>(null)
  const isClaimingOrder = (orderId: string) =>
    fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'claim' && fetcher.formData?.get('orderId') === orderId
  const requestedOrderId = new URLSearchParams(location.search).get('orderId')
  const returnPath = new URLSearchParams(location.search).get('returnTo') === 'orders' ? '/vendor/orders' : '/vendor'
  const selectedOrder = detailsDismissed
    ? null
    : (orders.find((order) => order.id === (selectedOrderId ?? requestedOrderId) && order.orderStatus !== 'pending_pickup') ?? null)
  const selectedReceived = selectedOrder
    ? (received[selectedOrder.id] ??
      getInitialReceivedCounts(selectedOrder.items, selectedOrder.mismatches, selectedOrder.clothesCountVendor))
    : {}
  const reviewOrder: VendorReviewOrder | null = selectedOrder
    ? {
        id: selectedOrder.id,
        publicOrderNumber: selectedOrder.publicOrderNumber,
        customer: selectedOrder.customer,
        orderType: selectedOrder.orderType,
        orderStatus: selectedOrder.orderStatus,
        confirmedCount: selectedOrder.clothesCountVendor,
        notes: selectedOrder.notes,
        items: selectedOrder.items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          confirmedQuantity: item.confirmedQuantity,
          service: item.service,
          unitPrice: item.unitPrice,
        })),
        mismatches: selectedOrder.mismatches,
      }
    : null

  useEffect(() => {
    if (!fetcher.data || handledFetcherData.current === fetcher.data) return
    handledFetcherData.current = fetcher.data
    if (fetcher.data.ok) {
      toast.success('intent' in fetcher.data && fetcher.data.intent === 'claim' ? 'Order claimed.' : 'Order review submitted.')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedOrderId(null)
      setNotes('')
      revalidate()
    } else if ('message' in fetcher.data) {
      toast.error(String(fetcher.data.message))
    }
  }, [fetcher.data, revalidate])

  const visibleOrders = orders.filter((order) => overviewOrderIds?.includes(order.id))
  const attentionOrders = visibleOrders.filter((order) => order.orderStatus === 'picked_up')
  const isLoadingOverview = navigation.state === 'loading' && navigation.location?.pathname === '/vendor'
  const updateOverviewQuery = (updates: {
    dateMode?: OverviewDateMode
    from?: string
    to?: string
    sortRules?: OverviewSortRule[]
    page?: number
  }) => {
    const nextSearchParams = new URLSearchParams(location.search)
    if (updates.dateMode !== undefined) {
      nextSearchParams.set('date', updates.dateMode)
      nextSearchParams.delete('range')
      if (updates.dateMode !== 'custom') {
        nextSearchParams.delete('from')
        nextSearchParams.delete('to')
      }
      nextSearchParams.delete('page')
    }
    if (updates.from !== undefined || updates.to !== undefined) {
      nextSearchParams.set('date', 'custom')
      nextSearchParams.delete('range')
      if (updates.from) nextSearchParams.set('from', updates.from)
      else nextSearchParams.delete('from')
      if (updates.to) nextSearchParams.set('to', updates.to)
      else nextSearchParams.delete('to')
      nextSearchParams.delete('page')
    }
    if (updates.sortRules !== undefined) {
      nextSearchParams.set('sort', updates.sortRules.map((rule) => `${rule.column}:${rule.direction}`).join(','))
      nextSearchParams.delete('page')
    }
    if (updates.page !== undefined) {
      if (updates.page <= 1) nextSearchParams.delete('page')
      else nextSearchParams.set('page', String(updates.page))
    }
    const query = nextSearchParams.toString()
    navigate(`${location.pathname}${query ? `?${query}` : ''}`, { replace: true })
  }

  const changeColumnSort = (column: OverviewSortColumn, direction: OverviewSortRule['direction']) => {
    const updatedRules = [{ column, direction }, ...sortRules.filter((rule) => rule.column !== column)]
    updateOverviewQuery({ sortRules: updatedRules })
  }
  const renderSortHeader = (column: OverviewSortColumn, label: string) => {
    const activeRule = sortRules.find((rule) => rule.column === column)
    return (
      <SortColumnHeader
        label={label}
        direction={activeRule?.direction ?? null}
        onSort={(direction) => changeColumnSort(column, direction)}
        fillWidth
      />
    )
  }
  const isValidCustomRange = Boolean(draftStartDate && draftEndDate && draftStartDate <= draftEndDate)
  const summary = overviewMetrics?.[dateMode]
  const metrics = [
    {
      label: 'Pending',
      value: summary?.pending ?? visibleOrders.filter((order) => order.orderStatus === 'picked_up').length,
      helper: 'Available to claim',
      icon: Clock3,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Active orders',
      value: summary?.active ?? visibleOrders.filter((order) => ['at_vendor', 'invoiced', 'paid'].includes(order.orderStatus)).length,
      helper: 'In progress or ready to dispatch',
      icon: PackageCheck,
      tone: 'bg-brand-soft text-brand-primary',
    },
    {
      label: 'Dispatched',
      value: summary?.dispatched ?? visibleOrders.filter((order) => order.orderStatus === 'out_for_delivery').length,
      helper: 'Out for delivery',
      icon: Truck,
      tone: 'bg-teal-50 text-teal-700',
    },
    {
      label: 'Completed',
      value: summary?.completed ?? visibleOrders.filter((order) => order.orderStatus === 'delivered').length,
      helper: 'Completed orders',
      icon: Check,
      tone: 'bg-emerald-50 text-emerald-700',
    },
  ]

  const claimOrder = (orderId: string) => {
    fetcher.submit({ intent: 'claim', orderId }, { method: 'post' })
  }

  const openOrderDetails = (order: VendorOrder) => {
    setDetailsDismissed(false)
    setSelectedOrderId(order.id)
    setAddedItems([])
    setReceived({
      [order.id]: getInitialReceivedCounts(order.items, order.mismatches, order.clothesCountVendor),
    })
  }

  const mismatchItems =
    selectedOrder?.items.filter((item) => {
      const receivedCount = selectedReceived[item.id]
      return receivedCount !== undefined && receivedCount !== item.quantity
    }) ?? []
  const hasMismatch = mismatchItems.length > 0 || addedItems.length > 0

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
    fetcher.submit(
      {
        intent: 'review',
        orderId: selectedOrder.id,
        receivedItems: JSON.stringify(Object.entries(selectedReceived).map(([itemId, quantity]) => ({ itemId, quantity }))),
        addedItems: JSON.stringify(addedItems),
        mismatchDetail: notes,
      },
      { method: 'post' },
    )
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Good morning, {vendorName}</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            Claim incoming orders, record what arrived, and flag any mismatch for review.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-[8px] border border-[#dedede] bg-white px-3 text-sm text-slate-700">
              <span className="font-medium">Date</span>
              <select
                value={dateMode}
                onChange={(event) => {
                  const nextMode = event.target.value as OverviewDateMode
                  if (nextMode === 'custom') {
                    setDraftStartDate(startDate)
                    setDraftEndDate(endDate)
                    setCustomRangeOpen(true)
                  } else {
                    setCustomRangeOpen(false)
                    updateOverviewQuery({ dateMode: nextMode })
                  }
                }}
                className="bg-transparent font-semibold outline-none"
              >
                {overviewDateOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {dateMode === 'custom' && (
              <button
                type="button"
                onClick={() => {
                  setDraftStartDate(startDate)
                  setDraftEndDate(endDate)
                  setCustomRangeOpen(true)
                }}
                className="h-10 rounded-[8px] border border-[#dedede] bg-white px-3 text-sm font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary"
              >
                Edit dates
              </button>
            )}
            {customRangeOpen && (
              <div
                role="dialog"
                aria-label="Custom pickup date range"
                className="absolute right-0 top-full z-30 mt-2 w-[min(90vw,360px)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
              >
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-xs font-medium text-slate-600">
                    From
                    <input
                      type="date"
                      value={draftStartDate}
                      max={draftEndDate || undefined}
                      onChange={(event) => setDraftStartDate(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-slate-600">
                    To
                    <input
                      type="date"
                      value={draftEndDate}
                      min={draftStartDate || undefined}
                      onChange={(event) => setDraftEndDate(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    {draftStartDate && draftEndDate && !isValidCustomRange ? 'End date must be on or after start date.' : ''}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomRangeOpen(false)}
                      className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!isValidCustomRange}
                      onClick={() => {
                        updateOverviewQuery({ from: draftStartDate, to: draftEndDate })
                        setCustomRangeOpen(false)
                      }}
                      className="h-9 rounded-lg bg-brand-primary px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Link
            to="/vendor/orders?tab=unclaimed"
            className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#dedede] bg-white px-3 text-sm font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary"
          >
            All orders <ArrowRight size={16} />
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
            <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{helper}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[10px] border border-[#e9e9e9] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#ededed] p-4 md:p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Orders needing attention</h3>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MultiSortManager columns={overviewSortableColumns} rules={sortRules} onApply={(rules) => updateOverviewQuery({ sortRules: rules })} />
            <div className="relative hidden sm:block">
              <Search size={15} className="absolute left-3 top-3 text-slate-400" />
              <span className="flex h-9 w-44 items-center rounded-[8px] border border-[#e1e1e1] pl-9 text-xs text-slate-400">
                Search orders
              </span>
            </div>
            <Link
              to="/vendor/orders?tab=unclaimed"
              className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#e1e1e1] text-slate-500 hover:border-brand-primary hover:text-brand-primary"
              aria-label="Open all orders"
            >
              <ChevronRight size={17} />
            </Link>
          </div>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {isLoadingOverview ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
              <LoaderCircle size={18} className="animate-spin text-brand-primary" />
              Loading orders...
            </div>
          ) : attentionOrders.map((order) => (
            <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{order.customer}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">{order.publicOrderNumber}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[order.status]}`}>
                  {order.status}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-slate-100 py-3 text-xs min-[520px]:grid-cols-3">
                <div>
                  <dt className="text-slate-400">Order type</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-700">{orderTypeLabels[order.orderType]}</dd>
                </div>
                <div className="col-span-2 min-[520px]:col-span-1">
                  <dt className="text-slate-400">Pickup location</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-700">{order.location}</dd>
                </div>
                <div className="col-span-2 min-[520px]:col-span-1">
                  <dt className="text-slate-400">Picked up</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-700">{order.collectedAt}</dd>
                </div>
              </dl>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => (order.orderStatus === 'picked_up' ? claimOrder(order.id) : openOrderDetails(order))}
                  disabled={fetcher.state !== 'idle'}
                  className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary disabled:cursor-wait disabled:opacity-60"
                >
                  {order.orderStatus === 'picked_up' ? (isClaimingOrder(order.id) ? 'Claiming...' : 'Claim') : 'View details'}
                </button>
              </div>
            </article>
          ))}
          {!isLoadingOverview && attentionOrders.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {dateMode === 'today' ? 'No orders today.' : 'No orders in this date range.'}
            </p>
          )}
        </div>
        <div className="hidden overflow-x-auto p-4 md:block md:p-5">
          <table className="w-full min-w-[1120px] table-fixed text-left">
            <thead>
              <tr className="border-b border-[#ededed] text-[10px] capitalize tracking-[0.16em] text-slate-400">
                <th className="w-40 px-4 py-3 font-semibold">{renderSortHeader('pickup_date', 'Picked up date')}</th>
                <th className="w-36 px-4 py-3 font-semibold">{renderSortHeader('order_type', 'Order type')}</th>
                <th className="w-56 px-4 py-3 font-semibold">{renderSortHeader('customer', 'Customer')}</th>
                <th className="w-40 px-4 py-3 font-semibold">{renderSortHeader('customer_id', 'Customer ID')}</th>
                <th className="w-40 px-4 py-3 font-semibold">{renderSortHeader('location', 'Pickup location')}</th>
                <th className="w-40 px-4 py-3 font-semibold">{renderSortHeader('status', 'Status')}</th>
                <th className="w-32 px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingOverview ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500" role="status">
                      <LoaderCircle size={18} className="animate-spin text-brand-primary" />
                      Loading orders...
                    </div>
                  </td>
                </tr>
              ) : attentionOrders.map((order) => (
                <tr key={order.id} className="border-b border-[#f0f0f0] last:border-0">
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-500" title={order.collectedAt}>
                    {order.collectedAt}
                  </td>
                  <td
                    className="max-w-36 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600"
                    title={orderTypeLabels[order.orderType]}
                  >
                    {orderTypeLabels[order.orderType]}
                  </td>
                  <td className="max-w-56 px-4 py-4">
                    <p className="truncate whitespace-nowrap font-semibold text-slate-900" title={order.customer}>
                      {order.customer}
                    </p>
                    <p className="mt-1 truncate whitespace-nowrap text-xs text-slate-400" title={order.publicOrderNumber}>
                      {order.publicOrderNumber}
                    </p>
                  </td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600" title={order.customerId}>
                    {order.customerId}
                  </td>
                  <td className="max-w-40 truncate whitespace-nowrap px-4 py-4 text-sm text-slate-600" title={order.location}>
                    {order.location}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => (order.orderStatus === 'picked_up' ? claimOrder(order.id) : openOrderDetails(order))}
                      disabled={fetcher.state !== 'idle'}
                      className="rounded-[7px] border border-[#dedede] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-brand-primary hover:text-brand-primary disabled:cursor-wait disabled:opacity-60"
                    >
                      {order.orderStatus === 'picked_up' ? (isClaimingOrder(order.id) ? 'Claiming...' : 'Claim') : 'View details'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoadingOverview && attentionOrders.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {dateMode === 'today' ? 'No orders today.' : 'No orders in this date range.'}
            </p>
          )}
        </div>
      </section>

      {overviewPagination && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-500">
            {overviewPagination.totalCount === 0
              ? 'No orders'
              : `${(overviewPagination.page - 1) * overviewPagination.pageSize + 1}–${Math.min(overviewPagination.page * overviewPagination.pageSize, overviewPagination.totalCount)} of ${overviewPagination.totalCount}`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateOverviewQuery({ page: overviewPagination.page - 1 })}
              disabled={overviewPagination.page <= 1 || isLoadingOverview}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => updateOverviewQuery({ page: overviewPagination.page + 1 })}
              disabled={overviewPagination.page >= overviewPagination.pageCount || isLoadingOverview}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedOrder && reviewOrder && (
        <VendorOrderReviewDialog
          order={reviewOrder}
          received={selectedReceived}
          hasMismatch={hasMismatch}
          notes={notes}
          addedItems={addedItems}
          categoryNames={rateCard.map((rate) => rate.name)}
          isPreClaim={selectedOrder.orderStatus === 'pending_pickup'}
          canEdit={selectedOrder.orderStatus === 'at_vendor'}
          onReceivedChange={(itemId, value) =>
            setReceived((current) => ({ ...current, [selectedOrder.id]: { ...selectedReceived, [itemId]: value } }))
          }
          onNotesChange={setNotes}
          onAddedItemsChange={setAddedItems}
          onClose={closeOrderDetails}
          onSave={saveOrder}
          onClaim={() => claimOrder(selectedOrder.id)}
          saving={fetcher.state !== 'idle'}
        />
      )}
    </div>
  )
}
