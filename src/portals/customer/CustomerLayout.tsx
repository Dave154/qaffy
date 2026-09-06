import { useState } from 'react'
import { data, NavLink, Outlet, redirect, useLocation, useNavigate } from 'react-router'
import type { Route } from './+types/CustomerLayout'
import { Home, LayoutGrid, ReceiptText, Sparkles, Settings, Menu, X, UserCircle2, Search, Bell, ClipboardList, LogOut } from 'lucide-react'
import QaffyLogo from '../../components/QaffyLogo'
import { isSupabaseServerConfigured, getSupabaseServerClient } from '../../lib/supabase.server'
import { supabase } from '../../lib/supabase.client'
import { CustomerStoreProvider } from './customer-store'
import { useCustomerStore } from './customer-store-hook'

const navItems = [
  { to: '/', label: 'Overview', icon: Home, end: true },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText },
  { to: '/orders', label: 'Orders', icon: LayoutGrid },
  { to: '/plans', label: 'Plans', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Route loaders must be exported from the layout module for React Router.
// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  if (!isSupabaseServerConfigured) return null

  const { supabase: serverSupabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await serverSupabase.auth.getUser()

  if (!userData.user) {
    throw redirect('/login', { headers })
  }

  return data({ user: userData.user }, { headers })
}

function PlanSummary() {
  const { balance } = useCustomerStore()

  return (
    <div className="mt-auto rounded-2xl border border-[#a7d7d2] bg-[#eef9f7] p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#418d87]">Current plan</p>
      <p className="mt-2 text-sm font-semibold text-slate-800">Weekly Plus</p>
      {balance < 0 && <p className="mt-1 text-xs text-[#d9364e]">Balance due: ₦{Math.abs(balance).toLocaleString()}</p>}
      <div className="mt-3 h-1.5 overflow-hidden bg-[#d3ebe8]">
        <div className="h-full w-3/4 bg-[#55aaa3]" />
      </div>
    </div>
  )
}

export default function CustomerLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const pageTitle = location.pathname === '/'
    ? 'Overview'
    : location.pathname.startsWith('/invoice')
      ? 'Invoice'
      : location.pathname.startsWith('/otp')
        ? 'OTP'
        : navItems.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))?.label ?? 'Overview'

  const closeMobileMenu = () => setMobileMenuOpen(false)

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <CustomerStoreProvider>
      <div className="relative min-h-screen bg-[#fafafa] text-[#121212]">
      <div className="relative z-10 min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen max-h-screen w-[221px] shrink-0 overflow-y-auto border-r border-[#f2f3f3] bg-white px-[13px] py-8 shadow-[1px_0_8px_rgba(18,18,18,0.04)] lg:flex lg:flex-col">
        <div className="px-3">
          <QaffyLogo />
        </div>

        <nav className="mx-auto mt-12 w-[194px] space-y-[3px]">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                    `flex h-10 items-center gap-3 rounded-[10px] px-4 text-sm font-medium transition ${
                    isActive ? 'bg-[#e8fbfd] text-[#00b7d4]' : 'text-[#121212] hover:bg-[#fafafa]'
                  }`
                }
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-[5px] text-[#121212]">
                  <Icon className="h-4 w-4" />
                </span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto space-y-1">
          <button type="button" onClick={handleLogout} className="flex h-10 w-full items-center gap-3 rounded-[10px] px-4 text-sm font-medium text-[#121212] hover:bg-[#fafafa]">
            <ClipboardList className="h-4 w-4" />
            <span>Activity log</span>
          </button>
          <button type="button" className="flex h-10 w-full items-center gap-3 rounded-[10px] px-4 text-sm font-medium text-[#121212] hover:bg-[#fafafa]">
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-[#f2f3f3] bg-white lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <QaffyLogo className="scale-[0.82]" />

            <button
              type="button"
              aria-label="Open profile"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600"
            >
              <UserCircle2 className="h-5 w-5" />
            </button>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" aria-label="Close navigation menu" className="absolute inset-0 bg-slate-950/35" onClick={closeMobileMenu} />

            <aside className="relative z-10 flex h-full w-[82%] max-w-sm flex-col border-r border-[#e7e7e7] bg-white px-4 py-5 shadow-xl">
              <div className="mb-6 flex items-center justify-between">
                <QaffyLogo className="scale-[0.82]" />
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={closeMobileMenu}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={closeMobileMenu}
                      className={({ isActive }) =>
                          `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition ${
                            isActive ? 'bg-[#e8fbfd] text-[#00b7d4]' : 'text-[#121212] hover:bg-[#fafafa]'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span className={`flex h-8 w-8 items-center justify-center rounded-md ${isActive ? 'text-[#00b7d4]' : 'text-[#121212]'}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </nav>

              <PlanSummary />
            </aside>
          </div>
        )}

        <div className="hidden h-[70px] items-center justify-between gap-4 px-7 pt-[22px] lg:flex">
          <h2 className="text-2xl font-bold tracking-tight text-[#121212]">{pageTitle}</h2>
          <div className="flex items-center gap-4">
          <div className="flex h-12 w-[288px] items-center gap-2 rounded-full border border-[#f2f3f3] bg-white px-4 text-sm text-[#505959]">
            <Search className="h-3.5 w-3.5 text-[#8e9a9a]" />
            <span>Search</span>
          </div>
          <button type="button" aria-label="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#f2f3f3] bg-white text-[#121212]">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-1 h-2 w-2 rounded-full border-2 border-white bg-[#f59e0b]" />
          </button>
          </div>
        </div>
        <main className="mx-auto w-full max-w-300 px-4 pb-8 pt-5 sm:px-6 sm:pt-6 lg:pb-10 lg:pt-5">
          <Outlet />
        </main>
      </div>
      </div>
      </div>
    </CustomerStoreProvider>
  )
}
