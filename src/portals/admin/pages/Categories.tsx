import { Archive, CheckCircle2, Loader2, MoreVertical, Package, Pencil, Plus, Save, Tag, Trash2, X, XCircle } from 'lucide-react'
import { data, useFetcher, useLoaderData } from 'react-router'
import { useEffect, useState } from 'react'
import type { Route } from './+types/Categories'
import { requireRole } from '../../../lib/auth.server'

type CategoryRow = {
  id: string
  name: string
  isMain: boolean
  active: boolean
  washPrice: number
  ironPrice: number
  washIronPrice: number
  vendorWashPrice: number
  vendorIronPrice: number
  vendorWashIronPrice: number
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
    supabase.from('cloth_categories').select('id, name, is_main, active, created_at').order('created_at', { ascending: false }),
    supabase.from('cloth_category_rates').select('id, category_id, wash_price, iron_price, wash_iron_price, vendor_wash_price, vendor_iron_price, vendor_wash_iron_price, subscription_units, created_at').order('created_at', { ascending: false }),
  ])
  const rateByCategory = new Map((rates ?? []).map((row) => [row.category_id, row]))
  return data<CategoriesData>({
    categories: (categories ?? []).map((category) => {
      const row = rateByCategory.get(category.id)
      return {
        id: String(category.id),
        name: String(category.name),
        isMain: Boolean(category.is_main),
        active: Boolean(category.active),
        washPrice: Number(row?.wash_price ?? 0),
        ironPrice: Number(row?.iron_price ?? 0),
        washIronPrice: Number(row?.wash_iron_price ?? 0),
        vendorWashPrice: Number(row?.vendor_wash_price ?? 0),
        vendorIronPrice: Number(row?.vendor_iron_price ?? 0),
        vendorWashIronPrice: Number(row?.vendor_wash_iron_price ?? 0),
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

  if (intent === 'bulk-toggle') {
    const ids = formData.getAll('ids').map(String).filter(Boolean)
    const active = formData.get('active') === 'true'
    if (ids.length === 0) return data({ error: 'Select at least one category.' }, { headers, status: 400 })
    const { error } = await supabase.from('cloth_categories').update({ active }).in('id', ids)
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  if (intent === 'delete') {
    const id = String(formData.get('id') ?? '')
    if (!id) return data({ error: 'Category required.' }, { headers, status: 400 })
    const { error } = await supabase.from('cloth_categories').delete().eq('id', id)
    if (error) {
      const message = error.code === '23503'
        ? 'This category is used by existing orders and cannot be deleted. Archive it instead.'
        : error.message
      return data({ error: message }, { headers, status: 400 })
    }
    return data({ ok: true }, { headers, status: 200 })
  }

  if (intent === 'set-main') {
    const id = String(formData.get('id') ?? '')
    if (!id) return data({ error: 'Category required.' }, { headers, status: 400 })
    const { error: clearError } = await supabase.from('cloth_categories').update({ is_main: false }).eq('is_main', true)
    if (clearError) return data({ error: clearError.message }, { headers, status: 400 })
    const { error } = await supabase.from('cloth_categories').update({ is_main: true }).eq('id', id)
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  if (intent === 'update') {
    const id = String(formData.get('id') ?? '')
    const name = String(formData.get('name') ?? '').trim()
    const washPrice = Number(formData.get('washPrice') ?? 0)
    const ironPrice = Number(formData.get('ironPrice') ?? 0)
    const washIronPrice = Number(formData.get('washIronPrice') ?? 0)
    const vendorWashPrice = Number(formData.get('vendorWashPrice') ?? 0)
    const vendorIronPrice = Number(formData.get('vendorIronPrice') ?? 0)
    const vendorWashIronPrice = Number(formData.get('vendorWashIronPrice') ?? 0)
    const subscriptionUnits = Number(formData.get('subscriptionUnits') ?? 1)
    if (!id || !name || !Number.isFinite(washPrice) || !Number.isFinite(ironPrice) || !Number.isFinite(washIronPrice) || !Number.isFinite(vendorWashPrice) || !Number.isFinite(vendorIronPrice) || !Number.isFinite(vendorWashIronPrice) || !Number.isFinite(subscriptionUnits) || subscriptionUnits <= 0) {
      return data({ error: 'Enter a category name, valid prices, and positive units.' }, { headers, status: 400 })
    }
    const { error: categoryError } = await supabase.from('cloth_categories').update({ name }).eq('id', id)
    if (categoryError) return data({ error: categoryError.message }, { headers, status: 400 })
    const { error: rateError } = await supabase.from('cloth_category_rates').update({ wash_price: washPrice, iron_price: ironPrice, wash_iron_price: washIronPrice, vendor_wash_price: vendorWashPrice, vendor_iron_price: vendorIronPrice, vendor_wash_iron_price: vendorWashIronPrice, subscription_units: subscriptionUnits }).eq('category_id', id)
    if (rateError) return data({ error: rateError.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  const name = String(formData.get('name') ?? '').trim()
  const washPrice = Number(formData.get('washPrice') ?? 0)
  const ironPrice = Number(formData.get('ironPrice') ?? 0)
  const washIronPrice = Number(formData.get('washIronPrice') ?? 0)
  const vendorWashPrice = Number(formData.get('vendorWashPrice') ?? 0)
  const vendorIronPrice = Number(formData.get('vendorIronPrice') ?? 0)
  const vendorWashIronPrice = Number(formData.get('vendorWashIronPrice') ?? 0)
  const subscriptionUnits = Number(formData.get('subscriptionUnits') ?? 1)
  if (!name) return data({ error: 'Category name is required.' }, { headers, status: 400 })

  const { data: category, error: categoryError } = await supabase.from('cloth_categories').insert({ name, active: true }).select('id').single()
  if (categoryError) return data({ error: categoryError.message }, { headers, status: 400 })

  const { error: rateError } = await supabase.from('cloth_category_rates').insert({
    category_id: category.id,
    wash_price: washPrice,
    iron_price: ironPrice,
    wash_iron_price: washIronPrice,
    vendor_wash_price: vendorWashPrice,
    vendor_iron_price: vendorIronPrice,
    vendor_wash_iron_price: vendorWashIronPrice,
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
  const [menuPlacement, setMenuPlacement] = useState<'up' | 'down'>('up')
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<CategoryRow | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    if (fetcher.state === 'idle') setIsSubmitting(false)
  }, [fetcher.state])

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data || !('ok' in fetcher.data)) return
    setOpenMenuId(null)
    setEditingCategory(null)
    setDeletingCategory(null)
    setIsAddOpen(false)
    setSelectedIds([])
  }, [fetcher.state, fetcher.data])

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
      {fetcher.state === 'idle' && fetcher.data && 'error' in fetcher.data && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{fetcher.data.error}</div>
      )}
      {!isAddOpen && <div className="flex justify-end">
        <button type="button" onClick={() => setIsAddOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover">
          <Plus size={16} />
          New category
        </button>
      </div>}
      {isAddOpen && <div className="fixed inset-0 z-40 bg-slate-950/35" onClick={() => setIsAddOpen(false)}>
        <button type="button" onClick={(event) => { event.stopPropagation(); setIsAddOpen(false) }} aria-label="Cancel category creation" className="absolute top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900" style={{ right: 'min(572px, calc(100vw - 36px))' }}><X size={17} /></button>
      </div>}
      <section className={`${isAddOpen ? 'fixed inset-y-0 right-0 z-50 w-[calc(100vw-48px)] max-w-[560px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl' : 'hidden'}`}>
        <div className="border-b border-slate-100 px-6 py-5 sm:px-7">
          <div className="flex items-center gap-2">
            <div><h3 className="text-xl font-bold text-slate-900">Add a laundry category</h3></div>
          </div>
        </div>
        <fetcher.Form method="post" onSubmit={handleSubmit} className="flex min-h-[calc(100vh-81px)] flex-col px-6 py-6 sm:px-8">
          <input type="hidden" name="intent" value="create" />
          <div className="space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900">Customer charges</h4>
              <p className="mt-1 text-xs text-slate-500">What customers pay for each service.</p>
            </div>
            <label className="block min-w-0">
            <span className="mb-2.5 block text-xs font-semibold capitalize text-slate-500">Category</span>
            <input name="name" required placeholder="e.g. Bedsheet" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
            <label className="block min-w-0">
            <span className="mb-2.5 block text-xs font-semibold capitalize text-slate-500">Wash</span>
            <input type="number" min="0" step="50" name="washPrice" defaultValue={350} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
            <label className="block min-w-0">
            <span className="mb-2.5 block text-xs font-semibold capitalize text-slate-500">Iron</span>
            <input type="number" min="0" step="50" name="ironPrice" defaultValue={350} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
            <label className="block min-w-0">
            <span className="mb-2.5 block text-xs font-semibold capitalize text-slate-500">Wash + Iron</span>
            <input type="number" min="0" step="50" name="washIronPrice" defaultValue={350} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
            <label className="block min-w-0">
              <span className="mb-2.5 block text-xs font-semibold capitalize text-slate-500">Subscription weight</span>
              <input type="number" min="1" step="1" name="subscriptionUnits" defaultValue={1} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
            </label>
            <div className="border-b border-slate-100 pb-3 pt-5">
              <h4 className="text-sm font-bold text-slate-900">Vendor payouts</h4>
              <p className="mt-1 text-xs text-slate-500">What vendors receive for each service.</p>
            </div>
            <label className="block min-w-0">
            <span className="mb-2 block text-xs font-semibold capitalize text-emerald-700">Wash</span>
            <input type="number" min="0" step="50" name="vendorWashPrice" defaultValue={200} className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
            <label className="block min-w-0">
            <span className="mb-2 block text-xs font-semibold capitalize text-emerald-700">Iron</span>
            <input type="number" min="0" step="50" name="vendorIronPrice" defaultValue={200} className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
            <label className="block min-w-0">
            <span className="mb-2 block text-xs font-semibold capitalize text-emerald-700">Wash + Iron</span>
            <input type="number" min="0" step="50" name="vendorWashIronPrice" defaultValue={350} className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
          </div>
          <div className="sticky bottom-0 mt-auto border-t border-slate-100 bg-white pt-6">
            <button type="submit" disabled={isSubmitting} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSubmitting ? 'Saving...' : 'Apply'}
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
        {selectedIds.length > 0 && <fetcher.Form method="post" className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3"><div className="text-sm font-semibold text-slate-700">{selectedIds.length} selected</div><div className="flex gap-2"><input type="hidden" name="intent" value="bulk-toggle" />{selectedIds.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}<button type="submit" name="active" value="false" disabled={fetcher.state !== 'idle'} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700">Archive selected</button><button type="submit" name="active" value="true" disabled={fetcher.state !== 'idle'} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700">Restore selected</button></div></fetcher.Form>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th rowSpan={2} className="px-5 py-3 align-middle"><input type="checkbox" aria-label="Select all categories" checked={categories.length > 0 && selectedIds.length === categories.length} onChange={(event) => setSelectedIds(event.target.checked ? categories.map((category) => category.id) : [])} /></th>
                <th rowSpan={2} className="px-5 py-3 text-left align-middle font-semibold">Category</th>
                <th colSpan={3} className="border-l border-slate-200 bg-cyan-50/60 px-5 py-3 text-center font-semibold text-cyan-800">Customer charges</th>
                <th colSpan={3} className="border-l border-slate-200 bg-emerald-50/60 px-5 py-3 text-center font-semibold text-emerald-800">Vendor payouts</th>
                <th rowSpan={2} className="px-5 py-3 align-middle font-semibold">Sub weight</th>
                <th rowSpan={2} className="px-5 py-3 align-middle font-semibold">Status</th>
                <th rowSpan={2} aria-label="Category actions" className="px-5 py-3 align-middle font-semibold" />
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="border-l border-slate-200 px-5 py-2 font-semibold">Wash</th>
                <th className="px-5 py-2 font-semibold">Iron</th>
                <th className="px-5 py-2 font-semibold">Wash + Iron</th>
                <th className="border-l border-slate-200 px-5 py-2 font-semibold">Wash</th>
                <th className="px-5 py-2 font-semibold">Iron</th>
                <th className="px-5 py-2 font-semibold">Wash + Iron</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-5 py-8 text-center text-sm text-slate-500">No categories configured yet.</td>
                </tr>
              ) : (
                [...categories].sort((first, second) => Number(second.isMain) - Number(first.isMain)).map((category) => (
                  <tr key={category.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-4"><input type="checkbox" aria-label={`Select ${category.name}`} checked={selectedIds.includes(category.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, category.id] : current.filter((id) => id !== category.id))} /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-primary"><Package size={16} /></span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{category.name} {category.isMain && <span className="ml-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Main</span>}</p>
                          <p className="text-xs text-slate-500">Created {new Date(category.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{money(category.washPrice)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{money(category.ironPrice)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{money(category.washIronPrice)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-emerald-700">{money(category.vendorWashPrice)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-emerald-700">{money(category.vendorIronPrice)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-emerald-700">{money(category.vendorWashIronPrice)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{category.subscriptionUnits}x</td>
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
                            const viewport = event.currentTarget.closest('.overflow-x-auto')
                            const buttonTop = event.currentTarget.getBoundingClientRect().top
                            const viewportTop = viewport?.getBoundingClientRect().top ?? 0
                            setMenuPlacement(buttonTop - viewportTop < 150 ? 'down' : 'up')
                            setOpenMenuId((current) => (current === category.id ? null : category.id))
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-primary hover:text-brand-primary"
                          aria-label={`More actions for ${category.name}`}
                        >
                          <MoreVertical size={16} />
                        </button>

                        {openMenuId === category.id && (
                          <div onClick={(event) => event.stopPropagation()} className={`absolute right-0 z-10 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg ${menuPlacement === 'down' ? 'top-11' : 'bottom-11'}`}>
                            <button type="button" onClick={() => { setEditingCategory(category); setOpenMenuId(null) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                              <Pencil size={14} />
                              Edit
                            </button>
                            {!category.isMain && <fetcher.Form method="post">
                              <input type="hidden" name="intent" value="set-main" />
                              <input type="hidden" name="id" value={category.id} />
                              <button type="submit" disabled={fetcher.state !== 'idle'} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60">Set as main</button>
                            </fetcher.Form>}
                            <fetcher.Form method="post">
                              <input type="hidden" name="intent" value="toggle" />
                              <input type="hidden" name="id" value={category.id} />
                              <button type="submit" disabled={fetcher.state !== 'idle'} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                                {fetcher.state !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : category.active ? <Archive size={14} /> : <CheckCircle2 size={14} />}
                                {category.active ? 'Archive' : 'Restore'}
                              </button>
                            </fetcher.Form>
                            <button type="button" onClick={() => { setDeletingCategory(category); setOpenMenuId(null) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-red-700 transition hover:bg-red-50">
                              <Trash2 size={14} />
                              Delete
                            </button>
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

      {editingCategory && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-950/35" onClick={() => setEditingCategory(null)} />
          <button type="button" onClick={() => setEditingCategory(null)} aria-label="Close category editor" className="absolute top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900" style={{ right: 'min(572px, calc(100vw - 36px))', zIndex: 55 }}><X size={17} /></button>
          <section className="fixed inset-y-0 right-0 z-50 w-[calc(100vw-48px)] max-w-[560px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5 sm:px-7">
              <h3 className="text-xl font-bold text-slate-900">Edit category</h3>
              <p className="mt-1 text-sm text-slate-500">Update the category name and pricing for customer charges and vendor payouts.</p>
            </div>
            <fetcher.Form method="post" className="flex min-h-[calc(100vh-81px)] flex-col px-6 py-6 sm:px-8">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="id" value={editingCategory.id} />
              <div className="space-y-6">
                <label className="block min-w-0">
                  <span className="mb-2.5 block text-xs font-semibold capitalize text-slate-500">Category</span>
                  <input name="name" defaultValue={editingCategory.name} required className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
                </label>

                <div className="border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-bold text-slate-900">Customer charges</h4>
                  <p className="mt-1 text-xs text-slate-500">What customers pay for each service.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block min-w-0">
                    <span className="mb-2.5 block text-xs font-semibold capitalize text-slate-500">Wash</span>
                    <input type="number" min="0" step="50" name="washPrice" defaultValue={editingCategory.washPrice} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-2.5 block text-xs font-semibold capitalize text-slate-500">Iron</span>
                    <input type="number" min="0" step="50" name="ironPrice" defaultValue={editingCategory.ironPrice} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
                  </label>
                  <label className="block min-w-0 sm:col-span-2">
                    <span className="mb-2.5 block text-xs font-semibold capitalize text-slate-500">Wash + Iron</span>
                    <input type="number" min="0" step="50" name="washIronPrice" defaultValue={editingCategory.washIronPrice} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
                  </label>
                </div>

                <div className="border-b border-slate-100 pb-3 pt-2">
                  <h4 className="text-sm font-bold text-slate-900">Vendor payouts</h4>
                  <p className="mt-1 text-xs text-slate-500">What vendors receive for each service.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block min-w-0">
                    <span className="mb-2 block text-xs font-semibold capitalize text-emerald-700">Wash</span>
                    <input type="number" min="0" step="50" name="vendorWashPrice" defaultValue={editingCategory.vendorWashPrice} className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-2 block text-xs font-semibold capitalize text-emerald-700">Iron</span>
                    <input type="number" min="0" step="50" name="vendorIronPrice" defaultValue={editingCategory.vendorIronPrice} className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
                  </label>
                  <label className="block min-w-0 sm:col-span-2">
                    <span className="mb-2 block text-xs font-semibold capitalize text-emerald-700">Wash + Iron</span>
                    <input type="number" min="0" step="50" name="vendorWashIronPrice" defaultValue={editingCategory.vendorWashIronPrice} className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
                  </label>
                </div>

                <label className="block min-w-0">
                  <span className="mb-2.5 block text-xs font-semibold capitalize text-slate-500">Subscription weight</span>
                  <input type="number" min="1" step="1" name="subscriptionUnits" defaultValue={editingCategory.subscriptionUnits} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
                </label>
              </div>

              <div className="sticky bottom-0 mt-auto border-t border-slate-100 bg-white pt-6">
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setEditingCategory(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={fetcher.state !== 'idle'} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70">
                    {fetcher.state !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {fetcher.state !== 'idle' ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            </fetcher.Form>
          </section>
        </>
      )}

      {deletingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-category-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 size={19} />
            </div>
            <h3 id="delete-category-title" className="mt-4 text-xl font-bold text-slate-900">Delete category?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">You are about to permanently delete <strong className="font-semibold text-slate-900">{deletingCategory.name}</strong>. This cannot be undone.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeletingCategory(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</button>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="id" value={deletingCategory.id} />
                <button type="submit" disabled={fetcher.state !== 'idle'} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {fetcher.state !== 'idle' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  Delete category
                </button>
              </fetcher.Form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
