import { Link, Outlet, data, useLoaderData, useNavigate, useRevalidator, type ShouldRevalidateFunctionArgs } from 'react-router'
import { useEffect } from 'react'
import { LogOut } from 'lucide-react'
import type { Route } from './+types/LogisticsLayout'
import QaffyLogo from '../../components/QaffyLogo'
import { requireRole } from '../../lib/auth.server'
import { sql } from '../../lib/db.server'
import { supabase } from '../../lib/supabase.client'

const logisticsHistoryPageSize = 10

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'logistics')
  if (!auth) {
    return data(
      {
        summary: { pickedUp: 0, pendingPickup: 0, delivered: 0, pendingDelivery: 0 },
        selectedLocation: 'all',
        locations: [],
        historyEvents: [],
        historyPagination: { page: 1, pageSize: logisticsHistoryPageSize, totalCount: 0, pageCount: 1 },
        agent: { id: null, name: 'Logistics agent', email: null, qaffyId: null },
      },
      { status: 200 },
    )
  }

  const { supabase: serverSupabase, headers, profile } = auth
  const agentProfile = {
    id: profile.id,
    name: profile.name ?? 'Logistics agent',
    email: profile.email ?? null,
    qaffyId: profile.qaffy_id ?? null,
  }
  const url = new URL(request.url)
  const requestedRange = url.searchParams.get('range') ?? 'Today'
  const range = (['Today', 'Yesterday', 'Last week', 'Last month', 'All time'].includes(requestedRange) ? requestedRange : 'Today') as
    'Today' | 'Yesterday' | 'Last week' | 'Last month' | 'All time'
  const historyType = url.searchParams.get('history') === 'delivered' ? 'delivered' : 'picked_up'
  const requestedPage = Number.parseInt(url.searchParams.get('page') ?? '1', 10)
  const pageNumber = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const requestedLocation = url.searchParams.get('location') ?? 'all'
  const locationFilter = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedLocation)
    ? requestedLocation
    : null
  const lagosDateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const lagosDatePart = (type: 'year' | 'month' | 'day') => Number(lagosDateParts.find((part) => part.type === type)?.value)
  const todayStart = new Date(Date.UTC(lagosDatePart('year'), lagosDatePart('month') - 1, lagosDatePart('day')) - 60 * 60 * 1000)
  const rangeStart = new Date(todayStart)
  let rangeEnd: Date | null = null
  if (range === 'Yesterday') {
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 1)
    rangeEnd = todayStart
  } else if (range === 'Last week') {
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 6)
  } else if (range === 'Last month') {
    rangeStart.setUTCDate(1)
  }
  const rangeStartIso = range === 'All time' ? null : rangeStart.toISOString()
  const rangeEndIso = rangeEnd?.toISOString() ?? null

  const [{ data: locations, error: locationsError }, [summary], [historyPage]] = await Promise.all([
    serverSupabase.from('pickup_locations').select('id, name').order('name'),
    sql<
      {
        picked_up: number
        pending_pickup: number
        delivered: number
        pending_delivery: number
      }[]
    >`
      select
        (
          select count(*)::int
          from order_logistics_events event
          join orders order_row on order_row.id = event.order_id
          where event.agent_profile_id = ${profile.id}
            and event.event_type = 'picked_up'
            and (${rangeStartIso}::timestamptz is null or event.created_at >= ${rangeStartIso}::timestamptz)
            and (${rangeEndIso}::timestamptz is null or event.created_at < ${rangeEndIso}::timestamptz)
            and (${locationFilter}::uuid is null or order_row.pickup_location_id = ${locationFilter}::uuid)
        ) as picked_up,
        (
          select count(*)::int
          from orders order_row
          where order_row.status = 'pending_pickup'
            and (${rangeStartIso}::timestamptz is null or order_row.created_at >= ${rangeStartIso}::timestamptz)
            and (${rangeEndIso}::timestamptz is null or order_row.created_at < ${rangeEndIso}::timestamptz)
            and (${locationFilter}::uuid is null or order_row.pickup_location_id = ${locationFilter}::uuid)
        ) as pending_pickup,
        (
          select count(*)::int
          from order_logistics_events event
          join orders order_row on order_row.id = event.order_id
          where event.agent_profile_id = ${profile.id}
            and event.event_type = 'delivered'
            and (${rangeStartIso}::timestamptz is null or event.created_at >= ${rangeStartIso}::timestamptz)
            and (${rangeEndIso}::timestamptz is null or event.created_at < ${rangeEndIso}::timestamptz)
            and (${locationFilter}::uuid is null or order_row.pickup_location_id = ${locationFilter}::uuid)
        ) as delivered,
        (
          select count(*)::int
          from orders order_row
          where order_row.status = 'out_for_delivery'
            and (${rangeStartIso}::timestamptz is null or order_row.created_at >= ${rangeStartIso}::timestamptz)
            and (${rangeEndIso}::timestamptz is null or order_row.created_at < ${rangeEndIso}::timestamptz)
            and (${locationFilter}::uuid is null or order_row.pickup_location_id = ${locationFilter}::uuid)
            and exists (select 1 from invoices invoice where invoice.order_id = order_row.id and invoice.status = 'paid')
        ) as pending_delivery
    `,
    sql<
      {
        events: Array<{
          id: string
          order_id: string
          event_type: 'picked_up' | 'delivered'
          created_at: string
          public_order_number: string
          customer_name: string
          customer_uid: string | null
          pickup_location_name: string | null
        }>
        total_count: number
        page: number
      }[]
    >`
      with filtered_events as (
        select
          event.id,
          event.order_id,
          event.event_type,
          event.created_at,
          order_row.public_order_number,
          coalesce(customer.name, 'Customer') as customer_name,
          customer.qaffy_id as customer_uid,
          location.name as pickup_location_name
        from order_logistics_events event
        join orders order_row on order_row.id = event.order_id
        left join profiles customer on customer.id = order_row.customer_id
        left join pickup_locations location on location.id = order_row.pickup_location_id
        where event.agent_profile_id = ${profile.id}
          and event.event_type = ${historyType}
          and (${rangeStartIso}::timestamptz is null or event.created_at >= ${rangeStartIso}::timestamptz)
          and (${rangeEndIso}::timestamptz is null or event.created_at < ${rangeEndIso}::timestamptz)
          and (${locationFilter}::uuid is null or order_row.pickup_location_id = ${locationFilter}::uuid)
      ),
      total as (
        select count(*)::int as total_count from filtered_events
      ),
      page_info as (
        select case
          when total.total_count = 0 then 1
          else least(${pageNumber}, ceil(total.total_count::numeric / ${logisticsHistoryPageSize})::int)
        end as page
        from total
      ),
      page_rows as (
        select *
        from filtered_events
        order by created_at desc, id desc
        offset ((select page from page_info) - 1) * ${logisticsHistoryPageSize}
        limit ${logisticsHistoryPageSize}
      )
      select
        coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc) from page_rows), '[]'::jsonb) as events,
        total.total_count,
        page_info.page
      from total, page_info
    `,
  ])
  if (locationsError) throw new Error(`Logistics locations could not be loaded: ${locationsError.message}`)
  const totalCount = Number(historyPage?.total_count ?? 0)
  return data(
    {
      summary: {
        pickedUp: Number(summary?.picked_up ?? 0),
        pendingPickup: Number(summary?.pending_pickup ?? 0),
        delivered: Number(summary?.delivered ?? 0),
        pendingDelivery: Number(summary?.pending_delivery ?? 0),
      },
      selectedLocation: locationFilter ?? 'all',
      locations: locations ?? [],
      historyEvents: historyPage?.events ?? [],
      historyPagination: {
        page: Number(historyPage?.page ?? 1),
        pageSize: logisticsHistoryPageSize,
        totalCount,
        pageCount: Math.max(1, Math.ceil(totalCount / logisticsHistoryPageSize)),
      },
      agent: agentProfile,
    },
    { headers, status: 200 },
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldRevalidate({ formData, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return formData?.get('intent') === 'search' ? false : defaultShouldRevalidate
}

export default function LogisticsLayout() {
  const loaderData = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const currentAgent = loaderData?.agent ?? { id: null, name: 'Logistics agent', email: null, qaffyId: null }

  useEffect(() => {
    const client = supabase
    if (!client) return

    const channel = client
      .channel('logistics-order-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => revalidator.revalidate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_logistics_events' }, () => revalidator.revalidate())
      .subscribe()

    let refreshVisibleState: number | null = null
    const startFallbackRefresh = () => {
      if (refreshVisibleState !== null) return
      refreshVisibleState = window.setInterval(() => revalidator.revalidate(), 30_000)
    }
    const stopFallbackRefresh = () => {
      if (refreshVisibleState === null) return
      window.clearInterval(refreshVisibleState)
      refreshVisibleState = null
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        revalidator.revalidate()
        startFallbackRefresh()
      } else {
        stopFallbackRefresh()
      }
    }

    if (document.visibilityState === 'visible') startFallbackRefresh()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopFallbackRefresh()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void client.removeChannel(channel)
    }
  }, [revalidator])
  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/logistics/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#f7f9f9] text-slate-900">
      <header className="sticky top-0 z-10 border-b border-brand-border bg-white/80 backdrop-blur-xl p-1">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex shrink-0 flex-col items-start justify-center gap-3 pt-0.5">
              <Link
                to="/logistics"
                aria-label="Go to logistics home"
                className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
              >
                <QaffyLogo className="inline-flex" />
              </Link>
              <p className="pl-0.5 text-[10px] font-semibold capitalize tracking-[0.18em] text-brand-primary">Logistics</p>
            </div>
            <div className="min-w-0 max-w-[180px] text-left sm:max-w-[260px]">
              <p className="truncate text-[11px] font-semibold text-slate-800 sm:text-sm">{currentAgent.name}</p>
              {currentAgent.email ? <p className="truncate text-[10px] text-slate-500 sm:text-[11px]">{currentAgent.email}</p> : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            aria-label="Log out"
            title="Log out"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 md:p-6">
        <Outlet context={loaderData} />
      </main>
    </div>
  )
}
