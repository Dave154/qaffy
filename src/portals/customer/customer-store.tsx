import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.client'
import { toast } from '../../lib/toast'
import { getRateValue, type RateCardService } from '../../lib/rate-card'
import { CustomerStoreContext } from './customer-store-context'
import type { Invoice, Order, Payment, Plan, Subscription, Wallet, WalletTransaction } from '../../types/database.types'

export type OrderStatus = 'Awaiting pickup' | 'Picked up' | 'In progress' | 'Pending payment' | 'Ready for delivery' | 'Delivered'
export type OrderLine = {
  category: string
  service: string
  quantity: number
  unitPrice: number
  subscriptionUnits?: number
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
  service: 'wash' | 'iron' | 'wash_iron'
  unit_price: number
}

export type MismatchLine = {
  category: string
  service: 'wash' | 'iron' | 'wash_iron'
  originalQuantity: number
  confirmedQuantity: number
  difference: number
  unitPrice: number
  extraAmount: number
}

export type CustomerTransaction = {
  id: string
  title: string
  reference: string
  date: string
  amount: string
  direction: 'credit' | 'debit'
  category: 'topup' | 'payment'
  status: string
}

export type CustomerInvoice = {
  id: string
  orderId: string
  orderReference: string
  reference: string
  status: 'Paid' | 'Awaiting payment'
  total: number
  dueDate: string
  items: Array<{ label: string; quantity: string; amount: number }>
  originalCount: number | null
  finalCount: number | null
  extraAmount: number
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
  pickup: string
  total: number
  items: number
  action: string
  pickupOtp: string
  deliveryOtp?: string
  pickedUp: boolean
  pickupDate?: string
  notes: string
  service: string
  paymentStatus: 'Paid' | 'Pending'
  isSubscriptionOrder: boolean
  pickupLocation: string
  lines?: OrderLine[]
  mismatch: { id: string; direction: 'over' | 'under'; detail: string; lines: MismatchLine[] } | null
}

export type CustomerStore = {
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  referralCode: string | null
  oneOffBalance: number
  subscriptionBalance: number
  balance: number
  debt: number
  subscription: { name: string; billingPeriod: 'monthly' | 'semester' } | null
  subscriptionEndDate: string | null
  activePlan: Plan | null
  subscriptionUsedUnits: number
  subscriptionRemainingUnits: number | null
  preferredPickupLocationId: string | null
  preferredPickupLocationName: string | null
  pickupLocations: PickupLocationOption[]
  orders: CustomerOrder[]
  transactions: CustomerTransaction[]
  pendingTopUp: boolean
  transactionError: string | null
  invoice: CustomerInvoice | null
  invoices: CustomerInvoice[]
  topUpWallet: (amount: number) => Promise<void>
  addOrder: (input: { items: OrderLine[]; notes: string; pickupLocation: string }) => Promise<CustomerOrder> | CustomerOrder
}

const initialOrders: CustomerOrder[] = []

function createOtp(_prefix: string, number: number) {
  return String(1000 + (Math.abs(number) % 9000))
}

function mapDatabaseTransaction(transaction: WalletTransaction): CustomerTransaction | null {
  const isCredit = transaction.txn_type === 'topup'
  if (isCredit) return null
  const amount = `${isCredit ? '+' : '-'}₦${Number(transaction.amount).toLocaleString()}`

  return {
    id: transaction.id,
    title: isCredit ? 'Wallet top up' : 'Order payment',
    reference: transaction.related_invoice_id ? `Invoice • ${transaction.related_invoice_id.slice(0, 8)}` : `Wallet • ${transaction.id.slice(0, 8)}`,
    date: new Date(transaction.created_at).toLocaleString(),
    amount,
    direction: isCredit ? 'credit' : 'debit',
    category: 'payment',
    status: 'Successful',
  }
}

function mapPayment(payment: Payment): CustomerTransaction {
  return {
    id: payment.id,
    title: payment.plan_id ? 'Subscription payment' : 'Wallet top up',
    reference: payment.reference,
    date: new Date(payment.created_at).toLocaleString(),
    amount: `+₦${Number(payment.amount).toLocaleString()}`,
    direction: 'credit',
    category: 'topup',
    status: payment.status === 'success' ? 'Successful' : payment.status === 'failed' ? 'Failed' : 'Pending',
  }
}

