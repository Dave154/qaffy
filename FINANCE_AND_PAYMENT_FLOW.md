# Qaffy Finance and Post-Paid Billing Flow

## Status

Approved operational billing model as of 2026-09-14.

### Payment implementation status

- Customer top-ups initialize Paystack server-side and record a pending payment row.
- No customer return callback is configured or used; the browser never verifies payment or credits the wallet.
- Paystack receives the customer overview URL only as a navigation destination after checkout; it is not a payment callback handler.
- `POST /api/paystack/webhook` validates Paystack's HMAC signature and processes `charge.success` plus `transfer.success`, `transfer.failed`, and `transfer.reversed` events. Transfer events update the persisted payout ledger and settlement status idempotently; Admin Finance revalidates from Supabase Realtime, with a manual refresh control and reconciliation fallback.
- Apply `supabase/migrations/20261001110000_payout_transfer_realtime.sql` to publish settlement and transfer changes for Admin Finance Realtime updates.
- Wallet crediting is idempotent by payment reference.
- Production requires `PAYSTACK_SECRET_KEY`, `DATABASE_URL`, and the Paystack dashboard webhook URL pointing to `/api/paystack/webhook`.
- The pending payment row is created before Paystack initialization so a successful charge always has a local reconciliation record.
- The customer top-up UI submits through the route fetcher so the index action response is handled reliably and initialization errors are visible to the customer.
- The top-up modal presents the amount to pay and expected wallet credit, but does not claim the balance has changed until the webhook confirms the payment.
- Subscription purchases use the same Paystack gateway but carry `plan_id`; the webhook activates the subscription without adding the plan price to one-time or subscription wallet balances.
- Subscription checkout returns to `/plans?payment=pending` only to refresh the customer loader until webhook activation is visible; the browser does not verify the payment.
- Wallet changes are made only by the signed webhook; the customer sees the updated balance on the next data load or refresh.
- The customer portal subscribes to wallet and wallet-ledger changes and revalidates the authoritative loader in real time after webhook crediting.
- For local webhook testing through ngrok, the current ngrok hostname must be allowlisted in both `vite.config.ts` and `react-router.config.ts`; otherwise Vite returns `403` before the webhook handler runs.

### Referral reward accounting

- Referral rewards are promotional wallet credit, not Paystack funds, customer revenue, or vendor payable.
- Promotional balance is stored separately from `one_off_balance` and `subscription_balance`.
- Promotional credit is consumed before ordinary one-off credit when an invoice is paid.
- Each referral reward keeps its remaining value, expiry, qualifying order, and linked wallet transaction.
- Expired promotional value creates an explicit expiry ledger transaction.
- Reward issuance is trusted, transactional, and idempotent across vendor finalization, customer invoice payment, subscription excess payment, and Paystack top-up auto-settlement.
- Apply `20260917120000_referral_attribution_foundation.sql`, `20260917130000_referral_campaign_reward_ledger.sql`, and `20260917140000_promotional_wallet_rewards.sql` before live referral testing.
- Remaining referral finance work is reporting promotional credits issued, consumed, expired, and reversed; no cash withdrawal or vendor settlement is allowed.

### Customer portal continuation checkpoint

