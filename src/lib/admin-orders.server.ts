import { data } from 'react-router'
import { requireRole } from './auth.server'
import { sql } from './db.server'

type BillingBreakdown = { coveredUnits: number; subscriberAmount: number; regularAmount: number }
type AdminOrder = {
  id: string
  public_order_number: string
  created_at: string
  picked_up_date: string | null
  order_type: 'wash' | 'wash_iron' | 'mixed'
  status: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  clothes_count_customer: number
  item_count: number
  clothes_count_vendor: number | null
  notes: string | null
  is_subscription_order: boolean
  customer: { name: string | null; qaffy_id: string | null; email: string | null; phone: string | null } | null
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
    paid_at: string | null
    billing_breakdown: BillingBreakdown | null
  } | null
  mismatches: Array<{ id: string; details: unknown }>
}
type OrderRow = Omit<AdminOrder, 'created_at' | 'picked_up_date' | 'customer' | 'location' | 'items' | 'invoice' | 'mismatches'> & {
  created_at: string | Date
  picked_up_date: string | Date | null
  customer: AdminOrder['customer']
  location: AdminOrder['location']
  items: AdminOrder['items']
  invoice: AdminOrder['invoice']
  mismatches: AdminOrder['mismatches']
}
type OrdersData = {
  orders: AdminOrder[]
  selectedOrder: AdminOrder | null
  page: number
  pageSize: number
  total: number
  query: string
  statusFilter: string
  paymentFilter: 'all' | 'pending' | 'paid'
  dateMode: 'all' | 'this_month' | 'last_month' | 'custom'
  startDate: string
  endDate: string
}

