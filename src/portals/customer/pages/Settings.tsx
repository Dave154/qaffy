import { data, Link, useFetcher } from 'react-router'
import type { Route } from './+types/Settings'
import { useCustomerStore } from '../customer-store-hook'

// Updates the customer's preferred pickup location.
// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const locationId = String(formData.get('pickupLocationId') ?? '')
  if (!locationId) return data({ ok: false, message: 'Choose a pickup location.' }, { status: 400 })

  const { getSupabaseServerClient, isSupabaseServerConfigured } = await import('../../../lib/supabase.server')
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })
  const { supabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const { error } = await supabase.from('profiles').update({ pickup_location_id: locationId }).eq('id', userData.user.id)
  if (error) return data({ ok: false, message: error.message }, { status: 500, headers })
  return data({ ok: true, message: 'Pickup location saved.' }, { headers })
}

export default function Settings() {
  const { customerName, customerEmail, customerPhone, customerId, pickupLocations, preferredPickupLocationId, subscription } = useCustomerStore()
  const fetcher = useFetcher<typeof action>()
  const quickStats = [
    { label: 'Phone', value: customerPhone || 'Not added', helper: 'Primary number' },
    { label: 'Profile ID', value: customerId, helper: 'Your Qaffy ID' },
    { label: 'Plan status', value: subscription ? 'Active' : 'No plan', helper: subscription ? `${subscription.name} ${subscription.billingPeriod}` : 'Choose a plan' },
    { label: 'Next renewal', value: subscription ? '12 Sep' : 'Not scheduled', helper: subscription ? 'Auto-renews' : 'No active plan' },
  ]

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
            <h3 className="mt-3 text-3xl font-bold">{customerName}</h3>
            <p className="mt-2 text-sm text-violet-100">{customerEmail} • {customerId}</p>
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
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Full name</span>
              <input
                value={customerName}
                readOnly
                aria-readonly="true"
                className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 text-base text-slate-500 focus:border-slate-200 focus:ring-0"
              />
            </label>

            <fetcher.Form method="post" className="rounded-2xl border border-brand-border bg-brand-soft p-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Preferred pickup location</span>
                <select name="pickupLocationId" defaultValue={preferredPickupLocationId ?? ''} required className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus">
                  <option value="" disabled>Select a location</option>
                  {pickupLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
              <button type="submit" disabled={fetcher.state !== 'idle'} className="mt-3 rounded-2xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{fetcher.state === 'idle' ? 'Save location' : 'Saving...'}</button>
              {fetcher.data && !fetcher.data.ok && <p role="alert" className="mt-2 text-sm text-red-700">{fetcher.data.message}</p>}
              {fetcher.data?.ok && <p role="status" className="mt-2 text-sm text-emerald-700">Pickup location saved.</p>}
            </fetcher.Form>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Phone number</span>
              <input
                value={customerPhone}
                readOnly
                aria-readonly="true"
                className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
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
          </div>
        </div>

        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <h3 className="text-lg font-bold text-slate-900">Billing & rewards</h3>

          <div className="mt-4 space-y-3">
            <div className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700">
              <span>Payment method</span>
              <span>Not added</span>
            </div>

            <div className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700">
              <span>Referral program</span>
              <span>Coming soon</span>
            </div>

            <div className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700">
              <span>Notifications</span>
              <span>Enabled</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Recent payments</h3>
            <p className="mt-1 text-sm text-slate-500">Your latest plan and service payments</p>
          </div>
          <Link to="/transactions" className="text-sm font-medium text-violet-600">View all</Link>
        </div>

        <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No payments recorded yet.</p>
      </section>
    </div>
  )
}
