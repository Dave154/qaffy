# Qaffy Referral Plan

**Status:** Planning baseline; attribution, campaigns, rewards, promotional settlement, and customer history implemented
**Updated:** 2026-09-17

This document is the source of truth for the Qaffy customer referral program. It defines the product behavior and engineering constraints before implementation begins.

## Goals

- Let an existing customer invite a new customer.
- Attribute the new customer reliably before authentication completes.
- Reward referrals only after a real qualifying order is completed and paid.
- Make rewards configurable by Admin rather than hardcoded in customer code.
- Keep referral rewards auditable, idempotent, and separate from customer-funded wallet top-ups.
- Provide enough visibility for customers, Admin, and Finance to reconcile every reward.

## Current State

The repository already contains a partial referral foundation:

- `profiles.referral_code` identifies a customer referral code.
- `profiles.referred_by` stores a referred profile's referrer.
- `referrals` stores one row per referred profile.
- Customer Settings displays the customer's referral code.
- Admin User Details displays referral history.

The original foundation did not implement referral-link capture, signup attribution, qualification, reward issuance, campaign configuration, or referral-specific accounting. Do not treat a referral row as proof that a reward is owed.

The current implementation includes referral-link capture, trusted first-time signup attribution for email OTP and Google OAuth, immutable referral codes, database attribution guards, campaign configuration, idempotent reward issuance, promotional wallet settlement, reward expiry, and customer referral history. Campaign editing and exceptional reversal workflows remain future Admin work.

## MVP Product Decisions

These are the proposed baseline decisions for the first implementation:

- Referrals are customer-to-customer only.
- A customer may be referred at most once.
- A referral is attributed only during first-time customer account creation.
- Existing accounts cannot be retroactively attached to a referral.
- Both the referrer and the referred customer receive a promotional wallet reward.
- The referred customer qualifies after their first order is vendor-confirmed and fully paid.
- Cancelled, unpaid, reversed, or fraudulent orders do not qualify.
- Rewards expire 90 days after issuance.
- Promotional rewards may be used toward eligible Qaffy laundry invoices, but cannot be withdrawn or transferred.
- Rewards are issued exactly once per eligible recipient and referral campaign.
- Referral rewards do not create vendor payout obligations and do not trigger Paystack transfers.
- Admin may configure campaign limits and reward values, but manual adjustments must be audited.

The following remain explicit decisions to confirm before expanding the current MVP:

1. The exact initial reward amount for each party.
2. Whether the qualifying order must also be delivered, or whether vendor confirmation plus payment is sufficient.
3. The minimum qualifying order amount, if any.
4. Whether promotional credit may pay subscription overage invoices.
5. Whether a customer may refer an unlimited number of people or is subject to a lifetime cap.
6. Whether a campaign may target a specific customer segment or pickup location.

## Referral Lifecycle

### 1. Share

A customer sees their personal referral code and a generated referral link:

`/create-account?ref=<REFERRAL_CODE>`

The link must be generated from the current trusted code. Customer-visible sharing must never expose internal profile UUIDs.

### 2. Capture

When a visitor opens a referral link:

- Validate the code format and normalize it.
- Store the attribution temporarily for 30 days.
- Preserve the first valid referral attribution during that window unless the visitor explicitly starts a new signup flow.
- Do not create a database referral row yet.
- Do not reveal private referrer information.

The temporary attribution must survive email OTP and Google OAuth redirects. It must not rely only on React component state or a query parameter that disappears during the redirect.

### 3. Signup Attribution

After first-time customer authentication creates or discovers the profile:

- Resolve the referral code against an active eligible customer.
- Reject self-referral.
- Reject attribution when the authenticated profile already existed before the referral flow.
- Reject attribution if the profile already has `referred_by` or a referral row.
- Store the referrer relationship once and make it immutable for normal customer actions.
- Create exactly one referral record linked to the referred profile.
- Clear the temporary attribution after successful attribution or a definitive rejection.

Attribution must happen through a trusted server path. The browser must not be able to choose arbitrary `referrer_id`, reward values, campaign IDs, or referral statuses.

### 4. Qualification

A referral remains pending until the referred customer has a qualifying order. Qualification should be evaluated from trusted lifecycle and payment state, not from a client-submitted form.

The recommended qualifying event is:

- Order belongs to the referred customer.
- Vendor has confirmed the final item count.
- The final invoice is paid.
- The order is not cancelled.
- The payment has not been reversed or administratively invalidated.

Qualification must be safe to retry. Replaying an order update, webhook, loader refresh, or server action must never create multiple rewards.

### 5. Reward Issuance

Once qualified:

- Snapshot the active campaign and reward values onto the referral reward records.
- Create one reward record for the referrer.
- Create one reward record for the referred customer.
- Credit promotional balances through the trusted wallet service and append-only wallet ledger.
- Mark the referral qualified/rewarded only after the reward records and wallet changes are consistent.
- Record the qualifying order and the actor or trusted event that caused issuance.

If one recipient's reward fails, the operation must be retryable without duplicating the other recipient's reward. The final implementation must use database constraints and transactional server-side work for this boundary; client-side retries are expected and must be harmless.

### 6. Expiry and Reversal

A reward that reaches its expiry date becomes unavailable for future invoice settlement. Expiry must be represented in the reward ledger and must not silently mutate historical wallet transactions.

Reversal is not part of the normal MVP. If a qualifying payment is later reversed or an order is determined to be fraudulent, Admin needs an audited adjustment path rather than an undocumented direct balance edit.

## Proposed Data Model

The existing `referrals` table should be extended or replaced carefully rather than overloaded with every concern.

### Referral Campaigns

A campaign represents the Admin-configured rules active when attribution or qualification occurs.

Suggested fields:

- `id`
- `name`
- `status` (`draft`, `active`, `paused`, `ended`)
- `starts_at`
- `ends_at`
- `referrer_reward_type`
- `referrer_reward_value`
- `referred_reward_type`
- `referred_reward_value`
- `minimum_order_amount`
- `reward_expiry_days`
- `max_rewards_per_referrer`
- `created_by`
- `created_at`
- `updated_at`

Only one campaign should be selected for a referral qualification event unless the product explicitly supports stacking. The MVP should not stack campaigns.

### Referrals

The referral relationship should retain the original attribution and lifecycle state.

Suggested fields:

- `id`
- `referrer_id`
- `referred_id` with a unique constraint
- `campaign_id` nullable only for legacy/unattributed rows
- `status` (`attributed`, `qualified`, `rewarded`, `rejected`, `expired`, `reversed`)
- `attributed_at`
- `qualified_at`
- `qualifying_order_id`
- `rejection_reason`
- `created_at`
- `updated_at`

The relationship must not be editable by customers. The original referrer and attribution timestamp are audit facts.

### Referral Rewards

Use a separate record per recipient so each reward can succeed, expire, or be reviewed independently.

Suggested fields:

- `id`
- `referral_id`
- `recipient_id`
- `campaign_id`
- `reward_type`
- `reward_value`
- `status` (`pending`, `issued`, `expired`, `reversed`, `failed`)
- `wallet_transaction_id` when applicable
- `qualifying_order_id`
- `expires_at`
- `issued_at`
- `reversed_at`
- `failure_reason`
- `created_at`
- `updated_at`

Add a uniqueness constraint for one recipient, one referral, and one reward type. This is the primary duplicate-reward defense.

### Wallet and Finance Metadata

Referral rewards must be distinguishable from Paystack top-ups and ordinary wallet adjustments.

The final design should provide:

- A promotional balance or equivalent source-aware wallet accounting.
- A wallet transaction source such as `referral_reward`.
- A reference to `referral_rewards.id` in transaction metadata or a dedicated foreign key.
- Expiry-aware spending rules.
- Finance reporting that separates customer-funded wallet money from promotional credit.

Do not credit referral rewards directly from a browser action. Do not use an Admin balance update as the normal reward path.

## Trust and Security Rules

- No RPCs may be introduced.
- Browser input may suggest a referral code but may not decide attribution, campaign, reward amount, qualification, or status.
- Trusted server/database code must re-read current profiles, campaigns, orders, invoices, and payment state.
- Referral codes must be unique, normalized, non-guessable enough for ordinary use, and safe to display publicly.
- Referral code lookup should reveal only whether attribution is valid; it must not expose profile data.
- Customer RLS should allow customers to read only their own referral summary and their own rewards, plus referrals where they are the referrer.
- Customer RLS must not allow customers to insert, update, reward, reverse, or expire referral records.
- Admin actions require Admin authorization and must append audit events.
- Referral rewards must not affect vendor settlement amounts.
- Referral rewards must not be treated as Paystack deposits or cash-equivalent withdrawals.

## Abuse Prevention

At minimum, reject or flag:

- Self-referral.
- Reuse of an existing account as a new referred account.
- A second referrer for the same referred profile.
- Duplicate qualification or reward issuance.
- Shared verified phone number between referrer and referred customer.
- Suspicious reward volume beyond campaign limits.
- Cancelled, unpaid, reversed, or fraudulent qualifying orders.
- Attempts to alter referral attribution after signup.

Device fingerprinting should not be required for the MVP. It can create privacy and false-positive problems. Campaign caps, verified identity fields, immutable attribution, and paid-order qualification should provide the initial protection.

