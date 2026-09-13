import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.client'
import { toast } from '../../lib/toast'
import { CustomerStoreContext } from './customer-store-context'
import type { Invoice, Order, Plan, Subscription, Wallet, WalletTransaction } from '../../types/database.types'

export type OrderStatus = 'Awaiting pickup' | 'Picked up' | 'In progress' | 'Ready for delivery' | 'Delivered'
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

export type CustomerTransaction = {
  title: string
  reference: string
  date: string
  amount: string
  direction: 'credit' | 'debit'
  status: string
}

export type CustomerInvoice = {
  id: string
  reference: string
  status: 'Paid' | 'Awaiting payment'
  total: number
  dueDate: string
  items: Array<{ label: string; quantity: string; amount: number }>
}

export type CustomerOrder = {
  id: string
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
}

export type CustomerStore = {
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string
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
  invoice: CustomerInvoice | null
  topUpWallet: (amount: number) => Promise<void>
  addOrder: (input: { items: OrderLine[]; notes: string; pickupLocation: string }) => Promise<CustomerOrder> | CustomerOrder
}

const initialOrders: CustomerOrder[] = []

const initialTransactions: CustomerTransaction[] = []

function createOtp(_prefix: string, number: number) {
  return String(1000 + (Math.abs(number) % 9000))
}

function mapDatabaseTransaction(transaction: WalletTransaction): CustomerTransaction {
  const isCredit = transaction.txn_type === 'topup'
  const amount = `${isCredit ? '+' : '-'}₦${Number(transaction.amount).toLocaleString()}`

  return {
    title: isCredit ? 'Wallet top up' : 'Order payment',
    reference: transaction.related_invoice_id ? `Invoice • ${transaction.related_invoice_id.slice(0, 8)}` : `Wallet • ${transaction.id.slice(0, 8)}`,
    date: new Date(transaction.created_at).toLocaleString(),
    amount,
    direction: isCredit ? 'credit' : 'debit',
    status: transaction.txn_type === 'topup' ? 'Successful' : 'Successful',
  }
}

function mapDatabaseInvoice(invoice: Invoice): CustomerInvoice {
  return {
    id: invoice.id,
    reference: `QF-${invoice.id.slice(0, 6).toUpperCase()}`,
    status: invoice.status === 'paid' ? 'Paid' : 'Awaiting payment',
    total: Number(invoice.amount),
    dueDate: invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : 'Due today',
    items: [
      { label: 'Laundry service', quantity: '1 order', amount: Number(invoice.amount) },
    ],
  }
}

function mapDatabaseOrder(order: Order, persistedItems: PersistedOrderItem[] = [], unpaidInvoiceOrderIds?: Set<string>): CustomerOrder {
  const statusMap: Record<Order['status'], CustomerOrder['status']> = {
    pending_pickup: 'Awaiting pickup',
    picked_up: 'Picked up',
    at_vendor: 'In progress',
    invoiced: 'Ready for delivery',
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
    invoiced: 'bg-emerald-50 text-emerald-700',
    paid: 'bg-emerald-50 text-emerald-700',
    out_for_delivery: 'bg-teal-50 text-teal-700',
    delivered: 'bg-slate-100 text-slate-700',
    cancelled: 'bg-rose-50 text-rose-700',
  }

  return {
    id: order.id,
    customerId: order.customer_id,
    title: serviceMap[order.order_type],
    status: statusMap[order.status],
    statusTone: statusToneMap[order.status],
    date: new Date(order.created_at).toLocaleDateString(),
    pickup: order.status === 'pending_pickup' ? 'Pickup pending' : 'Pickup confirmed',
    total: order.billed_extra_amount ?? 0,
    items: order.clothes_count_customer,
    action: 'View details',
    pickupOtp: order.pickup_otp ?? '',
    deliveryOtp: order.delivery_otp ?? undefined,
    pickedUp: order.status !== 'pending_pickup',
    notes: order.notes ?? '',
    service: serviceMap[order.order_type],
    paymentStatus: unpaidInvoiceOrderIds
      ? unpaidInvoiceOrderIds.has(order.id) ? 'Pending' : 'Paid'
      : ['paid', 'out_for_delivery', 'delivered'].includes(order.status) ? 'Paid' : 'Pending',
    isSubscriptionOrder: order.is_subscription_order,
    pickupLocation: order.pickup_location_id ?? 'Pickup location pending',
    lines: persistedItems
      .filter((item) => item.order_id === order.id)
      .map((item) => ({
        category: item.category_name,
        service: item.service === 'wash_iron' ? 'Wash + Iron' : item.service === 'iron' ? 'Iron' : 'Wash',
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
      })),
  }
}

