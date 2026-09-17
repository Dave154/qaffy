import { Gift, Loader2, Pause, Play, Plus, Save, Square } from 'lucide-react'
import { data, useFetcher, useLoaderData } from 'react-router'
import type { Route } from './+types/Referrals'
import { requireRole } from '../../../lib/auth.server'

type CampaignRow = {
  id: string
  name: string
  status: 'draft' | 'active' | 'paused' | 'ended'
  startsAt: string | null
  endsAt: string | null
  referrerRewardValue: number
  referredRewardValue: number
  minimumOrderAmount: number
  rewardExpiryDays: number
  maxRewardsPerReferrer: number | null
  createdAt: string
}

type ReferralsData = { campaigns: CampaignRow[] }

function money(value: number) {
  return `₦${value.toLocaleString()}`
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'No end date'
}

function formatDatetimeLocal(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data<ReferralsData>({ campaigns: [] }, { status: 200 })

  const { data: rows, error } = await auth.supabase
    .from('referral_campaigns')
    .select('id, name, status, starts_at, ends_at, referrer_reward_value, referred_reward_value, minimum_order_amount, reward_expiry_days, max_rewards_per_referrer, created_at')
    .order('created_at', { ascending: false })

  if (error) return data<ReferralsData>({ campaigns: [] }, { headers: auth.headers, status: 200 })

  return data<ReferralsData>({
    campaigns: (rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      referrerRewardValue: Number(row.referrer_reward_value),
      referredRewardValue: Number(row.referred_reward_value),
      minimumOrderAmount: Number(row.minimum_order_amount),
      rewardExpiryDays: Number(row.reward_expiry_days),
      maxRewardsPerReferrer: row.max_rewards_per_referrer === null ? null : Number(row.max_rewards_per_referrer),
      createdAt: row.created_at,
    })),
  }, { headers: auth.headers, status: 200 })
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data({ error: 'Admin access required.' }, { status: 403 })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'create')
  const { supabase, headers } = auth

  if (intent === 'status') {
    const id = String(formData.get('id') ?? '')
    const status = String(formData.get('status') ?? '')
    if (!id || !['active', 'paused', 'ended'].includes(status)) return data({ error: 'Valid campaign status required.' }, { headers, status: 400 })
    const { error } = await supabase.from('referral_campaigns').update({ status: status as CampaignRow['status'], updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers })
  }

  const name = String(formData.get('name') ?? '').trim()
  const startsAt = String(formData.get('startsAt') ?? '').trim() || null
  const endsAt = String(formData.get('endsAt') ?? '').trim() || null
  const referrerRewardValue = Number(formData.get('referrerRewardValue') ?? 0)
  const referredRewardValue = Number(formData.get('referredRewardValue') ?? 0)
  const minimumOrderAmount = Number(formData.get('minimumOrderAmount') ?? 0)
  const rewardExpiryDays = Number(formData.get('rewardExpiryDays') ?? 90)
  const maxRewardsPerReferrerValue = String(formData.get('maxRewardsPerReferrer') ?? '').trim()
  const maxRewardsPerReferrer = maxRewardsPerReferrerValue ? Number(maxRewardsPerReferrerValue) : null

  if (!name || !Number.isFinite(referrerRewardValue) || referrerRewardValue <= 0 || !Number.isFinite(referredRewardValue) || referredRewardValue <= 0 || !Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0 || !Number.isInteger(rewardExpiryDays) || rewardExpiryDays <= 0 || (maxRewardsPerReferrer !== null && (!Number.isInteger(maxRewardsPerReferrer) || maxRewardsPerReferrer <= 0))) {
    return data({ error: 'Enter valid campaign rewards, expiry, and limit values.' }, { headers, status: 400 })
  }
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return data({ error: 'Campaign end date must be later than the start date.' }, { headers, status: 400 })

  const { error } = await supabase.from('referral_campaigns').insert({
    name,
    status: 'draft',
    starts_at: startsAt,
    ends_at: endsAt,
    referrer_reward_type: 'wallet_credit',
    referrer_reward_value: referrerRewardValue,
    referred_reward_type: 'wallet_credit',
    referred_reward_value: referredRewardValue,
    minimum_order_amount: minimumOrderAmount,
    reward_expiry_days: rewardExpiryDays,
    max_rewards_per_referrer: maxRewardsPerReferrer,
    created_by: auth.profile.id,
  })
  if (error) return data({ error: error.message }, { headers, status: 400 })
  return data({ ok: true }, { headers })
}

