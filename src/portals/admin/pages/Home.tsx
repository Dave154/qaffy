import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Package,
  Store,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { Link, data, useLoaderData } from 'react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Route } from './+types/Home'
import { requireRole } from '../../../lib/auth.server'
import { successfulPlanPayments, sumSuccessfulPlanPayments } from '../../../lib/revenue-reporting'

type DailyPoint = {
  date: string
  label: string
  orders: number
  revenue: number
  customers: number
  clothes: number
  washClothes: number
  ironClothes: number
  washIronClothes: number
  oneTimeOrders: number
  subscriptionOrders: number
  subscriptionPurchases: number
  oneTimeRevenue: number
  subscriptionRevenue: number
}
type Activity = { id: string; title: string; detail: string; time: string; tone: 'cyan' | 'pink' | 'green' }
type RecentVendor = { id: string; name: string; status: string }
type RecentCustomer = { id: string; name: string; email: string | null }
type DashboardData = {
  metrics: {
    totalOrders: number
    ordersToday: number
    customers: number
    vendors: number
    logistics: number
    activeSubscriptions: number
    unpaidInvoices: number
    unpaidAmount: number
    revenue: number
    clothes: number
    washClothes: number
    ironClothes: number
    washIronClothes: number
    vendorPayouts: number
    platformProfit: number
    subscriptionRevenue: number
    oneTimeRevenue: number
    oneTimeOrders: number
  }
  pipeline: Array<{ label: string; status: string; count: number }>
  plans: Array<{ id: string; name: string; type: string; price: number; weeklyLimit: number; subscribers: number; active: boolean }>
  recentVendors: RecentVendor[]
  recentCustomers: RecentCustomer[]
  trend: DailyPoint[]
  hourlyTrend: DailyPoint[]
  activity: Activity[]
}

const emptyData: DashboardData = {
  metrics: {
    totalOrders: 0,
    ordersToday: 0,
    customers: 0,
    vendors: 0,
    logistics: 0,
    activeSubscriptions: 0,
    unpaidInvoices: 0,
    unpaidAmount: 0,
    revenue: 0,
    clothes: 0,
    washClothes: 0,
    ironClothes: 0,
    washIronClothes: 0,
    vendorPayouts: 0,
    platformProfit: 0,
    subscriptionRevenue: 0,
    oneTimeRevenue: 0,
    oneTimeOrders: 0,
  },
  pipeline: [],
  plans: [],
  recentVendors: [],
  recentCustomers: [],
  trend: [],
  hourlyTrend: [],
  activity: [],
}

