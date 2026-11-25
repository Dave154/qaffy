import { useMemo, useState } from 'react'
import { toast } from '../../lib/toast'
import {
  normalizeMismatchDetails,
  normalizeSubscriptionBillingBreakdown,
  type MismatchDetailLine,
} from '../../lib/mismatch-details'
import { CustomerStoreContext } from './customer-store-context'
import type { Invoice, Order, Payment, Plan, Subscription, Wallet, WalletTransaction } from '../../types/database.types'

export const CUSTOMER_MAX_UNPICKED_ORDERS = 1
export const CUSTOMER_UNPICKED_ORDER_CAP_MESSAGE = 'Edit or cancel an existing order before placing another.'

export type OrderStatus =
  'Awaiting pickup' | 'Picked up' | 'In progress' | 'Pending payment' | 'Ready for delivery' | 'Out for delivery' | 'Delivered' | 'Cancelled'
export type OrderLine = {
  itemId?: string
  categoryId?: string
  category: string
  service: string
  quantity: number
  unitPrice: number
  subscriptionUnits?: number
  customerQuantity?: number
  vendorQuantity?: number
}

export type PickupLocationOption = {
  id: string
  name: string
  address: string | null
}

export type PersistedOrderItem = {
  id: string
  order_id: string
  category_id: string
  category_name: string
  quantity: number
  confirmed_quantity: number | null
  service: 'wash' | 'iron' | 'wash_iron'
  unit_price: number
  subscription_units_snapshot: number | null
}

export type MismatchLine = MismatchDetailLine

export type CustomerTransaction = {
  id: string
  title: string
  reference: string
  orderReference?: string
  date: string
  sortDate: string
  amount: string
  direction: 'credit' | 'debit'
  category: 'topup' | 'payment' | 'reward' | 'refund'
  status: string
}

export type CustomerReferral = {
  id: string
  status: string
  createdAt: string
  qualifiedAt: string | null
  isReferrer: boolean
  rewardStatus: string | null
  rewardValue: number | null
  rewardExpiresAt: string | null
}

export type ReferralCampaignBenefit = {
  referrerRewardValue: number
  referredRewardValue: number
  minimumOrderAmount: number
}

export type CustomerInvoice = {
  id: string
  orderId: string
  orderReference: string
  reference: string
  status: 'Paid' | 'Awaiting payment' | 'Refunded' | 'Cancelled'
  total: number
  paymentMethod: 'wallet' | 'offline' | 'subscription_units' | null
  dueDate: string
  items: Array<{ label: string; quantity: string; amount: number }>
  originalCount: number | null
  finalCount: number | null
  extraAmount: number
  billingBreakdown: { coveredUnits: number; subscriberAmount: number; regularAmount: number } | null
  mismatch: { direction: 'over' | 'under'; detail: string; lines: MismatchLine[] } | null
}

export type CustomerOrder = {
  id: string
  publicOrderNumber: string
  customerId: string
  title: string
  status: OrderStatus
  statusTone: string
  date: string
  createdAt: string
  pickup: string
  total: number
  items: number
  action: string
  pickupOtp: string
  deliveryOtp?: string
  dispatched: boolean
  pickedUp: boolean
  pickupDate?: string
  notes: string
  service: string
  paymentStatus: 'Paid' | 'Pending'
  isSubscriptionOrder: boolean
  pickupLocation: string
  pickupLocationId?: string | null
  lines?: OrderLine[]
  mismatch: { id: string; direction: 'over' | 'under'; detail: string; lines: MismatchLine[] } | null
}

export type CustomerOverviewSummary = {
  activeOrderCount: number
  unpickedOrderCount: number
  hasPendingInvoiceOrder: boolean
  mismatchCount: number
  latestMismatchDetail: string | null
}

export type CustomerOrdersPagination = {
  page: number
  pageSize: number
  totalCount: number
  filteredCount: number
  activeCount: number
  deliveredCount: number
  unpickedOrderCount: number
  pageOrderIds: string[]
}