- One-time top-ups and subscription purchases share Paystack initialization but remain separate payment types.
- One-time top-ups credit `one_off_balance` only through the signed webhook.
- Subscription purchases store `payments.plan_id` and activate `subscriptions` only through the signed webhook; they do not credit either wallet balance.
- Customer plans are loaded from active database rows and duplicate active subscriptions are blocked at both UI and server levels.
- Customer wallet and subscription updates use Supabase Realtime, with bounded return-page refresh fallback for webhook timing.
- Apply `20260915110000_customer_wallet_realtime.sql`, `20260915120000_subscription_payment_plan.sql`, `20260915130000_authoritative_order_item_pricing.sql`, `20260915140000_public_order_numbers.sql`, `20261001120000_subscription_usage_applied_at.sql`, `20261002100000_service_specific_subscription_pricing.sql`, `20261002110000_subscription_invoice_billing_breakdown.sql`, and `20261002120000_global_subscription_category_rates.sql` to the intended target before live testing.
- Customer NewOrder now loads active categories, customer Wash/Iron/Wash + Iron rates, and subscription units from Supabase. Order creation recalculates prices from the database and does not charge the wallet.
- Subscription orders remain unpaid at creation. Weekly subscription usage and coverage are evaluated from the vendor-confirmed final count, not the customer's original estimate.
- Migration `20260915130000_authoritative_order_item_pricing.sql` overwrites client-supplied `order_items.unit_price` values from the selected customer rate in the database.
- Validation for the NewOrder slice: `npm run typecheck` and `npm run build` pass.
- Customer invoice history now loads every invoice, allows order/invoice selection, and exposes mismatch and extra-charge details only after vendor confirmation.
- Confirmed vendor mismatches are surfaced in the customer notification badge, affected order cards, and order details; they are not shown before vendor confirmation.
- Unpaid mismatch banners remain visible while the invoice is outstanding. Once paid, the mismatch notification can be dismissed once and remains available on the affected order details.
- Customer Transactions now combines Paystack payment rows and wallet ledger debits, with functional filters and real pending/success/failed statuses.
- Customer Settings now saves profile name/phone, shows the live subscription end date and referral code, and renders recent payment rows from the payment store.
- Customer OTP flow now selects the correct active order and does not expose OTPs for delivered orders.
- Vendor confirmation now stores weighted final units for subscription orders and applies allowance only to plan-covered service components. Over-limit covered components use the saved global category/service subscriber rate; uncovered services use saved regular customer rates. Charges remain one invoice payable from the one-off wallet. Vendors may dispatch before payment, but Logistics only sees dispatched orders after payment and cannot complete the handoff while the invoice is unpaid.
- Next billing-related customer work: run live payment, invoice, order, and OTP smoke tests after applying the pending Supabase migrations.
- Orders now have a globally unique database-generated `public_order_number` in `QO-######` format for user-facing references; UUID order IDs remain internal keys.

### Vendor review continuation checkpoint

- Vendor review quantity changes submit the underlying order-item IDs expected by the trusted finalization service, preserving accurate final counts and billing.
- The vendor-confirmed final count remains authoritative for invoices and settlements. Vendor-added categories are retained with their confirmed quantities, and extra billing is measured against the original order items rather than a baseline that includes additions.
- Vendor review displays only physical customer and received item quantities; subscription-unit accounting remains hidden from the vendor and trusted server-side.
- Physical counts and weighted subscription units are stored in separate order fields. Mismatch direction uses physical counts; subscription allowance usage uses vendor-confirmed unit fields.
- Subscription usage meters count only units covered by the plan; excess units charged from the general wallet are excluded from weekly allowance usage. The calendar week starts Sunday at 00:00 in `Africa/Lagos`. Units are assigned to the week when the vendor confirms the order, using `subscription_units_applied_at`; confirmation locks the active subscription row so concurrent orders cannot spend the same allowance twice.
- Unclaimed vendor orders are claimed before the vendor sees the detailed review form; count entry is prioritized after ownership is established.

### Vendor confirmation audit checkpoint

### Vendor finance progress checkpoint (2026-09-16)