function money(value: number) {
  return `₦${value.toLocaleString()}`
}
function formatTime(value: string) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}
function localDayKey(date: Date) {
  return dateInput(date)
}
function hourKey(date: Date) {
  return `${localDayKey(date)}T${String(date.getHours()).padStart(2, '0')}`
}
function hourLabel(hour: number) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString('en-GB', { hour: 'numeric' })
}
type DateMode = 'all' | 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'
type ChartMetric = 'orders' | 'revenue' | 'customers'
function dateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function rangeForMode(mode: DateMode, start: string, end: string) {
  if (mode === 'custom') return { start, end }
  if (mode === 'all') return { start: '', end: '' }
  const today = new Date()
  if (mode === 'today') {
    const todayInput = dateInput(today)
    return { start: todayInput, end: todayInput }
  }
  if (mode === 'this_week' || mode === 'last_week') {
    const mondayOffset = (today.getDay() + 6) % 7
    const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset + (mode === 'last_week' ? -7 : 0))
    return { start: dateInput(weekStart), end: dateInput(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)) }
  }
  return mode === 'this_month'
    ? {
        start: dateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
        end: dateInput(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      }
    : {
        start: dateInput(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        end: dateInput(new Date(today.getFullYear(), today.getMonth(), 0)),
      }
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data<DashboardData>(emptyData, { status: 200 })
  const { supabase, headers } = auth
  const [
    { data: orders },
    { count: customers },
    { count: vendors },
    { count: logistics },
    { count: activeSubscriptions },
    { data: invoices },
    { data: plans },
    { data: subscriptions },
    { data: settlements },
    { data: vendorRows },
    { data: customerRows },
    { data: orderItems },
    { data: customerGrowthRows },
    { data: paymentRows },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, created_at, status, clothes_count_customer, is_subscription_order, customer_id')
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('logistics_agents').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('invoices').select('order_id, amount, status, created_at').order('created_at', { ascending: false }),
    supabase.from('plans').select('id, name, type, price, weekly_limit, active').order('created_at', { ascending: true }),
    supabase.from('subscriptions').select('plan_id').eq('status', 'active'),
    supabase.from('vendor_settlements').select('amount_due').order('created_at', { ascending: false }),
    supabase.from('vendors').select('id, business_name, status').order('created_at', { ascending: false }).limit(5),
    supabase.from('profiles').select('id, name, email').eq('role', 'customer').order('created_at', { ascending: false }).limit(5),
    supabase.from('order_items').select('order_id, service, quantity, confirmed_quantity'),
    supabase.from('profiles').select('created_at').eq('role', 'customer'),
    supabase
      .from('payments')
      .select('amount, status, plan_id, succeeded_at, created_at')
      .eq('status', 'success')
      .not('plan_id', 'is', null),
  ])
  const allOrders = orders ?? []
  const allInvoices = invoices ?? []
  const planPayments = successfulPlanPayments(paymentRows ?? [])
  const planPaymentRevenue = sumSuccessfulPlanPayments(planPayments)
  const today = dayKey(new Date())
  const paidInvoices = allInvoices.filter((invoice) => invoice.status === 'paid')
  const orderById = new Map(allOrders.map((order) => [order.id, order]))
  const revenueByType = paidInvoices.reduce(
    (totals, invoice) => {
      if (orderById.get(invoice.order_id)?.is_subscription_order) totals.subscription += Number(invoice.amount)
      else totals.oneTime += Number(invoice.amount)
      return totals
    },
    { subscription: 0, oneTime: 0 },
  )
  revenueByType.subscription += planPaymentRevenue
  const vendorPayouts = (settlements ?? []).reduce((sum, settlement) => sum + Number(settlement.amount_due), 0)
  const clothesByService = (orderItems ?? []).reduce(
    (totals, item) => {
      const quantity = Number(item.confirmed_quantity ?? item.quantity)
      totals[item.service] += quantity
      return totals
    },
    { wash: 0, iron: 0, wash_iron: 0 },
  )
  const dailyMetrics = new Map<string, DailyPoint>()
  const getDailyPoint = (date: string) => {
    const existing = dailyMetrics.get(date)
    if (existing) return existing
    const point: DailyPoint = {
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      orders: 0,
      revenue: 0,
      customers: 0,
      clothes: 0,
      washClothes: 0,
      ironClothes: 0,
      washIronClothes: 0,
      oneTimeOrders: 0,
      subscriptionOrders: 0,
      subscriptionPurchases: 0,
      oneTimeRevenue: 0,
      subscriptionRevenue: 0,
    }
    dailyMetrics.set(date, point)
    return point
  }
  for (const order of allOrders) {
    const point = getDailyPoint(dayKey(new Date(order.created_at)))
    point.orders += 1
    point.clothes += order.clothes_count_customer
    if (order.status !== 'cancelled') {
      if (order.is_subscription_order) point.subscriptionOrders += 1
      else point.oneTimeOrders += 1
    }
  }
  for (const item of orderItems ?? []) {
    const order = orderById.get(item.order_id)
    if (!order) continue
    const point = getDailyPoint(dayKey(new Date(order.created_at)))
    const quantity = Number(item.confirmed_quantity ?? item.quantity)
    if (item.service === 'wash') point.washClothes += quantity
    if (item.service === 'iron') point.ironClothes += quantity
    if (item.service === 'wash_iron') point.washIronClothes += quantity
  }
  for (const invoice of paidInvoices) {
    const point = getDailyPoint(dayKey(new Date(invoice.created_at)))
    const amount = Number(invoice.amount)
    point.revenue += amount
    if (orderById.get(invoice.order_id)?.is_subscription_order) point.subscriptionRevenue += amount
    else point.oneTimeRevenue += amount
  }
  for (const payment of planPayments) {
    const point = getDailyPoint(dayKey(new Date(payment.succeeded_at ?? payment.created_at)))
    const amount = Number(payment.amount)
    point.revenue += amount
    point.subscriptionRevenue += amount
    point.subscriptionPurchases += 1
  }
  for (const customer of customerGrowthRows ?? []) getDailyPoint(dayKey(new Date(customer.created_at))).customers += 1
  const trend = [...dailyMetrics.values()].sort((left, right) => left.date.localeCompare(right.date))
  const hourlyMetrics = new Map<string, DailyPoint>()
  const getHourlyPoint = (date: Date) => {
    const key = hourKey(date)
    const existing = hourlyMetrics.get(key)
    if (existing) return existing
    const point: DailyPoint = {
      date: localDayKey(date),
      label: hourLabel(date.getHours()),
      orders: 0,
      revenue: 0,
      customers: 0,
      clothes: 0,
      washClothes: 0,
      ironClothes: 0,
      washIronClothes: 0,
      oneTimeOrders: 0,
      subscriptionOrders: 0,
      subscriptionPurchases: 0,
      oneTimeRevenue: 0,
      subscriptionRevenue: 0,
    }
    hourlyMetrics.set(key, point)
    return point
  }
  const localToday = new Date()
  for (let hour = 0; hour <= localToday.getHours(); hour += 1)
    getHourlyPoint(new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate(), hour))
  for (const order of allOrders) {
    const createdAt = new Date(order.created_at)
    if (localDayKey(createdAt) !== localDayKey(localToday)) continue
    const point = getHourlyPoint(createdAt)
    point.orders += 1
    point.clothes += order.clothes_count_customer
    if (order.status !== 'cancelled') {
      if (order.is_subscription_order) point.subscriptionOrders += 1
      else point.oneTimeOrders += 1
    }
  }
  for (const invoice of paidInvoices) {
    const createdAt = new Date(invoice.created_at)
    if (localDayKey(createdAt) !== localDayKey(localToday)) continue
    const point = getHourlyPoint(createdAt)
    const amount = Number(invoice.amount)
    point.revenue += amount
    if (orderById.get(invoice.order_id)?.is_subscription_order) point.subscriptionRevenue += amount
    else point.oneTimeRevenue += amount
  }
  for (const payment of planPayments) {
    const succeededAt = new Date(payment.succeeded_at ?? payment.created_at)
    if (localDayKey(succeededAt) !== localDayKey(localToday)) continue
    const point = getHourlyPoint(succeededAt)
    const amount = Number(payment.amount)
    point.revenue += amount
    point.subscriptionRevenue += amount
    point.subscriptionPurchases += 1
  }
  for (const customer of customerGrowthRows ?? []) {
    const createdAt = new Date(customer.created_at)
    if (localDayKey(createdAt) === localDayKey(localToday)) getHourlyPoint(createdAt).customers += 1
  }
  const hourlyTrend = [...hourlyMetrics.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, point]) => point)
  const pipelineStatuses = [
    ['Pending pickup', 'pending_pickup'],
    ['Picked up', 'picked_up'],
    ['At vendor', 'at_vendor'],
    ['Awaiting review', 'invoiced'],
    ['Paid', 'paid'],
    ['Out for delivery', 'out_for_delivery'],
    ['Delivered', 'delivered'],
    ['Cancelled', 'cancelled'],
  ] as const
  const pipeline = await Promise.all(
    pipelineStatuses.map(async ([label, status]) => {
      const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', status)
      return { label, status, count: count ?? 0 }
    }),
  )
  const subscriberCounts = new Map<string, number>()
  for (const subscription of subscriptions ?? [])
    subscriberCounts.set(subscription.plan_id, (subscriberCounts.get(subscription.plan_id) ?? 0) + 1)
  const activity: Activity[] = allOrders
    .slice(0, 5)
    .map((order, index) => ({
      id: order.id,
      title: index === 0 ? 'New order received' : order.status === 'delivered' ? 'Order delivered' : 'Order updated',
      detail: `${order.id} - ${order.clothes_count_customer} clothes`,
      time: formatTime(order.created_at),
      tone: index % 3 === 0 ? 'cyan' : index % 3 === 1 ? 'pink' : 'green',
    }))
  return data<DashboardData>(
    {
      metrics: {
        totalOrders: allOrders.length,
        ordersToday: allOrders.filter((order) => dayKey(new Date(order.created_at)) === today).length,
        customers: customers ?? 0,
        vendors: vendors ?? 0,
        logistics: logistics ?? 0,
        activeSubscriptions: activeSubscriptions ?? 0,
        unpaidInvoices: allInvoices.filter((invoice) => invoice.status === 'unpaid').length,
        unpaidAmount: allInvoices
          .filter((invoice) => invoice.status === 'unpaid')
          .reduce((sum, invoice) => sum + Number(invoice.amount), 0),
        revenue: paidInvoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0) + planPaymentRevenue,
        clothes: allOrders.reduce((sum, order) => sum + order.clothes_count_customer, 0),
        washClothes: clothesByService.wash,
        ironClothes: clothesByService.iron,
        washIronClothes: clothesByService.wash_iron,
        vendorPayouts,
        platformProfit: paidInvoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0) + planPaymentRevenue - vendorPayouts,
        subscriptionRevenue: revenueByType.subscription,
        oneTimeRevenue: revenueByType.oneTime,
        oneTimeOrders: allOrders.filter((order) => !order.is_subscription_order && order.status !== 'cancelled').length,
      },
      pipeline,
      plans: (plans ?? []).map((plan) => ({
        id: plan.id,
        name: plan.name,
        type: plan.type,
        price: Number(plan.price),
        weeklyLimit: plan.weekly_limit,
        subscribers: subscriberCounts.get(plan.id) ?? 0,
        active: plan.active,
      })),
      recentVendors: (vendorRows ?? []).map((vendor) => ({ id: vendor.id, name: vendor.business_name, status: vendor.status })),
      recentCustomers: (customerRows ?? []).map((customer) => ({
        id: customer.id,
        name: customer.name ?? 'Unnamed customer',
        email: customer.email,
      })),
      trend,
      hourlyTrend,
      activity,
    },
    { headers, status: 200 },
  )
}