export type CustomerInvoicePagination = {
  page: number
  pageSize: number
  totalCount: number
}

export type CustomerTransactionPagination = {
  page: number
  pageSize: number
  totalCount: number
}

export type CustomerStore = {
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  referralCode: string | null
  referrals: CustomerReferral[]
  referralCampaignBenefit: ReferralCampaignBenefit | null
  oneOffBalance: number
  subscriptionBalance: number
  promotionalBalance: number
  balance: number
  debt: number
  subscription: { name: string; billingPeriod: 'monthly' | 'semester' } | null
  subscriptionStartDate: string | null
  subscriptionEndDate: string | null
  scheduledSubscription: {
    name: string
    billingPeriod: 'monthly' | 'semester'
    startDate: string
    endDate: string
    price: number
  } | null
  activePlan: Plan | null
  subscriptionAvailableUnits: number | null
  subscriptionBorrowableUnits: number
  subscriptionBorrowedUnits: number
  subscriptionNextBalanceAfterCredit: number | null
  subscriptionRemainingUnits: number | null
  preferredPickupLocationId: string | null
  preferredPickupLocationName: string | null
  pickupLocations: PickupLocationOption[]
  pickupLocationsCatalogLoaded: boolean
  orders: CustomerOrder[]
  unpickedOrderCount: number
  overviewSummary: CustomerOverviewSummary | null
  ordersPagination: CustomerOrdersPagination | null
  invoicePagination: CustomerInvoicePagination | null
  transactions: CustomerTransaction[]
  transactionPagination: CustomerTransactionPagination | null
  pendingTopUp: boolean
  pendingPaymentTotal: number | null
  isPendingPaymentTotalLoading: boolean
  pendingPaymentTotalError: string | null
  loadPendingPaymentTotal: () => void
  transactionError: string | null
  isDataLoading: boolean
  dataLoadError: string | null
  retryDataLoad: () => void
  isOverviewInsightsLoading: boolean
  overviewInsightsError: string | null
  retryOverviewInsights: () => void
  isSubscriptionAllowanceLoading: boolean
  subscriptionAllowanceError: string | null
  retrySubscriptionAllowance: () => void
  isRecentOrdersLoading: boolean
  recentOrdersError: string | null
  retryRecentOrders: () => void
  removeOptimisticOrder: (orderId: string) => void
  invoice: CustomerInvoice | null
  invoices: CustomerInvoice[]
  topUpWallet: (amount: number) => Promise<void>
}

const initialOrders: CustomerOrder[] = []
const initialOrderMismatches: NonNullable<CustomerStoreProviderProps['persistedOrderMismatches']> = []

function formatOrderDateTime(value: string) {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))

  return formatted.replace(/am|pm/i, (match) => match.toUpperCase())
}