function mapDatabaseInvoice(invoice: Invoice & { order_reference?: string; original_count?: number | null; final_count?: number | null; extra_amount?: number | null; mismatch_direction?: 'over' | 'under' | null; mismatch_detail?: string | null; mismatch_details?: MismatchLine[] }): CustomerInvoice {
  const mismatchLines = Array.isArray(invoice.mismatch_details) ? invoice.mismatch_details : []
  return {
    id: invoice.id,
    orderId: invoice.order_id,
    orderReference: invoice.order_reference ?? invoice.order_id,
    reference: `INV-${invoice.id.slice(0, 6).toUpperCase()}`,
    status: invoice.status === 'paid' ? 'Paid' : 'Awaiting payment',
    total: Number(invoice.amount),
    dueDate: invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : 'Due today',
    items: [
      { label: invoice.final_count !== null && invoice.final_count !== undefined ? 'Final laundry count' : 'Laundry service', quantity: invoice.final_count !== null && invoice.final_count !== undefined ? `${invoice.final_count} items` : '1 order', amount: Number(invoice.amount) },
    ],
    originalCount: invoice.original_count ?? null,
    finalCount: invoice.final_count ?? null,
    extraAmount: Number(invoice.extra_amount ?? 0),
    mismatch: invoice.mismatch_direction ? { direction: invoice.mismatch_direction, detail: invoice.mismatch_detail ?? 'Vendor confirmed a different item count.', lines: mismatchLines } : null,
  }
}

