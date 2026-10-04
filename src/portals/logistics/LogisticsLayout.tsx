import { Outlet, data, useLoaderData, useNavigate, useRevalidator } from 'react-router'
import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import type { Route } from './+types/LogisticsLayout'
import QaffyLogo from '../../components/QaffyLogo'
import { requireRole } from '../../lib/auth.server'
import { supabase } from '../../lib/supabase.client'

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'logistics')
  if (!auth) {
    return data(
      { orders: [], logisticsEvents: [], agent: { id: null, name: 'Logistics agent', email: null, qaffyId: null } },
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

  const { data: agentEvents } = await serverSupabase
    .from('order_logistics_events')
    .select('*')
    .eq('agent_profile_id', profile.id)
    .order('created_at', { ascending: false })

  const relevantStatuses = ['pending_pickup', 'out_for_delivery', 'picked_up', 'delivered'] as const
  const { data: ordersData } = await serverSupabase
    .from('orders')
    .select('*')
    .in('status', relevantStatuses)
    .order('created_at', { ascending: false })

  const logisticsEvents = agentEvents ?? []

  const customerIds = [...new Set((ordersData ?? []).map((order) => order.customer_id).filter(Boolean))]
  const profileMap = new Map<string, { name: string | null; uid: string | null }>()

  if (customerIds.length > 0) {
    const { data: profiles } = await serverSupabase.from('profiles').select('id, name, qaffy_id').in('id', customerIds)

    for (const profile of profiles ?? []) {
      if (profile.id) {
        profileMap.set(profile.id, { name: profile.name, uid: profile.qaffy_id })
      }
    }
  }

  const locationIds = [
    ...new Set(
      (ordersData ?? []).map((order) => order.pickup_location_id).filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ]
  const locationMap = new Map<string, string>()

  if (locationIds.length > 0) {
    const { data: locations } = await serverSupabase.from('pickup_locations').select('id, name').in('id', locationIds)

    for (const location of locations ?? []) {
      if (location.id && location.name) {
        locationMap.set(location.id, location.name)
      }
    }
  }

  const expandedOrders = (ordersData ?? []).map((order) => ({
    ...order,
    customer_name: profileMap.get(order.customer_id)?.name ?? 'Customer',
    customer_uid: profileMap.get(order.customer_id)?.uid ?? null,
    pickup_location_name: order.pickup_location_id ? (locationMap.get(order.pickup_location_id) ?? null) : null,
  }))

  return data({ orders: expandedOrders, logisticsEvents, agent: agentProfile }, { headers, status: 200 })
}

export default function LogisticsLayout() {
  const loaderData = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const [activeTab, setActiveTab] = useState<'pickup' | 'delivery'>('pickup')
  const currentAgent = loaderData?.agent ?? { id: null, name: 'Logistics agent', email: null, qaffyId: null }

  useEffect(() => {
    const client = supabase
    if (!client) return

    const channel = client
      .channel('logistics-order-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => revalidator.revalidate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_logistics_events' }, () => revalidator.revalidate())
      .subscribe()

    const refreshVisibleState = window.setInterval(() => {
      if (document.visibilityState === 'visible') revalidator.revalidate()
    }, 5000)

    return () => {
      window.clearInterval(refreshVisibleState)
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
              <QaffyLogo className="inline-flex" />
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
        <Outlet context={{ ...loaderData, activeTab, setActiveTab }} />
      </main>
    </div>
  )
}
