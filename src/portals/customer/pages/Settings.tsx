import { Copy, Share2 } from 'lucide-react'
import { data, Link, useFetcher } from 'react-router'
import type { Route } from './+types/Settings'
import { useCustomerStore } from '../customer-store-hook'
import { useState } from 'react'

// Updates the customer's preferred pickup location.
// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'location')
  const { getSupabaseServerClient, isSupabaseServerConfigured } = await import('../../../lib/supabase.server')
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })
  const { supabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  if (intent === 'profile') {
    const name = String(formData.get('name') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    if (!name) return data({ ok: false, message: 'Enter your full name.' }, { status: 400, headers })
    if (phone && !/^[+\d][\d\s()-]{6,}$/.test(phone)) return data({ ok: false, message: 'Enter a valid phone number.' }, { status: 400, headers })
    const { error } = await supabase.from('profiles').update({ name, phone: phone || null }).eq('id', userData.user.id)
    if (error) return data({ ok: false, message: error.message }, { status: 500, headers })
    return data({ ok: true, message: 'Profile details saved.' }, { headers })
  }

  const locationId = String(formData.get('pickupLocationId') ?? '')
  if (!locationId) return data({ ok: false, message: 'Choose a pickup location.' }, { status: 400 })

  const { error } = await supabase.from('profiles').update({ pickup_location_id: locationId }).eq('id', userData.user.id)
  if (error) return data({ ok: false, message: error.message }, { status: 500, headers })
  return data({ ok: true, message: 'Pickup location saved.' }, { headers })
}

export default function Settings() {
  const { customerName, customerEmail, customerPhone, customerId, referralCode, referrals, subscription, subscriptionEndDate, pickupLocations, preferredPickupLocationId, transactions } = useCustomerStore()
  const fetcher = useFetcher<typeof action>()
  const profileFetcher = useFetcher<typeof action>()
  const [referralMessage, setReferralMessage] = useState('')
  const successfulReferrals = referrals.filter((referral) => referral.status === 'rewarded').length
  const referralLink = referralCode ? `/create-account?ref=${encodeURIComponent(referralCode)}` : ''
  const copyReferralLink = async () => {
    if (!referralLink) return
    await navigator.clipboard.writeText(new URL(referralLink, window.location.origin).toString())
    setReferralMessage('Referral link copied.')
  }
  const shareReferralLink = async () => {
    if (!referralLink) return
    const url = new URL(referralLink, window.location.origin).toString()
    if (navigator.share) await navigator.share({ title: 'Join Qaffy', text: 'Join me on Qaffy.', url })
    else await copyReferralLink()
    setReferralMessage('Referral link ready to share.')
  }
  const [selectedLocationId, setSelectedLocationId] = useState(preferredPickupLocationId ?? '')
  const quickStats = [
    { label: 'Phone', value: customerPhone || 'Not added', helper: 'Primary number' },
    { label: 'Profile ID', value: customerId, helper: 'Your Qaffy ID' },
    { label: 'Plan status', value: subscription ? 'Active' : 'No plan', helper: subscription ? `${subscription.name} ${subscription.billingPeriod}` : 'Choose a plan' },
    { label: 'Next renewal', value: subscriptionEndDate ? new Date(subscriptionEndDate).toLocaleDateString() : 'Not scheduled', helper: subscription ? 'Current plan end date' : 'No active plan' },
  ]

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Settings</h2>
        </div>
        <p className="text-sm text-slate-500">Manage your profile and billing</p>
      </header>

      <section className="rounded-[28px] bg-gradient-to-br from-brand-primary via-brand-primary to-brand-primary-hover p-5 text-white shadow-lg shadow-brand-border sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/80">Profile</p>
            <h3 className="mt-3 text-3xl font-bold">{customerName}</h3>
            <p className="mt-2 text-sm text-white/80">{customerEmail} • {customerId}</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl backdrop-blur-sm">A</div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quickStats.map((stat) => (
          <div key={stat.label} className="rounded-[22px] border border-brand-border bg-white p-4 shadow-sm shadow-brand-soft">
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
          </div>

          <profileFetcher.Form method="post" className="mt-5 space-y-4">
            <input type="hidden" name="intent" value="profile" />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Full name</span>
              <input
                name="name"
                defaultValue={customerName}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              />
            </label>

            <div className="rounded-2xl border border-brand-border bg-brand-soft p-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Preferred pickup location</span>
                <select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} required className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus">
                  <option value="" disabled>Select a location</option>
                  {pickupLocations.map((location) => <option key={location.id} value={location.id}>{location.name}{location.address ? ` (${location.address})` : ''}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => fetcher.submit({ pickupLocationId: selectedLocationId }, { method: 'post' })} disabled={!selectedLocationId || fetcher.state !== 'idle'} className="mt-3 rounded-2xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{fetcher.state === 'idle' ? 'Save location' : 'Saving...'}</button>
              {fetcher.data && !fetcher.data.ok && <p role="alert" className="mt-2 text-sm text-red-700">{fetcher.data.message}</p>}
              {fetcher.data?.ok && <p role="status" className="mt-2 text-sm text-emerald-700">Pickup location saved.</p>}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Phone number</span>
              <input
                name="phone"
                defaultValue={customerPhone}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Email address</span>
              <input
                value={customerEmail}
                readOnly
                aria-readonly="true"
                className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 text-base text-slate-500 focus:border-slate-200 focus:ring-0"
              />
            </label>
            <button type="submit" disabled={profileFetcher.state !== 'idle'} className="rounded-2xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{profileFetcher.state === 'idle' ? 'Save profile' : 'Saving...'}</button>
            {profileFetcher.data && !profileFetcher.data.ok && <p role="alert" className="text-sm text-red-700">{profileFetcher.data.message}</p>}
            {profileFetcher.data?.ok && <p role="status" className="text-sm text-emerald-700">Profile details saved.</p>}
          </profileFetcher.Form>
        </div>

        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <h3 className="text-lg font-bold text-slate-900">Referral program</h3>
          <div className="mt-4 space-y-3">
            <div className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700"><span>Referral code</span><span>{referralCode ?? 'Not assigned'}</span></div>
            <div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-2xl bg-brand-soft px-3.5 py-3"><p className="text-xs text-slate-500">Successful referrals</p><p className="mt-1 text-xl font-bold text-slate-900">{successfulReferrals}</p></div><div className="rounded-2xl bg-slate-50 px-3.5 py-3"><p className="text-xs text-slate-500">Referral history</p><p className="mt-1 text-xl font-bold text-slate-900">{referrals.length}</p></div></div>
            <div className="flex gap-2"><button type="button" onClick={() => void copyReferralLink()} disabled={!referralLink} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"><Copy size={15} />Copy link</button><button type="button" onClick={() => void shareReferralLink()} disabled={!referralLink} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Share2 size={15} />Share</button></div>
            {referralMessage && <p role="status" className="text-sm text-emerald-700">{referralMessage}</p>}
            {referrals.length > 0 && <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 px-3.5">{referrals.slice(0, 4).map((referral) => <div key={referral.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold text-slate-900">{referral.isReferrer ? 'Customer invited' : 'Joined through a referral'}</p><p className="mt-1 text-xs text-slate-500">{new Date(referral.createdAt).toLocaleDateString()}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{referral.status}</span></div>)}</div>}
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Recent payments</h3>
            <p className="mt-1 text-sm text-slate-500">Your latest plan and service payments</p>
          </div>
          <Link to="/transactions" className="text-sm font-medium text-brand-primary">View all</Link>
        </div>

        {transactions.filter((transaction) => transaction.category === 'topup').slice(0, 3).length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No payments recorded yet.</p> : <div className="divide-y divide-slate-100">{transactions.filter((transaction) => transaction.category === 'topup').slice(0, 3).map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold text-slate-900">{transaction.title}</p><p className="mt-1 text-xs text-slate-500">{transaction.date}</p></div><div className="text-right"><p className="font-semibold text-slate-900">{transaction.amount}</p><p className="mt-1 text-xs text-slate-500">{transaction.status}</p></div></div>)}</div>}
      </section>
    </div>
  )
}
