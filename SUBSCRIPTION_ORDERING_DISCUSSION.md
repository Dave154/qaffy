# Subscription and Order Rules Discussion

**Status:** The founder changed subscriber-rate scope on 2026-10-02 from per-plan to global per category/service. The local code follows that decision. The linked Supabase database reports migrations `20261002100000`, `20261002110000`, and `20261002120000` as applied; read-only checks confirm the global rate columns exist and are populated. The linked environment identity has not been independently confirmed, and live workflow smoke tests remain outstanding.

This file is the product-decision and implementation handoff for the three subscription/order changes raised on 2026-10-02. Read it before changing their behavior or database structure.

## Pre-Change Baseline

The following describes behavior before this implementation; the later implementation checkpoint records the current code state.

The current documented workflow has these rules:

- Customers select a category, service, and quantity for each order line.
- Vendor-confirmed quantities are the source of truth for final billing.
- Subscription allowance is measured in weighted units. The week starts Sunday at 00:00 in `Africa/Lagos`, and units are consumed when the vendor confirms the count.
- Subscription coverage is currently treated as an order-level decision: available weekly units are applied first, and excess units are charged at the regular customer rate from the one-off wallet.
- If the one-off wallet cannot cover an invoice, the order remains unpaid and cannot proceed to delivery.
- Category rates currently include customer prices, vendor payouts, and subscription weights. Plans currently have a weekly limit and are described as Wash + Iron.

The implementation changes behavior only for new subscriptions and new orders. Existing subscriptions retain their snapshots. Pre-migration orders without a subscription snapshot use the legacy vendor-finalization path.

## 1. Allow Multiple Services for the Same Category

### Agreed behavior

A customer may add the same category more than once when the service differs. For example:

- Bedsheet + Wash
- Bedsheet + Iron

These remain separate order lines because they are different services. If the customer selects Bedsheet + Wash again, increase the quantity on the existing Bedsheet + Wash line instead of adding a duplicate line. Customers can continue editing each line's quantity directly.

### Confirmed decision

- A category can appear on multiple order lines when the service differs. For example, Bedsheet + Wash and Bedsheet + Iron are separate lines.
- Selecting the same category/service combination again increments the existing line's quantity by one instead of adding a duplicate line.

### Confirmed scope

- Duplicate merging applies to the customer order form only. Vendor-added items keep their existing review flow.
- Customers can continue editing each line's quantity directly.

## 2. Make Subscription Plans Service-Specific

### Agreed behavior

Each plan would cover a chosen service: Wash, Iron, or both. Services not covered by the customer's plan would be billed outside the subscription.

### Confirmed decisions

- Plans should cover Wash, Iron, or Wash + Iron (both).
- A Wash + Iron plan covers all available service types: Wash, Iron, and Wash + Iron.
- Services outside a customer's plan are not covered by the subscription and are billed separately.
- For a Wash-only plan and a Wash + Iron order line, the Wash component uses the plan allowance and the Iron component is charged separately at its regular rate.
- An active subscriber may place an order containing both covered and uncovered services; each component is handled according to plan coverage.
- Plan coverage and weekly limit are fixed for the current subscription. Admin changes to those plan terms apply when the customer starts their next subscription.
- Subscriber extra rates are global per category/service, shared across all plans. The rate applicable to an order is saved when that order is placed, so a rate update affects later orders even for current subscribers.

## 3. Set a Discounted Subscriber Rate for Over-Limit Covered Units

### Agreed behavior

When an order exceeds the customer's remaining weekly allowance, charge the over-limit quantity for services covered by the plan at a discounted subscriber rate rather than the standard customer rate. The admin configures this rate from category pricing settings.

Example: a customer has 5 weighted units remaining and a vendor-confirmed order uses 8 eligible units. The subscription covers 5 units; the remaining 3 are charged at the configured subscriber rate.

### Confirmed decision

