const invoiceItems = [
  { label: 'Wash + Iron', quantity: '6 clothes', amount: '₦4,800' },
  { label: 'Pickup fee', quantity: 'Standard', amount: '₦600' },
  { label: 'Express handling', quantity: 'Priority', amount: '₦1,200' },
]

const paymentBreakdown = [
  { label: 'Subtotal', value: '₦4,800' },
  { label: 'Pickup', value: '₦600' },
  { label: 'Handling', value: '₦1,200' },
  { label: 'Discount', value: '-₦600' },
]

export default function Invoice() {
  const total = '₦6,000'

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-600">Billing</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Invoice</h2>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700">Awaiting payment</span>
      </header>

      <section className="rounded-[28px] bg-gradient-to-br from-slate-950 via-violet-950 to-violet-700 p-5 text-white shadow-lg shadow-violet-200 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">Order reference</p>
            <h3 className="mt-3 text-3xl font-bold">QF-1042</h3>
            <p className="mt-2 text-sm text-violet-100">Pickup scheduled for Friday • 8:00 AM</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-medium text-violet-50">Due today</div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Laundry summary</h3>
              <p className="mt-1 text-sm text-slate-500">This invoice reflects your active bag count</p>
            </div>
            <button type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">Download</button>
          </div>

          <div className="mt-5 space-y-3">
            {invoiceItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                <div>
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.quantity}</p>
                </div>
                <p className="font-semibold text-slate-900">{item.amount}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <h3 className="text-lg font-bold text-slate-900">Payment breakdown</h3>

          <div className="mt-4 space-y-3">
            {paymentBreakdown.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm text-slate-600">
                <span>{item.label}</span>
                <span className="font-semibold text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Total due</span>
              <span className="text-2xl font-bold text-slate-900">{total}</span>
            </div>
          </div>

          <button
            type="button"
            className="mt-6 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-200 transition hover:bg-violet-500"
          >
            Pay now
          </button>

          <button
            type="button"
            className="mt-3 w-full rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            Continue to delivery OTP
          </button>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <h3 className="text-lg font-bold text-slate-900">Pickup instructions</h3>
        <p className="mt-3 text-sm text-slate-600">
          Please drop off the bag at the nearest pickup point. Keep whites separate and note any silk items before handover.
        </p>
      </section>
    </div>
  )
}