- Vendor Finance is now the only vendor settlement screen; the duplicate Clearing history route was removed.
- Vendor Finance's Total payable card now represents confirmed vendor earnings that are not already assigned to a settlement batch. Pending payout and Paid to date remain sourced from live settlement rows.
- Vendor order-item loading is scoped to the current vendor's orders, and Supabase query failures are surfaced in the Finance UI instead of appearing as zero-valued metrics.
- Vendor Settings loads Nigerian banks into a dropdown, resolves the account automatically after the tenth digit through Paystack, shows the resolved account name, and saves only after explicit Save details confirmation. The server re-resolves during save, stores the verified bank/account name and masked account details, and prevents an account from appearing verified unless Paystack resolves it successfully. Apply `supabase/migrations/20260916150000_vendor_payout_accounts.sql` before using this flow.
- Historical payout-rate versioning is still not implemented. The current rate card is used for derived payout calculations because the product has not yet approved a payout-rate formula or rate-history model.
- Remaining vendor finance work: payout transfer metadata and final settlement payment workflow.
- Vendor phase handoff: payout release belongs to Admin. The next implementation should review pending settlement batches, require a verified vendor payout account, execute the approved trusted Paystack transfer, and persist auditable transfer metadata. Do not initiate transfers from the vendor portal.
- The Admin payout service creates an idempotent transfer record, calls Paystack from the server, leaves settlements pending while a result is unknown, and exposes release, reconcile, retry, and failure states in Admin Finance. Admin settlement creation now attempts each payout immediately after the settlement transaction commits. A ₦200 Paystack test-mode transfer completed successfully on staging; SQL-adapter integration tests and payout-rate approval remain before production use.

- Audit on 2026-09-16 identified high-risk follow-up work: restrict vendor RLS writes, auto-settle normal orders when the wallet covers the final invoice, sum only `subscription_units_applied` for allowance usage, preserve stored order-item prices, prevent duplicate settlement membership, make subscription allocation deterministic, reject missing-rate and incomplete payloads, display `confirmed_quantity` after finalization, make settlement creation atomic, improve mismatch detail, exclude cancelled orders from allowance usage, and append vendor confirmation audit events.
- The first security fix moves vendor claiming to the trusted database path and applies `supabase/migrations/20260916110000_restrict_vendor_writes.sql`.
- The follow-up billing fix auto-settles covered normal orders, preserves stored customer prices, excludes excess and cancelled orders from subscription usage, and prevents an order from entering more than one settlement.
- Vendor confirmation payloads now require complete, unique original-item quantities, and finalized vendor details read the persisted confirmed quantities.
- Subscription coverage now uses deterministic bounded allocation to maximize covered weighted units and no longer depends on database row order.
- Vendor finalization now records a trusted confirmation event with the vendor actor, original and confirmed counts, mismatch detail, and invoice outcome.
- New mismatch records now persist structured item lines and customer invoices show the itemized difference and extra-charge breakdown.
- Invoice payment is allowed for unpaid `invoiced` orders and unpaid `out_for_delivery` orders. Payment after dispatch preserves the dispatch state while issuing the delivery OTP. Cancelled subscription orders are excluded from the customer usage meter, and duplicate mismatch line rendering is safe.
- Customer order changes now revalidate the customer layout in realtime, and lifecycle fields force the provider snapshot to refresh so pickup and related customer-visible state update without a reload.
- Logistics order and event tables are now explicitly added to the Supabase realtime publication so new customer orders reach OTP search immediately.
- Vendor order state has a visible-page fallback refresh so logistics pickup transitions cannot leave the vendor available-claim count stale when realtime setup is delayed.
- Vendor availability now begins only after logistics pickup: `pending_pickup` is excluded, `picked_up` is claimable, and claiming moves the order to `at_vendor`.

## Logistics continuation checkpoint

- Logistics pickup and delivery remain tabs on one `/logistics` page.
- Pickup search requires the complete four-digit OTP and uses an exact match.
- Confirmed pickup sets the order to `picked_up`, records the pickup date, and nullifies the pickup OTP in the same trusted database update.
- Logistics pickup/delivery results and event history show the global public order reference (`QO-######`); UUIDs remain internal.
- Vendors may dispatch an order with a paid invoice (`paid`) or an unpaid finalized invoice (`invoiced`). Unpaid dispatched orders are hidden from Logistics until payment; payment preserves `out_for_delivery`, and the final Logistics handoff verifies a paid invoice as well as a valid delivery OTP.
- Final delivery clears `delivery_otp` in the same trusted update that marks the order `delivered`, preventing OTP reuse.
- Pickup/Delivery was moved out of the header and placed beside the date filter. The controls stay horizontal and compact on small screens. The header has padded spacing, a smaller Logistics label, and a red logout icon.
- Remaining logistics audit work: delivery exceptions, public order number search, event-history visibility, and permission boundaries, then run live OTP/order smoke tests after applying migrations.