function mapDatabaseTransaction(
  transaction: WalletTransaction,
  orderReferenceByInvoiceId: Map<string, string>,
): CustomerTransaction | null {
  if (transaction.txn_type === 'topup') {
    if (transaction.related_payment_id) return null
    return {
      id: transaction.id,
      title: transaction.balance_type === 'subscription' ? 'Admin top-up applied to subscription debt' : 'Admin wallet top-up',
      reference: `Admin credit • ${transaction.id.slice(0, 8)}`,
      date: new Date(transaction.created_at).toLocaleString(),
      sortDate: transaction.created_at,
      amount: `+₦${Number(transaction.amount).toLocaleString()}`,
      direction: 'credit',
      category: 'topup',
      status: 'Successful',
    }
  }

  if (transaction.related_subscription_id) {
    return {
      id: transaction.id,
      title: 'Plan purchase',
      reference: `Wallet plan • ${transaction.related_subscription_id.slice(0, 8)}`,
      date: new Date(transaction.created_at).toLocaleString(),
      sortDate: transaction.created_at,
      amount: `-₦${Number(transaction.amount).toLocaleString()}`,
      direction: 'debit',
      category: 'payment',
      status: 'Successful',
    }
  }

  const isCredit = ['cashback', 'referral_reward', 'refund'].includes(transaction.txn_type)
  const isReward = ['cashback', 'referral_reward', 'referral_reward_expiry'].includes(transaction.txn_type)
  const isRewardExpiry = transaction.txn_type === 'referral_reward_expiry'
  const amount = isRewardExpiry
    ? `-₦${Math.abs(Number(transaction.amount)).toLocaleString()}`
    : `${isCredit ? '+' : '-'}₦${Number(transaction.amount).toLocaleString()}`

  return {
    id: transaction.id,
    title:
      transaction.txn_type === 'cashback'
        ? 'Cashback earned'
        : isRewardExpiry
          ? 'Promotional credit expired'
          : transaction.txn_type === 'refund'
            ? 'Order refund'
          : isReward
            ? 'Referral reward'
            : 'Order payment',
    reference: transaction.txn_type === 'refund'
      ? `Refund • ${transaction.related_invoice_id ? transaction.related_invoice_id.slice(0, 8) : transaction.id.slice(0, 8)}`
      : transaction.related_referral_reward_id
      ? `Referral • ${transaction.related_referral_reward_id.slice(0, 8)}`
      : transaction.related_invoice_id
        ? `Invoice • ${transaction.related_invoice_id.slice(0, 8)}`
        : transaction.txn_type === 'cashback'
          ? `Cashback • ${transaction.id.slice(0, 8)}`
          : `Wallet • ${transaction.id.slice(0, 8)}`,
    orderReference: transaction.related_invoice_id ? orderReferenceByInvoiceId.get(transaction.related_invoice_id) : undefined,
    date: new Date(transaction.created_at).toLocaleString(),
    sortDate: transaction.created_at,
    amount,
    direction: isCredit ? 'credit' : 'debit',
    category: transaction.txn_type === 'refund' ? 'refund' : isReward ? 'reward' : 'payment',
    status: 'Successful',
  }
}

function mapDatabaseTransactions(walletTransactions: WalletTransaction[], orderReferenceByInvoiceId: Map<string, string>) {
  const planPurchases = new Map<string, WalletTransaction>()
  const otherTransactions: WalletTransaction[] = []

  for (const transaction of walletTransactions) {
    const subscriptionId = transaction.related_subscription_id
    if (!subscriptionId) {
      otherTransactions.push(transaction)
      continue
    }

    const existing = planPurchases.get(subscriptionId)
    if (existing) existing.amount += Number(transaction.amount)
    else planPurchases.set(subscriptionId, { ...transaction, amount: Number(transaction.amount) })
  }

  return [...otherTransactions, ...planPurchases.values()]
    .map((transaction) => mapDatabaseTransaction(transaction, orderReferenceByInvoiceId))
    .filter((transaction): transaction is CustomerTransaction => transaction !== null)
}

function mapPayment(payment: Payment): CustomerTransaction {
  return {
    id: payment.id,
    title: payment.plan_id ? 'Subscription payment' : 'Wallet top up',
    reference: payment.reference,
    date: new Date(payment.created_at).toLocaleString(),
    sortDate: payment.created_at,
    amount: `+₦${Number(payment.amount).toLocaleString()}`,
    direction: 'credit',
    category: 'topup',
    status: payment.status === 'success' ? 'Successful' : payment.status === 'failed' ? 'Failed' : 'Pending',
  }
}

