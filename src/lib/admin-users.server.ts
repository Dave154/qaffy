import { data } from 'react-router'
import { requireRole } from './auth.server'
import { sql } from './db.server'

type CustomerOrder = {
  id: string
  status: string
  createdAt: string
  amount: number | null
  invoiceStatus: string | null
}
type UserProfileRow = {
  id: string
  qaffy_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  created_at: string | Date
  roles: string[]
  order_count: number
  total_spend: number
  last_order: string | Date | null
  one_off_balance: number
  subscription_balance: number
  active_plan: string | null
  orders: CustomerOrder[]
}
type UsersData = {
  customers: Array<{
    id: string
    qaffyId: string | null
    name: string
    email: string | null
    phone: string | null
    roles: string[]
    joinedAt: string
    orderCount: number
    totalSpend: number
    lastOrder: string | null
    oneOffBalance: number
    subscriptionBalance: number
    activePlan: string | null
    orders: CustomerOrder[]
  }>
  page: number
  pageSize: number
  total: number
  query: string
  roleFilter: string
  dateMode: 'all' | 'this_month' | 'last_month' | 'custom'
  startDate: string
  endDate: string
}

const USERS_PER_PAGE = 10
const USERS_EXPORT_BATCH_SIZE = 500
const USER_ROLES = ['all', 'customer', 'vendor', 'logistics', 'admin'] as const
const DATE_MODES = ['all', 'this_month', 'last_month', 'custom'] as const
const csvValue = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`
const csvText = (value: string | null) => `="${String(value ?? '').replace(/"/g, '""')}"`
function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Not recorded'
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

