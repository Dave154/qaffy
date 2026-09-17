import { CheckCircle2, Loader2, Plus, ShieldCheck } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { data, useFetcher, useLoaderData } from 'react-router'
import type { Route } from './+types/Admins'
import type { Database } from '../../../types/database.types'
import { requireRole } from '../../../lib/auth.server'

type AdminRow = {
  profileId: string
  name: string
  email: string | null
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  createdAt: string
}

type AdminsData = { admins: AdminRow[] }

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data<AdminsData>({ admins: [] }, { status: 200 })

  const { data: assignments, error } = await auth.supabase
    .from('profile_roles')
    .select('profile_id, status, created_at')
    .eq('role', 'admin')
    .order('created_at', { ascending: false })

  if (error) return data<AdminsData>({ admins: [] }, { headers: auth.headers, status: 200 })

  const profileIds = (assignments ?? []).map((assignment) => assignment.profile_id)
  const { data: profiles } = profileIds.length > 0
    ? await auth.supabase.from('profiles').select('id, name, email').in('id', profileIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))

  return data<AdminsData>({
    admins: (assignments ?? []).map((assignment) => ({
      profileId: assignment.profile_id,
      name: profileById.get(assignment.profile_id)?.name ?? 'Unnamed admin',
      email: profileById.get(assignment.profile_id)?.email ?? null,
      status: assignment.status,
      createdAt: assignment.created_at,
    })),
  }, { headers: auth.headers, status: 200 })
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data({ error: 'Admin access required.' }, { status: 403 })

  const formData = await request.formData()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return data({ error: 'Enter a valid admin email address.' }, { headers: auth.headers, status: 400 })

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const serviceUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  if (!serviceRoleKey || !serviceUrl) return data({ error: 'Service-role credentials are not configured for admin provisioning.' }, { headers: auth.headers, status: 500 })

  const serviceSupabase = createClient<Database>(serviceUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: usersData, error: listUsersError } = await serviceSupabase.auth.admin.listUsers()
  if (listUsersError) return data({ error: listUsersError.message }, { headers: auth.headers, status: 400 })

  let profileId = usersData.users.find((user) => user.email?.toLowerCase() === email)?.id
  if (!profileId) {
    const generatedPassword = `Qaffy-${Math.random().toString(36).slice(2, 12)}!`
    const { data: createdUser, error: createUserError } = await serviceSupabase.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: { invited_by: auth.profile.id, invited_role: 'admin' },
    })
    if (createUserError || !createdUser.user) return data({ error: createUserError?.message ?? 'Unable to create the admin account.' }, { headers: auth.headers, status: 400 })
    profileId = createdUser.user.id
  }

  const { error: profileError } = await serviceSupabase.from('profiles').upsert({
    id: profileId,
    email,
    name: email.split('@')[0].replace(/[._-]+/g, ' '),
    phone: null,
    role: 'customer',
  }, { onConflict: 'id' })
  if (profileError) return data({ error: profileError.message }, { headers: auth.headers, status: 400 })

  const { error: roleError } = await serviceSupabase.from('profile_roles').upsert({
    profile_id: profileId,
    role: 'admin',
    status: 'approved',
  }, { onConflict: 'profile_id,role' })
  if (roleError) return data({ error: roleError.message }, { headers: auth.headers, status: 400 })

  const { error: auditError } = await auth.supabase.from('admin_audit_events').insert({
    admin_profile_id: auth.profile.id,
    action: 'admin_access_granted',
    entity_type: 'profile',
    entity_id: profileId,
    metadata: { email, profileId, status: 'approved' },
  })
  if (auditError) return data({ error: auditError.message }, { headers: auth.headers, status: 400 })

  return data({ ok: true }, { headers: auth.headers })
}

export default function Admins() {
  const { admins } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const isSaving = fetcher.state !== 'idle'

  return (
    <div className="space-y-6">
      {fetcher.state === 'idle' && fetcher.data && 'error' in fetcher.data && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{fetcher.data.error}</div>}
      {fetcher.state === 'idle' && fetcher.data && 'ok' in fetcher.data && fetcher.data.ok && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">Admin access granted. They can sign in with their email.</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-primary"><Plus size={17} /></div>
          <div><h3 className="text-lg font-bold text-slate-900">Add an admin</h3><p className="text-sm text-slate-500">Grant approved Admin portal access to an existing or new email account.</p></div>
        </div>
        <fetcher.Form method="post" className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="min-w-0 flex-1"><span className="sr-only">Admin email address</span><input name="email" type="email" required placeholder="admin@example.com" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" /></label>
          <button type="submit" disabled={isSaving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70">{isSaving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}{isSaving ? 'Granting access...' : 'Grant admin access'}</button>
        </fetcher.Form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 p-4"><ShieldCheck size={17} className="text-brand-primary" /><h3 className="text-lg font-bold text-slate-900">Admin accounts</h3></div>
        <div className="divide-y divide-slate-100">{admins.length === 0 ? <p className="p-5 text-sm text-slate-500">No admin accounts found.</p> : admins.map((admin) => <div key={admin.profileId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-semibold text-slate-900">{admin.name}</p><p className="mt-1 text-sm text-slate-500">{admin.email ?? 'No email recorded'}</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">Added {new Date(admin.createdAt).toLocaleDateString()}</span><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${admin.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{admin.status === 'approved' && <CheckCircle2 size={12} />}{admin.status}</span></div></div>)}</div>
      </section>
    </div>
  )
}