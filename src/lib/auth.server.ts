import { redirect } from 'react-router'
import { getSupabaseServerClient, isSupabaseServerConfigured } from './supabase.server'
import type { UserRole } from '../types/database.types'

export async function requireRole(request: Request, role: UserRole | UserRole[]) {
  if (!isSupabaseServerConfigured) return null

  const { supabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, name, qaffy_id, email, phone')
    .eq('id', userData.user.id)
    .maybeSingle()

  const allowedRoles = Array.isArray(role) ? role : [role]
  const { data: roleAssignments } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('profile_id', userData.user.id)
    .eq('status', 'approved')
  const assignedRoles = new Set((roleAssignments ?? []).map((assignment) => assignment.role))
  const hasAllowedRole = allowedRoles.some((allowedRole) => (
    allowedRole === 'customer' && Boolean(profile)
    || allowedRole !== 'customer' && (assignedRoles.has(allowedRole) || allowedRole === 'admin' && profile?.role === 'admin')
  ))

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

  return { supabase, headers, user: userData.user, profile }
}
