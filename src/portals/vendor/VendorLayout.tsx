import { Outlet } from 'react-router'

export default function VendorLayout() {
  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <header className="sticky top-0 z-10 border-b border-violet-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-500">Vendor portal</p>
            <h1 className="text-xl font-bold text-slate-900">Qaffy Vendor</h1>
          </div>
          <button
            type="button"
            className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm"
          >
            Today
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  )
}
