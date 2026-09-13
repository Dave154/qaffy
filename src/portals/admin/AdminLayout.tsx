import { AlertTriangle, Bell, Boxes, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, LayoutDashboard, LogOut, MapPin, Settings, ShieldCheck, Search, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { data, NavLink, Outlet, useLoaderData, useLocation, useNavigate } from 'react-router'
import type { Route } from './+types/AdminLayout'
import QaffyLogo from '../../components/QaffyLogo'
import { requireRole } from '../../lib/auth.server'
import { supabase } from '../../lib/supabase.client'

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  return data({ profile: auth?.profile ?? null }, { headers: auth?.headers, status: 200 })
}

const navItems = [
  { to: '/admin', label: 'Overview', end: true, icon: LayoutDashboard },
  { to: '/admin/mismatches', label: 'Mismatches', icon: AlertTriangle },
  { to: '/admin/partners', label: 'Partners', icon: ShieldCheck, children: [{ to: '/admin/partners/vendors', label: 'Vendors' }, { to: '/admin/partners/logistics', label: 'Logistics' }] },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/settings', label: 'Settings', icon: Settings, children: [{ to: '/admin/categories', label: 'Categories', icon: Boxes }, { to: '/admin/pickup-locations', label: 'Pickup locations', icon: MapPin }] },
  { to: '/admin/users', label: 'Users', icon: UsersRound },
  { to: '/admin/plans', label: 'Plans', icon: CircleDollarSign },
]

