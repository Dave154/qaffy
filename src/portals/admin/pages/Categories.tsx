import { Archive, CheckCircle2, Loader2, MoreVertical, Package, Plus, Save, Tag, Trash2, XCircle } from 'lucide-react'
import { data, useFetcher, useLoaderData } from 'react-router'
import { useEffect, useState } from 'react'
import type { Route } from './+types/Categories'
import { requireRole } from '../../../lib/auth.server'

type CategoryRow = {
  id: string
  name: string
  active: boolean
  washPrice: number
  ironPrice: number
  washIronPrice: number
  subscriptionUnits: number
  createdAt: string
}

type CategoriesData = { categories: CategoryRow[] }

function money(value: number) { return `₦${value.toLocaleString()}` }

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data<CategoriesData>({ categories: [] }, { status: 200 })
  const { supabase, headers } = auth
  const [{ data: categories }, { data: rates }] = await Promise.all([
    supabase.from('cloth_categories').select('id, name, active, created_at').order('created_at', { ascending: false }),
    supabase.from('cloth_category_rates').select('id, category_id, wash_price, iron_price, wash_iron_price, subscription_units, created_at').order('created_at', { ascending: false }),
  ])
  const rateByCategory = new Map((rates ?? []).map((row) => [row.category_id, row]))
  return data<CategoriesData>({
    categories: (categories ?? []).map((category) => {
      const row = rateByCategory.get(category.id)
      return {
        id: String(category.id),
        name: String(category.name),
        active: Boolean(category.active),
        washPrice: Number(row?.wash_price ?? 0),
        ironPrice: Number(row?.iron_price ?? 0),
        washIronPrice: Number(row?.wash_iron_price ?? 0),
        subscriptionUnits: Number(row?.subscription_units ?? 1),
        createdAt: String(category.created_at),
      }
    }),
  }, { headers, status: 200 })
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
    if (!id) return data({ error: 'Category required.' }, { headers, status: 400 })
    const { data: currentCategory, error: fetchError } = await supabase.from('cloth_categories').select('active').eq('id', id).maybeSingle()
    if (fetchError) return data({ error: fetchError.message }, { headers, status: 400 })
    const { error } = await supabase.from('cloth_categories').update({ active: !(currentCategory?.active ?? true) }).eq('id', id)
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  if (intent === 'delete') {
    const id = String(formData.get('id') ?? '')
    if (!id) return data({ error: 'Category required.' }, { headers, status: 400 })
    const { error } = await supabase.from('cloth_categories').delete().eq('id', id)
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  const name = String(formData.get('name') ?? '').trim()
  const washPrice = Number(formData.get('washPrice') ?? 0)
  const ironPrice = Number(formData.get('ironPrice') ?? 0)
  const washIronPrice = Number(formData.get('washIronPrice') ?? 0)
  const subscriptionUnits = Number(formData.get('subscriptionUnits') ?? 1)
  if (!name) return data({ error: 'Category name is required.' }, { headers, status: 400 })

  const { data: category, error: categoryError } = await supabase.from('cloth_categories').insert({ name, active: true }).select('id').single()
  if (categoryError) return data({ error: categoryError.message }, { headers, status: 400 })

  const { error: rateError } = await supabase.from('cloth_category_rates').insert({
    category_id: category.id,
    wash_price: washPrice,
    iron_price: ironPrice,
    wash_iron_price: washIronPrice,
    subscription_units: subscriptionUnits,
  })
  if (rateError) return data({ error: rateError.message }, { headers, status: 400 })

  return data({ ok: true }, { headers, status: 200 })
}

export default function Categories() {
  const { categories } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const [isSubmitting, setIsSubmitting] = useState(false)
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
          <h3 className="text-lg font-bold text-slate-900">Add a laundry category</h3>
        </div>
        <fetcher.Form method="post" onSubmit={handleSubmit} className="mt-5 grid gap-4 xl:grid-cols-[1.7fr_0.9fr_0.9fr_0.9fr_0.7fr_0.9fr]">
          <input type="hidden" name="intent" value="create" />
          <label className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Category</span>
            <input name="name" required placeholder="e.g. Bedsheet" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Wash</span>
            <input type="number" min="0" step="50" name="washPrice" defaultValue={350} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Iron</span>
            <input type="number" min="0" step="50" name="ironPrice" defaultValue={350} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Wash + Iron</span>
            <input type="number" min="0" step="50" name="washIronPrice" defaultValue={350} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Weight</span>
            <input type="number" min="1" step="1" name="subscriptionUnits" defaultValue={1} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={isSubmitting} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </fetcher.Form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-brand-primary" />
            <h3 className="text-lg font-bold text-slate-900">Category catalogue</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Wash</th>
                <th className="px-5 py-3 font-semibold">Iron</th>
                <th className="px-5 py-3 font-semibold">Wash + Iron</th>
                <th className="px-5 py-3 font-semibold">Units</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">No categories configured yet.</td>
                </tr>
              ) : (
                categories.map((category) => (
                  <tr key={category.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-primary"><Package size={16} /></span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{category.name}</p>
                          <p className="text-xs text-slate-500">Created {new Date(category.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{money(category.washPrice)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{money(category.ironPrice)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{money(category.washIronPrice)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{category.subscriptionUnits}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${category.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {category.active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {category.active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenMenuId((current) => (current === category.id ? null : category.id))
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-primary hover:text-brand-primary"
                          aria-label={`More actions for ${category.name}`}
                        >
                          <MoreVertical size={16} />
                        </button>

                        {openMenuId === category.id && (
                          <div className="absolute right-0 top-11 z-10 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                            <fetcher.Form method="post" onSubmit={() => setOpenMenuId(null)}>
                              <input type="hidden" name="intent" value="toggle" />
                              <input type="hidden" name="id" value={category.id} />
                              <button type="submit" disabled={fetcher.state !== 'idle'} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                                {fetcher.state !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : category.active ? <Archive size={14} /> : <CheckCircle2 size={14} />}
                                {category.active ? 'Archive' : 'Restore'}
                              </button>
                            </fetcher.Form>
                            <fetcher.Form method="post" onSubmit={() => {
                              if (!window.confirm(`Delete category “${category.name}”? This cannot be undone.`)) {
                                return false
                              }
                              setOpenMenuId(null)
                            }}>
                              <input type="hidden" name="intent" value="delete" />
                              <input type="hidden" name="id" value={category.id} />
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
