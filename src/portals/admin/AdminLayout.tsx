import { data, NavLink, Outlet, useLoaderData, useNavigate } from 'react-router'
import type { Route } from './+types/AdminLayout'
import { requireRole } from '../../lib/auth.server'
import { supabase } from '../../lib/supabase.client'

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  return data({ profile: auth?.profile ?? null }, { headers: auth?.headers, status: 200 })
}

const navItems = [
  { to: '/', label: 'Overview', end: true },
  { to: '/categories', label: 'Categories' },
  { to: '/vendors', label: 'Vendors' },
  { to: '/orders', label: 'Orders' },
  { to: '/settings', label: 'Settings' },
  { to: '/users', label: 'Users' },
  { to: '/plans', label: 'Plans' },
]

export default function AdminLayout() {
  useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/admin/login', { replace: true })
  }
  return (
    <div className="flex min-h-screen bg-transparent text-slate-900">
      <aside className="hidden w-64 shrink-0 border-r border-violet-100 bg-white/80 p-5 backdrop-blur-xl md:block">
        <div className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-500">Admin</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Qaffy</h1>
        </div>

        <nav className="space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-violet-600 text-white shadow-md shadow-violet-200' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={() => void handleLogout()} className="mt-8 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-violet-50 hover:text-violet-700">Log out</button>
      </aside>

      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
