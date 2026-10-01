import { sql } from '@/lib/db.server'
import { sendCustomerNotification } from './notifications.server'

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
async function notifyReferrerOfNewReferral(referrerId: string, referredProfileId: string, referralId: string) {
  const [campaign] = await sql`
    select c.name as campaign_name, c.referrer_reward_value
    from public.referral_campaigns c
    where c.status = 'active'
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at > now())
    order by c.starts_at desc nulls last, c.created_at desc
    limit 1
  `
  const [referredProfile] = await sql`
    select name
    from public.profiles
    where id = ${referredProfileId}
    limit 1
  `

  const rewardAmount = campaign ? Number(campaign.referrer_reward_value) : null
  const referredName = referredProfile?.name ?? 'a new customer'
  const rewardText = rewardAmount !== null ? ` Your pending reward is ₦${rewardAmount.toLocaleString()}.` : ''

  await sendCustomerNotification({
    eventKey: `referral-signup:${referralId}`,
    customerId: referrerId,
    notificationType: 'referral_signup',
    payload: {
      title: 'New referral joined',
      body: `${referredName} signed up using your referral link.${rewardText} The reward stays pending until they complete the qualifying action.`,
      details: [
        'Referral recorded successfully.',
        rewardAmount !== null ? `Pending reward: ₦${rewardAmount.toLocaleString()}` : 'Reward timing is based on the campaign rules.',
        'This reward is only added after the qualifying action is completed.',
      ],
      url: '/settings#referrals',
      tag: `referral:${referralId}`,
    },
  })
}

export async function attributeReferral(profileId: string, referralCode: string) {
  const normalizedCode = normalizeReferralCode(referralCode)
  if (!normalizedCode) return false

  const attribution = await sql.begin(async (tx) => {
    await tx`select set_config('qaffy.referral_attribution', 'true', true)`

    const [profile] = await tx`
      select p.id, p.referred_by, p.created_at, u.created_at as auth_created_at
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.id = ${profileId}
      for update of p
    `
    if (!profile || profile.referred_by || new Date(profile.created_at) < new Date(profile.auth_created_at)) return null

    const [referrer] = await tx`
      select id
      from public.profiles
      where referral_code = ${normalizedCode}
        and role = 'customer'
        and id <> ${profileId}
      limit 1
    `
    if (!referrer) return null

    const [updatedProfile] = await tx`
      update public.profiles
      set referred_by = ${referrer.id}
      where id = ${profileId} and referred_by is null
      returning id
    `
    if (!updatedProfile) return null

    const [referral] = await tx`
      insert into public.referrals (referrer_id, referred_id, status, attributed_at)
      values (${referrer.id}, ${profileId}, 'pending', now())
      on conflict (referred_id) do nothing
      returning id, referrer_id
    `
    if (!referral) return null

    return { referrerId: referral.referrer_id, referralId: referral.id }
  })

  if (!attribution) return false

  await notifyReferrerOfNewReferral(attribution.referrerId, profileId, attribution.referralId)
  return true
}
