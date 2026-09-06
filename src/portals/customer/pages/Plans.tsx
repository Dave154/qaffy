import { useState } from 'react'
import { Check, ChevronRight, Clock3, Sparkles } from 'lucide-react'

type BillingPeriod = 'monthly' | 'semester'

type CustomerPlan = {
  id: string
  name: string
  billingPeriod: BillingPeriod
  price: number
  currency: 'NGN'
  weeklyLimit: number
  service: string
  description: string
  benefits: string[]
  featured: boolean
}

const plans: CustomerPlan[] = [
  {
    id: 'lite-monthly',
    name: 'Lite',
    billingPeriod: 'monthly',
    price: 18000,
    currency: 'NGN',
    weeklyLimit: 20,
    service: 'Wash only',
    description: 'A simple monthly plan for lighter laundry routines.',
    benefits: ['Professional cleaning', 'Scheduled pickup', 'Quick turnaround'],
    featured: false,
  },
  {
    id: 'silver-monthly',
    name: 'Silver',
    billingPeriod: 'monthly',
    price: 27000,
    currency: 'NGN',
    weeklyLimit: 20,
    service: 'Wash + Iron',
    description: 'More care for households with a steady weekly load.',
    benefits: ['Professional cleaning', 'Scheduled pickup', 'Priority wash queue'],
    featured: true,
  },
  {
    id: 'gold-monthly',
    name: 'Gold',
    billingPeriod: 'monthly',
    price: 33000,
    currency: 'NGN',
    weeklyLimit: 25,
    service: 'Wash + Iron',
    description: 'Extra weekly capacity for larger laundry routines.',
    benefits: ['Professional cleaning', 'Priority pickup', 'Extra garment care'],
    featured: false,
  },
  {
    id: 'lite-semester',
    name: 'Lite',
    billingPeriod: 'semester',
    price: 100000,
    currency: 'NGN',
    weeklyLimit: 20,
    service: 'Wash only',
    description: 'A semester plan for lighter weekly laundry.',
    benefits: ['Professional cleaning', 'Scheduled pickup', 'Quick turnaround'],
    featured: false,
  },
  {
    id: 'silver-semester',
    name: 'Silver',
    billingPeriod: 'semester',
    price: 150000,
    currency: 'NGN',
    weeklyLimit: 20,
    service: 'Wash + Iron',
    description: 'Consistent care for households throughout the semester.',
    benefits: ['Professional cleaning', 'Scheduled pickup', 'Priority wash queue'],
    featured: true,
  },
  {
    id: 'gold-semester',
    name: 'Gold',
    billingPeriod: 'semester',
    price: 185000,
    currency: 'NGN',
    weeklyLimit: 25,
    service: 'Wash + Iron',
    description: 'The highest weekly limit for larger households.',
    benefits: ['Professional cleaning', 'Priority pickup', 'Extra garment care'],
    featured: false,
  },
]

const currentPlanId = 'silver-semester'

function formatPrice(price: number) {
  return `₦${price.toLocaleString()}`
}

export default function Plans() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('semester')
  const visiblePlans = plans.filter((plan) => plan.billingPeriod === billingPeriod)
  const currentPlan = plans.find((plan) => plan.id === currentPlanId)

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Plans</h2>
        <p className="text-sm text-slate-500">Choose a plan that fits your routine</p>
      </header>

      {currentPlan && <section className="rounded-2xl border border-[#a7d7d2] bg-[#eef9f7] p-5 text-slate-900 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#418d87]">Current plan</p>
            <div className="mt-3 flex items-center gap-2"><h3 className="text-2xl font-bold">{currentPlan.name}</h3><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-[#418d87]">{currentPlan.billingPeriod}</span></div>
            <p className="mt-2 text-sm text-slate-600">{currentPlan.service} · {currentPlan.weeklyLimit} clothes per week</p>
          </div>
          <div className="text-left sm:text-right"><p className="text-sm font-semibold text-slate-900">Renews on 12 Sep</p><p className="mt-1 text-xs text-slate-500">4 clothes remaining this week</p></div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#d3ebe8]"><div className="h-full w-4/5 rounded-full bg-[#55aaa3]" /></div>
      </section>}

      <section className="flex flex-col gap-4 border-b border-[#e7e7e7] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-lg font-bold text-[#121212]">Available plans</h3><p className="mt-1 text-sm text-slate-500">Plans are grouped by their billing period.</p></div>
        <div className="flex rounded-2xl border border-[#e7e7e7] bg-white p-1" role="tablist" aria-label="Plan billing period">
          {(['monthly', 'semester'] as BillingPeriod[]).map((period) => <button key={period} type="button" role="tab" aria-selected={billingPeriod === period} onClick={() => setBillingPeriod(period)} className={`rounded-2xl px-4 py-2 text-sm font-semibold capitalize transition ${billingPeriod === period ? 'bg-[#e8fbfd] text-[#00b7d4]' : 'text-slate-500 hover:text-slate-900'}`}>{period}</button>)}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {visiblePlans.map((plan) => {
          const isCurrent = plan.id === currentPlanId
          return <article key={plan.id} className={`relative flex flex-col rounded-2xl border p-5 shadow-sm ${plan.featured ? 'border-[#00b7d4] bg-[#f0fcfd]' : 'border-[#e7e7e7] bg-white'}`}>
            {plan.featured && <span className="absolute right-5 top-5 rounded-full bg-[#00b7d4] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">Popular</span>}
            <div className="pr-16"><p className="text-sm font-semibold text-[#00b7d4]">{plan.name}</p><div className="mt-3 flex items-baseline gap-1.5"><span className="text-3xl font-bold text-[#121212]">{formatPrice(plan.price)}</span><span className="text-sm text-slate-500">/{plan.billingPeriod}</span></div></div>
            <p className="mt-4 min-h-10 text-sm leading-5 text-slate-600">{plan.description}</p>
            <div className="mt-5 grid gap-2 border-y border-[#eeeeee] py-4 text-sm"><div className="flex items-center justify-between"><span className="text-slate-500">Weekly limit</span><span className="font-semibold text-slate-900">{plan.weeklyLimit} clothes</span></div><div className="flex items-center justify-between"><span className="text-slate-500">Service</span><span className="font-semibold text-slate-900">{plan.service}</span></div></div>
            <ul className="mt-5 flex-1 space-y-3">{plan.benefits.map((benefit) => <li key={benefit} className="flex items-start gap-2 text-sm text-slate-700"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#d8f3e9] text-[#418d87]"><Check className="h-3 w-3" /></span><span>{benefit}</span></li>)}</ul>
            <button type="button" disabled={isCurrent} className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${isCurrent ? 'cursor-default bg-[#eef9f7] text-[#418d87]' : plan.featured ? 'bg-[#00b7d4] text-white hover:bg-[#007f99]' : 'border border-[#a8eaf0] bg-white text-[#00b7d4] hover:bg-[#e8fbfd]'}`}>{isCurrent ? <>Current plan <Check className="h-4 w-4" /></> : <>Choose plan <ChevronRight className="h-4 w-4" /></>}</button>
          </article>
        })}
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-[#e7e7e7] bg-white p-4 text-sm text-slate-600"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#418d87]" /><p>Pay ahead for your next plan and it will begin after your current plan ends. Clothes above the weekly limit are billed separately.</p><Sparkles className="ml-auto mt-0.5 hidden h-4 w-4 shrink-0 text-[#00b7d4] sm:block" /></section>
    </div>
  )
}
