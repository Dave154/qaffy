import { sql } from '@/lib/db.server'

export const referralCookieName = 'qaffy_referral_code'

function normalizeReferralCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? ''
  return /^QF[A-Z0-9]{6}$/.test(code) ? code : null
}

export function getReferralCodeFromRequest(request: Request) {
  const cookieHeader = request.headers.get('Cookie') ?? ''
  const value = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${referralCookieName}=`))
    ?.slice(referralCookieName.length + 1)

  return normalizeReferralCode(value ? decodeURIComponent(value) : null)
}

/**
 * Attributes a referral only for a newly-created customer profile.
 * The direct database transaction is intentional: referral attribution is not a client write.
 */
export async function attributeReferral(profileId: string, referralCode: string) {
  const normalizedCode = normalizeReferralCode(referralCode)
  if (!normalizedCode) return false

  return sql.begin(async (tx) => {
    await tx`select set_config('qaffy.referral_attribution', 'true', true)`

    const [profile] = await tx`
      select p.id, p.referred_by, p.created_at, u.created_at as auth_created_at
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.id = ${profileId}
      for update of p
    `
    if (!profile || profile.referred_by || new Date(profile.created_at) < new Date(profile.auth_created_at)) return false

    const [referrer] = await tx`
      select id
      from public.profiles
      where referral_code = ${normalizedCode}
        and role = 'customer'
        and id <> ${profileId}
      limit 1
    `
    if (!referrer) return false

    const [updatedProfile] = await tx`
      update public.profiles
      set referred_by = ${referrer.id}
      where id = ${profileId} and referred_by is null
      returning id
    `
    if (!updatedProfile) return false

    await tx`
      insert into public.referrals (referrer_id, referred_id, status, attributed_at)
      values (${referrer.id}, ${profileId}, 'pending', now())
      on conflict (referred_id) do nothing
    `

    return true
  })
}