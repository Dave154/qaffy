import { useEffect, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { data, useFetcher, useLoaderData, useLocation, useRevalidator } from 'react-router'
import type { Route } from './+types/Plans'
import PlanEndingBanner from '../../../components/PlanEndingBanner'
import { useCustomerStore } from '../customer-store-hook'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { toast } from '../../../lib/toast'
import type { Plan } from '../../../types/database.types'

type BillingPeriod = 'monthly' | 'semester'

type CustomerPlan = {
  id: string
  name: string
  billingPeriod: BillingPeriod
  price: number
  currency: '₦'
  weeklyLimit: number
  service: string
  description: string
  featured: boolean
}

type PlansData = { plans: CustomerPlan[] }

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  if (!isSupabaseServerConfigured) return data<PlansData>({ plans: [] }, { status: 200 })
  const { supabase, headers } = getSupabaseServerClient(request)
  const { data: rows, error } = await supabase
    .from('plans')
    .select('id, name, type, price, weekly_limit, active')
    .eq('active', true)
    .order('price')
  if (error) return data<PlansData>({ plans: [] }, { headers, status: 200 })
  return data<PlansData>({
    plans: (rows ?? []).map((plan, index) => ({
      id: plan.id,
      name: plan.name,
      billingPeriod: plan.type,
      price: Number(plan.price),
      currency: '₦',
      weeklyLimit: plan.weekly_limit,
      service: 'Laundry care',
      description: `${plan.weekly_limit} clothes per week on a ${plan.type} plan.`,
      featured: index === 1,
    })),
  }, { headers, status: 200 })
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })

  const { supabase: serverSupabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await serverSupabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in first.' }, { status: 401, headers })

  const formData = await request.formData()
  const { data: planRows, error: planError } = await serverSupabase
    .from('plans')
    .select('*')
    .eq('id', String(formData.get('planId') ?? ''))
    .eq('active', true)
    .limit(1)

  if (planError || !planRows?.[0]) return data({ ok: false, message: 'This plan is not configured in the database.' }, { status: 400, headers })
  const plan = planRows[0] as Plan

  const { data: existingSubscription, error: existingError } = await serverSupabase
    .from('subscriptions')
    .select('id, end_date')
    .eq('customer_id', userData.user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (existingError) return data({ ok: false, message: 'Could not check your current subscription.' }, { status: 500, headers })
  if (existingSubscription && (!existingSubscription.end_date || existingSubscription.end_date >= new Date().toISOString().slice(0, 10))) {
    return data({ ok: false, message: 'You already have an active subscription.' }, { status: 409, headers })
  }

  const amount = Number(plan.price)
  const reference = `subscription_${crypto.randomUUID()}`
  const { error: paymentError } = await serverSupabase.from('payments').insert({ customer_id: userData.user.id, provider: 'paystack', reference, amount, balance_type: 'subscription', plan_id: plan.id, status: 'pending' })
  if (paymentError) return data({ ok: false, message: 'The subscription payment could not be recorded.' }, { status: 500, headers })

  const secretKey = process.env.PAYSTACK_SECRET_KEY
  if (!secretKey) return data({ ok: false, message: 'Paystack is not configured.' }, { status: 503, headers })
  const initializationResponse = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userData.user.email, amount: Math.round(amount * 100), reference, callback_url: new URL('/plans?payment=pending', request.url).toString() }),
  })
  const initialization = await initializationResponse.json() as { status?: boolean; message?: string; data?: { authorization_url?: string } }
  if (!initializationResponse.ok || !initialization.status || !initialization.data?.authorization_url) return data({ ok: false, message: initialization.message ?? 'Paystack could not start this subscription payment.' }, { status: 502, headers })
  return data({ ok: true, authorizationUrl: initialization.data.authorization_url }, { headers })
}

function formatPrice(price: number) {
  return `₦${price.toLocaleString()}`
}