- The subscriber discount does not apply to services outside the customer's plan. For example, a Wash-only subscriber does not receive a discount on Iron service just because the order also includes Wash.
- On a Wash-only plan with a Wash + Iron order line, the Wash component may use plan coverage; Iron is charged separately at the regular rate, without the subscriber discount.
- If the Wash component exceeds the remaining weekly allowance, only the excess Wash units use the configured subscriber rate; Iron remains at the regular rate.
- Subscriber extra rates should be configured once per category and service, not separately for each plan. A plan's coverage decides whether the global category/service subscriber rate is eligible.
- The applicable customer and subscriber rates are saved when the customer places the order, even though the final quantity is confirmed later by the vendor.
- When covered items compete for the remaining weekly allowance, keep the current deterministic allocation that maximizes the weighted units covered.
- Vendor payout rates and amounts are not reduced by a customer discount.
- Keep invoice presentation as minimal as possible while still distinguishing plan-covered units, discounted excess, and full-rate uncovered services when those charges apply.
- The regular and global subscriber rates used by an order are saved when the customer places it. Plan coverage and weekly limit are snapshotted when a subscription starts, so plan edits affect the customer's next subscription, not the active one.

### Confirmed follow-up decisions

- If a category is added while a customer has an active subscription, the global subscriber rate applies to orders placed after that rate is configured; the rate is captured per order at placement.
- Covered units already used earlier in the same Lagos week carry over if the customer changes subscription midweek. The new plan starts with its limit reduced by those units; usage resets at the next Sunday boundary.

## Implementation Sequence

1. Review and apply the migration to the intended staging database only after approving its target; verify migration history and snapshot rows.
2. Smoke-test paid and manual subscription activation, new category rates during active subscriptions, midweek plan changes, new order snapshots, service splitting, allowance exhaustion, invoice breakdown, and insufficient-balance blocking in staging.
3. Run `npm test`, `npm run typecheck`, and `npm run build` after any fixes.
4. Review customer, vendor, and Admin screens against the approved examples.
5. Apply no production migration until staging checks pass and the founder approves rollout.

## Implementation Checkpoint

- Customer order lines now merge by normalized category name plus service; different services remain separate, and quantities remain directly editable.
- Plans now store Wash/Iron coverage flags. Existing subscriptions snapshot their weekly limit and coverage; new activations snapshot only those plan terms.
- Admin Categories now has one global Wash, Iron, and Wash + Iron subscriber extra rate per category, defaulting to regular customer prices. Rates are validated not to exceed regular rates.
- New orders snapshot their subscription ID, regular component prices, weekly units, and subscriber rates through trusted database triggers at order placement.
- Vendor finalization uses the saved order-time rate snapshot for new orders, covers only plan-eligible service components, charges over-limit covered components at the saved global category/service subscriber rate, and bills uncovered components at regular rates. Legacy pre-migration orders retain the previous billing path.
- Invoice billing breakdown is stored separately and shown concisely: covered units, subscriber-rate extra, and uncovered-service amount when applicable.
- Migrations: `supabase/migrations/20261002100000_service_specific_subscription_pricing.sql`, `supabase/migrations/20261002110000_subscription_invoice_billing_breakdown.sql`, and `supabase/migrations/20261002120000_global_subscription_category_rates.sql`.
- Unit coverage: service-splitting and weighted-allocation tests in `src/lib/subscription-billing.test.mjs`; duplicate category/service tests in `src/lib/order-lines.test.mjs`.
- Validation passed: `npm test` (41 tests), `npm run typecheck`, `npm run build`, and `git diff --check`. Typecheck/build show existing React Router `envFile` deprecation and future-flag warnings.
- The linked migration ledger records `20261002100000_service_specific_subscription_pricing.sql`, `20261002110000_subscription_invoice_billing_breakdown.sql`, and `20261002120000_global_subscription_category_rates.sql` as applied. Read-only schema checks confirm the invoice breakdown column and all three global subscriber-rate columns exist, with no category missing a global rate.
- The legacy `plan_category_rates` and `subscription_category_rate_snapshots` tables remain in the linked schema, but application source has no runtime reads or writes to them. The conversion migration checks for conflicting per-plan values before copying rates globally and removes the old rate-seeding triggers.

