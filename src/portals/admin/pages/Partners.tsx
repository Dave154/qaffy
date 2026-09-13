import { Check, CircleSlash, Search, ShieldCheck, UserRound, X } from 'lucide-react'
import { data, useFetcher, useLoaderData, useLocation, useNavigate } from 'react-router'
import { useMemo, useState } from 'react'
import type { Route } from './+types/Partners'
import { requireRole } from '../../../lib/auth.server'

type PartnerStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
type Partner = { id: string; profileId: string; name: string; email: string | null; phone: string | null; status: PartnerStatus; createdAt: string; businessName?: string }
type PartnersData = { vendors: Partner[]; logistics: Partner[] }

const statuses: PartnerStatus[] = ['pending', 'approved', 'rejected', 'suspended']
const statusStyles: Record<PartnerStatus, string> = { pending: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-red-50 text-red-700', suspended: 'bg-slate-100 text-slate-600' }
const statusLabels: Record<PartnerStatus, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended' }

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data<PartnersData>({ vendors: [], logistics: [] }, { status: 200 })
  const { supabase, headers } = auth
  const [{ data: vendorRows }, { data: logisticsRows }] = await Promise.all([
    supabase.from('vendors').select('id, profile_id, business_name, status, created_at').order('created_at', { ascending: false }),
    supabase.from('logistics_agents').select('id, profile_id, status, created_at').order('created_at', { ascending: false }),
  ])
  const profileIds = [...new Set([...(vendorRows ?? []).map((row) => row.profile_id), ...(logisticsRows ?? []).map((row) => row.profile_id)])]
  const { data: profiles } = profileIds.length ? await supabase.from('profiles').select('id, name, email, phone').in('id', profileIds) : { data: [] }
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  return data<PartnersData>({
    vendors: (vendorRows ?? []).map((row) => ({ id: row.id, profileId: row.profile_id, name: profileById.get(row.profile_id)?.name ?? row.business_name, email: profileById.get(row.profile_id)?.email ?? null, phone: profileById.get(row.profile_id)?.phone ?? null, status: row.status, createdAt: row.created_at, businessName: row.business_name })),
    logistics: (logisticsRows ?? []).map((row) => ({ id: row.id, profileId: row.profile_id, name: profileById.get(row.profile_id)?.name ?? 'Unnamed agent', email: profileById.get(row.profile_id)?.email ?? null, phone: profileById.get(row.profile_id)?.phone ?? null, status: row.status, createdAt: row.created_at })),
  }, { headers, status: 200 })
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data({ error: 'Admin access required.' }, { status: 403 })
  const formData = await request.formData()
  const partnerType = formData.get('partnerType')
  const partnerId = String(formData.get('partnerId') ?? '')
  const profileId = String(formData.get('profileId') ?? '')
  const status = formData.get('status') as PartnerStatus
  if (!['vendor', 'logistics'].includes(String(partnerType)) || !partnerId || !profileId || !statuses.includes(status)) return data({ error: 'Invalid partner status request.' }, { status: 400 })
  const role = partnerType === 'vendor' ? 'vendor' : 'logistics'
  const table = partnerType === 'vendor' ? 'vendors' : 'logistics_agents'
  const { supabase, headers } = auth
  if (formData.get('intent') === 'bulk-status') {
    const ids = formData.getAll('ids').map(String).filter(Boolean)
    if (ids.length === 0 || !statuses.includes(status)) return data({ error: 'Select partners and a valid status.' }, { headers, status: 400 })
    const { data: selectedPartners, error: selectedError } = await supabase.from(table).select('profile_id').in('id', ids)
    if (selectedError) return data({ error: selectedError.message }, { headers, status: 400 })
    const { error: bulkError } = await supabase.from(table).update({ status }).in('id', ids)
    if (bulkError) return data({ error: bulkError.message }, { headers, status: 400 })
    const roleUpdates = await Promise.all((selectedPartners ?? []).map((partner) => supabase.from('profile_roles').upsert({ profile_id: partner.profile_id, role, status }, { onConflict: 'profile_id,role' })))
    const roleError = roleUpdates.find((result) => result.error)?.error
    if (roleError) return data({ error: roleError.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }
  const { data: currentPartner, error: currentError } = await supabase.from(table).select('status').eq('id', partnerId).maybeSingle()
  if (currentError) return data({ error: currentError.message }, { headers, status: 400 })
  const { error: partnerError } = await supabase.from(table).update({ status }).eq('id', partnerId)
  if (partnerError) return data({ error: partnerError.message }, { headers, status: 400 })
  const { error: roleError } = await supabase.from('profile_roles').upsert({ profile_id: profileId, role, status }, { onConflict: 'profile_id,role' })
  if (roleError) return data({ error: roleError.message }, { headers, status: 400 })
  const { error: auditError } = await supabase.from('admin_audit_events').insert({
    admin_profile_id: auth.profile.id,
    action: 'partner_status_changed',
    entity_type: String(partnerType),
    entity_id: partnerId,
    metadata: { profileId, fromStatus: currentPartner?.status ?? null, toStatus: status },
  })
  if (auditError) return data({ error: auditError.message }, { headers, status: 400 })
  return data({ ok: true }, { headers, status: 200 })
}

function PartnerTable({ type, partners }: { type: 'vendor' | 'logistics'; partners: Partner[] }) {
  const fetcher = useFetcher<typeof action>()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<PartnerStatus | 'all'>('all')
  const filtered = useMemo(() => partners.filter((partner) => {
    const text = `${partner.name} ${partner.businessName ?? ''} ${partner.email ?? ''} ${partner.phone ?? ''}`.toLowerCase()
    return (statusFilter === 'all' || partner.status === statusFilter) && text.includes(query.toLowerCase())
  }), [partners, query, statusFilter])
  const isSaving = fetcher.state !== 'idle'
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between"><div className="relative w-full md:max-w-md"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${type === 'vendor' ? 'vendors' : 'logistics agents'}`} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PartnerStatus | 'all')} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500"><th className="px-5 py-3 font-semibold">Partner</th><th className="px-5 py-3 font-semibold">Contact</th><th className="px-5 py-3 font-semibold">Joined</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody>{filtered.map((partner) => <tr key={partner.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-primary">{type === 'vendor' ? <ShieldCheck size={16} /> : <UserRound size={16} />}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{partner.name}</p>{partner.businessName && <p className="truncate text-xs text-slate-500">{partner.businessName}</p>}</div></div></td><td className="px-5 py-4 text-sm text-slate-500"><p>{partner.email ?? 'Email unavailable'}</p><p>{partner.phone ?? 'Phone unavailable'}</p></td><td className="px-5 py-4 text-sm text-slate-500">{new Date(partner.createdAt).toLocaleDateString()}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[partner.status]}`}>{statusLabels[partner.status]}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><fetcher.Form method="post"><input type="hidden" name="partnerType" value={type} /><input type="hidden" name="partnerId" value={partner.id} /><input type="hidden" name="profileId" value={partner.profileId} />{partner.status !== 'approved' && <button name="status" value="approved" disabled={isSaving} title="Approve" className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><Check size={15} /></button>}</fetcher.Form><fetcher.Form method="post"><input type="hidden" name="partnerType" value={type} /><input type="hidden" name="partnerId" value={partner.id} /><input type="hidden" name="profileId" value={partner.profileId} />{partner.status !== 'suspended' && <button name="status" value="suspended" disabled={isSaving} title="Suspend" className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50"><CircleSlash size={15} /></button>}</fetcher.Form><fetcher.Form method="post"><input type="hidden" name="partnerType" value={type} /><input type="hidden" name="partnerId" value={partner.id} /><input type="hidden" name="profileId" value={partner.profileId} />{partner.status !== 'rejected' && <button name="status" value="rejected" disabled={isSaving} title="Reject" className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"><X size={15} /></button>}</fetcher.Form></div></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="p-10 text-center text-sm text-slate-500">No matching partners.</p>}</div></section>
}

export function PartnerPage({ type }: { type: 'vendor' | 'logistics' }) {
  const { vendors, logistics } = useLoaderData<typeof loader>()
  const partners = type === 'vendor' ? vendors : logistics
  return <div className="space-y-6"><PartnerTable type={type} partners={partners} /></div>
}

export default function Partners() {
  const { vendors, logistics } = useLoaderData<typeof loader>()
  const location = useLocation()
  const navigate = useNavigate()
  const activeType = location.pathname.endsWith('/logistics') ? 'logistics' : 'vendor'
  return <div className="space-y-6"><div className="flex gap-6 border-b border-slate-200"><button type="button" onClick={() => navigate('/admin/partners/vendors')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${activeType === 'vendor' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-slate-500'}`}>Vendors <span className="ml-1 text-xs">{vendors.length}</span></button><button type="button" onClick={() => navigate('/admin/partners/logistics')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${activeType === 'logistics' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-slate-500'}`}>Logistics <span className="ml-1 text-xs">{logistics.length}</span></button></div><PartnerTable type={activeType} partners={activeType === 'vendor' ? vendors : logistics} /></div>
}