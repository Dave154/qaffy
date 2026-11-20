import { data } from 'react-router'
import { requireRole } from './auth.server'
import { sql } from './db.server'

type BillingBreakdown = { coveredUnits: number; subscriberAmount: number; regularAmount: number }
type AdminCancellationDetails = {
  reason: string
  refund_requested: boolean
  refund_amount: number
  include_in_vendor_settlement: boolean
  created_at: string
}
type AdminCancellationRow = Omit<AdminCancellationDetails, 'created_at'> & {
  created_at: string | Date
}
type AdminSettlementDetails = {
  status: 'pending' | 'paid' | 'cancelled'
  transfer_status: 'queued' | 'processing' | 'success' | 'failed' | 'reversed' | 'rejected' | null
}
type OrderHandoffEvent = {
  id: string
  event_type: 'picked_up' | 'delivered'
  created_at: string
  actor_type: 'logistics' | 'admin' | 'unknown'
  actor_name: string | null
  actor_email: string | null
}
type VendorClaimDetails = {
  business_name: string
  claimant_name: string | null
  claimant_email: string | null
}
type OrderOperations = {
  handoff_events: OrderHandoffEvent[]
  vendor_claim: VendorClaimDetails | null
}
type OrderOperationsRow = {
  id: string
  handoff_events: Array<Omit<OrderHandoffEvent, 'created_at'> & { created_at: string | Date }>
  vendor_claim: VendorClaimDetails | null
}
type AdminOrder = {
  id: string
  public_order_number: string
  created_at: string
  picked_up_date: string | null
  delivery_date: string | null
  pickup_otp?: string | null
  delivery_otp?: string | null
  order_type: 'wash' | 'wash_iron' | 'mixed'
  status: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  clothes_count_customer: number
  item_count: number
  clothes_count_vendor: number | null
  notes: string | null
  is_subscription_order: boolean
  subscription_id: string | null
  retroactive_subscription_id: string | null
  customer: { id: string; name: string | null; qaffy_id: string | null; email: string | null; phone: string | null } | null
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
    status: 'unpaid' | 'paid' | 'void' | 'refunded'
    payment_method: 'wallet' | 'offline' | 'subscription_units' | null
    paid_at: string | null
    billing_breakdown: BillingBreakdown | null
  } | null
  cancellation: AdminCancellationDetails | null
  settlement: AdminSettlementDetails | null
  mismatches: Array<{ id: string; details: unknown }>
  handoff_events: OrderHandoffEvent[]
  vendor_claim: VendorClaimDetails | null
}
type OrderRow = Omit<
  AdminOrder,
  | 'created_at'
  | 'picked_up_date'
  | 'delivery_date'
  | 'customer'
  | 'location'
  | 'items'
  | 'invoice'
  | 'cancellation'
  | 'mismatches'
  | 'handoff_events'
  | 'vendor_claim'
> & {
  created_at: string | Date
  picked_up_date: string | Date | null
  delivery_date: string | Date | null
  customer: AdminOrder['customer']
  location: AdminOrder['location']
  items: AdminOrder['items']
  invoice: AdminOrder['invoice']
  cancellation: AdminCancellationRow | null
  mismatches: AdminOrder['mismatches']
}
export type OrdersData = {
  orders: AdminOrder[]
  selectedOrder: AdminOrder | null
  page: number
  pageSize: number
  total: number
  query: string
  statusFilter: string
  paymentFilter: 'all' | 'pending' | 'paid'
  dateType: 'created' | 'pickup' | 'delivery'
  sortBy: SortColumn
  sortDirection: 'asc' | 'desc'
  sortRules: SortRule[]
  dateMode: 'all' | 'today' | 'this_month' | 'last_month' | 'custom'
  startDate: string
  endDate: string
}

type SortColumn =
  'created' | 'order' | 'pickup' | 'delivery' | 'customer' | 'qaffy_id' | 'order_type' | 'location' | 'items' | 'payment' | 'status'
type SortRule = { column: SortColumn; direction: 'asc' | 'desc' }