export default function Plans() {
  const { plans } = useLoaderData<typeof loader>()
  const { activePlan, subscriptionEndDate, subscriptionUsedUnits } = useCustomerStore()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()
  const location = useLocation()
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(() => plans.some((plan) => plan.billingPeriod === 'semester') ? 'semester' : 'monthly')
  const visiblePlans = plans.filter((plan) => plan.billingPeriod === billingPeriod)
  const currentPlan = activePlan
    ? {
        id: activePlan.id,
        name: activePlan.name,
        billingPeriod: activePlan.type,
        price: activePlan.price,
        currency: '₦' as const,
        weeklyLimit: activePlan.weekly_limit,
        service: 'Laundry care',
        description: 'Your active Qaffy subscription.',
        featured: false,
      }
    : null
  const displayedUsedUnits = currentPlan ? Math.min(subscriptionUsedUnits, currentPlan.weeklyLimit) : subscriptionUsedUnits
  const planUsagePercent = currentPlan ? Math.min(100, Math.round((displayedUsedUnits / currentPlan.weeklyLimit) * 100)) : 0

  useEffect(() => {
    if (!new URLSearchParams(location.search).has('payment')) return
    if (activePlan) {
      window.history.replaceState(null, '', '/plans')
      return
    }

    let attempts = 0
    const refreshTimer = window.setInterval(() => {
      attempts += 1
      revalidator.revalidate()
      if (attempts >= 15) window.clearInterval(refreshTimer)
    }, 2000)
    return () => window.clearInterval(refreshTimer)
  }, [activePlan, location.search, revalidator])

  const isSubscribing = fetcher.state !== 'idle'
  useEffect(() => {
    if (fetcher.data?.ok && 'authorizationUrl' in fetcher.data && fetcher.data.authorizationUrl) {
      window.location.assign(fetcher.data.authorizationUrl)
      return
    }
    if (fetcher.data && !fetcher.data.ok && 'message' in fetcher.data) {
      toast.error(fetcher.data.message)
    }
    if (fetcher.data?.ok && !('authorizationUrl' in fetcher.data)) {
      toast.success('Subscription payment completed.')
      revalidator.revalidate()
    }
  }, [fetcher.data, revalidator])

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
            <p className="mt-2 text-sm text-slate-600">{currentPlan.service} · {displayedUsedUnits} of {currentPlan.weeklyLimit} weekly units used</p>
          </div>
          <div className="text-left sm:text-right"><p className="text-sm font-semibold text-slate-900">{subscriptionEndDate ? `Ends on ${subscriptionEndDate}` : 'Active subscription'}</p><p className="mt-1 text-xs text-slate-500">{currentPlan.weeklyLimit} clothes per week</p></div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#d3ebe8]" aria-label={`${planUsagePercent}% of weekly plan allowance used`}><div className="h-full rounded-full bg-[#55aaa3] transition-[width] duration-500" style={{ width: `${planUsagePercent}%` }} /></div>
      </section>}

      {currentPlan && <PlanEndingBanner planName={`${currentPlan.name} ${currentPlan.billingPeriod}`} endDate={subscriptionEndDate} />}

      <section className="flex flex-col gap-4 border-b border-[#e7e7e7] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-lg font-bold text-[#121212]">Available plans</h3><p className="mt-1 text-sm text-slate-500">Plans are grouped by their billing period.</p></div>
        <div className="flex rounded-2xl border border-[#e7e7e7] bg-white p-1" role="tablist" aria-label="Plan billing period">
          {(['monthly', 'semester'] as BillingPeriod[]).map((period) => <button key={period} type="button" role="tab" aria-selected={billingPeriod === period} onClick={() => setBillingPeriod(period)} className={`rounded-2xl px-4 py-2 text-sm font-semibold capitalize transition ${billingPeriod === period ? 'bg-brand-soft text-brand-strong' : 'text-slate-500 hover:text-slate-900'}`}>{period}</button>)}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {visiblePlans.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-slate-700">No {billingPeriod} plans are available yet.</p>
          </div>
        ) : visiblePlans.map((plan) => {
          const isCurrent = plan.id === activePlan?.id
          return <article key={plan.id} className={`relative flex flex-col rounded-2xl border p-5 shadow-sm ${plan.featured ? 'border-brand-strong bg-brand-surface' : 'border-[#e7e7e7] bg-white'}`}>
            {plan.featured && <span className="absolute right-5 top-5 rounded-full bg-brand-strong px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">Popular</span>}
            <div className="pr-16"><p className="text-sm font-semibold text-brand-strong">{plan.name}</p><div className="mt-3 flex items-baseline gap-1.5"><span className="text-3xl font-bold text-[#121212]">{formatPrice(plan.price)}</span><span className="text-sm text-slate-500">/{plan.billingPeriod}</span></div></div>
            <p className="mt-4 min-h-10 text-sm leading-5 text-slate-600">{plan.description}</p>
            <div className="mt-5 grid gap-2 border-y border-[#eeeeee] py-4 text-sm"><div className="flex items-center justify-between"><span className="text-slate-500">Weekly limit</span><span className="font-semibold text-slate-900">{plan.weeklyLimit} clothes</span></div></div>
            <button type="button" disabled={Boolean(activePlan) || isSubscribing} onClick={() => { fetcher.submit({ planId: plan.id }, { method: 'post' }); }} className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${isCurrent ? 'cursor-default bg-[#eef9f7] text-[#418d87]' : activePlan ? 'cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400' : plan.featured ? 'bg-brand-strong text-white hover:bg-brand-strong-hover' : 'border border-brand-border bg-white text-brand-strong hover:bg-brand-soft'}`}>{isCurrent ? <>Current plan <Check className="h-4 w-4" /></> : activePlan ? 'Current subscription active' : isSubscribing ? 'Opening secure checkout...' : <>Choose plan <ChevronRight className="h-4 w-4" /></>}</button>
          </article>
        })}
      </section>

      {fetcher.data && !fetcher.data.ok && 'message' in fetcher.data && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{fetcher.data.message}</p>}

    </div>
  )
}
