import { sql } from '@/lib/db.server'
import { sendCustomerNotification } from './notifications.server'

export const referralCookieName = 'qaffy_referral_code'

function normalizeReferralCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? ''
  return /^QF[A-Z0-9]{6}$/.test(code) ? code : null
}

type ReferralCookieRead = {
  code: string | null
  status: 'missing' | 'invalid' | 'valid'
}

export function readReferralCodeFromRequest(request: Request): ReferralCookieRead {
  const cookieHeader = request.headers.get('Cookie') ?? ''
  const value = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${referralCookieName}=`))
    ?.slice(referralCookieName.length + 1)

  if (value === undefined) return { code: null, status: 'missing' }

  try {
    const code = normalizeReferralCode(decodeURIComponent(value))
    return code ? { code, status: 'valid' } : { code: null, status: 'invalid' }
  } catch {
    return { code: null, status: 'invalid' }
  }
}

/**
 * Attributes a referral only for a newly-created customer profile.
 * The direct database transaction is intentional: referral attribution is not a client write.
 */
export type ReferralAttributionResult =
  | { attributed: true; reason: 'attributed' | 'recorded_without_active_campaign' }
  | {
      attributed: false
      reason: ReferralAttributionRejectionReason
    }

type ReferralAttributionRejectionReason =
  | 'invalid_code'
  | 'profile_not_found'
  | 'auth_user_not_found'
  | 'already_attributed'
  | 'profile_predates_auth_user'
  | 'referrer_not_found'
  | 'referral_already_exists'
  | 'profile_attribution_conflict'

const profileAuthTimestampSkewToleranceMs = 1_000

type ReferralCampaignSnapshot = {
  referrerRewardValue: number
  referredRewardValue: number
  minimumOrderAmount: number
} | null

type ReferralAttributionRecord = {
  referrerId: string
  referralId: string
  campaignActive: boolean
  campaign: ReferralCampaignSnapshot
}

class ReferralAttributionConflict extends Error {
  constructor() {
    super('Referral attribution row already exists')
    this.name = 'ReferralAttributionConflict'
  }
}

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
  if (!normalizedCode) {
    console.warn('[referral] Attribution rejected', { reason: 'invalid_code' })
    return { attributed: false, reason: 'invalid_code' } satisfies ReferralAttributionResult
  }

  let attribution: ReferralAttributionRecord | null = null
  let rejectionReason: ReferralAttributionRejectionReason = 'profile_not_found'

  try {
    attribution = await sql.begin(async (tx) => {
      await tx`select set_config('qaffy.referral_attribution', 'true', true)`

      const [profile] = await tx`
        select p.id, p.referred_by, p.created_at, u.id as auth_user_id, u.created_at as auth_created_at
        from public.profiles p
        left join auth.users u on u.id = p.id
        where p.id = ${profileId}
        for update of p
      `
      if (!profile) {
        rejectionReason = 'profile_not_found'
        return null
      }
      if (!profile.auth_user_id || !profile.auth_created_at) {
        rejectionReason = 'auth_user_not_found'
        return null
      }
      if (profile.referred_by) {
        rejectionReason = 'already_attributed'
        return null
      }
      const profileCreatedAt = new Date(profile.created_at)
      const authCreatedAt = new Date(profile.auth_created_at)
      const profileCreatedAtMs = profileCreatedAt.getTime()
      const authCreatedAtMs = authCreatedAt.getTime()
      if (profileCreatedAtMs < authCreatedAtMs - profileAuthTimestampSkewToleranceMs) {
        console.warn('[referral] New-account timestamp guard rejected attribution', {
          profileCreatedAt: profileCreatedAt.toISOString(),
          authCreatedAt: authCreatedAt.toISOString(),
          deltaMilliseconds: profileCreatedAtMs - authCreatedAtMs,
        })
        rejectionReason = 'profile_predates_auth_user'
        return null
      }

      const [referrer] = await tx`
        select id
        from public.profiles
        where referral_code = ${normalizedCode}
          and role = 'customer'
          and id <> ${profileId}
        limit 1
      `
      if (!referrer) {
        rejectionReason = 'referrer_not_found'
        return null
      }

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
      if (!updatedProfile) {
        rejectionReason = 'profile_attribution_conflict'
        return null
      }

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
      if (!referral) throw new ReferralAttributionConflict()

      return {
        referrerId: referral.referrer_id,
        referralId: referral.id,
        campaignActive: Boolean(referral.campaign_id),
        campaign: referral.campaign_id
          ? {
              referrerRewardValue: Number(referral.referrer_reward_value_snapshot),
              referredRewardValue: Number(referral.referred_reward_value_snapshot),
              minimumOrderAmount: Number(referral.minimum_order_amount_snapshot),
            }
          : null,
      }
    })
  } catch (error) {
    if (error instanceof ReferralAttributionConflict) {
      rejectionReason = 'referral_already_exists'
    } else {
      console.error('[referral] Attribution transaction failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
      throw error
    }
  }

  if (!attribution) {
    console.warn('[referral] Attribution rejected', { reason: rejectionReason })
    return { attributed: false, reason: rejectionReason } satisfies ReferralAttributionResult
  }

  console.info('[referral] Attribution recorded', {
    campaignActive: attribution.campaignActive,
  })

  try {
    await notifyReferralParticipants(attribution.referrerId, profileId, attribution.referralId, attribution.campaign)
  } catch (error) {
    console.error('[referral] Attribution notification failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
  }

  return {
    attributed: true,
    reason: attribution.campaignActive ? 'attributed' : 'recorded_without_active_campaign',
  } satisfies ReferralAttributionResult
}