type CustomerStoreProviderProps = {
  children: React.ReactNode
  profile?: { id: string; name: string | null; qaffy_id: string | null; email: string | null; phone: string | null; pickup_location_id: string | null }
  persistedOrders?: Order[]
  persistedWallet?: Wallet | null
  persistedWalletTransactions?: WalletTransaction[]
  persistedUnpaidInvoiceOrderIds?: string[]
  persistedInvoice?: Invoice | null
  persistedSubscription?: { subscription: Subscription; plan: Plan } | null
  persistedPickupLocations?: PickupLocationOption[]
  persistedOrderItems?: PersistedOrderItem[]
  persistedSubscriptionUsedUnits?: number
}

export function CustomerStoreProvider({
  children,
  profile,
  persistedOrders,
  persistedWallet,
  persistedWalletTransactions,
  persistedUnpaidInvoiceOrderIds,
  persistedInvoice,
  persistedSubscription,
  persistedPickupLocations,
  persistedOrderItems,
  persistedSubscriptionUsedUnits = 0,
}: CustomerStoreProviderProps) {
  const unpaidInvoiceOrderIds = new Set(persistedUnpaidInvoiceOrderIds)
  const [orders, setOrders] = useState(() => persistedOrders ? persistedOrders.map((order) => mapDatabaseOrder(order, persistedOrderItems, unpaidInvoiceOrderIds)) : initialOrders)
  const [savedPickupLocationId, setSavedPickupLocationId] = useState(profile?.pickup_location_id ?? null)
  const [oneOffBalance, setOneOffBalance] = useState(persistedWallet?.one_off_balance ?? 0)
  const [subscriptionBalance, setSubscriptionBalance] = useState(persistedWallet?.subscription_balance ?? 0)
  const [transactions] = useState(() => persistedWalletTransactions ? persistedWalletTransactions.map(mapDatabaseTransaction) : initialTransactions)
  const [invoice, setInvoice] = useState(() => persistedInvoice ? mapDatabaseInvoice(persistedInvoice) : null)
  const [subscriptionUsedUnits, setSubscriptionUsedUnits] = useState(persistedSubscriptionUsedUnits)

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
      invoice,
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
        const idNumber = 1042 + orders.length + 1
        const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
        const clothes = items.reduce((sum, item) => sum + item.quantity, 0)
        const service = [...new Set(items.map((item) => item.service))].join(' + ')
        let chargeAmountForWallet = total
        const order: CustomerOrder = {
          id: `QF-${idNumber}`,
          customerId: profile?.qaffy_id ?? 'Not available',
          title: service,
          status: 'Awaiting pickup',
          statusTone: 'bg-sky-50 text-sky-700',
          date: 'Just now',
          pickup: 'Pickup will be confirmed after OTP verification',
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
        }

        let savedWeightedUnits = clothes

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

          const subscriptionUnitsByCategoryId = new Map((categoryRates ?? []).map((rate) => [rate.category_id, Number(rate.subscription_units)]))
          const weightedClothes = items.reduce((sum, item) => {
            const categoryId = categoryIdByName.get(item.category)
            const subscriptionUnits = categoryId ? subscriptionUnitsByCategoryId.get(categoryId) : undefined
            return sum + item.quantity * (subscriptionUnits ?? 0)
          }, 0)
          savedWeightedUnits = weightedClothes

          if (weightedClothes <= 0 || items.some((item) => !categoryIdByName.has(item.category) || !subscriptionUnitsByCategoryId.has(categoryIdByName.get(item.category)!))) {
            toast.error('Some laundry categories are not configured yet.')
            throw new Error('Missing cloth category or subscription units')
          }

          const hasSubscription = Boolean(persistedSubscription)
          const subscriptionRemainingUnits = persistedSubscription
            ? persistedSubscription.plan.weekly_limit - subscriptionUsedUnits
            : null
          const rateByCategoryId = new Map((categoryRates ?? []).map((rate) => [rate.category_id, rate]))
          let remainingUnits = hasSubscription ? Math.max(0, subscriptionRemainingUnits ?? 0) : 0
          const excessCharge = items.reduce((charge, item) => {
            const categoryId = categoryIdByName.get(item.category)
            const rate = categoryId ? rateByCategoryId.get(categoryId) : undefined
            const itemUnits = item.quantity * Number(rate?.subscription_units ?? 0)
            const excessUnits = hasSubscription ? Math.max(0, itemUnits - remainingUnits) : itemUnits
            remainingUnits = Math.max(0, remainingUnits - itemUnits)
            if (!rate || itemUnits <= 0 || excessUnits <= 0) return charge
            const servicePrice = item.service === 'Wash + Iron' ? Number(rate.wash_iron_price) : item.service === 'Iron' ? Number(rate.iron_price) : Number(rate.wash_price)
            return charge + (excessUnits / Number(rate.subscription_units)) * servicePrice
          }, 0)
          const chargeAmount = Math.round(excessCharge * 100) / 100
          chargeAmountForWallet = hasSubscription ? chargeAmount : total

          const { data: insertedOrder, error: orderInsertError } = await supabase
            .from('orders')
            .insert({
              customer_id: profile.id,
              order_type: orderType,
              clothes_count_customer: weightedClothes,
              status: 'pending_pickup',
              notes: notes || null,
              pickup_location_id: selectedLocation?.id ?? null,
              is_subscription_order: hasSubscription,
              billed_extra_amount: hasSubscription ? chargeAmount : total,
            })
            .select('*')
            .single()

          if (orderInsertError || !insertedOrder) {
            toast.error(`Order could not be saved: ${orderInsertError?.message ?? 'No order was returned.'}`)
            throw orderInsertError ?? new Error('Order insert did not return an order')
          }

          if (insertedOrder) {
            const orderItems = items.flatMap((item) => {
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

            if (!hasSubscription || chargeAmount > 0) {
              const { data: createdInvoice, error: invoiceInsertError } = await supabase
                .from('invoices')
                .insert({
                  order_id: insertedOrder.id,
                  amount: hasSubscription ? chargeAmount : total,
                  status: 'unpaid',
                })
                .select('*')
                .single()

              if (invoiceInsertError || !createdInvoice) {
                const error = invoiceInsertError ?? new Error('Invoice could not be created')
                toast.error(`Invoice could not be created: ${error.message}`)
                throw error
              }

              if (hasSubscription && chargeAmount > 0) {
                const response = await fetch('/orders', { method: 'POST', body: new URLSearchParams({ invoiceId: createdInvoice.id }) })
                if (!response.ok) {
                  const result = await response.json().catch(() => null)
                  toast.error(result?.message ?? 'The extra charge could not be paid from your wallet.')
                  throw new Error('Subscription excess payment failed')
                }
              } else if (!hasSubscription) {
                const response = await fetch('/orders', { method: 'POST', body: new URLSearchParams({ invoiceId: createdInvoice.id, balanceType: 'one_off' }) })
                if (!response.ok) {
                  const result = await response.json().catch(() => null)
                  toast.error(result?.message ?? 'The order balance could not be recorded.')
                  throw new Error('One-time order balance failed')
                }
              }

              setInvoice(mapDatabaseInvoice(hasSubscription
                ? { ...createdInvoice, status: 'paid', paid_at: new Date().toISOString() }
                : createdInvoice))
            }
          }
        }

        setOrders((currentOrders) => [order, ...currentOrders])
        if (persistedSubscription) {
          setSubscriptionBalance((currentBalance) => currentBalance - chargeAmountForWallet)
        } else {
          setOneOffBalance((currentBalance) => currentBalance - chargeAmountForWallet)
        }
        if (persistedSubscription) {
          setSubscriptionUsedUnits((currentUnits) => currentUnits + savedWeightedUnits)
        }

        return order
      },
    }
  }, [invoice, oneOffBalance, orders, profile, persistedPickupLocations, persistedSubscription, savedPickupLocationId, subscriptionBalance, subscriptionUsedUnits, transactions])

  return <CustomerStoreContext.Provider value={store}>{children}</CustomerStoreContext.Provider>
}
