const itemRates = [
  { name: 'Shirt', rate: '₦140' },
  { name: 'Trouser', rate: '₦220' },
  { name: 'Dress', rate: '₦320' },
  { name: 'Jacket', rate: '₦400' },
]

export default function Home() {
  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-gradient-to-br from-violet-100 via-white to-fuchsia-50 p-5 shadow-sm shadow-violet-100">
        <p className="text-xs uppercase tracking-[0.18em] text-violet-600">Amount due today</p>
        <h2 className="mt-3 text-4xl font-bold text-slate-900">₦18,640</h2>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Received items</h2>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">Check mismatch</span>
        </div>

        <div className="space-y-3">
          {itemRates.map((item) => (
            <div key={item.name} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">Rate: {item.rate}</p>
              </div>
              <input
                type="number"
                defaultValue={0}
                className="w-20 rounded-xl border border-slate-200 bg-white px-2 py-2 text-right text-base font-medium text-slate-900"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 p-3">
          <p className="font-semibold text-amber-800">Mismatch notice</p>
          <p className="mt-1 text-sm text-amber-700">Customer reported 1 red shirt and 2 polos. Verify and add notes for any variance.</p>
        </div>

        <button type="button" className="mt-4 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-200">
          Submit pickup summary
        </button>
      </section>
    </div>
  )
}
