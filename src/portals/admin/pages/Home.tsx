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
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Await, Link, data, useLoaderData } from 'react-router'
import type { Route } from './+types/Home'
import { requireRole } from '../../../lib/auth.server'
import { sql } from '../../../lib/db.server'

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
  vendorPayouts: number
  owedToVendors: number
}
type Activity = { id: string; title: string; detail: string; time: string; tone: 'cyan' | 'pink' | 'green' }
type RecentVendor = { id: string; name: string; status: string }
type RecentCustomer = { id: string; name: string; email: string | null }
type DashboardMetrics = {
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
  subscriptionRevenue: number
  oneTimeRevenue: number
  oneTimeOrders: number
}
type OverviewCore = {
  metrics: DashboardMetrics
  trend: DailyPoint[]
  hourlyTrend: DailyPoint[]
}
type OverviewPipeline = { pipeline: Array<{ label: string; status: string; count: number }> }
type OverviewPlans = {
  activeSubscriptions: number
  plans: Array<{ id: string; name: string; type: string; price: number; weeklyLimit: number; subscribers: number; active: boolean }>
}
function money(value: number) {
  return `₦${value.toLocaleString()}`
}
function formatTime(value: string) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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

function emptyDailyPoint(date: string, label: string): DailyPoint {
  return {
    date,
    label,
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
    vendorPayouts: 0,
    owedToVendors: 0,
  }
}

