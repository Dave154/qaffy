import { useState } from 'react'
import { NavLink, Outlet, data, redirect, useLoaderData, useLocation, useNavigate } from 'react-router'
import type { Route } from './+types/VendorLayout'
import { ClipboardList, History, LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import QaffyLogo from '../../components/QaffyLogo'
import { requireRole } from '../../lib/auth.server'
import { supabase } from '../../lib/supabase.client'

// Route loaders must be exported from the layout module for React Router.
// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'vendor')
  if (!auth) throw redirect('/vendor/login')
  const { supabase, headers } = auth

  const { data: orders } = await supabase.from('orders').select('*').order('created_at', { ascending: false })
  const orderIds = (orders ?? []).map((order) => order.id)
  const customerIds = [...new Set((orders ?? []).map((order) => order.customer_id))]
  const locationIds = [...new Set((orders ?? []).map((order) => order.pickup_location_id).filter(Boolean))] as string[]

  const [{ data: profiles }, { data: locations }, { data: items }, { data: invoices }, { data: mismatches }, { data: logisticsEvents }] = await Promise.all([
    customerIds.length ? supabase.from('profiles').select('id, name, qaffy_id, email, phone').in('id', customerIds) : Promise.resolve({ data: [] }),
    locationIds.length ? supabase.from('pickup_locations').select('id, name, address').in('id', locationIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from('order_items').select('id, order_id, category_id, quantity, service, unit_price').in('order_id', orderIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from('invoices').select('id, order_id, amount, status, created_at, paid_at').in('order_id', orderIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from('mismatches').select('id, order_id, direction, detail, created_at').in('order_id', orderIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from('order_logistics_events').select('id, order_id, event_type, created_at').in('order_id', orderIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ])
  const categoryIds = [...new Set((items ?? []).map((item) => item.category_id))]
  const { data: categories } = categoryIds.length ? await supabase.from('cloth_categories').select('id, name').in('id', categoryIds) : { data: [] }

  return data({ orders: (orders ?? []).map((order) => ({
    ...order,
    customer: (profiles ?? []).find((profile) => profile.id === order.customer_id) ?? null,
    location: (locations ?? []).find((location) => location.id === order.pickup_location_id) ?? null,
    items: (items ?? []).filter((item) => item.order_id === order.id).map((item) => ({ ...item, category: (categories ?? []).find((category) => category.id === item.category_id) ?? null })),
    invoice: (invoices ?? []).find((invoice) => invoice.order_id === order.id) ?? null,
    mismatches: (mismatches ?? []).filter((mismatch) => mismatch.order_id === order.id),
    logisticsEvents: (logisticsEvents ?? []).filter((event) => event.order_id === order.id),
  })) }, { headers, status: 200 })
}

const navigation = [
  { to: '/vendor', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/vendor/orders', label: 'Orders', icon: ClipboardList },
  { to: '/vendor/clearing-history', label: 'Clearing history', icon: History },
]

export default function VendorLayout() {
  const loaderData = useLoaderData<typeof loader>()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/vendor/login', { replace: true })
  }
  const pageTitle = location.pathname === '/vendor'
    ? 'Overview'
    : navigation.find((item) => item.to !== '/vendor' && location.pathname.startsWith(item.to))?.label ?? 'Overview'

  return (
    <div className="min-h-screen bg-[#f8f8f8] text-[#121212]">
      <header className="sticky top-0 z-20 border-b border-[#f2f3f3] bg-white lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
          <QaffyLogo className="inline-flex" />
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Open vendor menu" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <div className="min-h-screen">
        <aside className={`${menuOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-30 flex w-[221px] flex-col overflow-y-auto border-r border-[#ececec] bg-white px-[13px] py-7 transition-transform lg:translate-x-0`}>
          <div className="flex items-center justify-between px-3">
            <QaffyLogo className="inline-flex" />
            <button type="button" onClick={() => setMenuOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 lg:hidden" aria-label="Close vendor menu">
              <X size={16} />
            </button>
          </div>
          <nav className="mx-auto mt-12 w-[194px] space-y-1">
            {navigation.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex h-10 items-center gap-3 rounded-[8px] px-4 text-sm font-medium transition ${isActive ? 'bg-brand-surface text-brand-strong' : 'text-[#121212] hover:bg-[#f8f8f8]'}`}>
                <span className="flex h-5 w-5 items-center justify-center rounded-[5px]"><Icon size={16} /></span>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto space-y-1">
            <button type="button" onClick={() => void handleLogout()} className="flex h-10 w-full items-center gap-3 rounded-[8px] px-4 text-sm font-medium text-[#121212] hover:bg-[#f8f8f8]">
              <LogOut size={16} />
              <span>Log out</span>
            </button>
          </div>
        </aside>

        {menuOpen && <button type="button" aria-label="Close vendor menu overlay" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-20 bg-slate-950/20 lg:hidden" />}

        <div className="min-w-0 lg:ml-[221px]">
          <header className="hidden h-[70px] items-center justify-between gap-4 border-b border-[#f2f3f3] bg-white px-7 pt-[22px] lg:sticky lg:top-0 lg:z-10 lg:flex">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
            </div>
          </header>
          <main className="mx-auto w-full max-w-300 px-4 pb-8 pt-5 sm:px-6 sm:pt-6 lg:px-7 lg:pb-10 lg:pt-5"><Outlet context={loaderData} /></main>
        </div>
      </div>
    </div>
  )
}
