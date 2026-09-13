import { ArrowDownUp, Loader2, MapPin, MoreVertical, Plus, Save, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'
import { data, useFetcher, useLoaderData } from 'react-router'
import { useEffect, useMemo, useState } from 'react'
import type { Route } from './+types/PickupLocations'
import { requireRole } from '../../../lib/auth.server'

type PickupLocationRow = {
  id: string
  name: string
  address: string | null
  active: boolean
  createdAt: string
}

type PickupLocationsData = { locations: PickupLocationRow[] }

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data<PickupLocationsData>({ locations: [] }, { status: 200 })
  const { data: rows, error } = await auth.supabase.from('pickup_locations').select('id, name, address, active, created_at').order('created_at', { ascending: false })
  if (error) return data<PickupLocationsData>({ locations: [] }, { headers: auth.headers, status: 200 })
  return data<PickupLocationsData>({
    locations: (rows ?? []).map((row) => ({ id: row.id, name: row.name, address: row.address, active: row.active, createdAt: row.created_at })),
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
    if (!id) return data({ error: 'Location required.' }, { headers, status: 400 })
    const { data: currentLocation, error: fetchError } = await supabase.from('pickup_locations').select('active').eq('id', id).maybeSingle()
    if (fetchError) return data({ error: fetchError.message }, { headers, status: 400 })
    const { error } = await supabase.from('pickup_locations').update({ active: !(currentLocation?.active ?? true) }).eq('id', id)
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  if (intent === 'delete') {
    const id = String(formData.get('id') ?? '')
    if (!id) return data({ error: 'Location required.' }, { headers, status: 400 })
    const { error } = await supabase.from('pickup_locations').delete().eq('id', id)
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  const name = String(formData.get('name') ?? '').trim()
  const address = String(formData.get('address') ?? '').trim()
  if (!name) return data({ error: 'Location name is required.' }, { headers, status: 400 })
  const { error } = await supabase.from('pickup_locations').insert({ name, address: address || null, active: true })
  if (error) return data({ error: error.message }, { headers, status: 400 })
  return data({ ok: true }, { headers, status: 200 })
}

export default function PickupLocations() {
  const { locations } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sortMode, setSortMode] = useState<'active-first' | 'inactive-first' | 'alphabetical'>('active-first')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (fetcher.state === 'idle') setIsSubmitting(false)
  }, [fetcher.state])

  useEffect(() => {
    if (openMenuId === null) return
    const closeMenu = () => setOpenMenuId(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openMenuId])

  const orderedLocations = useMemo(() => {
    const sorted = [...locations]
    if (sortMode === 'alphabetical') {
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    }
    return sorted.sort((a, b) => {
      if (a.active === b.active) {
        return a.name.localeCompare(b.name)
      }
      return sortMode === 'active-first' ? Number(b.active) - Number(a.active) : Number(a.active) - Number(b.active)
    })
  }, [locations, sortMode])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (isSubmitting) {
      event.preventDefault()
      return
    }
    setIsSubmitting(true)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
            <Plus size={17} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Add a pickup point</h3>
        </div>
        <fetcher.Form method="post" onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-[1.3fr_1.5fr_auto]">
          <input type="hidden" name="intent" value="create" />
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Name</span>
            <input name="name" required placeholder="e.g. Front gate" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Address</span>
            <input name="address" placeholder="Optional site or landmark" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={isSubmitting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </fetcher.Form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-brand-primary" />
            <h3 className="text-lg font-bold text-slate-900">Pickup locations</h3>
          </div>
          <div className="flex items-center gap-2">
            <ArrowDownUp size={14} className="text-slate-400" />
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as 'active-first' | 'inactive-first' | 'alphabetical')} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus">
              <option value="active-first">Active first</option>
              <option value="inactive-first">Inactive first</option>
              <option value="alphabetical">A–Z</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="px-5 py-3 font-semibold">Location</th>
                <th className="px-5 py-3 font-semibold">Address</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {orderedLocations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">No pickup locations added yet.</td>
                </tr>
              ) : (
                orderedLocations.map((location) => (
                  <tr key={location.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-primary"><MapPin size={16} /></span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{location.name}</p>
                          <p className="text-xs text-slate-500">Added {new Date(location.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{location.address || 'No address supplied'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${location.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {location.active ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                        {location.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenMenuId((current) => (current === location.id ? null : location.id))
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-primary hover:text-brand-primary"
                          aria-label={`More actions for ${location.name}`}
                        >
                          <MoreVertical size={16} />
                        </button>

                        {openMenuId === location.id && (
                          <div className="absolute right-0 top-11 z-10 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                            <fetcher.Form method="post" onSubmit={() => {
                              if (openMenuId !== location.id) return
                              setOpenMenuId(null)
                            }}>
                              <input type="hidden" name="intent" value="toggle" />
                              <input type="hidden" name="id" value={location.id} />
                              <button type="submit" disabled={fetcher.state !== 'idle'} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                                {fetcher.state !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : location.active ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                                {location.active ? 'Archive' : 'Restore'}
                              </button>
                            </fetcher.Form>
                            <fetcher.Form method="post" onSubmit={(event) => {
                              if (!window.confirm(`Delete pickup location “${location.name}”? This cannot be undone.`)) {
                                event.preventDefault()
                              }
                              setOpenMenuId(null)
                            }}>
                              <input type="hidden" name="intent" value="delete" />
                              <input type="hidden" name="id" value={location.id} />
                              <button type="submit" disabled={fetcher.state !== 'idle'} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">
                                {fetcher.state !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                Delete
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
    </div>
  )
}