function TrendChart({ points, metric }: { points: DailyPoint[]; metric: ChartMetric }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const labelStep = points.length > 12 ? 3 : 1
  const metricValue = (point: DailyPoint) => (metric === 'orders' ? point.orders : metric === 'revenue' ? point.revenue : point.customers)
  const maxValue = Math.max(...points.map(metricValue), 1)
  const coordinates = points.map((point, index) => ({
    x: (index * 100) / Math.max(points.length - 1, 1),
    y: 100 - (metricValue(point) / maxValue) * 76,
  }))
  const linePath = coordinates.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`
    const previous = coordinates[index - 1]
    const midpoint = (previous.x + point.x) / 2
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`
  }, '')
  const valueLabels = [maxValue, Math.ceil(maxValue / 2), 0]
  const selectedPoint = selectedIndex === null ? null : points[selectedIndex]
  const activeCoordinate = selectedIndex === null ? null : coordinates[selectedIndex]
  return (
    <div className="relative h-56 overflow-hidden rounded-xl bg-[#f8fcfc] p-4">
      <div className="absolute bottom-8 left-0 top-5 flex flex-col justify-between text-[10px] font-medium text-slate-400">
        {valueLabels.map((value, index) => (
          <span key={`${value}-${index}`}>{metric === 'revenue' ? money(value) : value}</span>
        ))}
      </div>
      <div className="absolute inset-x-4 top-5 space-y-8 text-[10px] text-slate-300">
        <span className="block border-t border-dashed border-slate-200" />
        <span className="block border-t border-dashed border-slate-200" />
        <span className="block border-t border-dashed border-slate-200" />
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-x-4 bottom-8 top-5 h-[calc(100%-52px)] w-[calc(100%-32px)] overflow-visible"
      >
        <defs>
          <linearGradient id="orders-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#51d3c1" stopOpacity=".38" />
            <stop offset="100%" stopColor="#51d3c1" stopOpacity=".03" />
          </linearGradient>
        </defs>
        <path d={`${linePath} L 100 100 L 0 100 Z`} fill="url(#orders-fill)" />
        <path d={linePath} fill="none" stroke="#51c9bb" strokeLinecap="round" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        {coordinates.map((coordinate, index) => (
          <circle
            key={`${points[index].date}-${points[index].label}`}
            cx={coordinate.x}
            cy={coordinate.y}
            r={selectedIndex === index ? 3 : 2}
            fill="#fff"
            stroke="#24ad9f"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            tabIndex={0}
            role="button"
            aria-label={`${points[index].label}: ${metric === 'revenue' ? money(metricValue(points[index])) : metricValue(points[index])}`}
            onMouseEnter={() => setSelectedIndex(index)}
            onFocus={() => setSelectedIndex(index)}
            onClick={() => setSelectedIndex(index)}
          />
        ))}
      </svg>
      {selectedPoint && activeCoordinate && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 shadow-lg"
          style={{ left: `${activeCoordinate.x}%`, top: `${activeCoordinate.y}%` }}
        >
          <div className="flex items-center gap-2">
            <span className="text-slate-500">{selectedPoint.label}</span>
            <span className="text-slate-900">{metric === 'revenue' ? money(metricValue(selectedPoint)) : metricValue(selectedPoint)}</span>
          </div>
        </div>
      )}
      <div className="absolute inset-x-4 bottom-2 flex justify-between text-[10px] font-medium text-slate-400">
        {points.map((point, index) => (
          <span key={`${point.date}-${point.label}`} className={index % labelStep === 0 || index === points.length - 1 ? '' : 'invisible'}>
            {point.label}
          </span>
        ))}
      </div>
      {selectedPoint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
          <p className="font-semibold text-slate-900">{selectedPoint.label}</p>
          <p className="mt-0.5 text-slate-600">
            {metric === 'revenue'
              ? money(metricValue(selectedPoint))
              : `${metricValue(selectedPoint)} ${metric === 'orders' ? 'orders' : 'customers'}`}
          </p>
        </div>
      )}
    </div>
  )
}

