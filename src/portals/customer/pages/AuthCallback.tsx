import { redirect } from 'react-router'
import type { Route } from './+types/AuthCallback'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'

// React Router route modules require the loader and component to share this file.
// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const requestedNext = url.searchParams.get('next') ?? '/'
  const callbackRole = url.pathname.startsWith('/vendor/')
    ? 'vendor'
    : url.pathname.startsWith('/logistics/')
      ? 'logistics'
      : url.pathname.startsWith('/admin/')
        ? 'admin'
        : null
  const nextPath = callbackRole ? `/${callbackRole}` : requestedNext.startsWith('/') ? requestedNext : '/'
  const expectedRole = nextPath === '/vendor'
    ? 'vendor'
    : nextPath === '/logistics'
      ? 'logistics'
      : nextPath === '/admin'
        ? 'admin'
        : 'customer'

  if (!isSupabaseServerConfigured || !code) {
    throw redirect('/login')
  }

  const { supabase, headers } = getSupabaseServerClient(request)
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    throw redirect(`/login?error=${encodeURIComponent(error.message)}`, { headers })
  }

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    throw redirect('/login', { headers })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, phone, role, email')
    .eq('id', userData.user.id)
    .maybeSingle()

  const { data: roleAssignment } = expectedRole !== 'customer'
    ? await supabase.from('profile_roles').select('role').eq('profile_id', userData.user.id).eq('role', expectedRole).eq('status', 'approved').maybeSingle()
    : { data: null }
  const hasPortalAccess = expectedRole === 'customer'
    ? true
    : Boolean(roleAssignment) || expectedRole === 'admin' && profile?.role === 'admin'

  if (!hasPortalAccess) {
    const loginPath = expectedRole === 'customer' ? '/login' : `/${expectedRole}/login`
    throw redirect(`${loginPath}?error=${encodeURIComponent('This account is not provisioned for this portal.')}`, { headers })
  }

  let customerProfile: {
    name: string | null
    phone: string | null
    role: string | null
    email: string | null
  } | null = profile

  if (expectedRole === 'customer' && !customerProfile) {
    const { data: createdProfile, error: createProfileError } = await supabase
      .from('profiles')
      .insert({
        id: userData.user.id,
        role: 'customer',
        email: userData.user.email,
        name: userData.user.user_metadata?.full_name ?? userData.user.email?.split('@')[0] ?? 'Customer',
        phone: userData.user.user_metadata?.phone ?? null,
      })
      .select('name, phone, role, email')
      .single()

    if (createProfileError || !createdProfile) {
      throw redirect('/login?error=profile-setup-failed', { headers })
    }

    customerProfile = createdProfile
  }

  if (expectedRole !== 'customer') {
    throw redirect(nextPath, { headers })
  }

  if (!customerProfile?.name || !customerProfile?.phone) {
    throw redirect('/complete-profile', { headers })
  }

  throw redirect('/', { headers })
}

export default function AuthCallback() {
  return null
}