function afterSettled<TPrevious, TResult>(previous: Promise<TPrevious>, load: () => Promise<TResult>) {
  return previous.then(load, load)
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) throw new Response('Admin overview requires Supabase configuration.', { status: 503 })
  const { supabase, headers } = auth
  const activeOnDate = new Date().toISOString().slice(0, 10)

  const coreData = (async (): Promise<OverviewCore> => {
    const [metricRows, trendRows, hourlyRows] = await Promise.all([
      sql<
        {
          total_orders: string
          orders_today: string
          customers: string
          vendors: string
          logistics: string
          active_subscriptions: string
          unpaid_invoices: string
          unpaid_amount: string
          clothes: string
        }[]
      >`
        select
          (select count(*) from orders) as total_orders,
          (select count(*) from orders where created_at::date = ${activeOnDate}::date) as orders_today,
          (select count(*) from profiles where role = 'customer') as customers,
          (select count(*) from vendors where status = 'approved') as vendors,
          (select count(*) from logistics_agents where status = 'approved') as logistics,
          (select count(distinct customer_id) from subscriptions
            where status = 'active' and (end_date is null or end_date >= ${activeOnDate}::date)) as active_subscriptions,
          (select count(*) from invoices where status = 'unpaid') as unpaid_invoices,
          (select coalesce(sum(amount), 0) from invoices where status = 'unpaid') as unpaid_amount,
          (select coalesce(sum(quantity), 0) from order_items) as clothes
      `,
      sql<
        {
          date: string
          orders: string
          one_time_orders: string
          subscription_orders: string
          clothes: string
          wash_clothes: string
          iron_clothes: string
          wash_iron_clothes: string
          revenue: string
          one_time_revenue: string
          subscription_revenue: string
          subscription_purchases: string
          customers: string
          vendor_payouts: string
          owed_to_vendors: string
        }[]
      >`
        with
        daily_orders as (
          select created_at::date as day, count(*) as orders,
            count(*) filter (where status <> 'cancelled' and not is_subscription_order) as one_time_orders,
            count(*) filter (where status <> 'cancelled' and is_subscription_order) as subscription_orders
          from orders group by created_at::date
        ),
        daily_items as (
          select o.created_at::date as day, sum(i.quantity) as clothes,
            sum(coalesce(i.confirmed_quantity, i.quantity)) filter (where i.service = 'wash') as wash_clothes,
            sum(coalesce(i.confirmed_quantity, i.quantity)) filter (where i.service = 'iron') as iron_clothes,
            sum(coalesce(i.confirmed_quantity, i.quantity)) filter (where i.service = 'wash_iron') as wash_iron_clothes
          from orders o join order_items i on i.order_id = o.id
          group by o.created_at::date
        ),
        daily_invoices as (
          select coalesce(i.paid_at, i.created_at)::date as day, sum(i.amount) as revenue,
            sum(i.amount) filter (where o.is_subscription_order) as subscription_revenue,
            sum(i.amount) filter (where not o.is_subscription_order) as one_time_revenue
          from invoices i join orders o on o.id = i.order_id
          where i.status = 'paid'
          group by coalesce(i.paid_at, i.created_at)::date
        ),
        daily_plan_payments as (
          select coalesce(succeeded_at, created_at)::date as day, sum(amount) as revenue, count(*) as purchases
          from payments
          where status = 'success' and plan_id is not null
          group by coalesce(succeeded_at, created_at)::date
        ),
        daily_customers as (
          select created_at::date as day, count(*) as customers
          from profiles where role = 'customer'
          group by created_at::date
        ),
        daily_payouts as (
          select completed_at::date as day, sum(amount) as vendor_payouts
          from vendor_settlement_transfers
          where status = 'success' and completed_at is not null
          group by completed_at::date
        ),
        daily_owed as (
          select o.created_at::date as day,
            sum(coalesce(si.amount,
              (case i.service
                when 'wash' then coalesce(r.vendor_wash_price, 0)
                when 'iron' then coalesce(r.vendor_iron_price, 0)
                when 'wash_iron' then coalesce(r.vendor_wash_iron_price, 0)
                else 0
              end) * i.confirmed_quantity
            )) as owed_to_vendors
          from orders o
          join order_items i on i.order_id = o.id and i.confirmed_quantity is not null
          left join cloth_category_rates r on r.category_id = i.category_id
          left join vendor_settlement_items si on si.order_item_id = i.id
          where o.vendor_id is not null
            and o.status <> 'cancelled'
            and o.clothes_count_vendor is not null
            and exists (select 1 from invoices inv where inv.order_id = o.id and inv.status = 'paid')
            and not exists (
              select 1
              from vendor_settlement_orders so
              join vendor_settlements vs on vs.id = so.settlement_id and vs.status = 'paid'
              where so.order_id = o.id
            )
          group by o.created_at::date
        ),
        days as (
          select day from daily_orders union select day from daily_items union
          select day from daily_invoices union select day from daily_plan_payments union
          select day from daily_customers union select day from daily_payouts union
          select day from daily_owed
        )
        select to_char(days.day, 'YYYY-MM-DD') as date,
          coalesce(daily_orders.orders, 0) as orders,
          coalesce(daily_orders.one_time_orders, 0) as one_time_orders,
          coalesce(daily_orders.subscription_orders, 0) as subscription_orders,
          coalesce(daily_items.clothes, 0) as clothes,
          coalesce(daily_items.wash_clothes, 0) as wash_clothes,
          coalesce(daily_items.iron_clothes, 0) as iron_clothes,
          coalesce(daily_items.wash_iron_clothes, 0) as wash_iron_clothes,
          coalesce(daily_invoices.revenue, 0) + coalesce(daily_plan_payments.revenue, 0) as revenue,
          coalesce(daily_invoices.one_time_revenue, 0) as one_time_revenue,
          coalesce(daily_invoices.subscription_revenue, 0) + coalesce(daily_plan_payments.revenue, 0) as subscription_revenue,
          coalesce(daily_plan_payments.purchases, 0) as subscription_purchases,
          coalesce(daily_customers.customers, 0) as customers,
          coalesce(daily_payouts.vendor_payouts, 0) as vendor_payouts,
          coalesce(daily_owed.owed_to_vendors, 0) as owed_to_vendors
        from days
        left join daily_orders using (day)
        left join daily_items using (day)
        left join daily_invoices using (day)
        left join daily_plan_payments using (day)
        left join daily_customers using (day)
        left join daily_payouts using (day)
        left join daily_owed using (day)
        order by days.day
      `,
      sql<{ hour: number; orders: string; revenue: string; customers: string }[]>`
        with hourly as (
          select extract(hour from created_at)::int as hour, count(*) as orders, 0::numeric as revenue, 0::bigint as customers
          from orders where created_at::date = ${activeOnDate}::date group by extract(hour from created_at)
          union all
          select extract(hour from coalesce(i.paid_at, i.created_at))::int, 0, sum(i.amount), 0
          from invoices i where i.status = 'paid'
            and coalesce(i.paid_at, i.created_at)::date = ${activeOnDate}::date
          group by extract(hour from coalesce(i.paid_at, i.created_at))
          union all
          select extract(hour from coalesce(succeeded_at, created_at))::int, 0, sum(amount), 0
          from payments where status = 'success' and plan_id is not null
            and coalesce(succeeded_at, created_at)::date = ${activeOnDate}::date
          group by extract(hour from coalesce(succeeded_at, created_at))
          union all
          select extract(hour from created_at)::int, 0, 0, count(*)
          from profiles where role = 'customer' and created_at::date = ${activeOnDate}::date
          group by extract(hour from created_at)
        )
        select hour, sum(orders) as orders, sum(revenue) as revenue, sum(customers) as customers
        from hourly group by hour order by hour
      `,
    ])
    const [metricsRow] = metricRows
    const toNumber = (value: string | number | null) => Number(value ?? 0)
    const trend = trendRows.map((row) => ({
      ...emptyDailyPoint(row.date, new Date(`${row.date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })),
      orders: toNumber(row.orders),
      oneTimeOrders: toNumber(row.one_time_orders),
      subscriptionOrders: toNumber(row.subscription_orders),
      clothes: toNumber(row.clothes),
      washClothes: toNumber(row.wash_clothes),
      ironClothes: toNumber(row.iron_clothes),
      washIronClothes: toNumber(row.wash_iron_clothes),
      revenue: toNumber(row.revenue),
      oneTimeRevenue: toNumber(row.one_time_revenue),
      subscriptionRevenue: toNumber(row.subscription_revenue),
      subscriptionPurchases: toNumber(row.subscription_purchases),
      customers: toNumber(row.customers),
      vendorPayouts: toNumber(row.vendor_payouts),
      owedToVendors: toNumber(row.owed_to_vendors),
    }))
    const today = new Date()
    const todayKey = activeOnDate
    const hourlyByHour = new Map(hourlyRows.map((row) => [row.hour, row]))
    const hourlyTrend = Array.from({ length: today.getHours() + 1 }, (_, hour) => {
      const row = hourlyByHour.get(hour)
      return {
        ...emptyDailyPoint(todayKey, hourLabel(hour)),
        orders: toNumber(row?.orders ?? 0),
        revenue: toNumber(row?.revenue ?? 0),
        customers: toNumber(row?.customers ?? 0),
      }
    })
    return {
      metrics: {
        totalOrders: toNumber(metricsRow.total_orders),
        ordersToday: toNumber(metricsRow.orders_today),
        customers: toNumber(metricsRow.customers),
        vendors: toNumber(metricsRow.vendors),
        logistics: toNumber(metricsRow.logistics),
        activeSubscriptions: toNumber(metricsRow.active_subscriptions),
        unpaidInvoices: toNumber(metricsRow.unpaid_invoices),
        unpaidAmount: toNumber(metricsRow.unpaid_amount),
        revenue: trend.reduce((sum, point) => sum + point.revenue, 0),
        clothes: toNumber(metricsRow.clothes),
        washClothes: trend.reduce((sum, point) => sum + point.washClothes, 0),
        ironClothes: trend.reduce((sum, point) => sum + point.ironClothes, 0),
        washIronClothes: trend.reduce((sum, point) => sum + point.washIronClothes, 0),
        subscriptionRevenue: trend.reduce((sum, point) => sum + point.subscriptionRevenue, 0),
        oneTimeRevenue: trend.reduce((sum, point) => sum + point.oneTimeRevenue, 0),
        oneTimeOrders: trend.reduce((sum, point) => sum + point.oneTimeOrders, 0),
      },
      trend,
      hourlyTrend,
    }
  })().catch((error) => {
    console.error('Admin overview summary and chart data could not be loaded:', error)
    throw error
  })

  const pipelineData = afterSettled(coreData, async (): Promise<OverviewPipeline> => {
    const counts = await sql<{ status: string; count: string }[]>`
      select status, count(*) as count from orders group by status
    `
    const countByStatus = new Map(counts.map((row) => [row.status, Number(row.count)]))
    return { pipeline: pipelineStatuses.map(([label, status]) => ({ label, status, count: countByStatus.get(status) ?? 0 })) }
  }).catch((error) => {
    console.error('Admin overview workload data could not be loaded:', error)
    throw error
  })

  const plansData = afterSettled(pipelineData, async (): Promise<OverviewPlans> => {
    const [plansResult, subscriberCounts] = await Promise.all([
      supabase.from('plans').select('id, name, type, price, weekly_limit, active').order('created_at', { ascending: true }),
      sql<{ plan_id: string | null; subscribers: string }[]>`
        select plan_id, count(distinct customer_id) as subscribers
        from subscriptions
        where status = 'active' and (end_date is null or end_date >= ${activeOnDate}::date)
        group by grouping sets ((plan_id), ())
      `,
    ])
    if (plansResult.error) throw plansResult.error
    const activeSubscriptions = Number(subscriberCounts.find((row) => row.plan_id === null)?.subscribers ?? 0)
    const subscribersByPlan = new Map(
      subscriberCounts.filter((row) => row.plan_id !== null).map((row) => [row.plan_id, Number(row.subscribers)]),
    )
    return {
      activeSubscriptions,
      plans: (plansResult.data ?? []).map((plan) => ({
        id: plan.id,
        name: plan.name,
        type: plan.type,
        price: Number(plan.price),
        weeklyLimit: plan.weekly_limit,
        subscribers: subscribersByPlan.get(plan.id) ?? 0,
        active: plan.active,
      })),
    }
  }).catch((error) => {
    console.error('Admin overview plan data could not be loaded:', error)
    throw error
  })

  const vendorsData = afterSettled(plansData, async () => {
    const { data: vendors, error } = await supabase
      .from('vendors')
      .select('id, business_name, status')
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) throw error
    return { recentVendors: (vendors ?? []).map((vendor) => ({ id: vendor.id, name: vendor.business_name, status: vendor.status })) }
  }).catch((error) => {
    console.error('Admin overview recent vendor data could not be loaded:', error)
    throw error
  })

  const customersData = afterSettled(plansData, async () => {
    const { data: customers, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('role', 'customer')
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) throw error
    return {
      recentCustomers: (customers ?? []).map((customer) => ({
        id: customer.id,
        name: customer.name ?? 'Unnamed customer',
        email: customer.email,
      })),
    }
  }).catch((error) => {
    console.error('Admin overview recent customer data could not be loaded:', error)
    throw error
  })

  const activityData = afterSettled(plansData, async () => {
    const latestOrders = await sql<{ id: string; status: string; created_at: Date | string; clothes: string }[]>`
      select o.id, o.status, o.created_at, coalesce(items.clothes, 0) as clothes
      from orders o
      left join lateral (
        select sum(quantity) as clothes from order_items where order_id = o.id
      ) items on true
      order by o.created_at desc
      limit 5
    `
    const activity: Activity[] = latestOrders.map((order, index) => ({
      id: order.id,
      title: index === 0 ? 'New order received' : order.status === 'delivered' ? 'Order delivered' : 'Order updated',
      detail: `${order.id} - ${Number(order.clothes)} clothes`,
      time: formatTime(new Date(order.created_at).toISOString()),
      tone: index % 3 === 0 ? 'cyan' : index % 3 === 1 ? 'pink' : 'green',
    }))
    return { activity }
  }).catch((error) => {
    console.error('Admin overview recent activity could not be loaded:', error)
    throw error
  })

  return data({ coreData, pipelineData, plansData, vendorsData, customersData, activityData }, { headers, status: 200 })
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

function PipelineChart({ pipeline }: { pipeline: OverviewPipeline['pipeline'] }) {
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

function SectionLoadError({ section }: { section: string }) {
  return (
    <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      {section} data could not be loaded. Refresh the page to try again.
    </p>
  )
}

function SectionLoading() {
  return <div className="h-20 animate-pulse rounded-lg bg-slate-100" aria-label="Loading section" role="status" />
}

function OverviewSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading Admin overview" role="status">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="h-5 w-24 rounded bg-slate-200" />
          <div className="h-9 w-32 rounded-lg bg-slate-200" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="h-3 w-28 rounded bg-slate-200" />
              <div className="mt-4 h-7 w-32 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-20 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <section key={index} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="h-5 w-36 rounded bg-slate-200" />
            <div className="mt-5 h-56 rounded-xl bg-slate-100" />
          </section>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <section key={index} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="h-5 w-40 rounded bg-slate-200" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 4 }, (_, row) => (
                <div key={row} className="h-10 rounded-lg bg-slate-100" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const { coreData, pipelineData, plansData, vendorsData, customersData, activityData } = useLoaderData<typeof loader>()
  return (
    <OverviewDashboard
      coreData={coreData}
      pipelineData={pipelineData}
      plansData={plansData}
      vendorsData={vendorsData}
      customersData={customersData}
      activityData={activityData}
    />
  )
}

function OverviewDashboard({
  coreData,
  pipelineData,
  plansData,
  vendorsData,
  customersData,
  activityData,
}: {
  coreData: Promise<OverviewCore>
  pipelineData: Promise<OverviewPipeline>
  plansData: Promise<OverviewPlans>
  vendorsData: Promise<{ recentVendors: RecentVendor[] }>
  customersData: Promise<{ recentCustomers: RecentCustomer[] }>
  activityData: Promise<{ activity: Activity[] }>
}) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<OverviewSkeleton />}>
        <Await
          resolve={coreData}
          errorElement={
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
              Summary and chart data could not be loaded. Refresh the page to try again.
            </div>
          }
        >
          {(core) => <OverviewCoreDashboard core={core} />}
        </Await>
      </Suspense>
      <OverviewSupportingDashboard
        pipelineData={pipelineData}
        plansData={plansData}
        vendorsData={vendorsData}
        customersData={customersData}
        activityData={activityData}
      />
    </div>
  )
}

function OverviewCoreDashboard({ core }: { core: OverviewCore }) {
  const { metrics, trend, hourlyTrend } = core
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
      vendorPayouts: totals.vendorPayouts + point.vendorPayouts,
      owedToVendors: totals.owedToVendors + point.owedToVendors,
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
      vendorPayouts: 0,
      owedToVendors: 0,
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
      value: money(periodMetrics.vendorPayouts),
      helper: 'Settled',
      icon: Store,
      href: '/admin/partners/vendors',
      tone: 'pink',
    },
    {
      label: 'Owed to vendors',
      value: money(periodMetrics.owedToVendors),
      helper: 'Unsettled',
      icon: Store,
      href: '/admin/finance',
      tone: 'pink',
    },
    {
      label: 'Platform profit',
      value: money(periodMetrics.revenue - periodMetrics.vendorPayouts),
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
      label: 'Active subscribers',
      value: metrics.activeSubscriptions,
      helper: 'Current subscriptions',
      icon: UsersRound,
      href: '/admin/plans',
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
                  <p className="mt-1 text-[10px] capitalize tracking-[0.08em] text-[#9aa7a7]">{helper}</p>
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
    </div>
  )
}

function OverviewSupportingDashboard({
  pipelineData,
  plansData,
  vendorsData,
  customersData,
  activityData,
}: {
  pipelineData: Promise<OverviewPipeline>
  plansData: Promise<OverviewPlans>
  vendorsData: Promise<{ recentVendors: RecentVendor[] }>
  customersData: Promise<{ recentCustomers: RecentCustomer[] }>
  activityData: Promise<{ activity: Activity[] }>
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr_1fr]">
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Workload by status</h3>
            <BarChart3 size={18} className="text-[#00a7bd]" />
          </div>
          <Suspense fallback={<SectionLoading />}>
            <Await resolve={pipelineData} errorElement={<SectionLoadError section="Workload" />}>
              {({ pipeline }) => <PipelineChart pipeline={pipeline} />}
            </Await>
          </Suspense>
        </section>
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Plans</h3>
            <Link to="/admin/plans" className="text-xs font-semibold text-[#008fa6]">
              Manage
            </Link>
          </div>
          <Suspense fallback={<SectionLoading />}>
            <Await resolve={plansData} errorElement={<SectionLoadError section="Plans" />}>
              {({ plans, activeSubscriptions }) => (
                <div>
                  <div className="space-y-3">
                    {plans.length === 0 ? (
                      <p className="text-sm text-slate-500">No plans configured.</p>
                    ) : (
                      [...plans]
                        .sort((left, right) => right.subscribers - left.subscribers)
                        .map((plan) => (
                          <div key={plan.id} className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {plan.name} <span className="font-normal text-slate-400">{plan.type}</span>
                              </p>
                              <div className="group relative mt-1 h-1.5 w-32 rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-[#00b7d4]"
                                  style={{ width: `${Math.min(plan.subscribers * 18 + 8, 100)}%` }}
                                />
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
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                    <span className="font-medium text-slate-600">Total</span>
                    <strong className="text-slate-900">{activeSubscriptions.toLocaleString()}</strong>
                  </div>
                </div>
              )}
            </Await>
          </Suspense>
        </section>
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Recent updates</h3>
            <Clock3 size={18} className="text-slate-400" />
          </div>
          <Suspense fallback={<SectionLoading />}>
            <Await resolve={activityData} errorElement={<SectionLoadError section="Recent activity" />}>
              {({ activity }) => (
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
              )}
            </Await>
          </Suspense>
        </section>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Recent vendors</h3>
            <Store size={18} className="text-brand-primary" />
          </div>
          <Suspense fallback={<SectionLoading />}>
            <Await resolve={vendorsData} errorElement={<SectionLoadError section="Recent vendors" />}>
              {({ recentVendors }) => (
                <div className="space-y-3">
                  {recentVendors.length === 0 ? (
                    <p className="text-sm text-slate-500">No vendors registered.</p>
                  ) : (
                    recentVendors.map((vendor) => (
                      <Link
                        key={vendor.id}
                        to={`/admin/partners/vendor/${vendor.id}`}
                        className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                      >
                        <p className="truncate text-sm font-semibold text-slate-800 transition-colors hover:text-brand-primary">
                          {vendor.name}
                        </p>
                        <span className="shrink-0 rounded-full bg-brand-soft px-2 py-1 text-[10px] font-semibold capitalize text-brand-primary">
                          {vendor.status}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </Await>
          </Suspense>
        </section>
        <section className="rounded-xl border border-[#e8eeee] bg-white p-5 shadow-[0_5px_18px_rgba(21,61,73,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Recent customers</h3>
            <UserRound size={18} className="text-brand-primary" />
          </div>
          <Suspense fallback={<SectionLoading />}>
            <Await resolve={customersData} errorElement={<SectionLoadError section="Recent customers" />}>
              {({ recentCustomers }) => (
                <div className="space-y-3">
                  {recentCustomers.length === 0 ? (
                    <p className="text-sm text-slate-500">No customers registered.</p>
                  ) : (
                    recentCustomers.map((customer) => (
                      <Link
                        key={customer.id}
                        to={`/admin/users/${customer.id}`}
                        className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800 transition-colors hover:text-brand-primary">
                            {customer.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">{customer.email ?? 'Email unavailable'}</p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-slate-500">Customer</span>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </Await>
          </Suspense>
        </section>
      </div>
    </div>
  )
}