function PipelineChart({ pipeline }: { pipeline: DashboardData['pipeline'] }) {
  const visible = pipeline.filter((item) => item.count > 0)
  const total = Math.max(
    pipeline.reduce((sum, item) => sum + item.count, 0),
    1,
  )
  return (
    <div className="space-y-3">
      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">No order activity yet.</p>
      ) : (
        visible.slice(0, 5).map((item, index) => (
          <Link key={item.status} to={`/admin/orders?status=${item.status}`} className="group relative block">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">{item.label}</span>
              <span className="font-bold text-slate-900">{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${index === 0 ? 'bg-[#00b7d4]' : index === 1 ? 'bg-[#ff6077]' : index === 2 ? 'bg-[#64c4ae]' : 'bg-[#a9dfe6]'}`}
                style={{ width: `${Math.max((item.count / total) * 100, 4)}%` }}
              />
            </div>
            <span className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg group-hover:block group-focus-visible:block">
              {item.label}: {item.count} ({Math.round((item.count / total) * 100)}%)
            </span>
          </Link>
        ))
      )}
    </div>
  )
}

export default function Home() {
  const { metrics, pipeline, plans, recentVendors, recentCustomers, trend, hourlyTrend, activity } = useLoaderData<typeof loader>()
  const [overviewMode, setOverviewMode] = useState<DateMode>('all')
  const [overviewStart, setOverviewStart] = useState('')
  const [overviewEnd, setOverviewEnd] = useState('')
  const [isOverviewCustomOpen, setIsOverviewCustomOpen] = useState(false)
  const [chartMode, setChartMode] = useState<DateMode>('this_month')
  const [chartStart, setChartStart] = useState('')
  const [chartEnd, setChartEnd] = useState('')
  const [isChartCustomOpen, setIsChartCustomOpen] = useState(false)
  const [chartMetric, setChartMetric] = useState<ChartMetric>('orders')
  const [isMetricMenuOpen, setIsMetricMenuOpen] = useState(false)
  const metricMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isMetricMenuOpen) return
    const closeMetricMenu = (event: MouseEvent) => {
      if (metricMenuRef.current && !metricMenuRef.current.contains(event.target as Node)) setIsMetricMenuOpen(false)
    }
    document.addEventListener('mousedown', closeMetricMenu)
    return () => document.removeEventListener('mousedown', closeMetricMenu)
  }, [isMetricMenuOpen])
  useEffect(() => {
    setChartMode(overviewMode)
    setChartStart(overviewStart)
    setChartEnd(overviewEnd)
  }, [overviewMode, overviewStart, overviewEnd])
  const overviewRange = rangeForMode(overviewMode, overviewStart, overviewEnd)
  const chartRange = rangeForMode(chartMode, chartStart, chartEnd)
  const inRange = (point: DailyPoint, range: { start: string; end: string }) =>
    (!range.start || point.date >= range.start) && (!range.end || point.date <= range.end)
  const overviewPoints = useMemo(() => trend.filter((point) => inRange(point, overviewRange)), [overviewRange, trend])
  const chartPoints = useMemo(
    () => (chartMode === 'today' ? hourlyTrend : trend).filter((point) => inRange(point, chartRange)),
    [chartMode, chartRange, hourlyTrend, trend],
  )
  const periodMetrics = overviewPoints.reduce(
    (totals, point) => ({
      orders: totals.orders + point.orders,
      revenue: totals.revenue + point.revenue,
      customers: totals.customers + point.customers,
      oneTimeOrders: totals.oneTimeOrders + point.oneTimeOrders,
      subscriptionOrders: totals.subscriptionOrders + point.subscriptionOrders,
      subscriptionPurchases: totals.subscriptionPurchases + point.subscriptionPurchases,
      oneTimeRevenue: totals.oneTimeRevenue + point.oneTimeRevenue,
      subscriptionRevenue: totals.subscriptionRevenue + point.subscriptionRevenue,
      washClothes: totals.washClothes + point.washClothes,
      ironClothes: totals.ironClothes + point.ironClothes,
      washIronClothes: totals.washIronClothes + point.washIronClothes,
    }),
    {
      orders: 0,
      revenue: 0,
      customers: 0,
      oneTimeOrders: 0,
      subscriptionOrders: 0,
      subscriptionPurchases: 0,
      oneTimeRevenue: 0,
      subscriptionRevenue: 0,
      washClothes: 0,
      ironClothes: 0,
      washIronClothes: 0,
    },
  )
  const revenueMax = Math.max(...chartPoints.map((point) => point.revenue), 1)
  const cards = [
    {
      label: 'Gross revenue',
      value: money(periodMetrics.revenue),
      helper: 'Paid',
      icon: CircleDollarSign,
      href: '/admin/orders',
      tone: 'green',
    },
    {
      label: 'Vendor payouts',
      value: money(metrics.vendorPayouts),
      helper: 'Settled',
      icon: Store,
      href: '/admin/partners/vendors',
      tone: 'pink',
    },
    {
      label: 'Platform profit',
      value: money(metrics.platformProfit),
      helper: 'Net',
      icon: CircleDollarSign,
      href: '/admin/orders',
      tone: 'green',
    },
    {
      label: 'Subscription revenue',
      value: money(periodMetrics.subscriptionRevenue),
      helper: 'Recurring',
      icon: CircleDollarSign,
      href: '/admin/orders',
      tone: 'green',
    },
    {
      label: 'Subscription purchases',
      value: periodMetrics.subscriptionPurchases,
      helper: 'Paid plans',
      icon: UsersRound,
      href: '/admin/orders',
      tone: 'pink',
    },
    {
      label: 'One-time revenue',
      value: money(periodMetrics.oneTimeRevenue),
      helper: 'One-off',
      icon: CircleDollarSign,
      href: '/admin/orders',
      tone: 'green',
    },
    { label: 'One-time orders', value: periodMetrics.oneTimeOrders, helper: 'Orders', icon: Package, href: '/admin/orders', tone: 'pink' },
    {
      label: 'Subscription orders',
      value: periodMetrics.subscriptionOrders,
      helper: 'Orders',
      icon: Package,
      href: '/admin/orders',
      tone: 'green',
    },
    { label: 'Total vendors', value: metrics.vendors, helper: 'Active', icon: UsersRound, href: '/admin/partners/vendors', tone: 'pink' },
    { label: 'Wash clothes', value: periodMetrics.washClothes, helper: 'Wash', icon: Package, href: '/admin/orders', tone: 'green' },
    { label: 'Iron clothes', value: periodMetrics.ironClothes, helper: 'Iron', icon: Package, href: '/admin/orders', tone: 'pink' },
    {
      label: 'Wash + Iron clothes',
      value: periodMetrics.washIronClothes,
      helper: 'Combo',
      icon: Package,
      href: '/admin/orders',
      tone: 'green',
    },
  ]
  return (
    <div className="space-y-6">
      {metrics.unpaidInvoices > 0 && (
        <Link
          to="/admin/orders?payment=unpaid"
          className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-900 sm:px-4 sm:py-3"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate whitespace-nowrap text-xs font-semibold sm:text-sm">
            <AlertTriangle size={17} />
            {metrics.unpaidInvoices} unresolved payment issue
            {metrics.unpaidInvoices === 1 ? '' : 's'} requiring attention
          </span>
          <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold sm:text-xs">{money(metrics.unpaidAmount)} unpaid</span>
        </Link>
      )}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-[#121212]">Metrics</h3>
          <div className="relative">
            <select
              aria-label="Overview date range"
              value={overviewMode}
              onClick={() => overviewMode === 'custom' && setIsOverviewCustomOpen(true)}
              onChange={(event) => {
                const mode = event.target.value as DateMode
                setOverviewMode(mode)
                setIsOverviewCustomOpen(mode === 'custom')
              }}
              className="h-9 rounded-lg border border-[#eceeee] bg-white px-3 text-xs font-semibold text-[#505959]"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="this_week">This week</option>
              <option value="last_week">Last week</option>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="custom">Custom</option>
            </select>
            {overviewMode === 'custom' && isOverviewCustomOpen && (
              <div className="absolute right-0 top-11 z-20 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                <p className="text-sm font-semibold text-slate-900">Custom overview range</p>
                <div className="mt-3 grid gap-3">
                  <label className="text-xs font-semibold text-slate-500">
                    From
                    <input
                      aria-label="Overview start date"
                      type="date"
                      value={overviewStart}
                      onChange={(event) => setOverviewStart(event.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal text-slate-900"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">
                    To
                    <input
                      aria-label="Overview end date"
                      type="date"
                      value={overviewEnd}
                      onChange={(event) => setOverviewEnd(event.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal text-slate-900"
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOverviewCustomOpen(false)
                      setOverviewMode('all')
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOverviewCustomOpen(false)}
                    className="rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, helper, icon: Icon, href, tone }) => (
            <Link
              key={label}
              to={href}
              className="min-h-[147px] rounded-[10px] border border-[#f2f3f3] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition hover:border-brand-border"
            >
              <div className="flex items-start justify-between">
                <p className="text-xs font-semibold capitalize tracking-[0.12em] text-[#729ea1]">{label}</p>
                <Icon size={18} className={tone === 'green' ? 'text-[#64c4ae]' : 'text-brand-primary'} />
              </div>
              <div className="mt-8 flex items-end justify-between gap-3">
                <div>
                  <p className="text-3xl font-semibold leading-none text-[#121212]">{value}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#9aa7a7]">{helper}</p>
                </div>
                <ArrowUpRight size={15} className="text-[#505959]" />
              </div>
            </Link>
          ))}
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900">
              {chartMetric === 'orders' ? 'Orders' : chartMetric === 'revenue' ? 'Revenue' : 'New customers'}
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <div ref={metricMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsMetricMenuOpen((open) => !open)}
                  className="flex items-center gap-1.5 text-[11px] text-slate-500"
                >
                  <i className="h-2 w-2 rounded-full bg-[#00b7d4]" />
                  <span>{chartMetric === 'orders' ? 'Orders' : chartMetric === 'revenue' ? 'Revenue' : 'New customers'}</span>
                  <ChevronDown size={11} className="text-slate-400" />
                </button>
                {isMetricMenuOpen && (
                  <div className="absolute right-0 top-6 z-10 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                    {(
                      [
                        ['orders', 'Orders'],
                        ['revenue', 'Revenue'],
                        ['customers', 'New customers'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setChartMetric(value)
                          setIsMetricMenuOpen(false)
                        }}
                        className={`block w-full rounded-md px-3 py-2 text-left text-xs font-semibold ${chartMetric === value ? 'bg-brand-soft text-brand-primary' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative flex flex-wrap items-center gap-2">
                <select
                  aria-label="Chart date range"
                  value={chartMode}
                  onClick={() => chartMode === 'custom' && setIsChartCustomOpen(true)}
                  onChange={(event) => {
                    const mode = event.target.value as DateMode
                    setChartMode(mode)
                    setIsChartCustomOpen(mode === 'custom')
                  }}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"
                >
                  <option value="all">All time</option>
                  <option value="today">Today</option>
                  <option value="this_week">This week</option>
                  <option value="last_week">Last week</option>
                  <option value="this_month">This month</option>
                  <option value="last_month">Last month</option>
                  <option value="custom">Custom</option>
                </select>
                {chartMode === 'custom' && isChartCustomOpen && (
                  <div className="absolute right-0 top-11 z-20 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                    <p className="text-sm font-semibold text-slate-900">Custom chart range</p>
                    <div className="mt-3 grid gap-3">
                      <label className="text-xs font-semibold text-slate-500">
                        From
                        <input
                          aria-label="Chart start date"
                          type="date"
                          value={chartStart}
                          onChange={(event) => setChartStart(event.target.value)}
                          className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal text-slate-900"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-500">
                        To
                        <input
                          aria-label="Chart end date"
                          type="date"
                          value={chartEnd}
                          onChange={(event) => setChartEnd(event.target.value)}
                          className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal text-slate-900"
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsChartCustomOpen(false)
                          setChartMode('this_month')
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsChartCustomOpen(false)}
                        className="rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-5">
            {chartPoints.length > 0 ? (
              <TrendChart points={chartPoints} metric={chartMetric} />
            ) : (
              <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">No data in this period.</p>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-[#f8fcfc] px-3 py-2 text-xs">
            <span className="text-slate-500">Total in period</span>
            <strong className="text-slate-900">
              {chartMetric === 'orders'
                ? `${chartPoints.reduce((sum, point) => sum + point.orders, 0)} orders`
                : chartMetric === 'revenue'
                  ? money(chartPoints.reduce((sum, point) => sum + point.revenue, 0))
                  : `${chartPoints.reduce((sum, point) => sum + point.customers, 0)} customers`}
            </strong>
          </div>
        </section>
        <section className="flex flex-col rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="flex items-start justify-between">
            <h3 className="text-lg font-bold text-slate-900">Revenue</h3>
            <CircleDollarSign size={19} className="text-[#64c4ae]" />
          </div>
          <div className="mt-6 flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-900">{money(chartPoints.reduce((sum, point) => sum + point.revenue, 0))}</p>
            <span className="mb-1 rounded-full bg-[#eafaf4] px-2 py-1 text-[10px] font-semibold text-[#3a9a82]">Collected</span>
          </div>
          <div className="relative mt-auto h-52 pl-10">
            <div className="absolute left-0 top-0 flex h-44 flex-col justify-between text-[9px] font-medium text-slate-400">
              <span>{money(chartPoints.length > 0 ? revenueMax : 0)}</span>
              <span>{money(chartPoints.length > 0 ? Math.round(revenueMax / 2) : 0)}</span>
              <span>{money(0)}</span>
            </div>
            <div className="relative flex h-52 items-end gap-2 border-b border-[#b9ded8]">
              {chartPoints.map((point) => (
                <div
                  key={`${point.date}-${point.label}`}
                  className="group relative flex h-52 flex-1 flex-col items-center justify-end gap-2"
                >
                  <span className="pointer-events-none absolute bottom-12 z-10 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg group-hover:block group-focus-within:block">
                    {point.label}: {money(point.revenue)}
                  </span>
                  <div className="flex h-44 w-full items-end rounded-md">
                    <div
                      tabIndex={0}
                      role="img"
                      aria-label={`${point.label}: ${money(point.revenue)}`}
                      className="w-full shrink-0 rounded-md bg-[#64c4ae]"
                      style={{
                        height: `${(point.revenue / revenueMax) * 100}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`text-[10px] text-slate-400 ${chartPoints.length > 12 && chartPoints.indexOf(point) % 3 !== 0 && chartPoints.indexOf(point) !== chartPoints.length - 1 ? 'invisible' : ''}`}
                  >
                    {point.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr_1fr]">
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Workload by status</h3>
            <BarChart3 size={18} className="text-[#00a7bd]" />
          </div>
          <PipelineChart pipeline={pipeline} />
        </section>
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Plans</h3>
            <Link to="/admin/plans" className="text-xs font-semibold text-[#008fa6]">
              Manage
            </Link>
          </div>
          <div className="space-y-3">
            {plans.length === 0 ? (
              <p className="text-sm text-slate-500">No plans configured.</p>
            ) : (
              [...plans]
                .sort((left, right) => right.subscribers - left.subscribers)
                .slice(0, 4)
                .map((plan) => (
                <div key={plan.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {plan.name} <span className="font-normal text-slate-400">{plan.type}</span>
                    </p>
                    <div className="group relative mt-1 h-1.5 w-32 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#00b7d4]" style={{ width: `${Math.min(plan.subscribers * 18 + 8, 100)}%` }} />
                      <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg group-hover:block">
                        {plan.name}: {plan.subscribers} subscribers
                      </span>
                    </div>
                  </div>
                  <strong className="text-sm text-slate-900">{plan.subscribers}</strong>
                </div>
                ))
            )}
          </div>
        </section>
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Recent updates</h3>
            <Clock3 size={18} className="text-slate-400" />
          </div>
          <div className="space-y-3">
            {activity.length === 0 ? (
              <p className="text-sm text-slate-500">No recent activity.</p>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.tone === 'cyan' ? 'bg-[#00b7d4]' : item.tone === 'pink' ? 'bg-[#ff6077]' : 'bg-[#64c4ae]'}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">{item.title}</p>
                    <p className="truncate text-[11px] text-slate-500">{item.detail}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{item.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Recent vendors</h3>
            <Store size={18} className="text-brand-primary" />
          </div>
          <div className="space-y-3">
            {recentVendors.length === 0 ? (
              <p className="text-sm text-slate-500">No vendors registered.</p>
            ) : (
              recentVendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                >
                  <p className="truncate text-sm font-semibold text-slate-800">{vendor.name}</p>
                  <span className="shrink-0 rounded-full bg-brand-soft px-2 py-1 text-[10px] font-semibold capitalize text-brand-primary">
                    {vendor.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Recent customers</h3>
            <UserRound size={18} className="text-brand-primary" />
          </div>
          <div className="space-y-3">
            {recentCustomers.length === 0 ? (
              <p className="text-sm text-slate-500">No customers registered.</p>
            ) : (
              recentCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{customer.name}</p>
                    <p className="truncate text-xs text-slate-500">{customer.email ?? 'Email unavailable'}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">Customer</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
