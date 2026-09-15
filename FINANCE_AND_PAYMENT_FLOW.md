# Qaffy Finance and Post-Paid Billing Flow

## Status

Approved operational billing model as of 2026-09-14.

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