const PAGE_SIZE = 10
const EXPORT_BATCH_SIZE = 500
const ORDER_STATUSES = ['all', 'pending_pickup', 'picked_up', 'at_vendor', 'invoiced', 'paid', 'out_for_delivery', 'delivered', 'cancelled'] as const
const DATE_MODES = ['all', 'this_month', 'last_month', 'custom'] as const
const csvValue = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`
const orderTypeLabels = { wash: 'Wash only', wash_iron: 'Wash + Iron', mixed: 'Mixed service' }
const statusLabels = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Picked up',
  at_vendor: 'At vendor',
  invoiced: 'Awaiting review',
  paid: 'Paid',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : ''
}
function timestamp(value: string | Date | null) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}
function exportDate(value: string | Date | null) {
  const normalized = timestamp(value)
  return normalized
    ? new Date(normalized).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not recorded'
}
function normalizeBreakdown(value: unknown): BillingBreakdown | null {
  let candidate = value
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate)
    } catch {
      return null
    }
  }
  if (!candidate || typeof candidate !== 'object') return null
  const record = candidate as Record<string, unknown>
  const coveredUnits = Number(record.coveredUnits)
  const subscriberAmount = Number(record.subscriberAmount)
  const regularAmount = Number(record.regularAmount)
  return [coveredUnits, subscriberAmount, regularAmount].every(Number.isFinite)
    ? { coveredUnits, subscriberAmount, regularAmount }
    : null
}
function normalizeOrder(row: OrderRow): AdminOrder {
  return {
    ...row,
    created_at: timestamp(row.created_at) ?? '',
    picked_up_date: timestamp(row.picked_up_date),
    items: row.items.map((item) => ({ ...item, unit_price: Number(item.unit_price) })),
    invoice: row.invoice
      ? {
          ...row.invoice,
          amount: Number(row.invoice.amount),
          billing_breakdown: normalizeBreakdown(row.invoice.billing_breakdown),
        }
      : null,
  }
}

export async function loadAdminOrders(request: Request) {
  const auth = await requireRole(request, 'admin')
  const url = new URL(request.url)
  const params = url.searchParams
  if (!auth) {
    return data<OrdersData>(
      {
        orders: [],
        selectedOrder: null,
        page: 1,
        pageSize: PAGE_SIZE,
        total: 0,
        query: '',
        statusFilter: 'all',
        paymentFilter: 'all',
        dateMode: 'all',
        startDate: '',
        endDate: '',
      },
      { status: 200 },
    )
  }

  const { headers } = auth
  const query = (params.get('q') ?? '').trim().slice(0, 120)
  const requestedStatus = params.get('status') ?? 'all'
  const statusFilter = ORDER_STATUSES.includes(requestedStatus as (typeof ORDER_STATUSES)[number]) ? requestedStatus : 'all'
  const requestedPayment = params.get('payment') ?? 'all'
  const paymentFilter =
    requestedPayment === 'paid' || requestedPayment === 'pending' ? requestedPayment : 'all'
  const requestedDateMode = params.get('date') ?? 'all'
  const dateMode = DATE_MODES.includes(requestedDateMode as (typeof DATE_MODES)[number])
    ? (requestedDateMode as OrdersData['dateMode'])
    : 'all'
  const fromDate = validDate(params.get('from')) || null
  const toDate = validDate(params.get('to')) || null
  const startDate = fromDate ?? ''
  const endDate = toDate ?? ''
  const requestedPage = Number.parseInt(params.get('page') ?? '1', 10)
  const requestedPageNumber = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const isCsvExport = url.pathname === '/admin/orders/export'
  const selectedOrderId = params.get('orderId')
  const filters = sql`
    (
      ${query} = ''
      or o.public_order_number ilike '%' || ${query} || '%'
      or customer.name ilike '%' || ${query} || '%'
      or customer.qaffy_id ilike '%' || ${query} || '%'
      or customer.email ilike '%' || ${query} || '%'
      or customer.phone ilike '%' || ${query} || '%'
      or location.name ilike '%' || ${query} || '%'
    )
    and (${statusFilter} = 'all' or o.status::text = ${statusFilter})
    and (
      ${paymentFilter} = 'all'
      or (${paymentFilter} = 'paid' and exists (
        select 1 from invoices payment_invoice where payment_invoice.order_id = o.id and payment_invoice.status = 'paid'
      ))
      or (${paymentFilter} = 'pending' and not exists (
        select 1 from invoices payment_invoice where payment_invoice.order_id = o.id and payment_invoice.status = 'paid'
      ))
    )
    and (${fromDate}::date is null or o.created_at >= ${fromDate}::date)
    and (${toDate}::date is null or o.created_at < ${toDate}::date + interval '1 day')
  `
  const orderQuery = (
    limit: number,
    offset: number,
    cursorCreatedAt: Date | null,
    cursorId: string | null,
    includeDetails: boolean,
  ) => sql<OrderRow[]>`
    select
      o.id,
      o.public_order_number,
      o.created_at,
      o.picked_up_date,
      o.order_type,
      o.status,
      o.clothes_count_customer,
      (select coalesce(sum(oi_count.quantity), 0)::int from order_items oi_count where oi_count.order_id = o.id) as item_count,
      o.clothes_count_vendor,
      o.notes,
      o.is_subscription_order,
      case when customer.id is null then null else json_build_object(
        'name', customer.name, 'qaffy_id', customer.qaffy_id, 'email', customer.email, 'phone', customer.phone
      ) end as customer,
      case when location.id is null then null else json_build_object('name', location.name) end as location,
      case when ${includeDetails} then coalesce((
        select json_agg(json_build_object(
          'id', oi.id, 'quantity', oi.quantity, 'confirmed_quantity', oi.confirmed_quantity,
          'service', oi.service, 'unit_price', oi.unit_price,
          'category', case when category.id is null then null else json_build_object('name', category.name) end
        ) order by oi.id)
        from order_items oi
        left join cloth_categories category on category.id = oi.category_id
        where oi.order_id = o.id
      ), '[]'::json) else '[]'::json end as items,
      (
        select json_build_object('amount', invoice.amount, 'status', invoice.status,
          'paid_at', invoice.paid_at, 'billing_breakdown', invoice.billing_breakdown)
        from invoices invoice where invoice.order_id = o.id
      ) as invoice,
      case when ${includeDetails} then coalesce((
        select json_agg(json_build_object('id', mismatch.id, 'details', mismatch.details))
        from mismatches mismatch where mismatch.order_id = o.id
      ), '[]'::json) else '[]'::json end as mismatches
    from orders o
    left join profiles customer on customer.id = o.customer_id
    left join pickup_locations location on location.id = o.pickup_location_id
    where ${filters}
      and (
        ${cursorCreatedAt}::timestamptz is null
        or (o.created_at, o.id) < (${cursorCreatedAt}::timestamptz, ${cursorId}::uuid)
      )
    order by o.created_at desc, o.id desc
    limit ${limit}
    offset ${offset}
  `

  const total = isCsvExport
    ? 0
    : Number(
        (await sql<{ total: number }[]>`
          select count(*)::int as total
          from orders o
          left join profiles customer on customer.id = o.customer_id
          left join pickup_locations location on location.id = o.pickup_location_id
          where ${filters}
        `)[0]?.total ?? 0,
      )
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(requestedPageNumber, pageCount)

  if (isCsvExport) {
    const encoder = new TextEncoder()
    const headersRow = ['Order', 'Created', 'Pickup', 'Customer', 'Qaffy ID', 'Order type', 'Location', 'Items', 'Payment', 'Status']
    let cursorCreatedAt: Date | null = null
    let cursorId: string | null = null
    let finished = false
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (finished) return
        try {
          if (cursorId === null) controller.enqueue(encoder.encode(`${headersRow.map(csvValue).join(',')}\n`))
          const batch = await orderQuery(EXPORT_BATCH_SIZE, 0, cursorCreatedAt, cursorId, false)
          if (batch.length === 0) {
            finished = true
            controller.close()
            return
          }
          const lines = batch.map((row) =>
            [
              row.public_order_number,
              exportDate(row.created_at),
              exportDate(row.picked_up_date),
              row.customer?.name ?? 'Customer',
              row.customer?.qaffy_id ?? 'Unavailable',
              orderTypeLabels[row.order_type],
              row.location?.name ?? 'Location pending',
              Number(row.item_count),
              row.invoice?.status === 'paid' ? 'Paid' : 'Pending',
              statusLabels[row.status],
            ].map(csvValue).join(','),
          )
          const last = batch[batch.length - 1]
          cursorCreatedAt = last.created_at instanceof Date ? last.created_at : new Date(last.created_at)
          cursorId = last.id
          controller.enqueue(encoder.encode(`${lines.join('\n')}\n`))
        } catch (error) {
          console.error('[admin-orders] CSV export failed', error)
          finished = true
          controller.error(error)
        }
      },
      cancel() {
        finished = true
      },
    })
    const responseHeaders = new Headers(headers)
    responseHeaders.set('Content-Type', 'text/csv; charset=utf-8')
    responseHeaders.set('Content-Disposition', 'attachment; filename="qaffy-admin-orders.csv"')
    responseHeaders.set('Cache-Control', 'no-store')
    return new Response(stream, { status: 200, headers: responseHeaders })
  }

  const pageRows = await orderQuery(PAGE_SIZE, (page - 1) * PAGE_SIZE, null, null, true)
  const selectedFromPage = pageRows.find((order) => order.id === selectedOrderId)
  let selectedOrder = selectedFromPage ? normalizeOrder(selectedFromPage) : null
  if (!selectedOrder && selectedOrderId && /^[0-9a-f-]{36}$/i.test(selectedOrderId)) {
    const [selected] = await sql<OrderRow[]>`
      select
        o.id, o.public_order_number, o.created_at, o.picked_up_date, o.order_type, o.status,
        o.clothes_count_customer, o.clothes_count_customer as item_count, o.clothes_count_vendor, o.notes, o.is_subscription_order,
        json_build_object('name', customer.name, 'qaffy_id', customer.qaffy_id, 'email', customer.email, 'phone', customer.phone) as customer,
        case when location.id is null then null else json_build_object('name', location.name) end as location,
        coalesce((select json_agg(json_build_object(
          'id', oi.id, 'quantity', oi.quantity, 'confirmed_quantity', oi.confirmed_quantity,
          'service', oi.service, 'unit_price', oi.unit_price,
          'category', case when category.id is null then null else json_build_object('name', category.name) end
        ) order by oi.id)
          from order_items oi left join cloth_categories category on category.id = oi.category_id
          where oi.order_id = o.id), '[]'::json) as items,
        (select json_build_object('amount', invoice.amount, 'status', invoice.status,
          'paid_at', invoice.paid_at, 'billing_breakdown', invoice.billing_breakdown)
          from invoices invoice where invoice.order_id = o.id) as invoice,
        coalesce((select json_agg(json_build_object('id', mismatch.id, 'details', mismatch.details))
          from mismatches mismatch where mismatch.order_id = o.id), '[]'::json) as mismatches
      from orders o
      join profiles customer on customer.id = o.customer_id
      left join pickup_locations location on location.id = o.pickup_location_id
      where o.id = ${selectedOrderId}
      limit 1
    `
    if (selected) selectedOrder = normalizeOrder(selected)
  }
  return data<OrdersData>(
    {
      orders: pageRows.map(normalizeOrder),
      selectedOrder,
      page,
      pageSize: PAGE_SIZE,
      total,
      query,
      statusFilter,
      paymentFilter,
      dateMode,
      startDate,
      endDate,
    },
    { headers, status: 200 },
  )
}
