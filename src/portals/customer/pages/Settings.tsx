const quickStats = [
  { label: 'Phone', value: '+234 801 234 5678', helper: 'Primary number' },
  { label: 'Referral code', value: 'QFY-AISHA', helper: 'Share to earn' },
  { label: 'Plan status', value: 'Active', helper: 'Weekly Plus' },
  { label: 'Next renewal', value: '12 Sep', helper: 'Auto-renews' },
]

const recentPayments = [
  { title: 'Weekly Plus', date: '04 Sep 2026', amount: '₦6,500', status: 'Paid' },
  { title: 'Extra bags', date: '28 Aug 2026', amount: '₦1,800', status: 'Paid' },
  { title: 'Pickup fee', date: '22 Aug 2026', amount: '₦600', status: 'Pending' },
]

export default function Settings() {
  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Settings</h2>
        </div>
        <p className="text-sm text-slate-500">Manage your profile and billing</p>
      </header>

      <section className="rounded-[28px] bg-gradient-to-br from-violet-600 via-violet-700 to-fuchsia-500 p-5 text-white shadow-lg shadow-violet-200 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-100">Profile</p>
            <h3 className="mt-3 text-3xl font-bold">Aisha Bello</h3>
            <p className="mt-2 text-sm text-violet-100">aisha@qaffy.app • QF-2048</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl backdrop-blur-sm">A</div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quickStats.map((stat) => (
          <div key={stat.label} className="rounded-[22px] border border-violet-100 bg-white p-4 shadow-sm shadow-violet-50">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{stat.label}</p>
            <p className="mt-3 text-lg font-bold text-slate-900">{stat.value}</p>
            <p className="mt-1 text-sm text-slate-500">{stat.helper}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Profile details</h3>
              <p className="mt-1 text-sm text-slate-500">Keep your account info current</p>
            </div>
            <button type="button" className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700">Edit</button>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Full name</span>
              <input
                defaultValue="Aisha Bello"
                readOnly
                aria-readonly="true"
                className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 text-base text-slate-500 focus:border-slate-200 focus:ring-0"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Phone number</span>
              <input
                defaultValue="+234 801 234 5678"
                className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Email address</span>
              <input
                defaultValue="aisha@qaffy.app"
                readOnly
                aria-readonly="true"
                className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 text-base text-slate-500 focus:border-slate-200 focus:ring-0"
              />
            </label>
          </div>
        </div>

        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <h3 className="text-lg font-bold text-slate-900">Billing & rewards</h3>

          <div className="mt-4 space-y-3">
            <button type="button" className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700">
              <span>Payment method</span>
              <span>Visa •••• 2094</span>
            </button>

            <button type="button" className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700">
              <span>Referral program</span>
              <span>Earn 10%</span>
            </button>

            <button type="button" className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700">
              <span>Notifications</span>
              <span>Enabled</span>
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Recent payments</h3>
            <p className="mt-1 text-sm text-slate-500">Your latest plan and service payments</p>
          </div>
          <button type="button" className="text-sm font-medium text-violet-600">View all</button>
        </div>

        <div className="space-y-3">
          {recentPayments.map((payment) => (
            <div key={`${payment.title}-${payment.date}`} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="font-semibold text-slate-900">{payment.title}</p>
                <p className="mt-1 text-xs text-slate-500">{payment.date}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-900">{payment.amount}</p>
                <p className={`mt-1 text-[11px] font-medium ${payment.status === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {payment.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
