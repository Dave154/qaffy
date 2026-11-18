import { AlertTriangle, ChevronLeft, ChevronRight, LoaderCircle, Search, ShieldAlert, SlidersHorizontal, X } from 'lucide-react'
import { data, Form, Link, useLoaderData, useNavigate, useNavigation } from 'react-router'
import { useState } from 'react'
import type { Route } from './+types/Mismatches'
import { MultiSortManager, SortColumnHeader, type MultiSortRule } from '../../../components/admin/MultiSortControls'
import { requireRole } from '../../../lib/auth.server'
import { sql } from '../../../lib/db.server'

type MismatchRow = {
  id: string
  publicOrderNumber: string
  orderId: string
  direction: 'over' | 'under'
  detail: string | null
  createdAt: string
  customerName: string | null
  qaffyId: string | null
  orderStatus: string | null
  customerCount: number
  vendorCount: number | null
  pickupLocation: string | null
}

type DirectionFilter = 'all' | 'over' | 'under'
type OrderStatusFilter =
  | 'all'
  | 'pending_pickup'
  | 'picked_up'
  | 'at_vendor'
  | 'invoiced'
  | 'paid'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
type DateMode = 'all' | 'today' | 'this_month' | 'last_month' | 'custom'
type SortColumn = 'order' | 'customer' | 'location' | 'count' | 'type' | 'detail' | 'created'
type SortRule = MultiSortRule<SortColumn>
type MismatchesData = {
  mismatches: MismatchRow[]
  page: number
  pageSize: number
  pageCount: number
  total: number
  query: string
  directionFilter: DirectionFilter
  statusFilter: OrderStatusFilter
  dateMode: DateMode
  startDate: string
  endDate: string
  sortRules: SortRule[]
}

const pageSize = 10
const defaultSortRules: SortRule[] = [{ column: 'created', direction: 'desc' }]
const sortableColumns: Array<{ value: SortColumn; label: string }> = [
  { value: 'order', label: 'Order' },
  { value: 'customer', label: 'Customer' },
  { value: 'location', label: 'Location' },
  { value: 'count', label: 'Count difference' },
  { value: 'type', label: 'Type' },
  { value: 'detail', label: 'Detail' },
  { value: 'created', label: 'Created' },
]
const directionLabels = { over: 'Over count', under: 'Under count' }
const directionStyles = { over: 'bg-amber-50 text-amber-700', under: 'bg-violet-50 text-violet-700' }
const orderStatusLabels: Record<string, string> = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Picked up',
  at_vendor: 'At vendor',
  invoiced: 'Awaiting review',
  paid: 'Paid',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
