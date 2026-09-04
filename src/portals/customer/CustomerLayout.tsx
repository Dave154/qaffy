import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Home, LayoutGrid, ReceiptText, Sparkles, Settings, Menu, X, UserCircle2 } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText },
  { to: '/orders', label: 'Orders', icon: LayoutGrid },
  { to: '/plans', label: 'Plans', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function CustomerLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <div className="min-h-screen bg-transparent text-slate-900 lg:flex">
      <aside className="hidden min-h-screen w-64 shrink-0 border-r border-sky-100 bg-white/80 px-5 py-6 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="mb-10 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Qaffy</h1>
            <p className="mt-1 text-sm text-slate-500">Your personal laundry space</p>
          </div>
          <button
            type="button"
            aria-label="Profile"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-100 bg-sky-50 text-sky-700 shadow-sm"
          >
            <UserCircle2 className="h-5 w-5" />
          </button>
        </div>

        <nav className="rounded-[26px] border border-slate-100 bg-slate-50/80 p-2">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                    isActive ? 'bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-100' : 'text-slate-500 hover:bg-white hover:text-sky-700'
                  }`
                }
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100/80 text-sky-700">
                  <Icon className="h-4 w-4" />
                </span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto rounded-2xl bg-slate-900 p-4 text-white">
          <p className="text-xs font-medium text-sky-200">Weekly Plus</p>
          <p className="mt-2 text-sm font-semibold">4 bags remaining</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full w-3/4 rounded-full bg-sky-400" />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-sky-100 bg-white/80 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-100 bg-sky-50 text-sky-700 shadow-sm"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Qaffy</h1>
            </div>

            <button
              type="button"
              aria-label="Open profile"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-100 bg-sky-50 text-sky-700 shadow-sm"
            >
              <UserCircle2 className="h-5 w-5" />
            </button>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" aria-label="Close navigation menu" className="absolute inset-0 bg-slate-950/35" onClick={closeMobileMenu} />

            <aside className="relative z-10 flex h-full w-[82%] max-w-sm flex-col border-r border-sky-100 bg-white px-4 py-5 shadow-2xl">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Qaffy</h2>
                </div>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={closeMobileMenu}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="space-y-2">
                {navItems.map((item) => {
                  const Icon = item.icon

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={closeMobileMenu}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                          isActive ? 'bg-slate-900 text-white shadow-md shadow-slate-200' : 'text-slate-600 hover:bg-sky-50 hover:text-sky-700'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${isActive ? 'bg-white/10 text-white' : 'bg-sky-100 text-sky-700'}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </nav>

              <div className="mt-auto rounded-2xl bg-slate-900 p-4 text-white">
                <p className="text-xs font-medium text-sky-200">Weekly Plus</p>
                <p className="mt-2 text-sm font-semibold">4 bags remaining</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full w-3/4 rounded-full bg-sky-400" />
                </div>
              </div>
            </aside>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