export default function Referrals() {
  const { campaigns } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const defaultStartsAt = new Date()
  const defaultEndsAt = new Date(defaultStartsAt)
  defaultEndsAt.setMonth(defaultEndsAt.getMonth() + 1)
  const defaultStartsAtValue = formatDatetimeLocal(defaultStartsAt)
  const defaultEndsAtValue = formatDatetimeLocal(defaultEndsAt)
  const pendingIntent = fetcher.state === 'idle' ? '' : String(fetcher.formData?.get('intent') ?? '')
  const isPending = (intent: string, id?: string) => pendingIntent === intent && (!id || String(fetcher.formData?.get('id') ?? '') === id)

  return (
    <div className="space-y-6">
      {fetcher.state === 'idle' && fetcher.data && 'error' in fetcher.data && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{fetcher.data.error}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-primary"><Plus size={17} /></div>
          <div><h3 className="text-lg font-bold text-slate-900">Create referral campaign</h3><p className="text-sm text-slate-500">Campaigns configure rewards only. Wallet credit is issued after qualification.</p></div>
        </div>
        <fetcher.Form method="post" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="intent" value="create" />
          <label className="md:col-span-2 xl:col-span-4"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Campaign name</span><input name="name" required placeholder="e.g. Welcome friends" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Referrer reward</span><input name="referrerRewardValue" type="number" min="1" step="1" defaultValue="1000" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">New customer reward</span><input name="referredRewardValue" type="number" min="1" step="1" defaultValue="1000" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Minimum order</span><input name="minimumOrderAmount" type="number" min="0" step="1" defaultValue="0" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reward expiry days</span><input name="rewardExpiryDays" type="number" min="1" step="1" defaultValue="90" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Starts</span><input name="startsAt" type="datetime-local" defaultValue={defaultStartsAtValue} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ends</span><input name="endsAt" type="datetime-local" defaultValue={defaultEndsAtValue} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
          <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Max rewards per referrer</span><input name="maxRewardsPerReferrer" type="number" min="1" step="1" placeholder="Unlimited" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
          <div className="flex items-end"><button type="submit" disabled={isPending('create')} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70">{isPending('create') ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{isPending('create') ? 'Saving...' : 'Save draft'}</button></div>
        </fetcher.Form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 p-4"><Gift size={17} className="text-brand-primary" /><h3 className="text-lg font-bold text-slate-900">Campaigns</h3></div>
        <div className="overflow-x-auto"><table className="w-full min-w-245 table-fixed text-left"><thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><th className="w-[23%] px-5 py-3 font-semibold">Campaign</th><th className="w-[18%] px-5 py-3 font-semibold">Rewards</th><th className="w-[15%] px-5 py-3 font-semibold">Qualification</th><th className="w-[15%] px-5 py-3 font-semibold">Validity</th><th className="w-[12%] px-5 py-3 font-semibold">Status</th><th className="w-[17%] px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody>{campaigns.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">No referral campaigns configured yet.</td></tr> : campaigns.map((campaign) => <tr key={campaign.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4"><p className="truncate text-sm font-semibold text-slate-900">{campaign.name}</p><p className="mt-1 text-xs text-slate-500">Created {formatDate(campaign.createdAt)}</p></td><td className="px-5 py-4 text-sm text-slate-700">{money(campaign.referrerRewardValue)} + {money(campaign.referredRewardValue)}</td><td className="px-5 py-4 text-sm text-slate-700">{campaign.minimumOrderAmount > 0 ? money(campaign.minimumOrderAmount) : 'Any paid order'}<span className="block text-xs text-slate-500">Expires in {campaign.rewardExpiryDays} days</span></td><td className="px-5 py-4 text-sm text-slate-700">{formatDate(campaign.startsAt)}<span className="block text-xs text-slate-500">to {formatDate(campaign.endsAt)}</span></td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${campaign.status === 'active' ? 'bg-emerald-50 text-emerald-700' : campaign.status === 'ended' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>{campaign.status}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-2">{campaign.status !== 'ended' && <fetcher.Form method="post"><input type="hidden" name="intent" value="status" /><input type="hidden" name="id" value={campaign.id} /><input type="hidden" name="status" value={campaign.status === 'active' ? 'paused' : 'active'} /><button type="submit" disabled={isPending('status', campaign.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60">{isPending('status', campaign.id) ? <Loader2 size={13} className="animate-spin" /> : campaign.status === 'active' ? <Pause size={13} /> : <Play size={13} />}{campaign.status === 'active' ? 'Pause' : 'Activate'}</button></fetcher.Form>}{campaign.status !== 'ended' && <fetcher.Form method="post"><input type="hidden" name="intent" value="status" /><input type="hidden" name="id" value={campaign.id} /><input type="hidden" name="status" value="ended" /><button type="submit" disabled={isPending('status', campaign.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-2 text-xs font-semibold text-red-700 disabled:opacity-60"><Square size={12} />End</button></fetcher.Form>}</div></td></tr>)}</tbody></table></div>
      </section>
    </div>
  )
}