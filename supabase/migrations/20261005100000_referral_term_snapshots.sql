alter table public.referrals
  add column if not exists referrer_reward_value_snapshot numeric(10, 2),
  add column if not exists referred_reward_value_snapshot numeric(10, 2),
  add column if not exists minimum_order_amount_snapshot numeric(10, 2),
  add column if not exists reward_expiry_days_snapshot integer,
  add column if not exists max_rewards_per_referrer_snapshot integer;

update public.referrals r
set referrer_reward_value_snapshot = c.referrer_reward_value,
    referred_reward_value_snapshot = c.referred_reward_value,
    minimum_order_amount_snapshot = c.minimum_order_amount,
    reward_expiry_days_snapshot = c.reward_expiry_days,
    max_rewards_per_referrer_snapshot = c.max_rewards_per_referrer,
    reward_type = coalesce(r.reward_type, c.referrer_reward_type),
    reward_value = coalesce(r.reward_value, c.referrer_reward_value)
from public.referral_campaigns c
where r.campaign_id = c.id
  and r.referrer_reward_value_snapshot is null;

-- Legacy pending referrals have no campaign terms to safely pin to their attribution time.
update public.referrals
set status = 'rejected',
    rejection_reason = 'Campaign terms were not captured at attribution; this referral cannot be safely rewarded.',
    updated_at = now()
where status = 'pending'
  and campaign_id is null;

alter table public.referrals
  add constraint referrals_campaign_snapshot_consistency_check
  check (
    (
      campaign_id is null
      and referrer_reward_value_snapshot is null
      and referred_reward_value_snapshot is null
      and minimum_order_amount_snapshot is null
      and reward_expiry_days_snapshot is null
      and max_rewards_per_referrer_snapshot is null
    )
    or (
      campaign_id is not null
      and referrer_reward_value_snapshot is not null
      and referrer_reward_value_snapshot > 0
      and referred_reward_value_snapshot is not null
      and referred_reward_value_snapshot > 0
      and minimum_order_amount_snapshot is not null
      and minimum_order_amount_snapshot >= 0
      and reward_expiry_days_snapshot is not null
      and reward_expiry_days_snapshot > 0
    )
  );

alter table public.referrals
  add constraint referrals_pending_requires_campaign_check
  check (status <> 'pending' or campaign_id is not null);