## Customer notification checkpoint (2026-09-18)

- Customer Web Push is implemented through `public/push-sw.js` and `src/lib/push.client.ts`. Customers can enable or disable notifications from the Overview prompt or Settings; subscriptions are stored per customer in `push_subscriptions` through `/api/push-subscriptions`.
- Server delivery uses `web-push` and VAPID credentials from `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. The browser uses `VITE_VAPID_PUBLIC_KEY`.
- `notification_events` is an idempotency and delivery-status ledger for the wrapped notification path. An event key is inserted before delivery, duplicate keys are ignored, successful sends are marked `sent`, failures are marked `failed`, and stale subscriptions returning HTTP 404/410 are removed. Logistics pickup and delivery currently use the direct push sender, so those handoff sends are not recorded in this ledger.
- Notifications are emitted for pickup, delivery, ready-for-delivery, vendor mismatch confirmation, payment required/confirmed, wallet top-up confirmation, subscription activation, and scheduled subscription renewal/expiry.
- Paystack webhook processing, vendor confirmation/dispatch, logistics handoff, invoice payment, and the protected subscription-notification job are the trusted event sources. Push delivery is best-effort and does not replace the in-app order, invoice, or notification state.
- Apply `supabase/migrations/20260918100000_push_subscriptions.sql` and `supabase/migrations/20260918110000_notification_events.sql` before live testing. The scheduled subscription route requires `CRON_SECRET`; the VS Code embedded browser does not support this setup, so use Chrome or Edge.

## Business model

This platform uses a post-paid model.

- A customer can place an order and the order can be picked up before payment is settled.
- The customer may top up their wallet at any time before the final billing event.
- The wallet balance remains a general balance and is only consumed when the vendor confirms the final quantity.
- Final billing is triggered after vendor confirmation, not at order creation.

## Confirmed billing rules

### 1. General wallet behavior

- Customer top-ups are stored in the general wallet balance.
- The wallet is not treated as a pre-charge for the original order.
- The wallet is used only to settle the final invoice generated after vendor confirmation.
- If the final invoice amount is covered, the wallet deducts and the invoice becomes paid.
- If the wallet balance is insufficient, the invoice remains unpaid and the order stays in a pending-payment state until vendor dispatch. Dispatch does not mark the invoice paid or release the order for customer handoff.

### 2. Under-count handling

- If the vendor confirms fewer items than the original customer count, this is an under-count.
- The final invoice is automatically created from the vendor-confirmed quantity.
- There is no admin approval required for under-count final billing.
- The customer is billed based on the final confirmed count, not the original estimate.

### 3. Over-count handling

- If the vendor confirms more items than the original customer count, this is an over-count.
- The final invoice is still based on the vendor-confirmed quantity.
- The invoice must clearly show that the customer was billed extra because of the over-count.
- The extra amount must be visible in the same invoice, with the necessary details for the customer to understand the reason.
- The invoice should contain a clear section or line labelled something like:
  - "Extra billing due to over-count"
  - "Additional items confirmed by vendor"
  - "Difference: X items"
- This extra charge should include quantity difference, category/service breakdown, unit price, and total extra amount where applicable.

### 4. Mismatch visibility and timing

- The customer should not see a mismatch before the vendor confirms the final count.
- Once the vendor confirms the final count, the mismatch becomes visible to the customer via the order and invoice detail views.
- Admin does not approve the mismatch calculation or billing adjustment. Admin only reviews, tracks, and references the mismatch for operational insight.

### 5. Invoice generation

The invoice is generated after vendor confirmation. It includes:

- original order quantity
- final vendor-confirmed quantity
- quantity difference
- base charge from the final confirmed count
- extra-billing amount for over-counts when applicable
- total due
- payment status
- wallet deduction result

### 6. Pending payment behavior

If the wallet balance is insufficient after vendor confirmation:

- the invoice remains unpaid
- the order remains in a pending-payment state
- the customer can top up later and settle the invoice
- the order should remain visible as unpaid until funds are made available

### 7. Subscription order handling

- An order placed during an active subscription keeps a reference to that subscription's saved coverage and weekly-limit snapshot.
- Coverage is service-specific and applied to the vendor-confirmed final count. A Wash + Iron plan covers Wash, Iron, and Wash + Iron. For a Wash-only plan, the Wash component of a Wash + Iron line can use the plan while Iron is billed separately at its regular rate.
- The weekly allowance is allocated deterministically to maximize covered weighted units. Only covered units consume the allowance.
- Weekly covered-unit usage is tracked per customer across subscription changes and resets Sunday at 00:00 in `Africa/Lagos`; a new subscription midweek inherits units already applied that week.
- Over-limit units for a service covered by the plan use the saved global subscriber rate for that category and service. Services outside the plan use their saved regular customer rate and do not receive the subscriber discount.
- Regular and global subscriber rates are saved on order-item creation; plan coverage and weekly limit are snapshotted when the subscription starts. Admin plan edits apply to new subscriptions, while subscriber-rate edits apply to orders placed afterward, including orders from active subscribers.
- Vendor payout amounts are not reduced by customer subscriber discounts.
- If the wallet cannot cover the final invoice, the invoice remains unpaid. Vendor dispatch may proceed, but Logistics cannot complete final delivery until payment.
- The customer is prompted to top up the general wallet before the order can be paid and released for delivery.
- The implementation must not partially pay or complete final customer handoff while any charge remains unpaid.

## Operational rules for admins

Admin is not a billing gatekeeper for quantity mismatches. Their role is to:

- review mismatches
- track operational issues
- reference unresolved billing exceptions
- monitor overall finance health
- review unpaid invoice and wallet activity

## Schema and logic expectations

### Core billing flow

1. Customer creates order
2. Order is picked up and processed
3. Vendor confirms final item count
4. System creates mismatch record if count differs
5. System generates the final invoice from vendor-confirmed quantities, subscription coverage, and saved rates
6. System applies extra charge line item for over-counts
7. System attempts wallet deduction
8. If enough balance exists, invoice is paid
9. If balance is insufficient, invoice remains unpaid and marked pending payment

For a subscription order, the invoice minimally distinguishes plan-covered units, subscriber-rate excess, and regular-rate uncovered services. The order remains blocked until the full invoice is paid.

Migrations `20261002100000_service_specific_subscription_pricing.sql`, `20261002110000_subscription_invoice_billing_breakdown.sql`, and `20261002120000_global_subscription_category_rates.sql` are recorded as applied to the linked database. Read-only checks confirm the invoice breakdown column and global subscriber-rate columns exist, with no category missing a global rate. The linked environment identity and end-to-end subscription smoke tests still need confirmation before release.

## Vendor payout account verification

- Vendors enter their bank name and bank account number from their dashboard profile/settings.
- The server sends those details to Paystack's bank-account verification/resolution service.
- The account must resolve to a valid bank account before it can be used for payouts.
- The vendor should see the verified account name returned by Paystack and confirm that it matches their account.
- Unverified or mismatched bank details cannot be used to initiate a vendor transfer.
- The resolved account details and Paystack verification reference/status should be stored for subsequent settlement transfers.

## Bulk settlement creation

- Admin may select multiple approved vendors for one date range. Each selected vendor receives a separate settlement, and each newly created settlement is immediately submitted to the trusted Paystack transfer service after the batch transaction commits.
- The preview includes only approved vendors with a verified payout account and Paystack recipient, plus non-cancelled, vendor-confirmed orders with paid customer invoices that are not already linked to a settlement. Ineligible vendors remain visible with a reason but cannot be selected.
- Creation rechecks vendor approval, payout-account readiness, and order eligibility inside one database transaction, then writes each settlement, its order links, immutable item snapshots, and audit event atomically. If any selected vendor is no longer eligible or any write fails, the entire bulk operation rolls back.
- The global unique order-to-settlement constraint remains the final duplicate guard for concurrent admins and retries.
- Run `npm test` for the paid-only preview and fake-transaction tests. Repeat the suite three times before staging any connected-database or Paystack test-mode flow.

## Settlement payout error handling

- Settlement records and payout transfers remain separate durable operations, but Admin settlement creation immediately attempts the transfer for each created batch. A created settlement must never be represented as paid until Paystack confirms success.
- Auto-release attempts are processed sequentially. Successful transfers mark their settlements paid; processing or unknown results require reconciliation before retry; failed or rejected results remain pending and can be explicitly retried after review.
- The payout transfer must have its own durable status and audit record. `vendor_settlements.status = 'paid'` is allowed only after Paystack confirms a successful transfer.
- Use explicit transfer states for `queued`, `processing`, `success`, `failed`, `reversed`, and `rejected`.
- Store the Paystack transfer code/reference, recipient snapshot, Admin actor, timestamps, provider response, and failure reason.
- A missing or unverified vendor account, missing Paystack recipient, invalid amount, paid settlement, or active transfer is a local rejection. Do not call Paystack and show Admin what must be corrected.
- A Paystack rejection is a failed transfer. Keep the settlement pending, preserve the provider reason, and permit an explicit retry only after validation passes.
- A timeout or unknown provider response is not a failure and not a success. Mark the transfer as processing or reconciliation-required, check Paystack before retrying, and prevent a second active transfer.
- The original Paystack reference is persisted before the provider call and must be reused to verify an uncertain transfer when Paystack did not return a transfer code. References must satisfy Paystack's length/character constraints.
- Database, audit, or configuration failures must not mark the settlement paid. Surface a safe actionable message to Admin and preserve enough server-side detail for investigation.
- Technical provider responses belong in protected audit data; Admin-facing messages should avoid raw credentials, tokens, or opaque response dumps.
- Reversed transfers require investigation and an explicit operational decision. Do not automatically reopen, retry, or partially pay a settlement.
- Payout workflow tests use a transactional fake store and fake provider to cover persisted success, local/provider rejection, timeout/unknown, duplicate release, reconciliation by transfer code and reference, reversal, database/audit rollback, and retry with the existing reference. They do not exercise the production SQL adapter; add disposable-Postgres integration coverage before enabling live transfers.

### Admin-readable payout messages

The Finance screen should distinguish these outcomes:

- `Account not ready`: verify the vendor payout account.
- `Recipient not ready`: recreate or refresh the Paystack recipient.
- `Transfer in progress`: reconcile the existing transfer before retrying.
- `Transfer failed`: review the failure reason, correct the cause, then retry explicitly.
- `Transfer succeeded`: show the provider reference and payout timestamp.
- `Payout service unavailable`: no payment confirmation was received; settlement remains unpaid.

The UI should always show whether a provider call was attempted, whether the result is known, and what the Admin can do next.

## Recommended implementation sequence

1. Finalize vendor-confirmed count model
2. Create automatic invoice generation from vendor-confirmed data
3. Add mismatch record generation and visible customer messaging
4. Add extra-charge section to invoices for over-counts
5. Add wallet deduction at final invoice settlement time
6. Add pending-payment state when wallet balance is insufficient
7. Add admin mismatch tracking and finance reporting
8. Create immutable vendor settlement snapshots and make settlement creation atomic
9. Add a trusted payout transfer ledger and Paystack recipient readiness
10. Add payout release, reconciliation, audit logging, and explicit retry handling
11. Then add vendor settlement logic based on final confirmed values

## One-sentence policy statement

Final customer billing is always based on the vendor-confirmed quantity after review, with over-counts and under-counts both reflected in the invoice, while wallet settlement happens at final billing time and admin reviews mismatches without approving the billing math.