## Customer UX Requirements

### Settings

Show:

- Referral code.
- Copyable referral link.
- Share action using the platform share API when available.
- Number of successful referrals.
- Pending referrals.
- Earned promotional rewards.
- Expiring rewards and expiry dates.

Do not show private details about referred customers beyond an appropriate display name or masked identifier.

### Signup

- Preserve referral attribution through email OTP and Google OAuth.
- Show a non-sensitive confirmation that the signup was attributed.
- Do not promise that a reward has been earned before qualification.
- Explain the qualifying-order requirement in the referral terms.

### Referral History

Customers should see clear statuses such as:

- Joined through your link.
- Waiting for first qualifying order.
- Reward issued.
- Reward expired.

## Admin UX Requirements

Admin referral management should support:

- Create, edit, pause, activate, and end campaigns.
- Configure both recipient rewards.
- Configure minimum order amount, expiry, and referral caps.
- View attribution, qualification, reward, expiry, and failure states.
- Search by Qaffy ID, referral code, order reference, or campaign.
- Filter by date, campaign, status, and reward type.
- Inspect the qualifying order and wallet transaction.
- Manually reject or adjust a referral only with a reason and audit event.
- Export referral and reward history without exposing unnecessary authentication data.

Admin must not approve ordinary rewards manually. Qualification is a trusted business event; Admin tools are for configuration, investigation, and exceptional corrections.

## Accounting Treatment

Referral rewards are promotional marketing expense or promotional liability, not customer revenue and not vendor payable.

Reports should distinguish:

- Customer-funded Paystack top-ups.
- Promotional referral credits issued.
- Promotional credits consumed on invoices.
- Promotional credits expired.
- Promotional credits reversed by Admin.

When promotional credit pays an invoice, the invoice remains tied to the customer's service order. The ledger must show the promotional source used for settlement so Finance can reconcile the difference between gross service billing and cash collected.

## Implementation Phases

### Phase 0: Confirm Decisions

- Confirm reward amounts and reward type.
- Confirm the qualifying order state.
- Confirm minimum order amount and expiry.
- Confirm promotional balance behavior.
- Confirm campaign stacking policy.

### Phase 1: Attribution Foundation

- Generate or backfill safe referral codes.
- Add referral-link capture that survives both auth methods.
- Add trusted first-time signup attribution.
- Enforce immutable one-referrer-per-customer rules.
- Add migration constraints and RLS policies.

### Phase 2: Campaign and Reward Ledger

- Add campaign configuration.
- Add referral reward records.
- Add source-aware wallet ledger support. **Implemented.**
- Implement idempotent qualification and reward issuance. **Implemented.**
- Add audit events and failure handling.

### Phase 3: Customer Experience

- Add copy/share referral link. **Implemented.**
- Add referral history and reward status. **Implemented.**
- Add qualification and expiry messaging.
- Add realtime or loader refresh behavior where needed.

### Phase 4: Admin and Finance

- Add campaign management. **Implemented.**
- Add referral/reward review and export. **Remaining.**
- Add promotional-credit reporting. **Remaining.**
- Add audited exception handling.

## Verification Checklist

### Attribution

- New email signup with a valid code attributes exactly once.
- New Google signup with a valid code attributes exactly once.
- Referral attribution survives OTP and OAuth redirects.
- Invalid codes do not create referral rows.
- Existing users cannot be attached retroactively.
- Self-referral is rejected.
- Attribution cannot be changed by customer input.

### Qualification

- An unpaid order does not qualify.
- A cancelled order does not qualify.
- A vendor-confirmed paid order qualifies exactly once.
- A repeated webhook or lifecycle event does not duplicate qualification.
- A referral with no qualifying order remains pending.

### Rewards

- Both recipients receive the configured reward once.
- A retry after partial failure completes only missing rewards.
- Rewards have the correct campaign snapshot and expiry.
- Expired rewards cannot be spent.
- Referral credits are distinct from Paystack top-ups.
- Referral credits do not change vendor settlement totals.

### Security and Administration

- Customers cannot write referral or reward state through Supabase client access.
- Admin actions require Admin authorization.
- Admin adjustments create audit records.
- Duplicate referral and reward inserts are rejected safely.
- Referral exports omit passwords, OTPs, internal auth tokens, and unnecessary private data.

## Non-Goals for MVP

- Multi-level referrals.
- Referral rewards for vendors or logistics partners.
- Cash withdrawal of referral rewards.
- Automatic reversal workflows.
- Campaign stacking.
- Device fingerprinting.
- Referral-based subscription discounts unless explicitly added to the campaign model.
