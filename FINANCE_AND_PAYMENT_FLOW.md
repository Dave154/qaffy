# Qaffy Finance and Post-Paid Billing Flow

## Status

Approved operational billing model as of 2026-09-14.

### Payment implementation status

- Customer top-ups initialize Paystack server-side and record a pending payment row.
- No customer return callback is configured or used; the browser never verifies payment or credits the wallet.
- Paystack receives the customer overview URL only as a navigation destination after checkout; it is not a payment callback handler.
- `POST /api/paystack/webhook` validates Paystack's HMAC signature and is the authoritative processor for `charge.success` events.
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

### Customer portal continuation checkpoint

- One-time top-ups and subscription purchases share Paystack initialization but remain separate payment types.
- One-time top-ups credit `one_off_balance` only through the signed webhook.
- Subscription purchases store `payments.plan_id` and activate `subscriptions` only through the signed webhook; they do not credit either wallet balance.
- Customer plans are loaded from active database rows and duplicate active subscriptions are blocked at both UI and server levels.
- Customer wallet and subscription updates use Supabase Realtime, with bounded return-page refresh fallback for webhook timing.
- Apply `20260915110000_customer_wallet_realtime.sql`, `20260915120000_subscription_payment_plan.sql`, `20260915130000_authoritative_order_item_pricing.sql`, and `20260915140000_public_order_numbers.sql` before live testing.
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
- Vendor confirmation now stores weighted final units for subscription orders, applies remaining weekly allowance first, and settles only excess from the general one-off wallet. If excess funds are insufficient, the invoice remains unpaid and the order is not released for delivery.
- Next billing-related customer work: run live payment, invoice, order, and OTP smoke tests after applying the pending Supabase migrations.
- Orders now have a globally unique database-generated `public_order_number` in `QO-######` format for user-facing references; UUID order IDs remain internal keys.

### Vendor review continuation checkpoint

- Vendor review quantity changes submit the underlying order-item IDs expected by the trusted finalization service, preserving accurate final counts and billing.
- The vendor-confirmed final count remains authoritative for invoices and settlements. Vendor-added categories are retained with their confirmed quantities, and extra billing is measured against the original order items rather than a baseline that includes additions.
- Vendor review displays only physical customer and received item quantities; subscription-unit accounting remains hidden from the vendor and trusted server-side.
- Physical counts and weighted subscription units are stored in separate order fields. Mismatch direction uses physical counts; subscription allowance usage uses vendor-confirmed unit fields.
- Subscription usage meters count only units covered by the plan; excess units charged from the general wallet are excluded from weekly allowance usage.
- Unclaimed vendor orders are claimed before the vendor sees the detailed review form; count entry is prioritized after ownership is established.

## Logistics continuation checkpoint

- Logistics pickup and delivery remain tabs on one `/logistics` page.
- Pickup search requires the complete four-digit OTP and uses an exact match.
- Confirmed pickup sets the order to `picked_up`, records the pickup date, and nullifies the pickup OTP in the same trusted database update.
- Logistics pickup/delivery results and event history show the global public order reference (`QO-######`); UUIDs remain internal.
- Logistics dispatch now requires the order status to be `paid`; `invoiced` or otherwise unpaid orders remain blocked from delivery.
- Final delivery clears `delivery_otp` in the same trusted update that marks the order `delivered`, preventing OTP reuse.
- Pickup/Delivery was moved out of the header and placed beside the date filter. The controls stay horizontal and compact on small screens. The header has padded spacing, a smaller Logistics label, and a red logout icon.
- Remaining logistics audit work: delivery exceptions, public order number search, event-history visibility, and permission boundaries, then run live OTP/order smoke tests after applying migrations.

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
- If the wallet balance is insufficient, the invoice remains unpaid and the order stays in a pending-payment state.

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

- A subscription order is classified as a subscription order as a whole.
- Subscription coverage is not allocated as separate payment decisions per item.
- The system checks the customer's remaining subscription clothes/units for the week against the order's final confirmed count.
- If the order is within the remaining allowance, the subscription covers the order.
- If the order exceeds the remaining allowance, the subscription covers the available allowance and the excess is charged from the general wallet.
- If the general wallet cannot cover the excess, the entire order remains unpaid and delivery is blocked.
- The customer is prompted to top up the general wallet before the order can be paid and released for delivery.
- The implementation must not partially release or deliver a subscription order while its excess amount remains unpaid.

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
5. System generates final invoice from vendor-confirmed quantity
6. System applies extra charge line item for over-counts
7. System attempts wallet deduction
8. If enough balance exists, invoice is paid
9. If balance is insufficient, invoice remains unpaid and marked pending payment

For a subscription order with excess units, the same final invoice represents the order-level subscription coverage and the general-wallet excess. The order remains blocked until the excess is covered.

## Vendor payout account verification

- Vendors enter their bank name and bank account number from their dashboard profile/settings.
- The server sends those details to Paystack's bank-account verification/resolution service.
- The account must resolve to a valid bank account before it can be used for payouts.
- The vendor should see the verified account name returned by Paystack and confirm that it matches their account.
- Unverified or mismatched bank details cannot be used to initiate a vendor transfer.
- The resolved account details and Paystack verification reference/status should be stored for subsequent settlement transfers.

## Recommended implementation sequence

1. Finalize vendor-confirmed count model
2. Create automatic invoice generation from vendor-confirmed data
3. Add mismatch record generation and visible customer messaging
4. Add extra-charge section to invoices for over-counts
5. Add wallet deduction at final invoice settlement time
6. Add pending-payment state when wallet balance is insufficient
7. Add admin mismatch tracking and finance reporting
8. Then add vendor settlement logic based on final confirmed values

## One-sentence policy statement

Final customer billing is always based on the vendor-confirmed quantity after review, with over-counts and under-counts both reflected in the invoice, while wallet settlement happens at final billing time and admin reviews mismatches without approving the billing math.