function mapDatabaseInvoice(
  invoice: Invoice & {
    order_reference?: string
    original_count?: number | null
    final_count?: number | null
    extra_amount?: number | null
    mismatch_direction?: 'over' | 'under' | null
    mismatch_detail?: string | null
    mismatch_details?: MismatchLine[]
  },
): CustomerInvoice {
  const mismatchLines = normalizeMismatchDetails(invoice.mismatch_details)
  const billingBreakdown = normalizeSubscriptionBillingBreakdown(invoice.billing_breakdown)
  return {
    id: invoice.id,
    orderId: invoice.order_id,
    orderReference: invoice.order_reference ?? invoice.order_id,
    reference: `INV-${invoice.id.slice(0, 6).toUpperCase()}`,
    status:
      invoice.status === 'paid'
        ? 'Paid'
        : invoice.status === 'refunded'
          ? 'Refunded'
          : invoice.status === 'void'
            ? 'Cancelled'
            : 'Awaiting payment',
    total: Number(invoice.amount),
    paymentMethod: invoice.payment_method,
    dueDate: invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : 'Due today',
    items: [
      {
        label: invoice.final_count !== null && invoice.final_count !== undefined ? 'Final laundry count' : 'Laundry service',
        quantity: invoice.final_count !== null && invoice.final_count !== undefined ? `${invoice.final_count} items` : '1 order',
        amount: Number(invoice.amount),
      },
    ],
    originalCount: invoice.original_count ?? null,
    finalCount: invoice.final_count ?? null,
    extraAmount: Number(invoice.extra_amount ?? 0),
    billingBreakdown,
    mismatch: invoice.mismatch_direction
      ? {
          direction: invoice.mismatch_direction,
          detail: invoice.mismatch_detail ?? 'Vendor confirmed a different item count.',
          lines: mismatchLines,
        }
      : null,
  }
}

function mapDatabaseOrder(
  order: Order,
  persistedItems: PersistedOrderItem[] = [],
  unpaidInvoiceOrderIds?: Set<string>,
  invoiceAmountsByOrderId?: Record<string, number>,
  pickupLocations: PickupLocationOption[] = [],
  orderMismatches: Array<{
    id: string
    order_id: string
    direction: 'over' | 'under'
    detail: string | null
    details: MismatchLine[]
  }> = [],
): CustomerOrder {
  const statusMap: Record<Order['status'], CustomerOrder['status']> = {
    pending_pickup: 'Awaiting pickup',
    picked_up: 'Picked up',
    at_vendor: 'In progress',
    invoiced: 'Pending payment',
    paid: 'Ready for delivery',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }

  const serviceMap: Record<Order['order_type'], string> = {
    wash: 'Wash only',
    wash_iron: 'Wash + Iron',
    mixed: 'Mixed service',
  }

  const statusToneMap: Record<Order['status'], string> = {
    pending_pickup: 'bg-amber-50 text-amber-700',
    picked_up: 'bg-sky-50 text-sky-700',
    at_vendor: 'bg-blue-50 text-blue-700',
    invoiced: 'bg-amber-50 text-amber-700',
    paid: 'bg-emerald-50 text-emerald-700',
    out_for_delivery: 'bg-teal-50 text-teal-700',
    delivered: 'bg-slate-100 text-slate-700',
    cancelled: 'bg-rose-50 text-rose-700',
  }

  const mismatch = orderMismatches.find((item) => item.order_id === order.id)
  const mismatchLines = normalizeMismatchDetails(mismatch?.details)
  const paymentStatus = unpaidInvoiceOrderIds
    ? unpaidInvoiceOrderIds.has(order.id)
      ? 'Pending'
      : Object.prototype.hasOwnProperty.call(invoiceAmountsByOrderId ?? {}, order.id)
        ? 'Paid'
        : 'Pending'
    : ['paid', 'out_for_delivery', 'delivered'].includes(order.status)
      ? 'Paid'
      : 'Pending'

  return {
    id: order.id,
    publicOrderNumber: order.public_order_number,
    customerId: order.customer_id,
    title: serviceMap[order.order_type],
    status: statusMap[order.status],
    statusTone: statusToneMap[order.status],
    date: formatOrderDateTime(order.created_at),
    createdAt: order.created_at,
    pickup:
      order.status === 'pending_pickup'
        ? 'Pickup pending'
        : order.status === 'out_for_delivery'
          ? 'Out for delivery'
          : 'Pickup confirmed',
    total: invoiceAmountsByOrderId?.[order.id] ?? order.billed_extra_amount ?? 0,
    items: persistedItems.filter((item) => item.order_id === order.id).reduce((total, item) => total + item.quantity, 0),
    action: 'View details',
    pickupOtp: order.pickup_otp ?? '',
    deliveryOtp: paymentStatus === 'Paid' && order.status !== 'delivered' ? (order.delivery_otp ?? undefined) : undefined,
    dispatched: order.status === 'out_for_delivery',
    pickedUp: order.status !== 'pending_pickup',
    notes: order.notes ?? '',
    service: serviceMap[order.order_type],
    paymentStatus,
    isSubscriptionOrder: order.is_subscription_order,
    pickupLocation:
      pickupLocations.find((location) => location.id === order.pickup_location_id)?.name ??
      (order.pickup_location_id ? 'Pickup location pending' : 'Pickup location pending'),
    pickupLocationId: order.pickup_location_id,
    lines: persistedItems
      .filter((item) => item.order_id === order.id)
      .map((item) => {
        const mismatchLine = mismatchLines.find((line) => line.itemId === item.id)
        const vendorQuantity = item.confirmed_quantity ?? mismatchLine?.confirmedQuantity
        return {
          itemId: item.id,
          categoryId: item.category_id,
          category: item.category_name,
          service: item.service === 'wash_iron' ? 'Wash + Iron' : item.service === 'iron' ? 'Iron' : 'Wash',
          quantity: vendorQuantity ?? item.quantity,
          unitPrice: Number(item.unit_price),
          subscriptionUnits: item.subscription_units_snapshot === null ? undefined : Number(item.subscription_units_snapshot),
          customerQuantity: mismatchLine?.originalQuantity ?? item.quantity,
          vendorQuantity,
        }
      }),
    mismatch: mismatch
      ? {
          id: mismatch.id,
          direction: mismatch.direction,
          detail: mismatch.detail ?? 'Vendor confirmed a different item count.',
          lines: Array.isArray(mismatch.details) ? mismatch.details : [],
        }
      : null,
  }
}

