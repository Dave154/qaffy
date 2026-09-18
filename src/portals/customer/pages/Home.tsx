import { useEffect, useState } from 'react'
import { data, useFetcher, useSearchParams } from 'react-router'
import type { Route } from './+types/Home'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { ArrowUpRight, Bell, ClipboardList, Copy, CreditCard, FileText, Gift, LoaderCircle, Settings2, Share2, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router'
import NewOrder from './NewOrder'
import TopUpModal from './TopUpModal'
import CopyableOrderId from '../../../components/CopyableOrderId'
import ProtectedOtp from '../../../components/ProtectedOtp'
import { useCustomerStore } from '../customer-store-hook'
import { ensurePushSubscription, getPushSubscription, savePushSubscription } from '../../../lib/push.client'
import BubblyBackground from '../../../components/BubblyBackground'
import PlanEndingBanner from '../../../components/PlanEndingBanner'
import MismatchBanner from '../../../components/MismatchBanner'
import { toast } from '../../../lib/toast'

// Initializes Paystack top-ups and credits the wallet only after server-side verification.
// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })

  const { supabase: serverSupabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await serverSupabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'initialize')
  const amount = Number(formData.get('amount'))

  if (intent !== 'initialize') return data({ ok: false, message: 'Unsupported payment action.' }, { status: 400, headers })

  if (!Number.isFinite(amount) || amount < 1000) return data({ ok: false, message: 'Minimum top-up is ₦1,000.' }, { status: 400, headers })

  const secretKey = process.env.PAYSTACK_SECRET_KEY
  if (!secretKey) return data({ ok: false, message: 'Paystack is not configured.' }, { status: 503, headers })
  const paymentReference = `topup_${crypto.randomUUID()}`
  const { error: paymentError } = await serverSupabase.from('payments').insert({ customer_id: userData.user.id, provider: 'paystack', reference: paymentReference, amount, balance_type: 'one_off', status: 'pending' })
  if (paymentError) {
    console.error('Paystack pending payment insert failed:', paymentError)
    return data({ ok: false, message: 'The payment could not be recorded. Please check that the latest database migrations are applied.' }, { status: 500, headers })
  }

  const initializationResponse = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userData.user.email, amount: Math.round(amount * 100), reference: paymentReference, callback_url: new URL('/', request.url).toString() }),
  })
  const initialization = await initializationResponse.json() as { status?: boolean; message?: string; data?: { authorization_url?: string; reference?: string } }
  if (!initializationResponse.ok || !initialization.status || !initialization.data?.authorization_url) {
    return data({ ok: false, message: initialization.message ?? 'Paystack could not start this payment.' }, { status: 502, headers })
  }

  return data({ ok: true, authorizationUrl: initialization.data.authorization_url }, { headers })
}

