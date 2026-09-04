const metrics = [
  { label: 'Total orders', value: '1,284' },
  { label: 'Revenue', value: '₦2.6M' },
  { label: 'Customers', value: '842' },
  { label: 'Vendors', value: '36' },
]

export default function Home() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Plan performance</h2>
          <button type="button" className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white">
            New plan
          </button>
        </div>

        <div className="space-y-3">
          {['Weekly plan', 'Monthly plan', 'Semester plan'].map((plan) => (
            <div key={plan} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="font-semibold text-slate-900">{plan}</p>
                <p className="text-sm text-slate-500">320 active users</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Active</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