type CustomerStoreProviderProps = {
  children: React.ReactNode
  profile?: {
    id: string
    name: string | null
    qaffy_id: string | null
    email: string | null
    phone: string | null
    referral_code: string | null
    pickup_location_id: string | null
  }
  persistedReferrals?: CustomerReferral[]
  referralCampaignBenefit?: ReferralCampaignBenefit | null
  persistedOrders?: Order[]
  persistedWallet?: Wallet | null
  persistedWalletTransactions?: WalletTransaction[]
  persistedPayments?: Payment[]
  persistedTransactionError?: string | null
  persistedTransactions?: CustomerTransaction[]
  persistedTransactionPagination?: CustomerTransactionPagination | null
  persistedUnpaidInvoiceOrderIds?: string[]
  invoiceAmountsByOrderId?: Record<string, number>
  persistedInvoices?: Array<
    Invoice & {
      order_reference?: string
      original_count?: number | null
      final_count?: number | null
      extra_amount?: number | null
      mismatch_direction?: 'over' | 'under' | null
      mismatch_detail?: string | null
      mismatch_details?: MismatchLine[]
    }
  >
  persistedSubscription?: { subscription: Subscription; plan: Plan } | null
  persistedScheduledSubscription?: { subscription: Subscription; plan: Plan } | null
  persistedPickupLocations?: PickupLocationOption[]
  pickupLocationsCatalogLoaded?: boolean
  persistedOrderItems?: PersistedOrderItem[]
  persistedOrderMismatches?: Array<{
    id: string
    order_id: string
    direction: 'over' | 'under'
    detail: string | null
    details: MismatchLine[]
  }>
  persistedSubscriptionAllowance?: {
    balance: number
    borrowableUnits: number
    unitsAvailableForConfirmation: number
    nextBalanceAfterCredit: number | null
  } | null
  persistedOverviewSummary?: CustomerOverviewSummary | null
  persistedPendingTopUp?: boolean | null
  persistedPendingPaymentTotal?: number | null
  persistedOrdersPagination?: CustomerOrdersPagination | null
  persistedInvoicePagination?: CustomerInvoicePagination | null
  isDataLoading?: boolean
  dataLoadError?: string | null
  retryDataLoad: () => void
  isOverviewInsightsLoading?: boolean
  overviewInsightsError?: string | null
  retryOverviewInsights: () => void
  isPendingPaymentTotalLoading?: boolean
  pendingPaymentTotalError?: string | null
  loadPendingPaymentTotal: () => void
  isRecentOrdersLoading?: boolean
  recentOrdersError?: string | null
  retryRecentOrders: () => void
}