export default function Home() {
  const { balance, promotionalBalance, subscriptionBalance, customerName, customerId, referralCode, orders, subscription, subscriptionEndDate, pendingTopUp } = useCustomerStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(() => searchParams.get('topup') === '1')
  const [pushSetupVisible, setPushSetupVisible] = useState(false)
  const [pushSetupBusy, setPushSetupBusy] = useState(false)
  const [pushSetupMessage, setPushSetupMessage] = useState('')
  const topUpFetcher = useFetcher<typeof action>()
  const activeOrderCount = orders.filter((order) => order.status !== 'Delivered').length
  const pendingPaymentTotal = orders.filter((order) => order.status === 'Pending payment').reduce((total, order) => total + order.total, 0)
  const getVisibleOtp = (order: typeof orders[number]) => {
    if (order.status === 'Awaiting pickup') return order.pickupOtp
    if (order.status === 'In progress') return order.deliveryOtp ?? ''
    return ''
  }
  const recentOrders = [...orders].sort((firstOrder, secondOrder) => Number(Boolean(getVisibleOtp(secondOrder))) - Number(Boolean(getVisibleOtp(firstOrder))))
  const getAmountLabel = (order: typeof orders[number]) => {
    if (order.total > 0) return `₦${order.total.toLocaleString()}`
    if (order.status === 'In progress') return 'Final billing pending'
    if (order.isSubscriptionOrder && ['Ready for delivery', 'Delivered'].includes(order.status)) return 'Covered by plan'
    return 'No charge yet'
  }
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
  const referralPath = referralCode ? `/create-account?ref=${encodeURIComponent(referralCode)}` : ''

  const handleTopUp = async (amount: number) => {
    topUpFetcher.submit({ amount: String(amount) }, { method: 'post', encType: 'application/x-www-form-urlencoded' })
  }

  const handleEnableNotifications = async () => {
    setPushSetupBusy(true)
    setPushSetupMessage('')
    try {
      const subscription = await ensurePushSubscription()
      await savePushSubscription(subscription)
      window.localStorage.removeItem(`qaffy-push-prompt-dismissed:${customerId}`)
      setPushSetupVisible(false)
    } catch (error) {
      setPushSetupMessage(error instanceof Error ? error.message : 'Notifications could not be enabled.')
    } finally {
      setPushSetupBusy(false)
    }
  }

  const copyReferralLink = async () => {
    if (!referralPath) return
    await navigator.clipboard.writeText(new URL(referralPath, window.location.origin).toString())
    toast.success('Referral link copied')
  }

  const shareReferralLink = async () => {
    if (!referralPath) return
    const referralLink = new URL(referralPath, window.location.origin).toString()
    if (!navigator.share) {
      toast.error('Sharing is not supported in this browser')
      return
    }
    try {
      await navigator.share({ title: 'Join Qaffy', text: 'Join me on Qaffy.', url: referralLink })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error('The referral link could not be shared')
    }
  }

  useEffect(() => {
    const dismissed = window.localStorage.getItem(`qaffy-push-prompt-dismissed:${customerId}`) === '1'
    if (dismissed) return
    void getPushSubscription().then((subscription) => setPushSetupVisible(!subscription)).catch(() => setPushSetupVisible(true))
  }, [customerId])

  useEffect(() => {
    const result = topUpFetcher.data
    if (result?.ok && 'authorizationUrl' in result && result.authorizationUrl) {
      window.location.assign(result.authorizationUrl)
    }
  }, [topUpFetcher.data])

  useEffect(() => {
    if (searchParams.get('topup') !== '1') return
    setIsTopUpModalOpen(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('topup')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  return (
    <div className="space-y-6 pb-8">
      <div className="relative flex flex-col justify-end gap-1 overflow-hidden pb-5 sm:flex-row sm:items-end sm:justify-between">
        <BubblyBackground contained count={22} opacity={0.42} scale={1.8} />
        <div>
          <p className="relative text-base font-semibold text-brand-primary">Good morning, {customerName}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Overview</h2>
          <div className="mt-2 flex w-full items-center justify-between gap-3 text-xs">
            <p className="min-w-0 truncate font-semibold uppercase tracking-[0.14em] text-slate-400">Qaffy ID: <span className="text-slate-600">{customerId}</span></p>
            <p className="shrink-0 text-right text-slate-500">{today}</p>
          </div>
        </div>
      </div>

      {subscription && <PlanEndingBanner planName={`${subscription.name} ${subscription.billingPeriod}`} endDate={subscriptionEndDate} />}
      <MismatchBanner orders={orders} />

      {pushSetupVisible && <section className="flex min-w-0 items-center gap-2 overflow-hidden rounded-2xl border border-brand-border bg-brand-soft p-2.5 sm:gap-3 sm:p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-primary"><Bell className="h-3.5 w-3.5" /></span>
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">Stay updated <span className="font-normal text-slate-600">· Get alerts</span></p>
        <button type="button" onClick={() => void handleEnableNotifications()} disabled={pushSetupBusy} aria-label={pushSetupBusy ? 'Setting up notifications' : 'Enable notifications'} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-primary px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60">{pushSetupBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : 'Enable'}</button>
        <button type="button" onClick={() => { window.localStorage.setItem(`qaffy-push-prompt-dismissed:${customerId}`, '1'); setPushSetupVisible(false) }} aria-label="Dismiss notification prompt" title="Dismiss" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800"><X className="h-4 w-4" /></button>
        {pushSetupMessage && <span role="alert" className="sr-only" title={pushSetupMessage}>{pushSetupMessage}</span>}
      </section>}

      <section className="relative rounded-2xl overflow-hidden border border-[#e7e7e7] bg-[#f8f8f8] p-5 sm:p-6">
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{subscription ? 'Subscription' : 'Available balance'}</p>
              {subscription ? (
                <>
                  <p className="mt-3 text-3xl font-semibold capitalize tracking-tight text-slate-900 sm:text-4xl">
                    {subscription.name} {subscription.billingPeriod}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-600">Available balance: ₦{balance < 0 ? '-' : ''}{Math.abs(balance).toLocaleString()}</p>
                </>
              ) : (
                <>
                  <p className={`mt-3 text-3xl font-semibold tracking-tight sm:text-4xl ${balance < 0 ? 'text-brand-primary' : 'text-slate-900'}`}>₦{balance < 0 ? '-' : ''}{Math.abs(balance).toLocaleString()}</p>
                  {balance < 0 && <p className="mt-1 text-sm font-medium text-brand-primary">Outstanding order balance</p>}
                </>
              )}
            </div>
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-white text-sm ${pendingTopUp ? 'border-sky-200 text-sky-700' : 'border-[#e1e1e1]'}`} role={pendingTopUp ? 'status' : undefined} aria-label={pendingTopUp ? 'Top-up payment processing' : undefined} title={pendingTopUp ? 'Top-up payment processing' : undefined}>
              {pendingTopUp ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700" aria-hidden="true" /> : subscription ? '✦' : '₦'}
            </span>
          </div>

          {subscriptionBalance < 0 && <p className="mt-2 text-sm font-medium text-brand-primary">Subscription debt: ₦{Math.abs(subscriptionBalance).toLocaleString()}</p>}
          {promotionalBalance > 0 && <p className="mt-2 text-sm font-medium text-emerald-700">Referral credit: ₦{promotionalBalance.toLocaleString()}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span>Active orders <strong className="ml-1 text-slate-800">{activeOrderCount}</strong></span>
          </div>

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setIsTopUpModalOpen(true)} className="flex-1 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-primary-hover">
              Top up
            </button>
            <button type="button" onClick={() => setIsOrderModalOpen(true)} className="flex-1 rounded-lg border border-brand-primary bg-white px-4 py-2.5 text-sm font-semibold text-brand-primary transition hover:bg-brand-soft">
              New order
            </button>
          </div>
        </div>
      </section>

        <section className="rounded-2xl border border-[#e7e7e7] bg-white p-3 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900">Recent orders</h3>
              <p className="mt-1 text-xs text-slate-500">Track pickup, delivery, and payment</p>
            </div>
            <Link to="/orders" className="shrink-0 whitespace-nowrap pt-1 text-sm font-medium text-brand-primary">View all</Link>
          </div>

          <div className="space-y-3">
            {recentOrders.slice(0, 2).map((order) => (
              <article key={order.id} className="border-b border-[#eeeeee] bg-white p-4 last:border-b-0">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 sm:pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-slate-900"><CopyableOrderId id={order.publicOrderNumber} /></p>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${order.statusTone}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
                        <span>{order.status}</span>
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-700">{order.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{order.date}</p>
                    {order.mismatch && <div className="mt-3 min-w-0 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-3 text-left"><p className="text-xs font-semibold text-amber-800">Count update: {order.mismatch.direction === 'over' ? 'extra items confirmed' : 'fewer items confirmed'}</p><p className="mt-1 min-w-0 truncate text-xs text-amber-700" title={order.mismatch.detail}>{order.mismatch.detail}</p></div>}
                  </div>

                  <div className="shrink-0 sm:ml-2">
                    {getVisibleOtp(order) ? (
                      <div className="flex items-start gap-3 sm:flex-col sm:items-end">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-primary">{order.status === 'Awaiting pickup' ? 'Pickup OTP' : 'Delivery OTP'}</p>
                          <div className="mt-2">
                            <ProtectedOtp value={getVisibleOtp(order)} digitClassName="h-10 w-10 text-base" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-left sm:text-right">
                        <p className="max-w-40 text-sm font-bold text-slate-900">{getAmountLabel(order)}</p>
                        <p className="mt-1 text-xs text-slate-500">{order.items} clothes</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600">{order.pickup}</p>
                  <Link to={`/orders?order=${encodeURIComponent(order.publicOrderNumber)}`} className="rounded-lg border border-brand-border bg-white px-3.5 py-2 text-center text-sm font-semibold text-brand-primary hover:bg-brand-soft">View order</Link>
                </div>
              </article>
            ))}
            {orders.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No recent orders yet.</p>}
          </div>
        </section>

        {referralCode && <section className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-brand-soft p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-primary"><Gift className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Invite friends</p>
              <p className="mt-0.5 truncate text-xs text-slate-600">Share Qaffy and earn wallet credit</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <span className="min-w-0 truncate rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-primary" title={referralCode}>{referralCode}</span>
            <button type="button" onClick={() => void copyReferralLink()} aria-label="Copy referral link" title="Copy referral link" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 transition hover:text-brand-primary"><Copy className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => void shareReferralLink()} aria-label="Share referral link" title="Share referral link" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white transition hover:bg-brand-primary-hover"><Share2 className="h-3.5 w-3.5" /></button>
          </div>
        </section>}

      <section className="rounded-2xl border border-[#e7e7e7] bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Quick access</h3>
            <p className="mt-1 text-sm text-slate-500">Go straight to any part of your laundry account.</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-[#8e9a9a]" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { to: '/orders', label: 'Orders', icon: ClipboardList },
            { to: '/transactions', label: 'Transactions', icon: CreditCard },
            { to: '/plans', label: 'Plans', icon: Sparkles },
            { to: '/invoice', label: 'Invoice', icon: FileText },
            { to: '/otp', label: 'Pickup OTP', icon: Gift },
            { to: '/settings', label: 'Settings', icon: Settings2 },
          ].map((item) => {
            const Icon = item.icon

            return <Link key={item.to} to={item.to} className="flex min-h-20 flex-col justify-between rounded-2xl border border-slate-200 bg-[#fafafa] p-3 text-left transition hover:border-brand-border hover:bg-brand-soft-hover"><Icon className="h-4 w-4 text-brand-primary" /><span className="text-xs font-semibold text-slate-700">{item.label}</span></Link>
          })}
        </div>
      </section>

      {isOrderModalOpen && <NewOrder onClose={() => setIsOrderModalOpen(false)} />}
      {isTopUpModalOpen && <TopUpModal currentBalance={balance} subscriptionBalance={subscriptionBalance} pendingPaymentTotal={pendingPaymentTotal} onTopUp={handleTopUp} isProcessing={topUpFetcher.state !== 'idle'} error={topUpFetcher.data && !topUpFetcher.data.ok && 'message' in topUpFetcher.data ? topUpFetcher.data.message : null} onClose={() => setIsTopUpModalOpen(false)} />}
    </div>
  )
}