## Current Handoff (2026-10-02)

### Implemented Locally

- Customer order lines merge by normalized category plus service in `src/lib/order-lines.ts`; direct quantity editing remains enabled. `src/lib/order-lines.test.mjs` covers same-pair merging and distinct category/service lines.
- Admin Plans has Wash-only, Iron-only, and Wash + Iron coverage. Admin Categories manages one shared subscriber overage rate per category/service and validates each rate against the regular customer price.
- `src/lib/subscriptions.server.ts` creates subscription snapshots for both signed Paystack activations and Admin manual grants. Existing subscriptions are backfilled from their current plan terms by the migration.
- `src/portals/customer/CustomerLayout.tsx` and `customer-store.tsx` load saved subscription coverage and weekly limit. `NewOrder.tsx` loads global category rates, explains service coverage, and estimates plan-covered units, subscriber-rate extras, and regular-rate uncovered services.
- Database triggers snapshot the active subscription on newly inserted orders and snapshot regular prices, category weight, and subscriber rates on new order items.
- `src/lib/subscription-billing.ts` splits eligible service components, preserves regular pricing for services outside the plan, applies the saved global category/service subscriber rate to covered over-limit units, and maximizes weighted allowance coverage. `src/lib/wallet.server.ts` uses it for new snapshot-linked orders; legacy orders without `subscription_id` retain the previous finalization path.
- `invoices.billing_breakdown` stores covered units and the two charge totals; `Invoice.tsx` presents those values concisely. Vendor payout calculations are unchanged.

### Migration and Validation

- The initial migration `20261002100000_service_specific_subscription_pricing.sql` added plan coverage, legacy per-plan/category rates, subscription and order-item snapshots, order subscription association, RLS, and trusted triggers. `20261002110000_subscription_invoice_billing_breakdown.sql` is recorded as applied remotely; the invoice column was verified.
- The linked dry run reports the database is up to date. The global-rate migration migrates consistent legacy rates into global category/service columns and removes obsolete rate-seeding triggers. This session did not apply migrations; verify the linked environment before treating it as the intended staging or production target.
- Live/staging smoke tests have not been run for the global-rate workflow.
- The current global-rate refactor passes `npm test` (41 tests), `npm run typecheck`, `npm run build`, and `git diff --check`; only existing framework deprecation/future-flag warnings were emitted.
- No commit was made for this implementation.

### Known Boundaries and Next Steps

- Pre-migration orders without `orders.subscription_id` continue through the legacy finalization branch; their original per-item subscription snapshots did not exist and are not reconstructed.
- A global subscriber-rate change affects new orders from active subscribers; existing order-item snapshots retain their original prices.
- Weekly covered-unit usage carries across subscription changes during the same week; prior covered units count against the new plan until the Sunday 00:00 `Africa/Lagos` reset. A focused test covers this rule.
- Before any deployment, confirm the target environment. The linked database already reports the global-rate migration applied; on another target, apply the migration there only after reviewing its data checks and verifying that migrated global rates are populated.
- After the migration, smoke-test Admin plan/category configuration, a new paid subscription, an Admin manual subscription, Wash-only + Wash + Iron split pricing, both-service coverage, allowance exhaustion, invoice totals/breakdown, vendor payout unchanged, and insufficient-wallet delivery blocking.
- Current modified vendor files `src/portals/vendor/pages/Home.tsx` and `src/portals/vendor/pages/Orders.tsx` include hiding customer-entered counts and starting vendor counts blank. Preserve these changes during future conflict resolution.

Before release, confirm which environment the linked database represents and complete the subscription workflow smoke tests. No remote migration was applied by this coding session.