const statusFilters = Object.keys(orderStatusLabels) as Exclude<OrderStatusFilter, 'all'>[]
const dateModeLabels: Record<DateMode, string> = {
  all: 'All time',
  today: 'Today',
  this_month: 'This month',
  last_month: 'Last month',
  custom: 'Custom range',
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function parseSortRules(value: string | null): SortRule[] {
  if (value === null) return defaultSortRules.map((rule) => ({ ...rule }))
  const allowed = new Set(sortableColumns.map(({ value: column }) => column))
  const seen = new Set<string>()
  return value
    .split(',')
    .map((entry) => {
      const [column, direction] = entry.split(':')
      return allowed.has(column as SortColumn) && (direction === 'asc' || direction === 'desc')
        ? { column: column as SortColumn, direction: direction as 'asc' | 'desc' }
        : null
    })
    .filter((rule): rule is SortRule => {
      if (!rule || seen.has(rule.column)) return false
      seen.add(rule.column)
      return true
    })
    .slice(0, sortableColumns.length)
}

function normalizeDate(value: string | Date | null) {
  return value instanceof Date ? value.toISOString() : value ?? ''
}

function parseDateMode(value: string | null): DateMode {
  return value && value in dateModeLabels ? (value as DateMode) : 'all'
}

function parseDirection(value: string | null): DirectionFilter {
  return value === 'over' || value === 'under' ? value : 'all'
}

function parseStatus(value: string | null): OrderStatusFilter {
  return value && statusFilters.includes(value as Exclude<OrderStatusFilter, 'all'>)
    ? (value as OrderStatusFilter)
    : 'all'
}

function sortExpression(column: SortColumn) {
  switch (column) {
    case 'order':
      return sql`coalesce(o.public_order_number, m.order_id::text)`
    case 'customer':
      return sql`p.name`
    case 'location':
      return sql`l.name`
    case 'count':
      return sql`case when o.clothes_count_vendor is null then null else abs(o.clothes_count_vendor - coalesce(o.clothes_count_customer, 0)) end`
    case 'type':
      return sql`m.direction::text`
    case 'detail':
      return sql`m.detail`
    case 'created':
      return sql`m.created_at`
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  const params = new URL(request.url).searchParams
  const query = (params.get('q') ?? '').trim().slice(0, 120)
  const directionFilter = parseDirection(params.get('direction'))
  const statusFilter = parseStatus(params.get('status'))
  const dateMode = parseDateMode(params.get('date'))
  const startDate = isDate(params.get('from') ?? '') ? params.get('from')! : ''
  const endDate = isDate(params.get('to') ?? '') ? params.get('to')! : ''
  const fromDate = startDate || null
  const toDate = endDate || null
  const sortRules = parseSortRules(params.get('sort'))
  const requestedPage = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  if (!auth) {
    return data<MismatchesData>(
      {
        mismatches: [],
        page: 1,
        pageSize,
        pageCount: 1,
        total: 0,
        query,
        directionFilter,
        statusFilter,
        dateMode,
        startDate,
        endDate,
        sortRules,
      },
      { status: 200 },
    )
  }

  const { headers } = auth
  const dateFilter =
    dateMode === 'today'
      ? sql`and m.created_at >= (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')
            and m.created_at < ((date_trunc('day', now() at time zone 'Africa/Lagos') + interval '1 day') at time zone 'Africa/Lagos')`
      : dateMode === 'this_month'
        ? sql`and m.created_at >= (date_trunc('month', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')
              and m.created_at < ((date_trunc('month', now() at time zone 'Africa/Lagos') + interval '1 month') at time zone 'Africa/Lagos')`
        : dateMode === 'last_month'
          ? sql`and m.created_at >= ((date_trunc('month', now() at time zone 'Africa/Lagos') - interval '1 month') at time zone 'Africa/Lagos')
                and m.created_at < (date_trunc('month', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')`
          : dateMode === 'custom'
            ? sql`and (${fromDate}::date is null or m.created_at >= (${fromDate}::date at time zone 'Africa/Lagos'))
                  and (${toDate}::date is null or m.created_at < ((${toDate}::date + interval '1 day') at time zone 'Africa/Lagos'))`
            : sql``
  const where = sql`
    from public.mismatches m
    left join public.orders o on o.id = m.order_id
    left join public.profiles p on p.id = o.customer_id
    left join public.pickup_locations l on l.id = o.pickup_location_id
    where m.resolved_at is null
      and (${directionFilter} = 'all' or m.direction::text = ${directionFilter})
      and (${statusFilter} = 'all' or o.status::text = ${statusFilter})
      and (
        ${query} = ''
        or coalesce(o.public_order_number, '') ilike '%' || ${query} || '%'
        or m.order_id::text ilike '%' || ${query} || '%'
        or coalesce(p.name, '') ilike '%' || ${query} || '%'
        or coalesce(p.qaffy_id, '') ilike '%' || ${query} || '%'
        or coalesce(m.detail, '') ilike '%' || ${query} || '%'
        or coalesce(l.name, '') ilike '%' || ${query} || '%'
      )
      ${dateFilter}
  `
  const [countRows] = await sql<{ total: number | string }[]>`select count(*)::int as total ${where}`
  const total = Number(countRows?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, pageCount)
  const orderBy =
    sortRules.length > 0
      ? sortRules.slice(1).reduce(
          (order, rule) => sql`
            ${order}, ${sortExpression(rule.column)} ${rule.direction === 'asc' ? sql`asc` : sql`desc`} nulls last
          `,
          sql`${sortExpression(sortRules[0].column)} ${sortRules[0].direction === 'asc' ? sql`asc` : sql`desc`} nulls last`,
        )
      : sql`m.id desc`
  type DbMismatch = {
    id: string
    order_id: string
    public_order_number: string | null
    direction: 'over' | 'under'
    detail: string | null
    created_at: string | Date
    customer_name: string | null
    qaffy_id: string | null
    order_status: string | null
    customer_count: number | string | null
    vendor_count: number | string | null
    pickup_location: string | null
  }
  const rows = await sql<DbMismatch[]>`
    select
      m.id::text as id,
      m.order_id::text as order_id,
      o.public_order_number,
      m.direction::text as direction,
      m.detail,
      m.created_at,
      p.name as customer_name,
      p.qaffy_id,
      o.status::text as order_status,
      o.clothes_count_customer as customer_count,
      o.clothes_count_vendor as vendor_count,
      l.name as pickup_location
    ${where}
    order by ${orderBy}, m.id desc
    limit ${pageSize}
    offset ${(page - 1) * pageSize}
  `
  return data<MismatchesData>(
    {
      mismatches: rows.map((row) => ({
        id: row.id,
        publicOrderNumber: row.public_order_number ?? 'QO-UNKNOWN',
        orderId: row.order_id,
        direction: row.direction,
        detail: row.detail,
        createdAt: normalizeDate(row.created_at),
        customerName: row.customer_name ?? 'Unknown customer',
        qaffyId: row.qaffy_id,
        orderStatus: row.order_status,
        customerCount: Number(row.customer_count ?? 0),
        vendorCount: row.vendor_count === null ? null : Number(row.vendor_count),
        pickupLocation: row.pickup_location ?? 'Location pending',
      })),
      page,
      pageSize,
      pageCount,
      total,
      query,
      directionFilter,
      statusFilter,
      dateMode,
      startDate,
      endDate,
      sortRules,
    },
    { headers, status: 200 },
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data({ error: 'Admin access required.' }, { status: 403 })
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  if (intent !== 'resolve') return data({ error: 'Invalid mismatch action.' }, { status: 400 })

  const mismatchId = String(formData.get('mismatchId') ?? '')
  if (!mismatchId) return data({ error: 'Mismatch is required.' }, { status: 400 })

  const { supabase, headers } = auth
  const { error } = await supabase
    .from('mismatches')
    .update({ resolved_at: new Date().toISOString(), resolved_by: auth.profile.id })
    .eq('id', mismatchId)
    .is('resolved_at', null)
  if (error) return data({ error: error.message }, { headers, status: 400 })

  const { error: auditError } = await supabase.from('admin_audit_events').insert({
    admin_profile_id: auth.profile.id,
    action: 'mismatch_reviewed',
    entity_type: 'mismatch',
    entity_id: mismatchId,
    metadata: {},
  })
  if (auditError) return data({ error: auditError.message }, { headers, status: 400 })

  return data({ ok: true }, { headers, status: 200 })
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function buildSearch(values: {
  page: number
  query: string
  directionFilter: DirectionFilter
  statusFilter: OrderStatusFilter
  dateMode: DateMode
  startDate: string
  endDate: string
  sortRules: SortRule[]
}) {
  const search = new URLSearchParams()
  if (values.page > 1) search.set('page', String(values.page))
  if (values.query) search.set('q', values.query)
  if (values.directionFilter !== 'all') search.set('direction', values.directionFilter)
  if (values.statusFilter !== 'all') search.set('status', values.statusFilter)
  if (values.sortRules.length === 0) search.set('sort', '')
  else if (
    values.sortRules.length !== 1 ||
    values.sortRules[0].column !== 'created' ||
    values.sortRules[0].direction !== 'desc'
  ) {
    search.set('sort', values.sortRules.map((rule) => `${rule.column}:${rule.direction}`).join(','))
  }
  if (values.dateMode !== 'all') search.set('date', values.dateMode)
  if (values.startDate) search.set('from', values.startDate)
  if (values.endDate) search.set('to', values.endDate)
  return `?${search.toString()}`
}

function MismatchFilterDrawer({
  isOpen,
  onClose,
  onApply,
  onClear,
  directionFilter,
  setDirectionFilter,
  statusFilter,
  setStatusFilter,
  dateMode,
  setDateMode,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: {
  isOpen: boolean
  onClose: () => void
  onApply: () => void
  onClear: () => void
  directionFilter: DirectionFilter
  setDirectionFilter: (value: DirectionFilter) => void
  statusFilter: OrderStatusFilter
  setStatusFilter: (value: OrderStatusFilter) => void
  dateMode: DateMode
  setDateMode: (value: DateMode) => void
  startDate: string
  setStartDate: (value: string) => void
  endDate: string
  setEndDate: (value: string) => void
}) {
  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-40 bg-slate-950/30"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Filter mismatches"
        className="absolute inset-y-0 right-0 flex w-[min(100%,440px)] flex-col bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Filter mismatches</h3>
            <p className="mt-1 text-sm text-slate-500">Narrow the mismatch review list.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Mismatch type</span>
            <select
              value={directionFilter}
              onChange={(event) => setDirectionFilter(parseDirection(event.target.value))}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="all">All mismatches</option>
              <option value="over">Over count</option>
              <option value="under">Under count</option>
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Order status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(parseStatus(event.target.value))}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="all">All statuses</option>
              {statusFilters.map((status) => (
                <option key={status} value={status}>
                  {orderStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Mismatch created</span>
            <select
              value={dateMode}
              onChange={(event) => {
                const nextMode = parseDateMode(event.target.value)
                setDateMode(nextMode)
                if (nextMode !== 'custom') {
                  setStartDate('')
                  setEndDate('')
                }
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              {(Object.entries(dateModeLabels) as Array<[DateMode, string]>).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {dateMode === 'custom' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="block text-xs font-medium text-slate-500">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </label>
              <label className="space-y-2">
                <span className="block text-xs font-medium text-slate-500">To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </label>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-5">
          <button type="button" onClick={onClear} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            Clear filters
          </button>
          <button
            type="button"
            onClick={onApply}
            className="h-10 rounded-lg bg-brand-primary px-5 text-sm font-semibold text-white hover:bg-brand-primary-hover"
          >
            Apply filters
          </button>
        </div>
      </aside>
    </div>
  )
}

export default function Mismatches() {
  const {
    mismatches,
    page,
    pageSize: currentPageSize,
    pageCount,
    total,
    query,
    directionFilter,
    statusFilter,
    dateMode,
    startDate,
    endDate,
    sortRules,
  } = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [draftDirectionFilter, setDraftDirectionFilter] = useState(directionFilter)
  const [draftStatusFilter, setDraftStatusFilter] = useState(statusFilter)
  const [draftDateMode, setDraftDateMode] = useState(dateMode)
  const [draftStartDate, setDraftStartDate] = useState(startDate)
  const [draftEndDate, setDraftEndDate] = useState(endDate)
  const [selectedMismatch, setSelectedMismatch] = useState<MismatchRow | null>(null)
  const isLoadingPage = navigation.state === 'loading' && navigation.location?.pathname === '/admin/mismatches'
  const activeFilters = directionFilter !== 'all' || statusFilter !== 'all' || dateMode !== 'all'
  const buildCurrentSearch = (nextPage: number, nextSortRules = sortRules) =>
    buildSearch({
      page: nextPage,
      query,
      directionFilter,
      statusFilter,
      dateMode,
      startDate,
      endDate,
      sortRules: nextSortRules,
    })
  const changeColumnSort = (column: SortColumn, direction: SortRule['direction']) => {
    const updatedRules = [{ column, direction }, ...sortRules.filter((rule) => rule.column !== column)]
    navigate(buildCurrentSearch(1, updatedRules))
  }
  const applySortRules = (rules: SortRule[]) => navigate(buildCurrentSearch(1, rules))
  const openFilterDrawer = () => {
    setDraftDirectionFilter(directionFilter)
    setDraftStatusFilter(statusFilter)
    setDraftDateMode(dateMode)
    setDraftStartDate(startDate)
    setDraftEndDate(endDate)
    setIsFilterOpen(true)
  }
  const clearDraftFilters = () => {
    setDraftDirectionFilter('all')
    setDraftStatusFilter('all')
    setDraftDateMode('all')
    setDraftStartDate('')
    setDraftEndDate('')
  }
  const applyDraftFilters = () => {
    navigate(
      buildSearch({
        page: 1,
        query,
        directionFilter: draftDirectionFilter,
        statusFilter: draftStatusFilter,
        dateMode: draftDateMode,
        startDate: draftStartDate,
        endDate: draftEndDate,
        sortRules,
      }),
    )
    setIsFilterOpen(false)
  }
  const sortQuery = sortRules.map((rule) => `${rule.column}:${rule.direction}`).join(',')

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertTriangle size={16} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Mismatch review</h3>
              <p className="text-sm text-slate-500">Review unexpected counts before finance is treated as final.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Form method="get" action="/admin/mismatches" className="relative w-full lg:min-w-0 lg:flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="hidden" name="direction" value={directionFilter} />
            <input type="hidden" name="status" value={statusFilter} />
            <input type="hidden" name="sort" value={sortQuery} />
            <input type="hidden" name="date" value={dateMode} />
            <input type="hidden" name="from" value={startDate} />
            <input type="hidden" name="to" value={endDate} />
            <input
              key={query}
              name="q"
              defaultValue={query}
              placeholder="Search order, customer, location, or detail"
              aria-label="Search mismatches"
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
            />
          </Form>
          <div className="flex flex-wrap items-center justify-end gap-2 self-end lg:shrink-0 lg:flex-nowrap lg:self-auto">
            <MultiSortManager columns={sortableColumns} rules={sortRules} onApply={applySortRules} />
            <button
              type="button"
              onClick={openFilterDrawer}
              aria-label="Open mismatch filters"
              title="Filter mismatches"
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-brand-primary hover:text-brand-primary"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilters && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-primary" aria-label="Filters active" />
              )}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[9px] capitalize tracking-[0.12em] text-slate-500">
                {(
                  [
                    ['order', 'Order', 'w-[120px]'],
                    ['customer', 'Customer', 'w-[150px]'],
                    ['location', 'Location', 'w-[120px]'],
                    ['count', 'Count', 'w-[110px]'],
                    ['type', 'Type', 'w-[110px]'],
                    ['detail', 'Detail', 'w-[220px]'],
                    ['created', 'Created', 'w-[120px]'],
                  ] as const
                ).map(([column, label, width]) => {
                  const activeRule = sortRules.find((rule) => rule.column === column)
                  return (
                    <th key={column} className={`${width} px-3 py-3 font-semibold`}>
                      <SortColumnHeader
                        label={label}
                        direction={activeRule?.direction ?? null}
                        onSort={(direction) => changeColumnSort(column, direction)}
                      />
                    </th>
                  )
                })}
                <th className="w-[160px] px-3 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingPage ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12">
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500" role="status">
                      <LoaderCircle size={18} className="animate-spin text-brand-primary" />
                      Loading mismatches…
                    </div>
                  </td>
                </tr>
              ) : mismatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                    No mismatches match these filters.
                  </td>
                </tr>
              ) : (
                mismatches.map((mismatch) => (
                  <tr key={mismatch.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-3 py-3">
                      <div className="max-w-[110px] min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{mismatch.publicOrderNumber}</p>
                        <p className="mt-1 truncate text-[10px] text-slate-500">
                          {mismatch.orderStatus ? (orderStatusLabels[mismatch.orderStatus] ?? mismatch.orderStatus) : 'Status pending'}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-[140px] min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{mismatch.customerName}</p>
                        <p className="mt-1 truncate text-[10px] text-slate-500">{mismatch.qaffyId ?? 'Qaffy ID unavailable'}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-[110px] min-w-0">
                        <p className="truncate text-sm text-slate-600">{mismatch.pickupLocation ?? 'Location pending'}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700">
                      <div className="flex max-w-[100px] flex-col gap-0.5">
                        <span className="truncate">Customer: {mismatch.customerCount}</span>
                        <span className="truncate">Vendor: {mismatch.vendorCount ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-semibold capitalize tracking-[0.12em] ${directionStyles[mismatch.direction]}`}
                      >
                        <ShieldAlert size={10} />
                        {directionLabels[mismatch.direction]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-700">
                      <div className="max-w-[200px] min-w-0">
                        <p className="truncate">{mismatch.detail ?? 'No mismatch notes were supplied.'}</p>
                        <button
                          type="button"
                          onClick={() => setSelectedMismatch(mismatch)}
                          className="mt-2 text-[10px] font-semibold text-brand-primary underline-offset-2 hover:underline"
                        >
                          View details
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{formatDate(mismatch.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedMismatch(mismatch)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * currentPageSize + 1}–{Math.min(page * currentPageSize, total)} of {total.toLocaleString()} mismatches
            </p>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => navigate(buildCurrentSearch(page - 1))}
                disabled={page === 1 || isLoadingPage}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span className="whitespace-nowrap text-sm text-slate-600">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => navigate(buildCurrentSearch(page + 1))}
                disabled={page === pageCount || isLoadingPage}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      <MismatchFilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={applyDraftFilters}
        onClear={clearDraftFilters}
        directionFilter={draftDirectionFilter}
        setDirectionFilter={setDraftDirectionFilter}
        statusFilter={draftStatusFilter}
        setStatusFilter={setDraftStatusFilter}
        dateMode={draftDateMode}
        setDateMode={setDraftDateMode}
        startDate={draftStartDate}
        setStartDate={setDraftStartDate}
        endDate={draftEndDate}
        setEndDate={setDraftEndDate}
      />

      {selectedMismatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="mt-2 text-xl font-bold text-slate-900">{selectedMismatch.publicOrderNumber}</h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMismatch(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-500 hover:bg-slate-50"
                aria-label="Close mismatch details"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] capitalize tracking-[0.12em] text-slate-500">Customer</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{selectedMismatch.customerName}</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedMismatch.qaffyId ?? 'Qaffy ID unavailable'}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] capitalize tracking-[0.12em] text-slate-500">Type</p>
                  <div className="mt-2">
                    <span
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize tracking-[0.12em] ${directionStyles[selectedMismatch.direction]}`}
                    >
                      <ShieldAlert size={12} />
                      {directionLabels[selectedMismatch.direction]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] capitalize tracking-[0.12em] text-slate-500">Count summary</p>
                <div className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                  <span>Customer count: {selectedMismatch.customerCount}</span>
                  <span>Vendor count: {selectedMismatch.vendorCount ?? '—'}</span>
                  <span className="sm:col-span-2">Location: {selectedMismatch.pickupLocation ?? 'Location pending'}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] capitalize tracking-[0.12em] text-slate-500">Detailed note</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {selectedMismatch.detail ?? 'No mismatch notes were supplied.'}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-xs text-slate-500">
                <span>
                  Status:{' '}
                  {selectedMismatch.orderStatus
                    ? (orderStatusLabels[selectedMismatch.orderStatus] ?? selectedMismatch.orderStatus)
                    : 'Status pending'}
                </span>
                <span>{formatDate(selectedMismatch.createdAt)}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Link
                to={`/admin/orders?orderId=${encodeURIComponent(selectedMismatch.orderId)}`}
                className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-hover"
              >
                View order
              </Link>
              <button
                type="button"
                onClick={() => setSelectedMismatch(null)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
