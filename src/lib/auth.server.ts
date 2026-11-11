import { redirect } from 'react-router'
import { getClaimsUser, getSupabaseServerClient, isSupabaseServerConfigured } from './supabase.server'
import { sql } from './db.server'
import type { UserRole } from '../types/database.types'

export async function requireLogisticsOtpRole(request: Request) {
  if (!isSupabaseServerConfigured) return null

  const { supabase, headers } = getSupabaseServerClient(request)
  const claimsStartedAt = performance.now()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const claimsMs = performance.now() - claimsStartedAt
  const profileId = claimsData?.claims.sub

  if (claimsError || typeof profileId !== 'string') {
    throw redirect('/logistics/login', { headers })
  }

  const roleCheckStartedAt = performance.now()
  const [profile] = await sql`
    select p.id, p.name
    from public.profiles p
    where p.id = ${profileId}
      and exists (
        select 1
        from public.profile_roles pr
        where pr.profile_id = p.id
          and pr.role = 'logistics'
          and pr.status = 'approved'
      )
    limit 1
  `
  const roleCheckMs = performance.now() - roleCheckStartedAt

  if (!profile) throw redirect('/logistics/login', { headers })

  return {
    headers,
    profile,
    timing: {
      claimsMs,
      roleCheckMs,
      totalMs: performance.now() - claimsStartedAt,
    },
  }
}

export async function requireRole(request: Request, role: UserRole | UserRole[]) {
  if (!isSupabaseServerConfigured) return null

  const { supabase, headers } = getSupabaseServerClient(request)
  // Verified JWT claims instead of an Auth API round trip on every loader/revalidation.
  // Role approval is still checked against the database below on every request.
  const user = await getClaimsUser(supabase)
  if (!user) {
    const pathname = new URL(request.url).pathname
    const loginPath = pathname.startsWith('/vendor')
      ? '/vendor/login'
      : pathname.startsWith('/logistics')
        ? '/logistics/login'
        : pathname.startsWith('/admin')
          ? '/admin/login'
          : '/login'
    throw redirect(loginPath, { headers })
  }

  const allowedRoles = Array.isArray(role) ? role : [role]
  const [{ data: profile }, { data: roleAssignments }] = await Promise.all([
    supabase.from('profiles').select('id, role, name, qaffy_id, email, phone').eq('id', user.id).maybeSingle(),
    supabase.from('profile_roles').select('role').eq('profile_id', user.id).eq('status', 'approved'),
  ])
  const assignedRoles = new Set((roleAssignments ?? []).map((assignment) => assignment.role))
  const hasAllowedRole = allowedRoles.some(
    (allowedRole) =>
      (allowedRole === 'customer' && Boolean(profile)) ||
      (allowedRole !== 'customer' && (assignedRoles.has(allowedRole) || (allowedRole === 'admin' && profile?.role === 'admin'))),
  )

  if (!profile || !hasAllowedRole) {
    const destination = allowedRoles.includes('vendor')
      ? '/vendor/login'
      : allowedRoles.includes('logistics')
        ? '/logistics/login'
        : allowedRoles.includes('admin')
          ? '/admin/login'
          : '/login'
    throw redirect(destination, { headers })
  }

  return { supabase, headers, user, profile }
}
