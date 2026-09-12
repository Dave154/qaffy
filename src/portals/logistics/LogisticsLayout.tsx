import { NavLink, Outlet, data, useLoaderData, useNavigate } from 'react-router'
import type { Route } from './+types/LogisticsLayout'
import QaffyLogo from '../../components/QaffyLogo'
import { requireRole } from '../../lib/auth.server'
import { supabase } from '../../lib/supabase.client'

// Route loaders must be exported from the layout module for React Router.
// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'logistics')
  if (!auth) {
    return data({ orders: [] }, { status: 200 })
  }
  const { supabase: serverSupabase, headers } = auth
  const { data: orders } = await serverSupabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
  const { data: logisticsEvents } = await serverSupabase
    .from('order_logistics_events')
    .select('*')
    .order('created_at', { ascending: false })

  const customerIds = [...new Set((orders ?? []).map((order) => order.customer_id).filter(Boolean))]
  const profileMap = new Map<string, { name: string | null; uid: string | null }>()

  if (customerIds.length > 0) {
    const { data: profiles } = await serverSupabase
      .from('profiles')
      .select('id, name, qaffy_id')
      .in('id', customerIds)

    for (const profile of profiles ?? []) {
      if (profile.id) {
        profileMap.set(profile.id, { name: profile.name, uid: profile.qaffy_id })
      }
    }
  }

  const expandedOrders = (orders ?? []).map((order) => ({
    ...order,
    customer_name: profileMap.get(order.customer_id)?.name ?? 'Customer',
    customer_uid: profileMap.get(order.customer_id)?.uid ?? null,
  }))

  return data({ orders: expandedOrders, logisticsEvents: logisticsEvents ?? [] }, { headers, status: 200 })
}

export default function LogisticsLayout() {
  const loaderData = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/logistics/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#f7f9f9] text-slate-900">
      <header className="sticky top-0 z-10 border-b border-brand-border bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <QaffyLogo className="inline-flex" />
            <h1 className="text-xl font-bold text-slate-900">Logistics</h1>
          </div>

          <div className="rounded-full border border-brand-border bg-brand-soft p-1 shadow-sm">
            <div className="flex gap-1">
              <NavLink
                to="/logistics"
                end
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-brand-primary text-white shadow-sm' : 'text-slate-600 hover:text-brand-primary'}`
                }
              >
                Pickup
              </NavLink>
              <NavLink
                to="/logistics/delivery"
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-brand-primary text-white shadow-sm' : 'text-slate-600 hover:text-brand-primary'}`
                }
              >
                Delivery
              </NavLink>
            </div>
          </div>
          <button type="button" onClick={() => void handleLogout()} className="text-sm font-semibold text-slate-600 hover:text-brand-primary">Log out</button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 md:p-6">
        <Outlet context={loaderData} />
      </main>
    </div>
  )
}
