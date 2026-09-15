import { Check, CircleSlash, MoreVertical, Plus, Search, ShieldCheck, UserRound, X } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { data, useFetcher, useLoaderData, useLocation, useNavigate, useNavigation } from 'react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Database } from '../../../types/database.types'
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
  const intent = String(formData.get('intent') ?? '')
  const { supabase, headers } = auth

  if (intent === 'create') {
    const partnerType = String(formData.get('partnerType') ?? '')
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    if (!['vendor', 'logistics'].includes(partnerType) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return data({ error: 'Enter a valid email address.' }, { headers, status: 400 })
    }

    const role = partnerType === 'vendor' ? 'vendor' : 'logistics'
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const serviceUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
    if (!serviceRoleKey || !serviceUrl) {
      return data({ error: 'Service-role credentials are not configured for partner creation.' }, { headers, status: 500 })
    }

    const serviceSupabase = createClient<Database>(serviceUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const { data: usersData, error: listUsersError } = await serviceSupabase.auth.admin.listUsers()
    if (listUsersError) return data({ error: listUsersError.message }, { headers, status: 400 })
    let profileId = usersData.users.find((user) => user.email?.toLowerCase() === email)?.id

    if (!profileId) {
      const generatedPassword = `Qaffy-${Math.random().toString(36).slice(2, 12)}!`
      const { data: createdUser, error: createUserError } = await serviceSupabase.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { invited_by: auth.profile.id },
      })
      if (createUserError || !createdUser.user) {
        return data({ error: createUserError?.message ?? 'Unable to create this partner account.' }, { headers, status: 400 })
      }
      profileId = createdUser.user.id
    }

    const { error: profileError } = await serviceSupabase.from('profiles').upsert({
      id: profileId,
      email,
      name: email.split('@')[0].replace(/[._-]+/g, ' '),
      phone: null,
      qaffy_id: null,
      role: 'customer',
    }, { onConflict: 'id' })
    if (profileError) return data({ error: profileError.message }, { headers, status: 400 })

    const targetTable = partnerType === 'vendor' ? 'vendors' : 'logistics_agents'

    if (partnerType === 'vendor') {
      const { error: partnerError } = await supabase.from(targetTable).upsert({
        profile_id: profileId,
        business_name: email.split('@')[0],
        status: 'approved',
      }, { onConflict: 'profile_id' })
      if (partnerError) return data({ error: partnerError.message }, { headers, status: 400 })
    } else {
      const { error: partnerError } = await supabase.from(targetTable).upsert({
        profile_id: profileId,
        status: 'approved',
      }, { onConflict: 'profile_id' })
      if (partnerError) return data({ error: partnerError.message }, { headers, status: 400 })
    }

    const { error: roleError } = await supabase.from('profile_roles').upsert({
      profile_id: profileId,
      role,
      status: 'approved',
    }, { onConflict: 'profile_id,role' })
    if (roleError) return data({ error: roleError.message }, { headers, status: 400 })

    const { error: auditError } = await supabase.from('admin_audit_events').insert({
      admin_profile_id: auth.profile.id,
      action: 'partner_created',
      entity_type: partnerType,
      entity_id: profileId,
      metadata: { email, profileId, status: 'pending' },
    })
    if (auditError) return data({ error: auditError.message }, { headers, status: 400 })

    return data({ ok: true }, { headers, status: 200 })
  }

  const partnerType = String(formData.get('partnerType') ?? '')
  const partnerId = String(formData.get('partnerId') ?? '')
  const profileId = String(formData.get('profileId') ?? '')

  if (!['vendor', 'logistics'].includes(partnerType) || !partnerId) {
    return data({ error: 'Invalid partner request.' }, { headers, status: 400 })
  }

  const role = partnerType === 'vendor' ? 'vendor' : 'logistics'
  const table = partnerType === 'vendor' ? 'vendors' : 'logistics_agents'

  if (intent === 'delete') {
    const { error: deletePartnerError } = await supabase.from(table).delete().eq('id', partnerId)
    if (deletePartnerError) return data({ error: deletePartnerError.message }, { headers, status: 400 })

    if (profileId) {
      const { error: roleDeleteError } = await supabase.from('profile_roles').delete().eq('profile_id', profileId).eq('role', role)
      if (roleDeleteError) return data({ error: roleDeleteError.message }, { headers, status: 400 })
    }

    const { error: auditError } = await supabase.from('admin_audit_events').insert({
      admin_profile_id: auth.profile.id,
      action: 'partner_deleted',
      entity_type: partnerType,
      entity_id: partnerId,
      metadata: { profileId, partnerType },
    })
    if (auditError) return data({ error: auditError.message }, { headers, status: 400 })

    return data({ ok: true }, { headers, status: 200 })
  }

  const status = formData.get('status') as PartnerStatus
  if (!statuses.includes(status)) return data({ error: 'Invalid partner status request.' }, { headers, status: 400 })

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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement | null>(null)
  const filtered = useMemo(() => partners.filter((partner) => {
    const text = `${partner.name} ${partner.businessName ?? ''} ${partner.email ?? ''} ${partner.phone ?? ''}`.toLowerCase()
    return (statusFilter === 'all' || partner.status === statusFilter) && text.includes(query.toLowerCase())
  }), [partners, query, statusFilter])
  const isSaving = fetcher.state !== 'idle'

  useEffect(() => {
    if (!openMenuId) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target || !tableRef.current?.contains(target)) {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [openMenuId])

  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
      <div className="relative w-full md:max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${type === 'vendor' ? 'vendors' : 'logistics agents'}`} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
      </div>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PartnerStatus | 'all')} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
        <option value="all">All statuses</option>
        {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
      </select>
    </div>

    <div ref={tableRef} className="overflow-visible">
      <table className="relative z-0 w-full min-w-[760px] text-left overflow-visible">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <th className="px-5 py-3 font-semibold">Partner</th>
            <th className="px-5 py-3 font-semibold">Contact</th>
            <th className="px-5 py-3 font-semibold">Joined</th>
            <th className="px-5 py-3 font-semibold">Status</th>
            <th className="px-5 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((partner) => (
            <tr key={partner.id} className="border-b border-slate-100 last:border-0">
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
                    {type === 'vendor' ? <ShieldCheck size={16} /> : <UserRound size={16} />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{partner.name}</p>
                    {partner.businessName && <p className="truncate text-xs text-slate-500">{partner.businessName}</p>}
                  </div>
                </div>
              </td>
              <td className="px-5 py-4 text-sm text-slate-500">
                <p>{partner.email ?? 'Email unavailable'}</p>
                <p>{partner.phone ?? 'Phone unavailable'}</p>
              </td>
              <td className="px-5 py-4 text-sm text-slate-500">{new Date(partner.createdAt).toLocaleDateString()}</td>
              <td className="px-5 py-4">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[partner.status]}`}>
                  {statusLabels[partner.status]}
                </span>
              </td>
              <td className="relative overflow-visible px-5 py-4 text-right">
                <div className="relative z-10 inline-flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpenMenuId((current) => current === partner.id ? null : partner.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-primary hover:text-brand-primary"
                    aria-label={`More actions for ${partner.name}`}
                    disabled={isSaving}
                  >
                    <MoreVertical size={16} />
                  </button>

                  {openMenuId === partner.id && (
                    <div className="absolute bottom-full right-0 z-[100] mb-2 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                      {partner.status !== 'approved' && (
                        <fetcher.Form method="post">
                          <input type="hidden" name="partnerType" value={type} />
                          <input type="hidden" name="partnerId" value={partner.id} />
                          <input type="hidden" name="profileId" value={partner.profileId} />
                          <input type="hidden" name="status" value="approved" />
                          <button type="submit" disabled={isSaving} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                            <Check size={14} />
                            Approve
                          </button>
                        </fetcher.Form>
                      )}
                      {partner.status !== 'suspended' && (
                        <fetcher.Form method="post">
                          <input type="hidden" name="partnerType" value={type} />
                          <input type="hidden" name="partnerId" value={partner.id} />
                          <input type="hidden" name="profileId" value={partner.profileId} />
                          <input type="hidden" name="status" value="suspended" />
                          <button type="submit" disabled={isSaving} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                            <CircleSlash size={14} />
                            Suspend
                          </button>
                        </fetcher.Form>
                      )}
                      {partner.status !== 'rejected' && (
                        <fetcher.Form method="post">
                          <input type="hidden" name="partnerType" value={type} />
                          <input type="hidden" name="partnerId" value={partner.id} />
                          <input type="hidden" name="profileId" value={partner.profileId} />
                          <input type="hidden" name="status" value="rejected" />
                          <button type="submit" disabled={isSaving} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">
                            <X size={14} />
                            Reject
                          </button>
                        </fetcher.Form>
                      )}
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="partnerType" value={type} />
                        <input type="hidden" name="partnerId" value={partner.id} />
                        <input type="hidden" name="profileId" value={partner.profileId} />
                        <button type="submit" disabled={isSaving} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">
                          <X size={14} />
                          Delete
                        </button>
                      </fetcher.Form>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="p-10 text-center text-sm text-slate-500">No matching partners.</p>}
    </div>
  </section>
}

export function PartnerPage({ type }: { type: 'vendor' | 'logistics' }) {
  const { vendors, logistics } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const navigation = useNavigation()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [email, setEmail] = useState('')
  const partners = type === 'vendor' ? vendors : logistics
  const isSubmitting = fetcher.state !== 'idle' || navigation.state === 'submitting' || navigation.state === 'loading'

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && 'ok' in fetcher.data) {
      setIsCreateOpen(false)
      setEmail('')
    }
  }, [fetcher.data, fetcher.state])

  return <div className="space-y-6">
    {fetcher.state === 'idle' && fetcher.data && 'error' in fetcher.data && (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{fetcher.data.error}</div>
    )}
    {isSubmitting && (
      <div className="flex items-center gap-2 rounded-xl border border-brand-border bg-brand-soft px-4 py-3 text-sm font-medium text-brand-primary">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-primary" />
        Updating partner list…
      </div>
    )}
    {!isCreateOpen && (
      <div className="flex justify-end">
        <button type="button" onClick={() => setIsCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting}>
          <Plus size={16} />
          Add {type === 'vendor' ? 'vendor' : 'logistics agent'}
        </button>
      </div>
    )}
    {isCreateOpen && <div className="fixed inset-0 z-40 bg-slate-950/35" onClick={() => setIsCreateOpen(false)}>
      <button type="button" onClick={(event) => { event.stopPropagation(); setIsCreateOpen(false) }} aria-label="Close partner creation drawer" className="absolute top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900" style={{ right: 'min(572px, calc(100vw - 36px))' }}><X size={17} /></button>
    </div>}
    <section className={`${isCreateOpen ? 'fixed inset-y-0 right-0 z-50 w-[calc(100vw-48px)] max-w-[560px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl' : 'hidden'}`}>
      <div className="border-b border-slate-100 px-6 py-5 sm:px-7">
        <h3 className="text-xl font-bold text-slate-900">Add {type === 'vendor' ? 'vendor' : 'logistics agent'}</h3>
        <p className="mt-1 text-sm text-slate-500">Create a new partner using only their email address.</p>
      </div>
      <fetcher.Form method="post" className="flex min-h-[calc(100vh-81px)] flex-col px-6 py-6 sm:px-8">
        <input type="hidden" name="intent" value="create" />
        <input type="hidden" name="partnerType" value={type} />
        <div className="space-y-6">
          <label className="block min-w-0">
            <span className="mb-2.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Email address</span>
            <input type="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="partner@email.com" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
          </label>
        </div>
        <div className="sticky bottom-0 mt-auto border-t border-slate-100 bg-white pt-6">
          <button type="submit" disabled={isSubmitting} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70">
            {isSubmitting ? 'Creating...' : 'Create partner'}
          </button>
        </div>
      </fetcher.Form>
    </section>
    <PartnerTable type={type} partners={partners} />
  </div>
}

export default function Partners() {
  const { vendors, logistics } = useLoaderData<typeof loader>()
  const location = useLocation()
  const navigate = useNavigate()
  const activeType = location.pathname.endsWith('/logistics') ? 'logistics' : 'vendor'
  return <div className="space-y-6"><div className="flex gap-6 border-b border-slate-200"><button type="button" onClick={() => navigate('/admin/partners/vendors')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${activeType === 'vendor' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-slate-500'}`}>Vendors <span className="ml-1 text-xs">{vendors.length}</span></button><button type="button" onClick={() => navigate('/admin/partners/logistics')} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${activeType === 'logistics' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-slate-500'}`}>Logistics <span className="ml-1 text-xs">{logistics.length}</span></button></div><PartnerTable type={activeType} partners={activeType === 'vendor' ? vendors : logistics} /></div>
}