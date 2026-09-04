import { NavLink, Outlet } from 'react-router'

export default function LogisticsLayout() {
  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-500">Operations</p>
            <h1 className="text-xl font-bold text-slate-900">Qaffy Logistics</h1>
          </div>

          <div className="rounded-full border border-violet-100 bg-violet-50 p-1">
            <div className="flex gap-1">
              <NavLink
                to="/logistics"
                end
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600'}`
                }
              >
                Pickup
              </NavLink>
              <NavLink
                to="/logistics/delivery"
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600'}`
                }
              >
                Delivery
              </NavLink>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  )
}