export function CustomerStoreProvider({
  children,
  profile,
  persistedReferrals = [],
  referralCampaignBenefit = null,
  persistedOrders,
  persistedWallet,
  persistedWalletTransactions,
  persistedPayments,
  persistedTransactionError = null,
  persistedTransactions,
  persistedTransactionPagination = null,
  persistedUnpaidInvoiceOrderIds,
  invoiceAmountsByOrderId,
  persistedInvoices,
  persistedSubscription,
  persistedScheduledSubscription = null,
  persistedPickupLocations,
  pickupLocationsCatalogLoaded = false,
  persistedOrderItems,
  persistedOrderMismatches,
  persistedSubscriptionAllowance = null,
  persistedOverviewSummary = null,
  persistedPendingTopUp = null,
  persistedPendingPaymentTotal = null,
  persistedOrdersPagination = null,
  persistedInvoicePagination = null,
  isDataLoading = false,
  dataLoadError = null,
  retryDataLoad,
  isOverviewInsightsLoading = false,
  overviewInsightsError = null,
  retryOverviewInsights,
  isPendingPaymentTotalLoading = false,
  pendingPaymentTotalError = null,
  loadPendingPaymentTotal,
  isRecentOrdersLoading = false,
  recentOrdersError = null,
  retryRecentOrders,
}: CustomerStoreProviderProps) {
  const unpaidInvoiceOrderIds = useMemo(() => new Set(persistedUnpaidInvoiceOrderIds), [persistedUnpaidInvoiceOrderIds])
  const orderMismatches = persistedOrderMismatches ?? initialOrderMismatches
  const orderReferenceByInvoiceId = useMemo(
    () => new Map((persistedInvoices ?? []).map((invoice) => [invoice.id, invoice.order_reference ?? invoice.order_id])),
    [persistedInvoices],
  )
  const persistedOrdersMapped = useMemo(
    () =>
      persistedOrders
        ? persistedOrders.map((order) =>
            mapDatabaseOrder(
              order,
              persistedOrderItems,
              unpaidInvoiceOrderIds,
              invoiceAmountsByOrderId,
              persistedPickupLocations,
              orderMismatches,
            ),
          )
        : initialOrders,
    [
      persistedOrders,
      persistedOrderItems,
      unpaidInvoiceOrderIds,
      invoiceAmountsByOrderId,
      persistedPickupLocations,
      orderMismatches,
    ],
  )
  const [optimisticOrders, setOptimisticOrders] = useState<CustomerOrder[]>([])
  const persistedOrderIds = useMemo(() => new Set(persistedOrdersMapped.map((order) => order.id)), [persistedOrdersMapped])
  const orders = useMemo(
    () => [...optimisticOrders.filter((order) => !persistedOrderIds.has(order.id)), ...persistedOrdersMapped],
    [optimisticOrders, persistedOrderIds, persistedOrdersMapped],
  )
  const unpickedOrderCount = Math.max(
    persistedOverviewSummary?.unpickedOrderCount ?? 0,
    persistedOrdersPagination?.unpickedOrderCount ?? 0,
    orders.filter((order) => order.status === 'Awaiting pickup' && !order.pickedUp).length,
  )
  const walletSourceKey = `${persistedWallet?.updated_at ?? 'no-wallet'}:${persistedWallet?.one_off_balance ?? 0}:${persistedWallet?.subscription_balance ?? 0}`
  const [optimisticWallet, setOptimisticWallet] = useState<{
    source: string
    oneOffBalance: number
    subscriptionBalance: number
  } | null>(null)
  const walletOverride = optimisticWallet?.source === walletSourceKey ? optimisticWallet : null
  const oneOffBalance = walletOverride?.oneOffBalance ?? persistedWallet?.one_off_balance ?? 0
  const subscriptionBalance = walletOverride?.subscriptionBalance ?? persistedWallet?.subscription_balance ?? 0
  const promotionalBalance = persistedWallet?.promotional_balance ?? 0
  const transactions = useMemo(
    () =>
      persistedTransactions ??
      [
        ...(persistedPayments ?? []).map(mapPayment),
        ...mapDatabaseTransactions(persistedWalletTransactions ?? [], orderReferenceByInvoiceId),
        ...(persistedInvoices ?? [])
          .filter((invoice) => invoice.status === 'paid' && invoice.payment_method === 'offline')
          .map((invoice) => {
            const date = invoice.paid_at ?? invoice.created_at
            return {
              id: `offline-invoice-${invoice.id}`,
              title: 'Offline order payment',
              reference: `Offline payment • ${invoice.id.slice(0, 8).toUpperCase()}`,
              orderReference: invoice.order_reference ?? invoice.order_id,
              date: new Date(date).toLocaleString(),
              sortDate: date,
              amount: `-₦${Number(invoice.amount).toLocaleString()}`,
              direction: 'debit' as const,
              category: 'payment' as const,
              status: 'Successful',
            }
          }),
      ].sort((left, right) => new Date(right.sortDate).getTime() - new Date(left.sortDate).getTime()),
    [persistedTransactions, persistedPayments, persistedWalletTransactions, persistedInvoices, orderReferenceByInvoiceId],
  )
  const invoices = useMemo(() => (persistedInvoices ?? []).map(mapDatabaseInvoice), [persistedInvoices])
  const invoice = invoices[0] ?? null
  const subscriptionAvailableUnits = persistedSubscription ? (persistedSubscriptionAllowance?.balance ?? null) : null
  const subscriptionBorrowedUnits = Math.max(0, -(subscriptionAvailableUnits ?? 0))
  const subscriptionBorrowableUnits = Math.max(
    0,
    (persistedSubscriptionAllowance?.unitsAvailableForConfirmation ?? 0) - Math.max(0, subscriptionAvailableUnits ?? 0),
  )

  const store = useMemo<CustomerStore>(() => {
    const subscription = persistedSubscription
      ? { name: persistedSubscription.plan.name, billingPeriod: persistedSubscription.plan.type }
      : null
    const preferredPickupLocation =
      persistedPickupLocations?.find((location) => location.id === (profile?.pickup_location_id ?? null)) ?? null
    const hasPendingTopUp =
      persistedPendingTopUp ??
      transactions.some((transaction) => transaction.title === 'Wallet top up' && transaction.status === 'Pending')

    return {
      customerId: profile?.qaffy_id ?? 'Not available',
      customerName: profile?.name ?? 'Customer',
      customerEmail: profile?.email ?? 'Not available',
      customerPhone: profile?.phone ?? '',
      referralCode: profile?.referral_code ?? null,
      referrals: persistedReferrals,
      referralCampaignBenefit,
      oneOffBalance,
      subscriptionBalance,
      promotionalBalance,
      balance: oneOffBalance + promotionalBalance,
      debt: Math.max(0, -subscriptionBalance),
      subscription,
      subscriptionStartDate: persistedSubscription?.subscription.start_date ?? null,
      subscriptionEndDate: persistedSubscription?.subscription.end_date ?? null,
      scheduledSubscription: persistedScheduledSubscription
        ? {
            name: persistedScheduledSubscription.plan.name,
            billingPeriod: persistedScheduledSubscription.plan.type,
            startDate: persistedScheduledSubscription.subscription.start_date,
            endDate: persistedScheduledSubscription.subscription.end_date ?? '',
            price: persistedScheduledSubscription.plan.price,
          }
        : null,
      activePlan: persistedSubscription?.plan ?? null,
      subscriptionAvailableUnits,
      subscriptionBorrowableUnits,
      subscriptionBorrowedUnits,
      subscriptionNextBalanceAfterCredit: persistedSubscriptionAllowance?.nextBalanceAfterCredit ?? null,
      subscriptionRemainingUnits: persistedSubscriptionAllowance?.unitsAvailableForConfirmation ?? null,
      preferredPickupLocationId: profile?.pickup_location_id ?? preferredPickupLocation?.id ?? null,
      preferredPickupLocationName: preferredPickupLocation?.name ?? null,
      pickupLocations: persistedPickupLocations ?? [],
      pickupLocationsCatalogLoaded,
      orders,
      unpickedOrderCount,
      overviewSummary: persistedOverviewSummary,
      ordersPagination: persistedOrdersPagination,
      invoicePagination: persistedInvoicePagination,
      transactions,
      transactionPagination: persistedTransactionPagination,
      pendingTopUp:
        hasPendingTopUp &&
        (persistedOverviewSummary?.hasPendingInvoiceOrder ?? orders.some((order) => order.status === 'Pending payment')),
      pendingPaymentTotal: persistedPendingPaymentTotal,
      isPendingPaymentTotalLoading,
      pendingPaymentTotalError,
      loadPendingPaymentTotal,
      transactionError: persistedTransactionError,
      isDataLoading,
      dataLoadError,
      retryDataLoad,
      isOverviewInsightsLoading,
      overviewInsightsError,
      retryOverviewInsights,
      isSubscriptionAllowanceLoading: Boolean(persistedSubscription && isOverviewInsightsLoading),
      subscriptionAllowanceError: persistedSubscription ? overviewInsightsError : null,
      retrySubscriptionAllowance: retryOverviewInsights,
      isRecentOrdersLoading,
      recentOrdersError,
      retryRecentOrders,
      removeOptimisticOrder: (orderId) => {
        setOptimisticOrders((currentOrders) => currentOrders.filter((order) => order.id !== orderId))
      },
      invoice,
      invoices,
      topUpWallet: async (amount) => {
        if (amount <= 0) throw new Error('Enter a valid top-up amount.')
        const subscriptionDebt = Math.max(0, -subscriptionBalance)
        setOptimisticWallet({
          source: walletSourceKey,
          oneOffBalance: oneOffBalance + Math.max(0, amount - subscriptionDebt),
          subscriptionBalance:
            subscriptionBalance < 0 ? Math.min(0, subscriptionBalance + amount) : subscriptionBalance,
        })
        toast.success(`₦${amount.toLocaleString()} added to your wallet.`)
      },
    }
  }, [
    invoice,
    invoices,
    oneOffBalance,
    orders,
    persistedReferrals,
    referralCampaignBenefit,
    persistedTransactionError,
    profile,
    persistedPickupLocations,
    pickupLocationsCatalogLoaded,
    persistedSubscription,
    persistedScheduledSubscription,
    subscriptionBorrowableUnits,
    promotionalBalance,
    walletSourceKey,
    subscriptionBalance,
    persistedSubscriptionAllowance,
    persistedOverviewSummary,
    persistedPendingTopUp,
    persistedPendingPaymentTotal,
    persistedOrdersPagination,
    unpickedOrderCount,
    persistedInvoicePagination,
    persistedTransactionPagination,
    subscriptionAvailableUnits,
    subscriptionBorrowedUnits,
    transactions,
    isDataLoading,
    dataLoadError,
    retryDataLoad,
    isOverviewInsightsLoading,
    overviewInsightsError,
    retryOverviewInsights,
    isPendingPaymentTotalLoading,
    pendingPaymentTotalError,
    loadPendingPaymentTotal,
    isRecentOrdersLoading,
    recentOrdersError,
    retryRecentOrders,
  ])

  return <CustomerStoreContext.Provider value={store}>{children}</CustomerStoreContext.Provider>
}
