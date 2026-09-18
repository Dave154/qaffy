import { useEffect, useState } from 'react'
import { data, Form, NavLink, Outlet, redirect, useLoaderData, useLocation, useNavigate, useRevalidator } from 'react-router'
import type { Route } from './+types/CustomerLayout'
import { Home, LayoutGrid, ReceiptText, FileText, Sparkles, Settings, Menu, X, UserCircle2, Search, Bell, ClipboardList, LogOut } from 'lucide-react'
import QaffyLogo from '../../components/QaffyLogo'
import { isSupabaseServerConfigured, getSupabaseServerClient } from '../../lib/supabase.server'
import { supabase } from '../../lib/supabase.client'
import { CustomerStoreProvider } from './customer-store'
import type { CustomerReferral, MismatchLine, PersistedOrderItem, PickupLocationOption } from './customer-store'
import { useCustomerStore } from './customer-store-hook'
import type { Invoice, Order, Payment, Plan, Subscription, Wallet, WalletTransaction } from '../../types/database.types'
import { ensurePushSubscription, savePushSubscription } from '../../lib/push.client'

const navItems = [
  { to: '/', label: 'Overview', icon: Home, end: true },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText },
  { to: '/orders', label: 'Orders', icon: LayoutGrid },
  { to: '/invoice', label: 'Invoice', icon: FileText },
  { to: '/plans', label: 'Plans', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Route loaders must be exported from the layout module for React Router.
// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  if (!isSupabaseServerConfigured) return null

  const { supabase: serverSupabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await serverSupabase.auth.getUser()

  if (!userData.user) {
    throw redirect('/login', { headers })
  }

  const { data: profile } = await serverSupabase
    .from('profiles')
    .select('id, role, name, qaffy_id, email, phone, referral_code, pickup_location_id')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (!profile) {
    throw redirect('/login', { headers })
  }

  const { data: orders } = await serverSupabase
    .from('orders')
    .select('*')
    .eq('customer_id', userData.user.id)
    .order('created_at', { ascending: false })

  const invoiceOrderIds = (orders ?? []).map((order) => order.id)
  const { data: unpaidInvoices } = invoiceOrderIds.length > 0
    ? await serverSupabase.from('invoices').select('order_id').in('order_id', invoiceOrderIds).eq('status', 'unpaid')
    : { data: [] }
  const { data: orderInvoices } = invoiceOrderIds.length > 0
    ? await serverSupabase.from('invoices').select('order_id, amount').in('order_id', invoiceOrderIds)
    : { data: [] }

  const { data: pickupLocations } = await serverSupabase
    .from('pickup_locations')
    .select('id, name, address')
    .eq('active', true)
    .order('name')

  const orderIds = (orders ?? []).map((order) => order.id)
  const { data: orderItems } = orderIds.length > 0
    ? await serverSupabase
      .from('order_items')
      .select('id, order_id, category_id, quantity, service, unit_price')
      .in('order_id', orderIds)
    : { data: [] }
  const categoryIds = [...new Set((orderItems ?? []).map((item) => item.category_id))]
  const { data: orderCategories } = categoryIds.length > 0
    ? await serverSupabase.from('cloth_categories').select('id, name').in('id', categoryIds)
    : { data: [] }
  const categoryNameById = new Map((orderCategories ?? []).map((category) => [category.id, category.name]))
  const persistedOrderItems: PersistedOrderItem[] = (orderItems ?? []).map((item) => ({
    ...item,
    category_name: categoryNameById.get(item.category_id) ?? 'Laundry item',
  }))
  const weekStart = new Date()
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const subscriptionUsedUnits = (orders ?? [])
    .filter((order) => order.is_subscription_order && order.status !== 'cancelled' && order.clothes_count_vendor !== null && new Date(order.created_at) >= weekStart)
    .reduce((total, order) => total + (order.subscription_units_applied ?? 0), 0)

  const { data: wallet } = await serverSupabase
    .from('wallets')
    .select('*')
    .eq('customer_id', userData.user.id)
    .maybeSingle()

  const { data: walletTransactions } = await serverSupabase
    .from('wallet_transactions')
    .select('*')
    .eq('customer_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: payments, error: paymentsError } = await serverSupabase
    .from('payments')
    .select('*')
    .eq('customer_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: invoiceRows } = await serverSupabase
    .from('invoices')
    .select('*, orders!inner(customer_id)')
    .eq('orders.customer_id', userData.user.id)
    .order('created_at', { ascending: false })
  const customerInvoiceOrderIds = (invoiceRows ?? []).map((invoice) => invoice.order_id)
  const { data: invoiceMismatches } = customerInvoiceOrderIds.length > 0
    ? await serverSupabase.from('mismatches').select('id, order_id, direction, detail, details, created_at').in('order_id', customerInvoiceOrderIds).order('created_at', { ascending: false })
    : { data: [] }
  const orderMismatches = (invoiceMismatches ?? []).map((mismatch) => ({ id: mismatch.id, order_id: mismatch.order_id, direction: mismatch.direction, detail: mismatch.detail, details: (mismatch.details ?? []) as MismatchLine[] }))
  const mismatchByOrderId = new Map<string, { direction: 'over' | 'under'; detail: string | null; details: MismatchLine[] }>()
  for (const mismatch of invoiceMismatches ?? []) {
    if (!mismatchByOrderId.has(mismatch.order_id)) mismatchByOrderId.set(mismatch.order_id, mismatch)
  }
  const invoicesWithDetails = (invoiceRows ?? []).map((invoice) => {
    const invoiceOrder = (orders ?? []).find((order) => order.id === invoice.order_id)
    const invoiceMismatch = mismatchByOrderId.get(invoice.order_id)
    return {
      ...invoice,
      order_reference: invoiceOrder?.public_order_number ?? invoice.order_id,
      original_count: invoiceOrder?.clothes_count_customer ?? null,
      final_count: invoiceOrder?.clothes_count_vendor ?? null,
      extra_amount: invoiceOrder?.billed_extra_amount ?? 0,
      mismatch_direction: invoiceMismatch?.direction ?? null,
      mismatch_detail: invoiceMismatch?.detail ?? null,
      mismatch_details: invoiceMismatch?.details ?? [],
    }
  })

  const { data: subscription } = await serverSupabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', userData.user.id)
    .eq('status', 'active')
    .or(`end_date.is.null,end_date.gte.${new Date().toISOString().slice(0, 10)}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: subscriptionPlan } = subscription
    ? await serverSupabase.from('plans').select('*').eq('id', subscription.plan_id).maybeSingle()
    : { data: null }

  const [{ data: referredRows }, { data: referrerRows }] = await Promise.all([
    serverSupabase.from('referrals').select('id, referrer_id, referred_id, status, qualified_at, created_at').eq('referred_id', userData.user.id).order('created_at', { ascending: false }),
    serverSupabase.from('referrals').select('id, referrer_id, referred_id, status, qualified_at, created_at').eq('referrer_id', userData.user.id).order('created_at', { ascending: false }),
  ])
  const referralRows = [...(referredRows ?? []), ...(referrerRows ?? [])].filter((row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index)
  const referralIds = referralRows.map((row) => row.id)
  const { data: referralRewards } = referralIds.length > 0
    ? await serverSupabase.from('referral_rewards').select('referral_id, recipient_id, reward_value, status, expires_at').in('referral_id', referralIds).eq('recipient_id', userData.user.id)
    : { data: [] }
  const persistedReferrals: CustomerReferral[] = referralRows.map((row) => {
    const reward = (referralRewards ?? []).find((candidate) => candidate.referral_id === row.id)
    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      qualifiedAt: row.qualified_at,
      isReferrer: row.referrer_id === userData.user.id,
      rewardStatus: reward?.status ?? null,
      rewardValue: reward ? Number(reward.reward_value) : null,
      rewardExpiresAt: reward?.expires_at ?? null,
    }
  })

  return data({
    user: userData.user,
    profile,
    orders: orders ?? [],
    unpaidInvoiceOrderIds: (unpaidInvoices ?? []).map((invoice) => invoice.order_id),
    invoiceAmountsByOrderId: Object.fromEntries((orderInvoices ?? []).map((invoice) => [invoice.order_id, Number(invoice.amount)])),
    pickupLocations: pickupLocations ?? [],
    orderItems: persistedOrderItems,
    subscriptionUsedUnits,
    wallet,
    walletTransactions: walletTransactions ?? [],
    payments: payments ?? [],
    transactionError: paymentsError?.message ?? null,
    invoices: invoicesWithDetails,
    orderMismatches,
    subscription,
    subscriptionPlan,
    persistedReferrals,
  }, { headers })
}

function PlanSummary({ onNavigate }: { onNavigate?: () => void }) {
  const { activePlan, subscription, subscriptionBalance, subscriptionUsedUnits } = useCustomerStore()
  const displayedUsedUnits = activePlan ? Math.min(subscriptionUsedUnits, activePlan.weekly_limit) : subscriptionUsedUnits
  const usagePercent = activePlan ? Math.min(100, Math.round((displayedUsedUnits / activePlan.weekly_limit) * 100)) : 0

  return (
    <NavLink to="/plans" aria-label="View plans" onClick={onNavigate} className="mt-auto block rounded-2xl border border-[#a7d7d2] bg-[#eef9f7] p-3.5 transition hover:border-[#78beb7] hover:bg-[#e4f5f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00b7d4]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#418d87]">Current plan</p>
      <p className="mt-2 text-sm font-semibold capitalize text-slate-800">{activePlan && subscription ? `${subscription.name} ${subscription.billingPeriod}` : 'No active plan'}</p>
      {subscriptionBalance < 0 && <p className="mt-1 text-xs text-brand-primary">Subscription debt: ₦{Math.abs(subscriptionBalance).toLocaleString()}</p>}
      {activePlan && <p className="mt-2 text-xs text-slate-600">{displayedUsedUnits} of {activePlan.weekly_limit} weekly units used</p>}
      <div className="mt-3 h-1.5 overflow-hidden bg-[#d3ebe8]" aria-label={`${usagePercent}% of weekly plan allowance used`}>
        <div className="h-full bg-[#55aaa3] transition-[width] duration-500" style={{ width: `${usagePercent}%` }} />
      </div>
    </NavLink>
  )
}

export default function CustomerLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const loaderData = useLoaderData<typeof loader>()
  const revalidator = useRevalidator()
  const unpaidOrderIds = new Set(loaderData?.unpaidInvoiceOrderIds ?? [])
  const mismatchCount = loaderData?.orderMismatches?.filter((mismatch) => unpaidOrderIds.has(mismatch.order_id)).length ?? 0
  const pageTitle = location.pathname === '/'
    ? 'Overview'
    : location.pathname.startsWith('/invoice')
      ? 'Invoice'
      : location.pathname.startsWith('/otp')
        ? 'OTP'
        : navItems.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))?.label ?? 'Overview'

  const closeMobileMenu = () => setMobileMenuOpen(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    if (supabase) await supabase.auth.signOut()
    navigate('/login')
  }

  useEffect(() => {
    const client = supabase
    if (!client || !loaderData?.profile?.id) return

    const channel = client
      .channel(`customer-wallet-${loaderData.profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `customer_id=eq.${loaderData.profile.id}` }, () => revalidator.revalidate())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wallet_transactions', filter: `customer_id=eq.${loaderData.profile.id}` }, () => revalidator.revalidate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: `customer_id=eq.${loaderData.profile.id}` }, () => revalidator.revalidate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${loaderData.profile.id}` }, () => revalidator.revalidate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `customer_id=eq.${loaderData.profile.id}` }, () => revalidator.revalidate())
      .subscribe()

    const refreshVisibleState = window.setInterval(() => {
      if (document.visibilityState === 'visible') revalidator.revalidate()
    }, 5000)

    return () => {
      window.clearInterval(refreshVisibleState)
      void client.removeChannel(channel)
    }
  }, [loaderData?.profile?.id, revalidator])

  useEffect(() => {
    if (!loaderData?.profile?.id || typeof window === 'undefined') return
    if (/Electron|\bCode\//i.test(navigator.userAgent)) return
    const promptKey = `qaffy-push-prompted:${loaderData.profile.id}`
    if (window.sessionStorage.getItem(promptKey)) return

    const setupFromInteraction = () => {
      window.removeEventListener('pointerdown', setupFromInteraction)
      window.removeEventListener('keydown', setupFromInteraction)
      void ensurePushSubscription()
        .then((subscription) => savePushSubscription(subscription))
        .then(() => window.sessionStorage.setItem(promptKey, '1'))
        .catch((error) => console.info('Push notification setup skipped:', error))
    }

    window.addEventListener('pointerdown', setupFromInteraction, { once: true })
    window.addEventListener('keydown', setupFromInteraction, { once: true })
    return () => {
      window.removeEventListener('pointerdown', setupFromInteraction)
      window.removeEventListener('keydown', setupFromInteraction)
    }
  }, [loaderData?.profile?.id])

  return (
    <CustomerStoreProvider
      key={`${loaderData?.profile?.id ?? 'customer'}:${loaderData?.profile?.name ?? ''}:${loaderData?.profile?.phone ?? ''}:${loaderData?.profile?.referral_code ?? ''}:${loaderData?.wallet?.updated_at ?? 'no-wallet'}:${loaderData?.subscription?.id ?? 'no-subscription'}:${loaderData?.subscription?.end_date ?? ''}:${(loaderData?.orders ?? []).map((order) => `${order.id}-${order.status}-${order.pickup_otp ?? ''}-${order.delivery_otp ?? ''}-${order.clothes_count_vendor ?? ''}`).join('|')}:${(loaderData?.payments ?? []).map((payment) => `${payment.id}-${payment.status}`).join('|')}:${(loaderData?.persistedReferrals ?? []).map((referral) => `${referral.id}-${referral.status}-${referral.rewardStatus ?? ''}`).join('|')}`}
      profile={loaderData?.profile ?? undefined}
      persistedOrders={loaderData ? (loaderData.orders as Order[]) : undefined}
      persistedUnpaidInvoiceOrderIds={loaderData?.unpaidInvoiceOrderIds as string[] | undefined}
      invoiceAmountsByOrderId={loaderData?.invoiceAmountsByOrderId as Record<string, number> | undefined}
      persistedPickupLocations={loaderData ? (loaderData.pickupLocations as PickupLocationOption[]) : undefined}
      persistedOrderItems={loaderData ? (loaderData.orderItems as PersistedOrderItem[]) : undefined}
      persistedOrderMismatches={loaderData?.orderMismatches as Array<{ id: string; order_id: string; direction: 'over' | 'under'; detail: string | null; details: MismatchLine[] }> | undefined}
      persistedSubscriptionUsedUnits={loaderData?.subscriptionUsedUnits as number | undefined}
      persistedWallet={loaderData?.wallet as Wallet | null | undefined}
      persistedWalletTransactions={loaderData?.walletTransactions as WalletTransaction[] | undefined}
      persistedPayments={loaderData?.payments as Payment[] | undefined}
      persistedReferrals={loaderData?.persistedReferrals as CustomerReferral[] | undefined}
      persistedTransactionError={loaderData?.transactionError as string | null | undefined}
      persistedInvoices={loaderData?.invoices as Array<Invoice & { order_reference?: string; original_count?: number | null; final_count?: number | null; extra_amount?: number | null; mismatch_direction?: 'over' | 'under' | null; mismatch_detail?: string | null; mismatch_details?: MismatchLine[] }> | undefined}
      persistedSubscription={loaderData?.subscription && loaderData.subscriptionPlan
        ? { subscription: loaderData.subscription as Subscription, plan: loaderData.subscriptionPlan as Plan }
        : null}
    >
      <div className="relative min-h-screen bg-[#fafafa] text-[#121212]">
      <div className="relative z-10 min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen max-h-screen w-[221px] shrink-0 overflow-y-auto border-r border-[#f2f3f3] bg-white px-[13px] py-8 shadow-[1px_0_8px_rgba(18,18,18,0.04)] lg:flex lg:flex-col">
        <div className="px-3">
          <QaffyLogo />
        </div>

        <nav className="mx-auto mt-12 w-[194px] space-y-[3px]">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                    `flex h-10 items-center gap-3 rounded-[10px] px-4 text-sm font-medium transition ${
                    isActive ? 'bg-brand-surface text-brand-strong' : 'text-[#121212] hover:bg-[#fafafa]'
                  }`
                }
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-[5px] text-[#121212]">
                  <Icon className="h-4 w-4" />
                </span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto space-y-1">
          <NavLink to="/transactions" className="flex h-10 w-full items-center gap-3 rounded-[10px] px-4 text-sm font-medium text-[#121212] hover:bg-[#fafafa]">
            <ClipboardList className="h-4 w-4" />
            <span>Activity log</span>
          </NavLink>
          <button type="button" onClick={() => setLogoutConfirmationOpen(true)} className="flex h-10 w-full items-center gap-3 rounded-[10px] px-4 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700">
            <LogOut className="h-4 w-4 text-red-600" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-[#f2f3f3] bg-white lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <QaffyLogo className="scale-[0.82]" />

            <div className="flex items-center gap-2">
              <NavLink
                to="/orders?filter=Needs%20attention"
                aria-label="Open notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600"
              >
                <Bell className="h-4 w-4" />
                {mismatchCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-[#f59e0b] px-0.5 text-[9px] font-bold text-white">{mismatchCount}</span>}
              </NavLink>
              <NavLink
                to="/settings"
                aria-label="Open profile"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600"
              >
                <UserCircle2 className="h-5 w-5" />
              </NavLink>
            </div>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" aria-label="Close navigation menu" className="absolute inset-0 bg-slate-950/35" onClick={closeMobileMenu} />

            <aside className="relative z-10 flex h-full w-[82%] max-w-sm flex-col border-r border-[#e7e7e7] bg-white px-4 py-5 shadow-xl">
              <div className="mb-6 flex items-center justify-between">
                <QaffyLogo className="scale-[0.82]" />
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={closeMobileMenu}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={closeMobileMenu}
                      className={({ isActive }) =>
                          `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition ${
                            isActive ? 'bg-brand-surface text-brand-strong' : 'text-[#121212] hover:bg-[#fafafa]'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span className={`flex h-8 w-8 items-center justify-center rounded-md ${isActive ? 'text-brand-strong' : 'text-[#121212]'}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </nav>

              <PlanSummary onNavigate={closeMobileMenu} />
              <button type="button" onClick={() => { closeMobileMenu(); setLogoutConfirmationOpen(true) }} className="mt-3 flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700">
                <LogOut className="h-4 w-4 text-red-600" />
                <span>Log out</span>
              </button>
            </aside>
          </div>
        )}

        <div className="hidden h-[70px] items-center justify-between gap-4 px-7 pt-[22px] lg:flex">
          <h2 className="text-2xl font-bold tracking-tight text-[#121212]">{pageTitle}</h2>
          <div className="flex items-center gap-4">
          <Form method="get" action="/orders" className="flex h-12 w-[288px] items-center gap-2 rounded-full border border-[#f2f3f3] bg-white px-4 text-sm text-[#505959]">
            <Search className="h-3.5 w-3.5 text-[#8e9a9a]" />
            <input name="search" type="search" placeholder="Search orders" aria-label="Search orders" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#8e9a9a]" />
          </Form>
          <NavLink to="/orders?filter=Needs%20attention" aria-label="Open notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#f2f3f3] bg-white text-[#121212]">
            <Bell className="h-4 w-4" />
            {mismatchCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[#f59e0b] px-1 text-[10px] font-bold text-white">{mismatchCount}</span>}
          </NavLink>
          </div>
        </div>
        <main className="mx-auto w-full max-w-300 px-4 pb-8 pt-5 sm:px-6 sm:pt-6 lg:pb-10 lg:pt-5">
          <Outlet />
        </main>
      </div>
      </div>
      </div>

      {logoutConfirmationOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={() => !isLoggingOut && setLogoutConfirmationOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[#e7e7e7] bg-white p-6 shadow-2xl"
          >
            <h2 id="logout-title" className="text-xl font-bold text-slate-900">Log out of Qaffy?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">You will need to sign in again to access your laundry account.</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setLogoutConfirmationOpen(false)}
                disabled={isLoggingOut}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex-1 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? 'Logging out...' : 'Log out'}
              </button>
            </div>
          </section>
        </div>
      )}
    </CustomerStoreProvider>
  )
}
