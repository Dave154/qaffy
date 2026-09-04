const plans = [
  {
    name: 'Lite',
    price: '₦3,500',
    cadence: '/week',
    description: 'Great for light weekly laundry and ironing.',
    features: ['Up to 4 bags per week', 'Free pickup scheduling', 'Priority wash queue'],
    featured: false,
  },
  {
    name: 'Weekly Plus',
    price: '₦6,500',
    cadence: '/week',
    description: 'Best for regular households with steady laundry needs.',
    features: ['Up to 8 bags per week', 'Discounted ironing', 'Delivery reminders'],
    featured: true,
  },
  {
    name: 'Family Care',
    price: '₦12,000',
    cadence: '/month',
    description: 'A flexible plan for busy homes and larger loads.',
    features: ['Unlimited pickup slots', 'Priority support', 'Extra garment care'],
    featured: false,
  },
]

export default function Plans() {
  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-600">Subscription</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Plans</h2>
        </div>
        <p className="text-sm text-slate-500">Choose a plan that fits your routine</p>
      </header>

      <section className="rounded-[28px] bg-gradient-to-br from-slate-950 via-violet-950 to-violet-700 p-5 text-white shadow-lg shadow-violet-200 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">Active plan</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-3xl font-bold">Weekly Plus</h3>
            <p className="mt-2 text-sm text-violet-100">4 bags remaining • Next renewal in 3 days</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white">Renews on 12 Sep</span>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={`rounded-[28px] border p-5 shadow-sm ${
              plan.featured
                ? 'border-violet-500 bg-violet-50 shadow-violet-100'
                : 'border-slate-200 bg-white shadow-slate-100'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-violet-600">{plan.name}</p>
                <div className="mt-3 flex items-end gap-1.5">
                  <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
                  <span className="pb-1 text-sm text-slate-500">{plan.cadence}</span>
                </div>
              </div>
              {plan.featured && (
                <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                  Popular
                </span>
              )}
            </div>

            <p className="mt-4 text-sm text-slate-600">{plan.description}</p>

            <ul className="mt-5 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[11px] text-emerald-700">✓</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className={`mt-6 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                plan.featured
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-200 hover:bg-violet-500'
                  : 'border border-violet-200 bg-white text-violet-700 hover:bg-violet-50'
              }`}
            >
              {plan.featured ? 'Current plan' : 'Choose plan'}
            </button>
          </article>
        ))}
      </section>
    </div>
  )
}