function mapDatabaseOrder(order: Order, persistedItems: PersistedOrderItem[] = [], unpaidInvoiceOrderIds?: Set<string>, invoiceAmountsByOrderId?: Record<string, number>, pickupLocations: PickupLocationOption[] = [], orderMismatches: Array<{ id: string; order_id: string; direction: 'over' | 'under'; detail: string | null; details: MismatchLine[] }> = []): CustomerOrder {
  const statusMap: Record<Order['status'], CustomerOrder['status']> = {
    pending_pickup: 'Awaiting pickup',
    picked_up: 'Picked up',
    at_vendor: 'In progress',
    invoiced: 'Pending payment',
    paid: 'Ready for delivery',
    out_for_delivery: 'Ready for delivery',
    delivered: 'Delivered',
    cancelled: 'Delivered',
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

  return {
    id: order.id,
    publicOrderNumber: order.public_order_number,
    customerId: order.customer_id,
    title: serviceMap[order.order_type],
    status: statusMap[order.status],
    statusTone: statusToneMap[order.status],
    date: new Date(order.created_at).toLocaleDateString(),
    pickup: order.status === 'pending_pickup' ? 'Pickup pending' : 'Pickup confirmed',
    total: invoiceAmountsByOrderId?.[order.id] ?? order.billed_extra_amount ?? 0,
    items: order.clothes_count_customer,
    action: 'View details',
    pickupOtp: order.pickup_otp ?? '',
    deliveryOtp: order.delivery_otp ?? undefined,
    pickedUp: order.status !== 'pending_pickup',
    notes: order.notes ?? '',
    service: serviceMap[order.order_type],
    paymentStatus: unpaidInvoiceOrderIds
      ? unpaidInvoiceOrderIds.has(order.id)
        ? 'Pending'
        : Object.prototype.hasOwnProperty.call(invoiceAmountsByOrderId ?? {}, order.id)
          ? 'Paid'
          : 'Pending'
      : ['paid', 'out_for_delivery', 'delivered'].includes(order.status) ? 'Paid' : 'Pending',
    isSubscriptionOrder: order.is_subscription_order,
    pickupLocation: pickupLocations.find((location) => location.id === order.pickup_location_id)?.name ?? (order.pickup_location_id ? 'Pickup location pending' : 'Pickup location pending'),
    lines: persistedItems
      .filter((item) => item.order_id === order.id)
      .map((item) => ({
        category: item.category_name,
        service: item.service === 'wash_iron' ? 'Wash + Iron' : item.service === 'iron' ? 'Iron' : 'Wash',
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
      })),
    mismatch: mismatch ? { id: mismatch.id, direction: mismatch.direction, detail: mismatch.detail ?? 'Vendor confirmed a different item count.', lines: Array.isArray(mismatch.details) ? mismatch.details : [] } : null,
  }
}

type CustomerStoreProviderProps = {
  children: React.ReactNode
  profile?: { id: string; name: string | null; qaffy_id: string | null; email: string | null; phone: string | null; referral_code: string | null; pickup_location_id: string | null }
  persistedOrders?: Order[]
  persistedWallet?: Wallet | null
  persistedWalletTransactions?: WalletTransaction[]
  persistedPayments?: Payment[]
  persistedTransactionError?: string | null
  persistedUnpaidInvoiceOrderIds?: string[]
  invoiceAmountsByOrderId?: Record<string, number>
  persistedInvoices?: Array<Invoice & { order_reference?: string; original_count?: number | null; final_count?: number | null; extra_amount?: number | null; mismatch_direction?: 'over' | 'under' | null; mismatch_detail?: string | null; mismatch_details?: MismatchLine[] }>
  persistedSubscription?: { subscription: Subscription; plan: Plan } | null
  persistedPickupLocations?: PickupLocationOption[]
  persistedOrderItems?: PersistedOrderItem[]
  persistedOrderMismatches?: Array<{ id: string; order_id: string; direction: 'over' | 'under'; detail: string | null; details: MismatchLine[] }>
  persistedSubscriptionUsedUnits?: number
}

export function CustomerStoreProvider({
  children,
  profile,
  persistedOrders,
  persistedWallet,
  persistedWalletTransactions,
  persistedPayments,
  persistedTransactionError = null,
  persistedUnpaidInvoiceOrderIds,
  invoiceAmountsByOrderId,
  persistedInvoices,
  persistedSubscription,
  persistedPickupLocations,
  persistedOrderItems,
  persistedOrderMismatches = [],
  persistedSubscriptionUsedUnits = 0,
}: CustomerStoreProviderProps) {
  const unpaidInvoiceOrderIds = new Set(persistedUnpaidInvoiceOrderIds)
  const [orders, setOrders] = useState(() => persistedOrders ? persistedOrders.map((order) => mapDatabaseOrder(order, persistedOrderItems, unpaidInvoiceOrderIds, invoiceAmountsByOrderId, persistedPickupLocations, persistedOrderMismatches)) : initialOrders)
  const [savedPickupLocationId, setSavedPickupLocationId] = useState(profile?.pickup_location_id ?? null)
  const [oneOffBalance, setOneOffBalance] = useState(persistedWallet?.one_off_balance ?? 0)
  const [subscriptionBalance, setSubscriptionBalance] = useState(persistedWallet?.subscription_balance ?? 0)
  const [transactions] = useState(() => [
    ...(persistedPayments ?? []).map(mapPayment),
    ...(persistedWalletTransactions ?? []).map(mapDatabaseTransaction).filter((transaction): transaction is CustomerTransaction => transaction !== null),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()))
  const [invoices] = useState(() => (persistedInvoices ?? []).map(mapDatabaseInvoice))
  const invoice = invoices[0] ?? null
  const [subscriptionUsedUnits] = useState(persistedSubscriptionUsedUnits)

  const store = useMemo<CustomerStore>(() => {
    const subscription = persistedSubscription
      ? { name: persistedSubscription.plan.name, billingPeriod: persistedSubscription.plan.type }
      : null
    const preferredPickupLocation = persistedPickupLocations?.find((location) => location.id === savedPickupLocationId) ?? null

    return {
      customerId: profile?.qaffy_id ?? 'Not available',
      customerName: profile?.name ?? 'Customer',
      customerEmail: profile?.email ?? 'Not available',
      customerPhone: profile?.phone ?? '',
      referralCode: profile?.referral_code ?? null,
      oneOffBalance,
      subscriptionBalance,
      balance: oneOffBalance,
      debt: Math.max(0, -subscriptionBalance),
      subscription,
      subscriptionEndDate: persistedSubscription?.subscription.end_date ?? null,
      activePlan: persistedSubscription?.plan ?? null,
      subscriptionUsedUnits,
      subscriptionRemainingUnits: persistedSubscription
        ? Math.max(0, persistedSubscription.plan.weekly_limit - subscriptionUsedUnits)
        : null,
      preferredPickupLocationId: preferredPickupLocation?.id ?? null,
      preferredPickupLocationName: preferredPickupLocation?.name ?? null,
      pickupLocations: persistedPickupLocations ?? [],
      orders,
      transactions,
      pendingTopUp: transactions.some((transaction) => transaction.title === 'Wallet top up' && transaction.status === 'Pending') && orders.some((order) => order.status === 'Pending payment'),
      transactionError: persistedTransactionError,
      invoice,
      invoices,
      topUpWallet: async (amount) => {
        if (amount <= 0) throw new Error('Enter a valid top-up amount.')
        setSubscriptionBalance((currentBalance) => {
          if (currentBalance >= 0) return currentBalance
          return Math.min(0, currentBalance + amount)
        })
        setOneOffBalance((currentBalance) => currentBalance + Math.max(0, amount - Math.max(0, -subscriptionBalance)))
        toast.success(`₦${amount.toLocaleString()} added to your wallet.`)
      },
      addOrder: async ({ items, notes, pickupLocation }) => {
        const categoryKeys = items.map((item) => item.category.trim().toLowerCase())
        if (new Set(categoryKeys).size !== categoryKeys.length) throw new Error('Each laundry category can only be added once.')
        const idNumber = 1042 + orders.length + 1
        const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
        const clothes = items.reduce((sum, item) => sum + item.quantity, 0)
        const service = [...new Set(items.map((item) => item.service))].join(' + ')
        let savedOrderId: string | null = null
        const order: CustomerOrder = {
          id: `QF-${idNumber}`,
          publicOrderNumber: `QO-${String(idNumber).padStart(6, '0')}`,
          customerId: profile?.qaffy_id ?? 'Not available',
          title: service,
          status: 'Awaiting pickup',
          statusTone: 'bg-amber-50 text-amber-700',
          date: 'Just now',
          pickup: 'Pickup pending',
          total,
          items: clothes,
          action: 'View details',
          pickupOtp: createOtp('QF', 2000 + idNumber),
          pickedUp: false,
          notes: notes || 'No special instructions added.',
          service,
          paymentStatus: 'Pending',
          isSubscriptionOrder: Boolean(persistedSubscription),
          pickupLocation,
          lines: items,
          mismatch: null,
        }

        let savedPickupOtp: string | null = null
        let savedPublicOrderNumber: string | null = null

        if (supabase && profile?.id) {
          const serviceTypes = new Set(items.map((item) => item.service))
          const orderType = serviceTypes.size > 1
            ? 'mixed'
            : serviceTypes.has('Wash + Iron')
              ? 'wash_iron'
              : 'wash'
          const selectedLocation = persistedPickupLocations?.find((location) => location.name === pickupLocation)
          if (!savedPickupLocationId && selectedLocation) {
            const { error: profileLocationError } = await supabase
              .from('profiles')
              .update({ pickup_location_id: selectedLocation.id })
              .eq('id', profile.id)
            if (profileLocationError) {
              toast.error(`Pickup location could not be saved: ${profileLocationError.message}`)
              throw profileLocationError
            }
            setSavedPickupLocationId(selectedLocation.id)
          }
          const { data: categoryRows, error: categoryError } = await supabase
            .from('cloth_categories')
            .select('id, name')
            .in('name', [...new Set(items.map((item) => item.category))])
          if (categoryError) {
            toast.error(`Categories could not be loaded: ${categoryError.message}`)
            throw categoryError
          }
          const categoryIdByName = new Map((categoryRows ?? []).map((category) => [category.name, category.id]))
          const categoryIds = [...categoryIdByName.values()]
          const { data: categoryRates, error: categoryRatesError } = categoryIds.length > 0
            ? await supabase
              .from('cloth_category_rates')
              .select('category_id, subscription_units, wash_price, iron_price, wash_iron_price')
              .in('category_id', categoryIds)
            : { data: [], error: null }

          if (categoryRatesError) {
            toast.error('Category prices could not be loaded. Please try again.')
            throw categoryRatesError
          }

          const rateByCategoryId = new Map((categoryRates ?? []).map((rate) => [rate.category_id, rate]))
          const weightedClothes = items.reduce((sum, item) => {
            const categoryId = categoryIdByName.get(item.category)
            const subscriptionUnits = categoryId ? Number(rateByCategoryId.get(categoryId)?.subscription_units ?? 0) : 0
            return sum + item.quantity * subscriptionUnits
          }, 0)
          if (weightedClothes <= 0 || items.some((item) => {
            const categoryId = categoryIdByName.get(item.category)
            const rate = categoryId ? rateByCategoryId.get(categoryId) : undefined
            return !categoryId || !rate || Number(rate.subscription_units) <= 0 || getRateValue(rate, item.service as RateCardService) <= 0
          })) {
            toast.error('Some laundry categories are not configured yet.')
            throw new Error('Missing cloth category or subscription units')
          }

          const hasSubscription = Boolean(persistedSubscription)
          const authoritativeItems = items.map((item) => {
            const categoryId = categoryIdByName.get(item.category)!
            const rate = rateByCategoryId.get(categoryId)!
            return { ...item, unitPrice: getRateValue(rate, item.service as RateCardService), subscriptionUnits: Number(rate.subscription_units) }
          })
          const { data: insertedOrder, error: orderInsertError } = await supabase
            .from('orders')
            .insert({
              customer_id: profile.id,
              order_type: orderType,
              clothes_count_customer: clothes,
              clothes_count_customer_units: hasSubscription ? weightedClothes : clothes,
              status: 'pending_pickup',
              notes: notes || null,
              pickup_location_id: selectedLocation?.id ?? null,
              is_subscription_order: hasSubscription,
              billed_extra_amount: null,
            })
            .select('*')
            .single()

          if (orderInsertError || !insertedOrder) {
            toast.error(`Order could not be saved: ${orderInsertError?.message ?? 'No order was returned.'}`)
            throw orderInsertError ?? new Error('Order insert did not return an order')
          }
          savedOrderId = insertedOrder.id
          savedPickupOtp = insertedOrder.pickup_otp
          savedPublicOrderNumber = insertedOrder.public_order_number

          if (insertedOrder) {
            const orderItems = authoritativeItems.flatMap((item) => {
              const categoryId = categoryIdByName.get(item.category)
              if (!categoryId) return []

              const service: 'wash' | 'iron' | 'wash_iron' = item.service === 'Wash + Iron'
                ? 'wash_iron'
                : item.service === 'Iron'
                  ? 'iron'
                  : 'wash'

              return [{
                order_id: insertedOrder.id,
                category_id: categoryId,
                quantity: item.quantity,
                service,
                unit_price: item.unitPrice,
              }]
            })

            if (orderItems.length > 0) {
              const { error: itemInsertError } = await supabase.from('order_items').insert(orderItems)
              if (itemInsertError) {
                toast.error(`Order items could not be saved: ${itemInsertError.message}`)
                throw itemInsertError
              }
            }

          }
        }

        setOrders((currentOrders) => [{ ...order, id: savedOrderId ?? order.id, publicOrderNumber: savedPublicOrderNumber ?? order.publicOrderNumber, pickupOtp: savedPickupOtp ?? order.pickupOtp }, ...currentOrders])
        return order
      },
    }
  }, [invoice, invoices, oneOffBalance, orders, persistedTransactionError, profile, persistedPickupLocations, persistedSubscription, savedPickupLocationId, subscriptionBalance, subscriptionUsedUnits, transactions])

  return <CustomerStoreContext.Provider value={store}>{children}</CustomerStoreContext.Provider>
}