export default function AdminLayout() {
  useLoaderData<typeof loader>()
  const location = useLocation()
  const navigate = useNavigate()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openNav, setOpenNav] = useState<string | null>(location.pathname.startsWith('/admin/partners') ? 'Partners' : location.pathname.startsWith('/admin/categories') || location.pathname.startsWith('/admin/pickup-locations') ? 'Settings' : null)
  const pageTitle = location.pathname === '/admin'
    ? 'Overview'
    : location.pathname.includes('/orders')
      ? 'Orders'
      : location.pathname.includes('/logistics')
        ? 'Logistics'
        : location.pathname.includes('/vendors')
          ? 'Vendors'
          : location.pathname.includes('/categories')
            ? 'Categories'
              : location.pathname.includes('/pickup-locations')
                ? 'Pickup locations'
                : location.pathname.includes('/mismatches')
                  ? 'Mismatches'
                  : location.pathname.includes('/users')
                    ? 'Users'
                    : location.pathname.includes('/plans')
                      ? 'Plans'
                      : location.pathname.includes('/settings')
                        ? 'Settings'
                        : 'Admin'
  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/admin/login', { replace: true })
  }
  return (
    <div className="flex min-h-screen bg-[#fafafa] text-slate-900">
      <aside className={`fixed left-0 top-0 z-30 hidden h-screen max-h-screen shrink-0 self-start flex-col overflow-visible border-r border-[#f2f3f3] bg-white py-7 transition-[width] duration-300 md:flex ${isCollapsed ? 'w-[76px] px-3' : 'w-[221px] px-[13px]'}`}>
        <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={`mb-8 ${isCollapsed ? 'text-center' : ''}`}>
          {isCollapsed ? <span className="mt-2 block text-3xl leading-[33px] text-brand-primary" style={{ fontFamily: 'Pacifico, cursive' }}>Q</span> : <QaffyLogo className="mt-2 origin-left px-3 scale-[0.78]" />}
          <p className={`mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-primary ${isCollapsed ? 'sr-only' : 'px-3'}`}>Admin</p>
        </div>

        <nav className={`mx-auto space-y-[13px] ${isCollapsed ? 'w-full' : 'w-[194px]'}`}>
          {navItems.map((item) => <div key={item.to} className="space-y-1">
            {item.children ? <button type="button" onClick={() => setOpenNav((open) => open === item.label ? null : item.label)} aria-expanded={openNav === item.label} className={`group relative flex h-10 w-full items-center rounded-[10px] text-sm font-medium transition ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} ${((item.label === 'Partners' && location.pathname.startsWith('/admin/partners')) || (item.label === 'Settings' && (location.pathname.startsWith('/admin/settings') || location.pathname.startsWith('/admin/categories') || location.pathname.startsWith('/admin/pickup-locations'))) ? 'bg-brand-soft text-brand-primary' : 'text-[#121212] hover:bg-brand-soft hover:text-brand-primary')}`}>
              <item.icon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span className={isCollapsed ? 'sr-only' : ''}>{item.label}</span>
              {!isCollapsed && <ChevronDown size={15} aria-hidden="true" className={`ml-auto transition-transform duration-300 ${openNav === item.label ? 'rotate-180' : ''}`} />}
              {isCollapsed && <span role="tooltip" className="pointer-events-none absolute left-[calc(100%+12px)] z-20 hidden whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block">{item.label}</span>}
            </button> : <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) => `group relative flex h-10 items-center rounded-[10px] text-sm font-medium transition ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} ${isActive ? 'bg-brand-soft text-brand-primary' : 'text-[#121212] hover:bg-brand-soft hover:text-brand-primary'}`}
            >
              <item.icon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span className={isCollapsed ? 'sr-only' : ''}>{item.label}</span>
              {isCollapsed && <span role="tooltip" className="pointer-events-none absolute left-[calc(100%+12px)] z-20 hidden whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block">{item.label}</span>}
            </NavLink>}
            {item.children && !isCollapsed && <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${openNav === item.label ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'}`}><div className="relative min-h-0 overflow-hidden pl-9"><svg aria-hidden="true" viewBox="0 0 24 76" preserveAspectRatio="none" className="absolute left-5 top-0 h-full w-5 overflow-visible text-brand-primary"><path d="M3 0V29H17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="transition-[stroke-dashoffset] duration-300" style={{ strokeDasharray: 46, strokeDashoffset: openNav === item.label ? 0 : 46 }} /><path d="M3 0V53H17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="transition-[stroke-dashoffset] duration-300" style={{ strokeDasharray: 70, strokeDashoffset: openNav === item.label ? 0 : 70 }} /><path d="m13 25 4 4-4 4M13 49l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity duration-300 ${openNav === item.label ? 'opacity-100' : 'opacity-0'}`} /></svg><div className="space-y-1 pl-6">{item.children.map((child) => <NavLink key={child.to} to={child.to} className={({ isActive }) => `block rounded-md px-3 py-2 text-xs font-medium transition ${isActive ? 'bg-brand-soft text-brand-primary' : 'text-slate-500 hover:bg-brand-soft hover:text-brand-primary'}`}>{child.label}</NavLink>)}</div></div></div>}
          </div>)}
        </nav>
          <button type="button" onClick={() => void handleLogout()} aria-label="Log out" className={`group relative mt-auto flex h-10 w-full items-center rounded-[10px] text-left text-sm font-medium text-[#121212] hover:bg-brand-soft hover:text-brand-primary ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}>
            <LogOut size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className={isCollapsed ? 'sr-only' : ''}>Log out</span>
            {isCollapsed && <span role="tooltip" className="pointer-events-none absolute left-[calc(100%+12px)] z-20 hidden whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block">Log out</span>}
          </button>
        </div>
          <button type="button" onClick={() => setIsCollapsed((collapsed) => !collapsed)} aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="absolute -right-3 top-7 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-[#f0eeee] bg-white text-slate-400 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition hover:text-brand-primary">
            {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
      </aside>

      <main className={`min-h-screen min-w-0 flex-1 px-4 pb-10 pt-5 transition-[margin] duration-300 md:px-7 md:pt-[22px] ${isCollapsed ? 'md:ml-[76px]' : 'md:ml-[221px]'}`}>
        <div className="mx-auto max-w-[1180px]">
          <div className="sticky top-0 z-20 -mx-4 mb-6 flex h-12 items-center justify-between gap-4 bg-[#fafafa] px-4 py-1 md:-mx-7 md:px-7">
            <h2 className="text-[28px] font-semibold leading-[34px] tracking-tight text-[#121212]">{pageTitle}</h2>
            <div className="ml-auto flex h-12 w-full max-w-[310px] items-center gap-2 rounded-full border border-[#f2f3f3] bg-white px-4 text-sm text-[#8e9a9a] shadow-[0_2px_8px_rgba(0,0,0,0.02)]"><Search size={14} /> Search</div>
            <button type="button" aria-label="Notifications" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#f2f3f3] bg-white text-[#121212]"><Bell size={16} /></button>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
