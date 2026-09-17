import { data } from 'react-router'
import type { Route } from './+types/referral-attribution'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../lib/supabase.server'
import { attributeReferral, getReferralCodeFromRequest } from '../lib/referrals.server'

export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })

  const { supabase, headers } = getSupabaseServerClient(request)
  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  const { data: userData, error } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser()

  if (error || !userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const referralCode = getReferralCodeFromRequest(request)
  if (!referralCode) return data({ ok: true, attributed: false }, { headers })

  try {
    const attributed = await attributeReferral(userData.user.id, referralCode)
    headers.append('Set-Cookie', 'qaffy_referral_code=; Max-Age=0; Path=/; SameSite=Lax')
    return data({ ok: true, attributed }, { headers })
  } catch (error) {
    return data({ ok: false, message: error instanceof Error ? error.message : 'Referral attribution failed.' }, { status: 500, headers })
  }
}

export default function ReferralAttribution() {
  return null
}