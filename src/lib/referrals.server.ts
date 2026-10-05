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
type ReferralCampaignSnapshot = {
  referrerRewardValue: number
  referredRewardValue: number
  minimumOrderAmount: number
} | null

async function notifyReferralParticipants(
  referrerId: string,
  referredProfileId: string,
  referralId: string,
  campaign: ReferralCampaignSnapshot,
) {
  const [referredProfile] = await sql`
    select name
    from public.profiles
    where id = ${referredProfileId}
    limit 1
  `

  const rewardAmount = campaign?.referrerRewardValue ?? null
  const referredRewardAmount = campaign?.referredRewardValue ?? null
  const minimumOrderAmount = campaign?.minimumOrderAmount ?? null
  const referredName = referredProfile?.name ?? 'a new customer'
  const rewardText = rewardAmount !== null
    ? ` Your pending reward is ₦${rewardAmount.toLocaleString()}.`
    : ' No bonus campaign was active when they signed up.'

  await Promise.all([
    sendCustomerNotification({
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
    }),
    sendCustomerNotification({
      eventKey: `referral-signup-referred:${referralId}`,
      customerId: referredProfileId,
      notificationType: 'referral_signup',
      payload: {
        title: 'Your referral bonus is on its way',
        body: referredRewardAmount !== null && minimumOrderAmount !== null
          ? minimumOrderAmount > 0
            ? `Your referral bonus of ₦${referredRewardAmount.toLocaleString()} is pending. Earn it when you pay for a qualifying order of at least ₦${minimumOrderAmount.toLocaleString()}.`
            : `Your referral bonus of ₦${referredRewardAmount.toLocaleString()} is pending after any paid order.`
          : 'Your referral was recorded, but no bonus campaign was active when you signed up.',
        details: [
          'Your account was successfully linked to a referral.',
          referredRewardAmount !== null && minimumOrderAmount !== null
            ? minimumOrderAmount > 0
              ? `Referral bonus: ₦${referredRewardAmount.toLocaleString()} after a paid order of at least ₦${minimumOrderAmount.toLocaleString()}.`
              : `Referral bonus: ₦${referredRewardAmount.toLocaleString()} after any paid order.`
            : 'No reward terms were attached to this referral at signup.',
          ...(referredRewardAmount !== null ? ['We will notify you again when the bonus is credited to your promotional balance.'] : []),
        ],
        url: '/settings#referrals',
        tag: `referral:${referralId}:referred`,
      },
    }),
  ])
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

    const [campaign] = await tx`
      select
        id,
        referrer_reward_value,
        referred_reward_value,
        minimum_order_amount,
        reward_expiry_days,
        max_rewards_per_referrer
      from public.referral_campaigns
      where status = 'active'
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at > now())
      order by starts_at desc nulls last, created_at desc
      limit 1
      for share
    `

    const [updatedProfile] = await tx`
      update public.profiles
      set referred_by = ${referrer.id}
      where id = ${profileId} and referred_by is null
      returning id
    `
    if (!updatedProfile) return null

    const [referral] = await tx`
      insert into public.referrals (
        referrer_id,
        referred_id,
        campaign_id,
        reward_type,
        reward_value,
        referrer_reward_value_snapshot,
        referred_reward_value_snapshot,
        minimum_order_amount_snapshot,
        reward_expiry_days_snapshot,
        max_rewards_per_referrer_snapshot,
        status,
        rejection_reason,
        attributed_at
      )
      values (
        ${referrer.id},
        ${profileId},
        ${campaign?.id ?? null},
        ${campaign ? 'wallet_credit' : null},
        ${campaign ? campaign.referrer_reward_value : null},
        ${campaign?.referrer_reward_value ?? null},
        ${campaign?.referred_reward_value ?? null},
        ${campaign?.minimum_order_amount ?? null},
        ${campaign?.reward_expiry_days ?? null},
        ${campaign?.max_rewards_per_referrer ?? null},
        ${campaign ? 'pending' : 'rejected'},
        ${campaign ? null : 'No active referral campaign at attribution time'},
        now()
      )
      on conflict (referred_id) do nothing
      returning id, referrer_id, campaign_id, referrer_reward_value_snapshot, referred_reward_value_snapshot, minimum_order_amount_snapshot
    `
    if (!referral) return null

    return {
      referrerId: referral.referrer_id,
      referralId: referral.id,
      campaign: referral.campaign_id
        ? {
            referrerRewardValue: Number(referral.referrer_reward_value_snapshot),
            referredRewardValue: Number(referral.referred_reward_value_snapshot),
            minimumOrderAmount: Number(referral.minimum_order_amount_snapshot),
          }
        : null,
    }
  })

  if (!attribution) return false

  await notifyReferralParticipants(attribution.referrerId, profileId, attribution.referralId, attribution.campaign)
  return true
}
