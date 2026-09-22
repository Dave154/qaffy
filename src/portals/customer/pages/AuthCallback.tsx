import { redirect } from 'react-router'
import type { Route } from './+types/AuthCallback'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { attributeReferral, getReferralCodeFromRequest } from '../../../lib/referrals.server'

function getCallbackErrorMessage(role: string | null, error: string | null, description: string | null) {
  if (error === 'access_denied' || description?.toLowerCase().includes('cancel')) return 'Google sign-in was cancelled.'
  if (description || error) return role ? `Google sign-in could not be completed. Please try again.` : description || error || 'Sign-in could not be completed. Please try again.'
  return role ? 'Google sign-in did not complete. Please try again.' : 'Sign-in did not complete. Please try again.'
}

// React Router route modules require the loader and component to share this file.
// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const callbackError = url.searchParams.get('error')
  const callbackErrorDescription = url.searchParams.get('error_description')
  const requestedNext = url.searchParams.get('next') ?? '/'
  const callbackRole = url.pathname.startsWith('/vendor/')
    ? 'vendor'
    : url.pathname.startsWith('/logistics/')
      ? 'logistics'
      : url.pathname.startsWith('/admin/')
        ? 'admin'
        : null
        const portalLoginPath = callbackRole ? `/${callbackRole}/login` : '/login'
  const nextPath = callbackRole ? `/${callbackRole}` : requestedNext.startsWith('/') ? requestedNext : '/'
  const expectedRole = nextPath === '/vendor'
    ? 'vendor'
    : nextPath === '/logistics'
      ? 'logistics'
      : nextPath === '/admin'
        ? 'admin'
        : 'customer'

  if (!isSupabaseServerConfigured || !code) {
    const message = getCallbackErrorMessage(callbackRole, callbackError, callbackErrorDescription)
    throw redirect(`${portalLoginPath}?error=${encodeURIComponent(message)}`)
  }

  const { supabase, headers } = getSupabaseServerClient(request)
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const message = getCallbackErrorMessage(callbackRole, 'exchange_failed', error.message)
    throw redirect(`${portalLoginPath}?error=${encodeURIComponent(message)}`, { headers })
  }

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    throw redirect(portalLoginPath, { headers })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, phone, role, email')
    .eq('id', userData.user.id)
    .maybeSingle()

  const { data: roleAssignment } = expectedRole !== 'customer'
    ? await supabase.from('profile_roles').select('role').eq('profile_id', userData.user.id).eq('role', expectedRole).eq('status', 'approved').maybeSingle()
    : { data: null }
  const { data: vendorAccount } = expectedRole === 'vendor'
    ? await supabase.from('vendors').select('id').eq('profile_id', userData.user.id).eq('status', 'approved').maybeSingle()
    : { data: null }
  const { data: logisticsAccount } = expectedRole === 'logistics'
    ? await supabase.from('logistics_agents').select('id').eq('profile_id', userData.user.id).eq('status', 'approved').maybeSingle()
    : { data: null }
  const hasPortalAccess = expectedRole === 'customer'
    ? true
    : expectedRole === 'vendor'
      ? Boolean(roleAssignment) && Boolean(vendorAccount)
      : expectedRole === 'logistics'
        ? Boolean(roleAssignment) && Boolean(logisticsAccount)
      : Boolean(roleAssignment) || expectedRole === 'admin' && profile?.role === 'admin'

  if (!hasPortalAccess) {
    await supabase.auth.signOut()
    const message = expectedRole === 'vendor'
      ? 'This email is not registered to an approved vendor account.'
      : expectedRole === 'logistics'
        ? 'This email is not registered to an approved logistics account.'
        : expectedRole === 'admin'
          ? 'This email is not approved for admin access.'
          : 'This account is not provisioned for this portal.'
    throw redirect(`${portalLoginPath}?error=${encodeURIComponent(message)}`, { headers })
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
    if (!profile?.name || !profile?.phone) {
      const completeProfilePath = expectedRole === 'vendor' ? '/vendor/complete-profile' : '/logistics/complete-profile'
      throw redirect(`${completeProfilePath}?next=${encodeURIComponent(nextPath)}`, { headers })
    }
    throw redirect(nextPath, { headers })
  }

  const referralCode = getReferralCodeFromRequest(request)
  if (expectedRole === 'customer' && referralCode) {
    try {
      await attributeReferral(userData.user.id, referralCode)
      headers.append('Set-Cookie', 'qaffy_referral_code=; Max-Age=0; Path=/; SameSite=Lax')
    } catch {
      // Keep authentication successful; a later authenticated attribution attempt can retry safely.
    }
  }

  if (!customerProfile?.name || !customerProfile?.phone) {
    throw redirect('/complete-profile', { headers })
  }

  throw redirect('/', { headers })
}

export default function AuthCallback() {
  return null
}