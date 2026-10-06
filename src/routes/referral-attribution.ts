import type { Route } from './+types/referral-attribution'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../lib/supabase.server'
import { attributeReferral, readReferralCodeFromRequest } from '../lib/referrals.server'

export async function action({ request }: Route.ActionArgs) {
  let responseHeaders = new Headers()

  try {
    if (!isSupabaseServerConfigured) {
      console.error('[referral] Attribution endpoint unavailable', { reason: 'supabase_not_configured' })
      return Response.json({ ok: false, reason: 'service_unavailable' }, { status: 500 })
    }

    const { supabase, headers } = getSupabaseServerClient(request)
    responseHeaders = headers
    const authorization = request.headers.get('Authorization')
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    const { data: userData, error } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser()

    if (error || !userData.user) {
      console.warn('[referral] Attribution request rejected', {
        reason: error ? 'authentication_failed' : 'user_missing',
        errorName: error?.name ?? null,
      })
      return Response.json({ ok: false, reason: 'authentication_required' }, { status: 401, headers })
    }

    const referralCookie = readReferralCodeFromRequest(request)
    console.info('[referral] Attribution request received', { cookieStatus: referralCookie.status })
    if (referralCookie.status === 'missing') {
      return Response.json({ ok: true, attributed: false, reason: 'no_referral_cookie' }, { headers })
    }
    if (referralCookie.status === 'invalid' || !referralCookie.code) {
      headers.append('Set-Cookie', 'qaffy_referral_code=; Max-Age=0; Path=/; SameSite=Lax')
      return Response.json({ ok: false, reason: 'invalid_referral_cookie' }, { status: 400, headers })
    }

    const result = await attributeReferral(userData.user.id, referralCookie.code)
    if (result.attributed) {
      headers.append('Set-Cookie', 'qaffy_referral_code=; Max-Age=0; Path=/; SameSite=Lax')
    }
    return Response.json({ ok: true, ...result }, { headers })
  } catch (error) {
    console.error('[referral] Attribution endpoint failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return Response.json({ ok: false, reason: 'attribution_failed' }, { status: 500, headers: responseHeaders })
  }
}
