import { CheckCircle2, Loader2, MoreVertical, Pencil, Plus, Save, Sparkles, ToggleLeft, ToggleRight } from 'lucide-react'
import { data, useFetcher, useLoaderData, useNavigation } from 'react-router'
import { useEffect, useState } from 'react'
import type { Route } from './+types/Plans'
import { requireRole } from '../../../lib/auth.server'
import type { PlanType } from '../../../types/database.types'

type PlanRow = {
  id: string
  name: string
  type: 'monthly' | 'semester'
  price: number
  weeklyLimit: number
  active: boolean
  createdAt: string
}

type SemesterSettings = { semesterStartDate: string | null; semesterEndDate: string | null }
type PlansData = { plans: PlanRow[]; semesterSettings: SemesterSettings }

function money(value: number) { return `₦${value.toLocaleString()}` }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString() : 'Not set' }

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data<PlansData>({ plans: [], semesterSettings: { semesterStartDate: null, semesterEndDate: null } }, { status: 200 })

  const [{ data: rows, error }, settingsResult] = await Promise.all([
    auth.supabase
      .from('plans')
      .select('id, name, type, price, weekly_limit, active, created_at')
      .order('created_at', { ascending: false }),
    auth.supabase
      .from('app_settings' as any)
      .select('semester_start_date, semester_end_date')
      .eq('key', 'semester')
      .maybeSingle() as unknown as Promise<{ data: { semester_start_date: string | null; semester_end_date: string | null } | null; error: { message: string } | null }>,
  ])

  const settings = settingsResult.data

  if (error) return data<PlansData>({ plans: [], semesterSettings: { semesterStartDate: null, semesterEndDate: null } }, { headers: auth.headers, status: 200 })

  return data<PlansData>({
    plans: (rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      price: Number(row.price),
      weeklyLimit: Number(row.weekly_limit),
      active: Boolean(row.active),
      createdAt: row.created_at,
    })),
    semesterSettings: {
      semesterStartDate: settings?.semester_start_date ?? null,
      semesterEndDate: settings?.semester_end_date ?? null,
    },
  }, { headers: auth.headers, status: 200 })
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data({ error: 'Admin access required.' }, { status: 403 })
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'create')
  const { supabase, headers } = auth

  if (intent === 'toggle') {
    const id = String(formData.get('id') ?? '')
    if (!id) return data({ error: 'Plan required.' }, { headers, status: 400 })
    const { data: currentPlan, error: fetchError } = await supabase.from('plans').select('active').eq('id', id).maybeSingle()
    if (fetchError) return data({ error: fetchError.message }, { headers, status: 400 })
    const { error } = await supabase.from('plans').update({ active: !(currentPlan?.active ?? true) }).eq('id', id)
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  if (intent === 'bulk-toggle') {
    const ids = formData.getAll('ids').map(String).filter(Boolean)
    const active = formData.get('active') === 'true'
    if (ids.length === 0) return data({ error: 'Select at least one plan.' }, { headers, status: 400 })
    const { error } = await supabase.from('plans').update({ active }).in('id', ids)
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  if (intent === 'update-semester-settings') {
    const semesterStartDate = String(formData.get('semesterStartDate') ?? '').trim() || null
    const semesterEndDate = String(formData.get('semesterEndDate') ?? '').trim() || null

    if (!semesterStartDate || !semesterEndDate) return data({ error: 'Semester settings require both a start and end date.' }, { headers, status: 400 })
    if (new Date(semesterEndDate) <= new Date(semesterStartDate)) return data({ error: 'Semester end date must be later than the start date.' }, { headers, status: 400 })

    const { error } = await supabase
      .from('app_settings' as any)
      .upsert({
        key: 'semester',
        semester_start_date: semesterStartDate,
        semester_end_date: semesterEndDate,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  if (intent === 'update') {
    const id = String(formData.get('id') ?? '')
    const name = String(formData.get('name') ?? '').trim()
    const rawType = String(formData.get('type') ?? 'monthly')
    const price = Number(formData.get('price') ?? 0)
    const weeklyLimit = Number(formData.get('weeklyLimit') ?? 0)
    if (!id || !name || !['monthly', 'semester'].includes(rawType) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(weeklyLimit) || weeklyLimit <= 0) {
      return data({ error: 'Enter a plan name, valid type, positive price, and positive weekly limit.' }, { headers, status: 400 })
    }
    const { error } = await supabase.from('plans').update({ name, type: rawType as PlanType, price, weekly_limit: weeklyLimit }).eq('id', id)
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  const name = String(formData.get('name') ?? '').trim()
  const rawType = String(formData.get('type') ?? 'monthly')
  const validatedType: PlanType = rawType === 'semester' ? 'semester' : 'monthly'
  const price = Number(formData.get('price') ?? 0)
  const weeklyLimit = Number(formData.get('weeklyLimit') ?? 0)

  if (!name) return data({ error: 'Plan name is required.' }, { headers, status: 400 })
  if (!['monthly', 'semester'].includes(rawType)) return data({ error: 'Invalid plan type.' }, { headers, status: 400 })
  if (price <= 0) return data({ error: 'Plan price must be greater than zero.' }, { headers, status: 400 })
  if (weeklyLimit <= 0) return data({ error: 'Weekly limit must be greater than zero.' }, { headers, status: 400 })

  const { error } = await supabase.from('plans').insert({
    name,
    type: validatedType,
    price,
    weekly_limit: weeklyLimit,
    active: true,
  })
  if (error) return data({ error: error.message }, { headers, status: 400 })

  return data({ ok: true }, { headers, status: 200 })
}

export default function Plans() {
  const { plans, semesterSettings } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const navigation = useNavigation()
  const [planType, setPlanType] = useState<'monthly' | 'semester'>('monthly')
  const [semesterConfig, setSemesterConfig] = useState<SemesterSettings>(semesterSettings)
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPlacement, setMenuPlacement] = useState<'up' | 'down'>('up')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    setSemesterConfig(semesterSettings)
  }, [semesterSettings])

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data || !('ok' in fetcher.data)) return
    setEditingPlan(null)
    setOpenMenuId(null)
    setSelectedIds([])
  }, [fetcher.state, fetcher.data])

  useEffect(() => {
    if (openMenuId === null) return
    const closeMenu = () => setOpenMenuId(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openMenuId])

  const handleSemesterChange = (field: 'semesterStartDate' | 'semesterEndDate', value: string) => {
    setSemesterConfig((current) => ({ ...current, [field]: value || null }))
  }
  const pendingIntent = fetcher.state === 'idle' ? '' : String(fetcher.formData?.get('intent') ?? '')
  const isPending = (intent: string) => pendingIntent === intent
  const isTogglePending = (id: string) => isPending('toggle') && String(fetcher.formData?.get('id') ?? '') === id
  const isPageLoading = navigation.state === 'loading'

  return (
    <div className="space-y-6">
      {isPageLoading && <div role="status" className="flex items-center gap-2 rounded-xl border border-brand-border bg-brand-soft px-4 py-3 text-sm font-medium text-brand-primary"><Loader2 size={16} className="animate-spin" />Refreshing plans...</div>}
      {fetcher.state === 'idle' && fetcher.data && 'error' in fetcher.data && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{fetcher.data.error}</div>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
            <Plus size={17} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Add a plan</h3>
        </div>

        <fetcher.Form method="post" className="mt-5 space-y-4">
          <input type="hidden" name="intent" value="create" />

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.9fr_0.8fr_0.9fr]">
            <label className="min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Name</span>
              <input name="name" required placeholder="e.g. Silver" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
            </label>

            <label className="min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Type</span>
              <select name="type" value={planType} onChange={(event) => setPlanType(event.target.value as 'monthly' | 'semester')} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus">
                <option value="monthly">Monthly</option>
                <option value="semester">Semester</option>
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Price</span>
              <input type="number" min="1" step="100" name="price" defaultValue={25000} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
            </label>

            <label className="min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Weekly limit</span>
              <input type="number" min="1" step="1" name="weeklyLimit" defaultValue={20} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
            </label>

            <div className="flex items-end">
              <button type="submit" disabled={isPending('create')} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70">
                {isPending('create') ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isPending('create') ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </fetcher.Form>
      </section>

      <section className="rounded-2xl border border-brand-soft bg-[#f8fcfc] p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Semester settings</h3>

        <fetcher.Form method="post" className="mt-4 grid gap-4 md:grid-cols-2">
          <input type="hidden" name="intent" value="update-semester-settings" />
          <label className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Start date</span>
            <input type="date" name="semesterStartDate" value={semesterConfig.semesterStartDate ?? ''} onChange={(event) => handleSemesterChange('semesterStartDate', event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">End date</span>
            <input type="date" name="semesterEndDate" value={semesterConfig.semesterEndDate ?? ''} onChange={(event) => handleSemesterChange('semesterEndDate', event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={isPending('update-semester-settings')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70">
              {isPending('update-semester-settings') ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isPending('update-semester-settings') ? 'Saving settings...' : 'Save semester settings'}
            </button>
          </div>
        </fetcher.Form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand-primary" />
            <h3 className="text-lg font-bold text-slate-900">Plan catalogue</h3>
          </div>
        </div>
        {selectedIds.length > 0 && <fetcher.Form method="post" className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3"><div className="text-sm font-semibold text-slate-700">{selectedIds.length} selected</div><div className="flex gap-2"><input type="hidden" name="intent" value="bulk-toggle" />{selectedIds.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}<button type="submit" name="active" value="false" disabled={isPending('bulk-toggle')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">{isPending('bulk-toggle') ? <Loader2 size={13} className="animate-spin" /> : null}{isPending('bulk-toggle') ? 'Updating...' : 'Deactivate selected'}</button><button type="submit" name="active" value="true" disabled={isPending('bulk-toggle')} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{isPending('bulk-toggle') ? <Loader2 size={13} className="animate-spin" /> : null}{isPending('bulk-toggle') ? 'Updating...' : 'Activate selected'}</button></div></fetcher.Form>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed text-left">
            <colgroup>
              <col className="w-[40px]" />
              <col className="w-[28%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="w-10 px-2 py-3"><input type="checkbox" aria-label="Select all plans" checked={plans.length > 0 && selectedIds.length === plans.length} onChange={(event) => setSelectedIds(event.target.checked ? plans.map((plan) => plan.id) : [])} /></th>
                <th className="px-5 py-3 text-left font-semibold">Plan</th>
                <th className="px-5 py-3 text-left font-semibold">Type</th>
                <th className="px-5 py-3 text-left font-semibold">Price</th>
                <th className="px-5 py-3 text-left font-semibold">Weekly limit</th>
                <th className="px-5 py-3 text-left font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold" aria-label="Plan actions"></th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">No plans configured yet.</td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id} className="border-b border-slate-100 align-middle last:border-0">
                    <td className="w-10 px-2 py-4 align-middle"><input type="checkbox" aria-label={`Select ${plan.name}`} checked={selectedIds.includes(plan.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, plan.id] : current.filter((id) => id !== plan.id))} /></td>
                    <td className="px-5 py-4 align-middle">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-primary"><Sparkles size={16} /></span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{plan.name}</p>
                          <p className="text-xs text-slate-500">Created {formatDate(plan.createdAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-middle text-sm font-semibold capitalize text-slate-800">{plan.type}</td>
                    <td className="px-5 py-4 align-middle text-sm font-semibold text-slate-800">{money(plan.price)}</td>
                    <td className="px-5 py-4 align-middle text-sm font-semibold text-slate-800">{plan.weeklyLimit} clothes</td>
                    <td className="px-5 py-4 align-middle">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${plan.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {plan.active ? <CheckCircle2 size={12} /> : <ToggleLeft size={12} />}
                        {plan.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            const viewport = event.currentTarget.closest('.overflow-x-auto')
                            const buttonTop = event.currentTarget.getBoundingClientRect().top
                            const viewportTop = viewport?.getBoundingClientRect().top ?? 0
                            setMenuPlacement(buttonTop - viewportTop < 150 ? 'down' : 'up')
                            setOpenMenuId((current) => (current === plan.id ? null : plan.id))
                          }}
                          aria-label={`More actions for ${plan.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-primary hover:text-brand-primary"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenuId === plan.id && (
                          <div onClick={(event) => event.stopPropagation()} className={`absolute right-0 z-10 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg ${menuPlacement === 'down' ? 'top-11' : 'bottom-11'}`}>
                            <button type="button" onClick={() => { setEditingPlan(plan); setOpenMenuId(null) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                              <Pencil size={14} />
                              Edit
                            </button>
                            <fetcher.Form method="post">
                              <input type="hidden" name="intent" value="toggle" />
                              <input type="hidden" name="id" value={plan.id} />
                              <button type="submit" disabled={isTogglePending(plan.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                                {isTogglePending(plan.id) ? <Loader2 size={14} className="animate-spin" /> : plan.active ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                                {isTogglePending(plan.id) ? 'Updating...' : plan.active ? 'Deactivate' : 'Activate'}
                              </button>
                            </fetcher.Form>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingPlan && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-2xl rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-2xl font-bold text-slate-900">Edit plan</h3>
              <button type="button" onClick={() => setEditingPlan(null)} aria-label="Close plan editor" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-400">×</button>
            </div>
            <fetcher.Form method="post" className="mt-6 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="id" value={editingPlan.id} />
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Name</span><input name="name" defaultValue={editingPlan.name} required className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
              <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Type</span><select name="type" defaultValue={editingPlan.type} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"><option value="monthly">Monthly</option><option value="semester">Semester</option></select></label>
              <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Price</span><input type="number" min="1" step="100" name="price" defaultValue={editingPlan.price} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
              <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Weekly limit</span><input type="number" min="1" step="1" name="weeklyLimit" defaultValue={editingPlan.weeklyLimit} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
              <div className="flex justify-end gap-3 sm:col-span-2"><button type="button" onClick={() => setEditingPlan(null)} disabled={isPending('update')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">Cancel</button><button type="submit" disabled={isPending('update')} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{isPending('update') ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{isPending('update') ? 'Saving changes...' : 'Save changes'}</button></div>
            </fetcher.Form>
          </div>
        </div>
      )}
    </div>
  )
}