const PAGE_SIZE = 10
const EXPORT_BATCH_SIZE = 500
const ORDER_STATUSES = [
  'all',
  'pending_pickup',
  'picked_up',
  'at_vendor',
  'invoiced',
  'paid',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const
const DATE_MODES = ['all', 'today', 'this_month', 'last_month', 'custom'] as const
const DATE_TYPES = ['created', 'pickup', 'delivery'] as const
const SORT_COLUMNS: SortColumn[] = [
  'created',
  'order',
  'pickup',
  'delivery',
  'customer',
  'qaffy_id',
  'order_type',
  'location',
  'items',
  'payment',
  'status',
]
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
function paymentStatusLabel(status: 'unpaid' | 'paid' | 'void' | 'refunded' | undefined) {
  if (status === 'paid') return 'Paid'
  if (status === 'refunded') return 'Refunded'
  if (status === 'void') return 'Voided'
  return 'Pending'
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
  return [coveredUnits, subscriberAmount, regularAmount].every(Number.isFinite) ? { coveredUnits, subscriberAmount, regularAmount } : null
}
function normalizeOrder(row: OrderRow, operations?: OrderOperations): AdminOrder {
  return {
    ...row,
    created_at: timestamp(row.created_at) ?? '',
    picked_up_date: timestamp(row.picked_up_date),
    delivery_date: timestamp(row.delivery_date),
    items: row.items.map((item) => ({ ...item, unit_price: Number(item.unit_price) })),
    invoice: row.invoice
      ? {
          ...row.invoice,
          amount: Number(row.invoice.amount),
          billing_breakdown: normalizeBreakdown(row.invoice.billing_breakdown),
        }
      : null,
    cancellation: row.cancellation
      ? {
          ...row.cancellation,
          refund_amount: Number(row.cancellation.refund_amount),
          created_at: timestamp(row.cancellation.created_at) ?? '',
        }
      : null,
    handoff_events: operations?.handoff_events ?? [],
    vendor_claim: operations?.vendor_claim ?? null,
  }
}

async function loadOrderOperations(orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, OrderOperations>()
  const rows = await sql<OrderOperationsRow[]>`
    select
      o.id,
      case when claimed_vendor.id is null then null else json_build_object(
        'business_name', claimed_vendor.business_name,
        'claimant_name', claimant.name,
        'claimant_email', claimant.email
      ) end as vendor_claim,
      coalesce((
        select json_agg(json_build_object(
          'id', handoff.id,
          'event_type', handoff.event_type,
          'created_at', handoff.created_at,
          'actor_type', case
            when handoff.agent_profile_id is not null then 'logistics'
            when admin_actor.admin_profile_id is not null then 'admin'
            else 'unknown'
          end,
          'actor_name', case
            when handoff.agent_profile_id is not null then logistics_profile.name
            else admin_actor.name
          end,
          'actor_email', case
            when handoff.agent_profile_id is not null then logistics_profile.email
            else admin_actor.email
          end
        ) order by handoff.created_at, handoff.id)
        from order_logistics_events handoff
        left join profiles logistics_profile on logistics_profile.id = handoff.agent_profile_id
        left join lateral (
          select admin_event.admin_profile_id, admin_profile.name, admin_profile.email
          from admin_audit_events admin_event
          left join profiles admin_profile on admin_profile.id = admin_event.admin_profile_id
          where admin_event.entity_type = 'order'
            and admin_event.entity_id = o.id
            and (
              (handoff.event_type = 'picked_up' and admin_event.action = 'admin_order_marked_picked_up')
              or (
                handoff.event_type = 'delivered'
                and admin_event.action in ('admin_order_marked_delivered', 'admin_offline_order_payment_recorded')
              )
            )
          order by abs(extract(epoch from (admin_event.created_at - handoff.created_at))), admin_event.created_at desc
          limit 1
        ) admin_actor on true
        where handoff.order_id = o.id
      ), '[]'::json) as handoff_events
    from orders o
    left join vendors claimed_vendor on claimed_vendor.id = o.vendor_id
    left join profiles claimant on claimant.id = claimed_vendor.profile_id
    where o.id in ${sql(orderIds)}
  `
  return new Map(
    rows.map((row) => [
      row.id,
      {
        vendor_claim: row.vendor_claim,
        handoff_events: row.handoff_events.map((event) => ({
          ...event,
          created_at: timestamp(event.created_at) ?? '',
        })),
      },
    ]),
  )
}

function parseSortRules(value: string | null): SortRule[] {
  if (!value) return []
  const rules: SortRule[] = []
  for (const item of value.split(',').slice(0, SORT_COLUMNS.length)) {
    const [column, direction, extra] = item.split(':')
    if (
      extra === undefined &&
      SORT_COLUMNS.includes(column as SortColumn) &&
      (direction === 'asc' || direction === 'desc') &&
      !rules.some((rule) => rule.column === column)
    ) {
      rules.push({ column: column as SortColumn, direction })
    }
  }
  return rules
}

export async function loadAdminOrders(request: Request, authOverride?: Awaited<ReturnType<typeof requireRole>>) {
  const auth = authOverride === undefined ? await requireRole(request, 'admin') : authOverride
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
        dateType: 'created',
        sortBy: 'created',
        sortDirection: 'desc',
        sortRules: [{ column: 'created', direction: 'desc' }],
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
  const paymentFilter = requestedPayment === 'paid' || requestedPayment === 'pending' ? requestedPayment : 'all'
  const requestedDateMode = params.get('date') ?? 'all'
  const dateMode = DATE_MODES.includes(requestedDateMode as (typeof DATE_MODES)[number])
    ? (requestedDateMode as OrdersData['dateMode'])
    : 'all'
  const requestedDateType = params.get('dateType') ?? 'created'
  const dateType = DATE_TYPES.includes(requestedDateType as (typeof DATE_TYPES)[number])
    ? (requestedDateType as OrdersData['dateType'])
    : 'created'
  const legacySortBy = params.get('sortBy') ?? 'created'
  const legacySortDirection: SortRule['direction'] = params.get('sortDirection') === 'asc' ? 'asc' : 'desc'
  const parsedSortRules = parseSortRules(params.get('sort'))
  const sortRules: SortRule[] = params.has('sort')
    ? parsedSortRules
    : SORT_COLUMNS.includes(legacySortBy as SortColumn)
      ? [{ column: legacySortBy as SortColumn, direction: legacySortDirection }]
      : [{ column: 'created', direction: 'desc' }]
  const sortBy = sortRules[0]?.column ?? 'created'
  const sortDirection = sortRules[0]?.direction ?? 'desc'
  const fromDate = validDate(params.get('from')) || null
  const toDate = validDate(params.get('to')) || null
  const startDate = fromDate ?? ''
  const endDate = toDate ?? ''
  const requestedPage = Number.parseInt(params.get('page') ?? '1', 10)
  const requestedPageNumber = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const isCsvExport = url.pathname === '/admin/orders/export'
  const selectedOrderId = params.get('orderId')
  const sortExpression = (column: SortColumn) => {
    switch (column) {
      case 'created':
        return sql`o.created_at`
      case 'order':
        return sql`o.public_order_number`
      case 'pickup':
        return sql`o.picked_up_date`
      case 'delivery':
        return sql`(select max(delivery_event.created_at) from order_logistics_events delivery_event where delivery_event.order_id = o.id and delivery_event.event_type = 'delivered')`
      case 'customer':
        return sql`customer.name`
      case 'qaffy_id':
        return sql`customer.qaffy_id`
      case 'order_type':
        return sql`o.order_type::text`
      case 'location':
        return sql`location.name`
      case 'items':
        return sql`(select coalesce(sum(oi_sort.quantity), 0) from order_items oi_sort where oi_sort.order_id = o.id)`
      case 'payment':
        return sql`
          case
            when exists (select 1 from invoices sort_invoice where sort_invoice.order_id = o.id and sort_invoice.status = 'paid') then 'Paid'
            when exists (select 1 from invoices sort_invoice where sort_invoice.order_id = o.id and sort_invoice.status = 'refunded') then 'Refunded'
            when exists (select 1 from invoices sort_invoice where sort_invoice.order_id = o.id and sort_invoice.status = 'void') then 'Voided'
            else 'Pending'
          end
        `
      case 'status':
        return sql`o.status::text`
    }
  }
  const orderBy = sortRules.length
    ? sortRules.slice(1).reduce(
        (order, rule) => sql`
          ${order}, ${sortExpression(rule.column)} ${rule.direction === 'asc' ? sql`asc` : sql`desc`} nulls last
        `,
        sql`${sortExpression(sortRules[0].column)} ${sortRules[0].direction === 'asc' ? sql`asc` : sql`desc`} nulls last`,
      )
    : sql`o.created_at desc`
  const dateRangeFilter =
    dateType === 'pickup'
      ? sql`
          (${fromDate}::date is null or o.picked_up_date >= ${fromDate}::date)
          and (${toDate}::date is null or o.picked_up_date < ${toDate}::date + interval '1 day')
        `
      : dateType === 'delivery'
        ? sql`
            (
              (${fromDate}::date is null and ${toDate}::date is null)
              or exists (
                select 1
                from order_logistics_events delivery_event
                where delivery_event.order_id = o.id
                  and delivery_event.event_type = 'delivered'
                  and (${fromDate}::date is null or delivery_event.created_at >= ${fromDate}::date)
                  and (${toDate}::date is null or delivery_event.created_at < ${toDate}::date + interval '1 day')
              )
            )
          `
        : sql`
            (${fromDate}::date is null or o.created_at >= ${fromDate}::date)
            and (${toDate}::date is null or o.created_at < ${toDate}::date + interval '1 day')
          `
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
        select 1 from invoices payment_invoice
        where payment_invoice.order_id = o.id and payment_invoice.status in ('paid', 'refunded', 'void')
      ))
    )
    and ${dateRangeFilter}
  `
  const orderQuery = (limit: number, offset: number, includeDetails: boolean) => sql<OrderRow[]>`
    select
      o.id,
      o.public_order_number,
      o.created_at,
      o.picked_up_date,
      (select max(delivery_event.created_at)
        from order_logistics_events delivery_event
        where delivery_event.order_id = o.id and delivery_event.event_type = 'delivered') as delivery_date,
      case when ${includeDetails} then o.pickup_otp else null end as pickup_otp,
      case when ${includeDetails} then o.delivery_otp else null end as delivery_otp,
      o.order_type,
      o.status,
      o.clothes_count_customer,
      (select coalesce(sum(oi_count.quantity), 0)::int from order_items oi_count where oi_count.order_id = o.id) as item_count,
      o.clothes_count_vendor,
      o.notes,
      o.is_subscription_order,
      o.subscription_id,
      o.retroactive_subscription_id,
      case when customer.id is null then null else json_build_object(
        'id', customer.id, 'name', customer.name, 'qaffy_id', customer.qaffy_id, 'email', customer.email, 'phone', customer.phone
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
          'payment_method', invoice.payment_method, 'paid_at', invoice.paid_at,
          'billing_breakdown', invoice.billing_breakdown)
        from invoices invoice where invoice.order_id = o.id
      ) as invoice,
      case when ${includeDetails} then (
        select json_build_object(
          'status', settlement.status::text,
          'transfer_status', transfer.status
        )
        from vendor_settlement_orders membership
        join vendor_settlements settlement on settlement.id = membership.settlement_id
        left join vendor_settlement_transfers transfer on transfer.settlement_id = settlement.id
        where membership.order_id = o.id
        order by
          case
            when settlement.status = 'paid'
              or transfer.status in ('success', 'queued', 'processing') then 0
            else 1
          end,
          settlement.created_at desc,
          settlement.id desc
        limit 1
      ) else null end as settlement,
      case when ${includeDetails} then (
        select json_build_object(
          'reason', cancellation.reason,
          'refund_requested', cancellation.refund_requested,
          'refund_amount', cancellation.refund_amount,
          'include_in_vendor_settlement', cancellation.include_in_vendor_settlement,
          'created_at', cancellation.created_at
        )
        from order_cancellations cancellation
        where cancellation.order_id = o.id
      ) else null end as cancellation,
      case when ${includeDetails} then coalesce((
        select json_agg(json_build_object('id', mismatch.id, 'details', mismatch.details))
        from mismatches mismatch where mismatch.order_id = o.id
      ), '[]'::json) else '[]'::json end as mismatches
    from orders o
    left join profiles customer on customer.id = o.customer_id
    left join pickup_locations location on location.id = o.pickup_location_id
    where ${filters}
    order by ${orderBy}, o.created_at desc, o.id desc
    limit ${limit}
    offset ${offset}
  `

  const total = isCsvExport
    ? 0
    : Number(
        (
          await sql<{ total: number }[]>`
          select count(*)::int as total
          from orders o
          left join profiles customer on customer.id = o.customer_id
          left join pickup_locations location on location.id = o.pickup_location_id
          where ${filters}
        `
        )[0]?.total ?? 0,
      )
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(requestedPageNumber, pageCount)

  if (isCsvExport) {
    const encoder = new TextEncoder()
    const headersRow = [
      'Order',
      'Created',
      'Pickup',
      'Delivery',
      'Customer',
      'Qaffy ID',
      'Order type',
      'Location',
      'Items',
      'Payment',
      'Status',
    ]
    let offset = 0
    let finished = false
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (finished) return
        try {
          if (offset === 0) controller.enqueue(encoder.encode(`${headersRow.map(csvValue).join(',')}\n`))
          const batch = await orderQuery(EXPORT_BATCH_SIZE, offset, false)
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
              exportDate(row.delivery_date),
              row.customer?.name ?? 'Customer',
              row.customer?.qaffy_id ?? 'Unavailable',
              orderTypeLabels[row.order_type],
              row.location?.name ?? 'Location pending',
              Number(row.item_count),
              paymentStatusLabel(row.invoice?.status),
              statusLabels[row.status],
            ]
              .map(csvValue)
              .join(','),
          )
          offset += batch.length
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

  const pageRows = await orderQuery(PAGE_SIZE, (page - 1) * PAGE_SIZE, true)
  const pageOperations = await loadOrderOperations(pageRows.map((order) => order.id))
  const normalizedPageRows = pageRows.map((order) => normalizeOrder(order, pageOperations.get(order.id)))
  const selectedFromPage = normalizedPageRows.find((order) => order.id === selectedOrderId)
  let selectedOrder: AdminOrder | null = selectedFromPage ?? null
  if (!selectedOrder && selectedOrderId && /^[0-9a-f-]{36}$/i.test(selectedOrderId)) {
    const [selected] = await sql<OrderRow[]>`
      select
        o.id, o.public_order_number, o.created_at, o.picked_up_date,
        o.pickup_otp, o.delivery_otp,
        (select max(delivery_event.created_at) from order_logistics_events delivery_event
          where delivery_event.order_id = o.id and delivery_event.event_type = 'delivered') as delivery_date,
        o.order_type, o.status,
        o.clothes_count_customer,
        (select coalesce(sum(oi_count.quantity), 0)::int from order_items oi_count where oi_count.order_id = o.id) as item_count,
        o.clothes_count_vendor, o.notes, o.is_subscription_order, o.subscription_id, o.retroactive_subscription_id,
        json_build_object('id', customer.id, 'name', customer.name, 'qaffy_id', customer.qaffy_id, 'email', customer.email, 'phone', customer.phone) as customer,
        case when location.id is null then null else json_build_object('name', location.name) end as location,
        coalesce((select json_agg(json_build_object(
          'id', oi.id, 'quantity', oi.quantity, 'confirmed_quantity', oi.confirmed_quantity,
          'service', oi.service, 'unit_price', oi.unit_price,
          'category', case when category.id is null then null else json_build_object('name', category.name) end
        ) order by oi.id)
          from order_items oi left join cloth_categories category on category.id = oi.category_id
          where oi.order_id = o.id), '[]'::json) as items,
        (select json_build_object('amount', invoice.amount, 'status', invoice.status,
          'payment_method', invoice.payment_method, 'paid_at', invoice.paid_at,
          'billing_breakdown', invoice.billing_breakdown)
          from invoices invoice where invoice.order_id = o.id) as invoice,
        coalesce((select json_agg(json_build_object('id', mismatch.id, 'details', mismatch.details))
          from mismatches mismatch where mismatch.order_id = o.id), '[]'::json) as mismatches
      from orders o
      join profiles customer on customer.id = o.customer_id
      left join pickup_locations location on location.id = o.pickup_location_id
      where o.id = ${selectedOrderId}
      limit 1
    `
    if (selected) {
      const selectedOperations = await loadOrderOperations([selected.id])
      selectedOrder = normalizeOrder(selected, selectedOperations.get(selected.id))
    }
  }
  return data<OrdersData>(
    {
      orders: normalizedPageRows,
      selectedOrder,
      page,
      pageSize: PAGE_SIZE,
      total,
      query,
      statusFilter,
      paymentFilter,
      dateType,
      sortBy,
      sortDirection,
      sortRules,
      dateMode,
      startDate,
      endDate,
    },
    { headers, status: 200 },
  )
}
