import { AlertTriangle, ArrowRight, CheckCircle2, Search, ShieldAlert } from 'lucide-react'
import { data, useFetcher, useLoaderData } from 'react-router'
import { useMemo, useState } from 'react'
import type { Route } from './+types/Mismatches'
import { requireRole } from '../../../lib/auth.server'

type MismatchRow = {
  id: string
  orderId: string
  direction: 'over' | 'under'
  detail: string | null
  createdAt: string
  customerName: string | null
  qaffyId: string | null
  orderStatus: string | null
  customerCount: number
  vendorCount: number | null
  pickupLocation: string | null
}

type MismatchesData = { mismatches: MismatchRow[] }

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data<MismatchesData>({ mismatches: [] }, { status: 200 })
  const { supabase, headers } = auth
  const { data: mismatchRows } = await supabase
    .from('mismatches')
    .select('id, order_id, direction, detail, created_at, resolved_at')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })

  const orderIds = [...new Set((mismatchRows ?? []).map((row) => row.order_id))]
  type OrderRecord = {
    id: string
    customer_id: string
    status: string | null
    clothes_count_customer: number | null
    clothes_count_vendor: number | null
    pickup_location_id: string | null
  }
  type ProfileRecord = { id: string; qaffy_id: string | null; name: string | null }

  const ordersResult = orderIds.length
    ? await supabase.from('orders').select('id, customer_id, status, clothes_count_customer, clothes_count_vendor, pickup_location_id').in('id', orderIds)
    : { data: [] as OrderRecord[] }
  const orders = (ordersResult.data ?? []) as OrderRecord[]
  const customerIds = [...new Set(orders.map((order) => order.customer_id))]
  const profilesResult = customerIds.length
    ? await supabase.from('profiles').select('id, qaffy_id, name').in('id', customerIds)
    : { data: [] as ProfileRecord[] }

  const profiles = (profilesResult.data ?? []) as ProfileRecord[]
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const locationIds = [...new Set(orders.map((order) => order.pickup_location_id).filter(Boolean))] as string[]
  const { data: locations } = locationIds.length ? await supabase.from('pickup_locations').select('id, name').in('id', locationIds) : { data: [] }
  const locationById = new Map((locations ?? []).map((location) => [location.id, location.name]))

  return data<MismatchesData>({
    mismatches: (mismatchRows ?? []).map((row) => {
      const order = (orders ?? []).find((item) => item.id === row.order_id)
      const profile = order ? profileById.get(order.customer_id) ?? null : null
      return {
        id: row.id,
        orderId: row.order_id,
        direction: row.direction,
        detail: row.detail,
        createdAt: row.created_at,
        customerName: profile?.name ?? 'Unknown customer',
        qaffyId: profile?.qaffy_id ?? null,
        orderStatus: order?.status ?? null,
        customerCount: Number(order?.clothes_count_customer ?? 0),
        vendorCount: order ? Number(order.clothes_count_vendor ?? 0) : null,
        pickupLocation: order?.pickup_location_id ? locationById.get(order.pickup_location_id) ?? 'Location pending' : 'Location pending',
      }
    }),
  }, { headers, status: 200 })
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data({ error: 'Admin access required.' }, { status: 403 })
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  if (intent !== 'resolve') return data({ error: 'Invalid mismatch action.' }, { status: 400 })

  const mismatchId = String(formData.get('mismatchId') ?? '')
  if (!mismatchId) return data({ error: 'Mismatch is required.' }, { status: 400 })

  const { supabase, headers } = auth
  const { error } = await supabase
    .from('mismatches')
    .update({ resolved_at: new Date().toISOString(), resolved_by: auth.profile.id })
    .eq('id', mismatchId)
    .is('resolved_at', null)
  if (error) return data({ error: error.message }, { headers, status: 400 })

  const { error: auditError } = await supabase.from('admin_audit_events').insert({
    admin_profile_id: auth.profile.id,
    action: 'mismatch_reviewed',
    entity_type: 'mismatch',
    entity_id: mismatchId,
    metadata: {},
  })
  if (auditError) return data({ error: auditError.message }, { headers, status: 400 })

  return data({ ok: true }, { headers, status: 200 })
}

const directionLabels = { over: 'Over count', under: 'Under count' }
const directionStyles = { over: 'bg-amber-50 text-amber-700', under: 'bg-violet-50 text-violet-700' }
const orderStatusLabels: Record<string, string> = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Picked up',
  at_vendor: 'At vendor',
  invoiced: 'Awaiting review',
  paid: 'Paid',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export default function Mismatches() {
  const { mismatches } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const [query, setQuery] = useState('')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'over' | 'under'>('all')

  const filteredMismatches = useMemo(() => mismatches.filter((mismatch) => {
    const text = `${mismatch.orderId} ${mismatch.customerName ?? ''} ${mismatch.qaffyId ?? ''} ${mismatch.detail ?? ''} ${mismatch.pickupLocation ?? ''}`.toLowerCase()
    return (directionFilter === 'all' || mismatch.direction === directionFilter) && text.includes(query.toLowerCase())
  }), [mismatches, query, directionFilter])

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertTriangle size={16} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Mismatch review</h3>
              <p className="text-sm text-slate-500">Review unexpected counts before finance is treated as final.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 md:max-w-lg md:flex-row">
            <div className="relative w-full">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, or detail" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
            </div>
            <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as 'all' | 'over' | 'under')} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus">
              <option value="all">All mismatches</option>
              <option value="over">Over count</option>
              <option value="under">Under count</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="px-5 py-3 font-semibold">Order</th>
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Location</th>
                <th className="px-5 py-3 font-semibold">Count</th>
                <th className="px-5 py-3 font-semibold">Direction</th>
                <th className="px-5 py-3 font-semibold">Detail</th>
                <th className="px-5 py-3 font-semibold">Created</th>
                <th className="px-5 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredMismatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">No mismatch records need review.</td>
                </tr>
              ) : (
                filteredMismatches.map((mismatch) => (
                  <tr key={mismatch.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{mismatch.orderId}</p>
                        <p className="mt-1 text-xs text-slate-500">{mismatch.orderStatus ? orderStatusLabels[mismatch.orderStatus] ?? mismatch.orderStatus : 'Status pending'}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{mismatch.customerName}</p>
                        <p className="truncate text-xs text-slate-500">{mismatch.qaffyId ?? 'Qaffy ID unavailable'}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{mismatch.pickupLocation ?? 'Location pending'}</td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <div className="flex flex-col gap-0.5">
                        <span>Customer: {mismatch.customerCount}</span>
                        <span>Vendor: {mismatch.vendorCount ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${directionStyles[mismatch.direction]}`}>
                        <ShieldAlert size={12} />
                        {directionLabels[mismatch.direction]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <div className="max-w-md break-words">{mismatch.detail ?? 'No mismatch notes were supplied.'}</div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">{formatDate(mismatch.createdAt)}</td>
                    <td className="px-5 py-4">
                      <fetcher.Form method="post" className="flex justify-end">
                        <input type="hidden" name="intent" value="resolve" />
                        <input type="hidden" name="mismatchId" value={mismatch.id} />
                        <button
                          type="submit"
                          disabled={fetcher.state !== 'idle'}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {fetcher.state !== 'idle' ? <ArrowRight size={14} className="animate-pulse" /> : <CheckCircle2 size={14} />}
                          Mark reviewed
                        </button>
                      </fetcher.Form>
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