export async function loadUsers(request: Request) {
  const auth = await requireRole(request, 'admin')
  if (!auth) {
    return data<UsersData>(
      { customers: [], page: 1, pageSize: USERS_PER_PAGE, total: 0, query: '', roleFilter: 'all', dateMode: 'all', startDate: '', endDate: '' },
      { status: 200 },
    )
  }
  const { headers } = auth
  const params = new URL(request.url).searchParams
  const query = (params.get('q') ?? '').trim().slice(0, 120)
  const requestedRole = params.get('role') ?? 'all'
  const roleFilter = USER_ROLES.includes(requestedRole as (typeof USER_ROLES)[number]) ? requestedRole : 'all'
  const requestedDateMode = params.get('date') ?? 'all'
  const dateMode = DATE_MODES.includes(requestedDateMode as (typeof DATE_MODES)[number])
    ? (requestedDateMode as UsersData['dateMode'])
    : 'all'
  const fromDate = validDate(params.get('from')) || null
  const toDate = validDate(params.get('to')) || null
  const startDate = fromDate ?? ''
  const endDate = toDate ?? ''
  const requestedPage = Number.parseInt(params.get('page') ?? '1', 10)
  const requestedPageNumber = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const isCsvExport = new URL(request.url).pathname === '/admin/users/export'
  const filters = sql`
    p.role = 'customer'
    and (
      ${query} = ''
      or p.name ilike '%' || ${query} || '%'
      or p.email ilike '%' || ${query} || '%'
      or p.phone ilike '%' || ${query} || '%'
      or p.qaffy_id ilike '%' || ${query} || '%'
    )
    and (
      ${roleFilter} = 'all'
      or exists (
        select 1 from profile_roles filtered_role
        where filtered_role.profile_id = p.id
          and filtered_role.status = 'approved'
          and filtered_role.role::text = ${roleFilter}
      )
      or (
        ${roleFilter} = 'customer'
        and not exists (
          select 1 from profile_roles existing_role
          where existing_role.profile_id = p.id and existing_role.status = 'approved'
        )
      )
    )
    and (${fromDate}::date is null or p.created_at >= ${fromDate}::date)
    and (${toDate}::date is null or p.created_at < ${toDate}::date + interval '1 day')
  `
  const total = isCsvExport
    ? 0
    : Number(
        (await sql<{ total: number }[]>`
          select count(*)::int as total from profiles p where ${filters}
        `)[0]?.total ?? 0,
      )
  const pageCount = Math.max(1, Math.ceil(total / USERS_PER_PAGE))
  const page = Math.min(requestedPageNumber, pageCount)
  const fetchProfileBatch = (
    limit: number,
    cursorCreatedAt: Date | null = null,
    cursorId: string | null = null,
    offset = 0,
    includeOrders = true,
  ) => sql<UserProfileRow[]>`
    select
      p.id,
      p.qaffy_id,
      p.name,
      p.email,
      p.phone,
      p.created_at,
      coalesce(
        (select json_agg(approved_role.role::text order by approved_role.role)
         from profile_roles approved_role
         where approved_role.profile_id = p.id and approved_role.status = 'approved'),
        '["customer"]'::json
      ) as roles,
      (select count(*)::int from orders customer_order where customer_order.customer_id = p.id) as order_count,
      coalesce(
        (select sum(customer_invoice.amount)
         from orders invoiced_order
         join invoices customer_invoice on customer_invoice.order_id = invoiced_order.id
         where invoiced_order.customer_id = p.id and customer_invoice.status = 'paid'),
        0
      ) + coalesce(
        (select sum(plan_payment.amount) from payments plan_payment
         where plan_payment.customer_id = p.id and plan_payment.status = 'success' and plan_payment.plan_id is not null),
        0
      ) as total_spend,
      (select max(customer_order.created_at) from orders customer_order where customer_order.customer_id = p.id) as last_order,
      coalesce((select customer_wallet.one_off_balance from wallets customer_wallet where customer_wallet.customer_id = p.id), 0) as one_off_balance,
      coalesce((select customer_wallet.subscription_balance from wallets customer_wallet where customer_wallet.customer_id = p.id), 0) as subscription_balance,
      (select active_plan.name
       from subscriptions active_subscription
       join plans active_plan on active_plan.id = active_subscription.plan_id
       where active_subscription.customer_id = p.id and active_subscription.status = 'active'
       order by active_subscription.created_at desc
       limit 1) as active_plan,
      case when ${includeOrders} then coalesce(
        (select json_agg(recent_order.order_detail order by recent_order.created_at desc)
         from (
           select
             customer_order.created_at,
             json_build_object(
               'id', customer_order.id,
               'status', customer_order.status,
               'createdAt', customer_order.created_at,
               'amount', customer_invoice.amount,
               'invoiceStatus', customer_invoice.status
             ) as order_detail
           from orders customer_order
           left join invoices customer_invoice on customer_invoice.order_id = customer_order.id
           where customer_order.customer_id = p.id
           order by customer_order.created_at desc
           limit 10
         ) recent_order),
        '[]'::json
      ) else '[]'::json end as orders
    from profiles p
    where ${filters}
      and (
        ${cursorCreatedAt}::timestamptz is null
        or (p.created_at, p.id) < (${cursorCreatedAt}::timestamptz, ${cursorId}::uuid)
      )
    order by p.created_at desc, p.id desc
    limit ${limit}
    offset ${offset}
  `
  if (isCsvExport) {
    const encoder = new TextEncoder()
    const csvHeaders = ['Name', 'Qaffy ID', 'Roles', 'Email', 'Phone', 'Joined', 'Orders', 'Total paid', 'Wallet', 'Plan']
    let cursorCreatedAt: Date | null = null
    let cursorId: string | null = null
    let finished = false
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (finished) return
        try {
          if (cursorId === null) controller.enqueue(encoder.encode(`${csvHeaders.map(csvValue).join(',')}\n`))
          const batch = await fetchProfileBatch(USERS_EXPORT_BATCH_SIZE, cursorCreatedAt, cursorId, 0, false)
          if (batch.length === 0) {
            finished = true
            controller.close()
            return
          }
          const lines = batch.map((profile) =>
            [
              csvValue(profile.name ?? 'Unnamed customer'),
              csvValue(profile.qaffy_id),
              csvValue(profile.roles.join(', ')),
              csvValue(profile.email),
              csvText(profile.phone),
              csvValue(date(timestamp(profile.created_at))),
              csvValue(Number(profile.order_count)),
              csvValue(Number(profile.total_spend)),
              csvValue(Number(profile.one_off_balance) + Number(profile.subscription_balance)),
              csvValue(profile.active_plan ?? 'One-time'),
            ].join(','),
          )
          const lastProfile = batch[batch.length - 1]
          cursorCreatedAt = lastProfile.created_at instanceof Date ? lastProfile.created_at : new Date(lastProfile.created_at)
          cursorId = lastProfile.id
          controller.enqueue(encoder.encode(`${lines.join('\n')}\n`))
        } catch (error) {
          console.error('[admin-users] CSV export failed', error)
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
    responseHeaders.set('Content-Disposition', 'attachment; filename="qaffy-admin-users.csv"')
    responseHeaders.set('Cache-Control', 'no-store')
    return new Response(stream, { status: 200, headers: responseHeaders })
  }
  const profileRows = await fetchProfileBatch(USERS_PER_PAGE, null, null, (page - 1) * USERS_PER_PAGE)
  return data<UsersData>(
    {
      customers: profileRows.map((profile) => ({
        id: profile.id,
        qaffyId: profile.qaffy_id,
        name: profile.name ?? 'Unnamed customer',
        email: profile.email,
        phone: profile.phone,
        roles: profile.roles,
        joinedAt: timestamp(profile.created_at) ?? '',
        orderCount: Number(profile.order_count),
        totalSpend: Number(profile.total_spend),
        lastOrder: timestamp(profile.last_order),
        oneOffBalance: Number(profile.one_off_balance),
        subscriptionBalance: Number(profile.subscription_balance),
        activePlan: profile.active_plan,
        orders: profile.orders,
      })),
      page,
      pageSize: USERS_PER_PAGE,
      total,
      query,
      roleFilter,
      dateMode,
      startDate,
      endDate,
    },
    { headers, status: 200 },
  )
}
