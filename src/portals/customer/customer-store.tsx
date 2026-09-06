import { useMemo, useState } from 'react'
import { CustomerStoreContext } from './customer-store-context'

export type OrderStatus = 'Awaiting pickup' | 'Picked up' | 'In progress' | 'Ready for delivery' | 'Delivered'
export type OrderLine = {
  category: string
  service: string
  quantity: number
  unitPrice: number
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
  pickupLocation: string
  lines?: OrderLine[]
}

export type CustomerStore = {
  customerId: string
  customerName: string
  balance: number
  debt: number
  subscription: { name: string; billingPeriod: 'monthly' | 'semester' } | null
  pickupLocations: string[]
  orders: CustomerOrder[]
  addOrder: (input: { items: OrderLine[]; notes: string; pickupLocation: string }) => CustomerOrder
}

const initialOrders: CustomerOrder[] = [
  {
    id: 'QF-1042',
    customerId: 'ID-1042',
    title: 'Wash + Iron',
    status: 'Picked up',
    statusTone: 'bg-emerald-50 text-emerald-700',
    date: 'Today, 09:10 AM',
    pickup: 'Pickup scheduled for Fri, 8:00 AM',
    total: 4800,
    items: 6,
    action: 'Track order',
    pickupOtp: 'QF-2048',
    deliveryOtp: 'QF-4187',
    pickedUp: true,
    pickupDate: 'Today, 09:10 AM',
    notes: 'Separate whites and handle the silk top carefully. Please keep the bag zipped and avoid any fabric softener.',
    service: 'Wash + Iron',
    paymentStatus: 'Paid',
    pickupLocation: 'Lekki Phase 1 pickup point',
  },
  {
    id: 'QF-1038',
    customerId: 'ID-1038',
    title: 'Wash only',
    status: 'In progress',
    statusTone: 'bg-amber-50 text-amber-700',
    date: 'Yesterday, 04:18 PM',
    pickup: 'Ready for delivery today',
    total: 7200,
    items: 9,
    action: 'View details',
    pickupOtp: 'QF-3219',
    pickedUp: false,
    notes: 'Please check the denim and towels separately. One pair of white jeans needs extra care.',
    service: 'Wash only',
    paymentStatus: 'Pending',
    pickupLocation: 'Lekki Phase 1 pickup point',
  },
  {
    id: 'QF-1027',
    customerId: 'ID-1027',
    title: 'Wash + Iron',
    status: 'Delivered',
    statusTone: 'bg-slate-100 text-slate-700',
    date: 'Mon, 11:40 AM',
    pickup: 'Delivered to your address',
    total: 5500,
    items: 7,
    action: 'Reorder',
    pickupOtp: 'QF-9081',
    deliveryOtp: 'QF-7703',
    pickedUp: true,
    pickupDate: 'Mon, 11:40 AM',
    notes: 'Customer collected the order successfully and the delivery OTP was verified on arrival.',
    service: 'Wash + Iron',
    paymentStatus: 'Paid',
    pickupLocation: 'Lekki Phase 1 pickup point',
  },
]

function createOtp(prefix: string, number: number) {
  return `${prefix}-${String(number).padStart(4, '0')}`
}

export function CustomerStoreProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState(initialOrders)
  const [balance, setBalance] = useState(18750)

  const store = useMemo<CustomerStore>(() => ({
    customerId: 'ID-1042',
    customerName: 'Aisha',
    balance,
    debt: Math.max(0, -balance),
    subscription: { name: 'Silver', billingPeriod: 'semester' },
    pickupLocations: ['Lekki Phase 1 pickup point', 'Ikoyi collection desk', 'Victoria Island hub'],
    orders,
    addOrder: ({ items, notes, pickupLocation }) => {
      const idNumber = 1042 + orders.length + 1
      const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      const clothes = items.reduce((sum, item) => sum + item.quantity, 0)
      const service = [...new Set(items.map((item) => item.service))].join(' + ')
      const order: CustomerOrder = {
        id: `QF-${idNumber}`,
        customerId: 'ID-1042',
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
        pickupLocation,
        lines: items,
      }

      setOrders((currentOrders) => [order, ...currentOrders])
      setBalance((currentBalance) => currentBalance - total)
      return order
    },
  }), [balance, orders])

  return <CustomerStoreContext.Provider value={store}>{children}</CustomerStoreContext.Provider>
}
