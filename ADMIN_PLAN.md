# Qaffy Admin Implementation Plan

Referral product rules and implementation sequencing are documented in [REFERRAL_PLAN.md](REFERRAL_PLAN.md). Treat that document as the source of truth before building referral attribution, campaigns, or rewards.

**Status:** Approved planning baseline
**Updated:** 2026-09-17

Read this before implementing the admin portal. Confirmed product decisions are binding unless the user changes them.

## Product Rules

- A vendor claim is exclusive. Once an order is claimed, another vendor cannot claim it.
- Vendor settlement-rate rules are not decided yet. Do not invent a vendor payout formula.
- Partial settlement payment is not decided yet.
- Settlement reversal is most likely not allowed; do not implement reversal until explicitly approved.
- Customer billing depends on vendor-confirmed item details. Vendor over-counts and under-counts change the final amount due, and the customer is billed accordingly.
- Customer payments are Paystack transactions that top up the wallet. This is not a Paystack virtual-account flow.
- Refunds are not a current feature. Any exceptional refund is handled manually by an admin; do not build automated refunds yet.
- Subscription orders are included in vendor settlement calculations.
- Extra clothes are billed to the customer. The vendor follows the normal receiving/review flow using the final paid item count.
- Once an order has been paid for and settled, it cannot be edited.
- Wallet balances must be changed through the existing trusted wallet service and append-only wallet transactions, never direct client table writes.

## Current Admin State

- Admin authentication and `requireRole(request, 'admin')` exist.
- `src/portals/admin/AdminLayout.tsx` has the shared Admin sidebar with consistent menu spacing, expandable Settings/Partners groups, and nested chevron navigation.
- `src/portals/admin/pages/Home.tsx` loads live overview analytics and chart data.
- The admin routes in `src/routes.ts` include overview, orders, finance, categories, pickup locations, mismatches, plans, referrals, Admin management, partners, and user screens.
- The codebase includes working data tables and screens for profiles, profile_roles, vendors, logistics_agents, orders, order_items, mismatches, invoices, payments, wallet tooling, plans, subscriptions, cloth_categories, cloth_category_rates, pickup_locations, vendor_settlements, vendor_settlement_orders, referrals, and order_logistics_events.
- Admin functionality already implemented in code includes overview, partner management, categories/rates, mismatch review, finance summaries, and plan configuration.
- Admin provisioning is implemented at `/admin/admins` under Settings. An existing or new email can receive approved Admin access through `profile_roles`; the action is server-side and audited.

## Outstanding Admin Work

These items are **not complete yet**:

### High Priority

- **Admin Orders date filter:** filter orders by date range. **Implemented 2026-09-16** using created date.
- **Admin Orders CSV export:** export only the currently filtered order results. **Implemented 2026-09-16** with search, status, and date filters applied.
- **Admin Overview date filter:** implemented 2026-09-16 with independent general and chart date ranges using All time, This month, Last month, and Custom options.
- **Admin Overview service metrics:** implemented 2026-09-16 with live Wash, Iron, and Wash + Iron clothes counts from order items.
- **Admin Overview chart metrics:** implemented 2026-09-16 with Orders, Revenue, and New customers chart options.
- **Settlement payout release:** execute trusted Admin payout transfers after verifying the vendor payout account. The current Admin Finance page records internal withdrawals and settlement batches, but does not initiate bank transfers yet.

### Medium Priority

- **Automatic subscription dates:** derive subscription start/end dates from the selected plan and semester settings in Admin User Details.
- **Settlement transfer audit trail:** persist transfer reference, actor, timestamps, status, and failure reason.
- **Duplicate payout prevention:** prevent a settlement from being transferred more than once.
- **Finance loading/error states:** show dedicated loading and query-error states in Admin and Vendor Finance.
- **Historical payout-rate versioning:** item-level payout snapshots are now stored when a settlement batch is created through `supabase/migrations/20260917110000_admin_finance_ledger_and_settlement_snapshots.sql`.

### Deferred

- **Customer/vendor messaging.**
- **Historical/archive views.**
- **Granular Admin permissions.** Admin provisioning currently grants the single approved Admin role; permission levels are still deferred.
- **Settlement reversal or partial payments**, pending explicit product approval.

### Next Admin UX and Reporting Requirements

#### Admin Orders

- Add date-range filtering to the Orders page.
- Add CSV export for the currently filtered order results only, using the active search/status/date filters.
- Keep export data aligned with the visible order table and avoid exporting internal OTPs or unnecessary sensitive fields.

#### Admin Overview

- Add date filtering to the overview dashboard and apply it consistently to the order graph, revenue, pipeline, and related statistics.
- Make the order graph filterable by date range and compatible with the other overview filters.
- Add live clothes-processed metrics split into Wash, Iron, and Wash + Iron counts, based on confirmed/order item service data.
- Define whether overview date filters use order creation date, pickup date, or another operational date before implementation; default recommendation is created date for order/revenue trends and confirmed date for processing metrics.

#### Admin User Details

- Hide the Cancelled order metric for now; retain the underlying status data for future use.
- Subscription start and end dates should populate automatically from the selected plan and current semester settings when an admin creates a subscription. Manual date overrides should not be required for the standard flow.

### Phase 1 Progress

- Admin Overview now loads live order, customer, vendor, logistics, invoice, subscription, and plan data.
- Admin Overview now includes live seven-day order/revenue charts, pipeline bars, subscriber mix, KPI cards, and recent activity.
- Admin Orders is registered at `/admin/orders` with live rows, search, status filtering, truncation, payment/status badges, and a read-only order detail modal.
- Admin Partners now supports vendor and logistics onboarding, approval, suspension, rejection, and deletion flows.
- Admin Categories and Rates now supports category creation, updates, activation, archival-safe deletion behavior, and customer/vendor pricing controls.
- Admin Mismatch Review is a read-only accountability view with search, direction filtering, compact/truncated rows, a detail modal, and a modal-only link to the exact Admin order detail.
- Admin Finance loads live payout summaries and settlement creation data from live orders and rates. Admin profit withdrawals persist in `admin_finance_transactions`, and settlement item snapshots preserve historical vendor rates and amounts.
- Finance now renders Paystack balance failures as `Unavailable` with an explanatory state instead of silently showing `₦0`.
- Finance cards and payout panels have responsive containment; million-level amounts use compact notation such as `₦7.36M`.
- Admin Plans supports plan edits and semester configuration settings.
- Admin sidebar links now use `/admin/*` paths instead of leaving the admin portal.
- Delivery verification, trusted settlement transfer execution, and wallet/messaging/archive layers remain future work.

## Navigation and Screens

### Overview

Replace hardcoded cards with live metrics:

- Total orders and orders today
- Pending pickup, picked up, at vendor, awaiting review, paid, out for delivery, delivered, cancelled
- Total clothes processed
- Revenue collected
- Unpaid invoices
- Amount due to vendors, labelled clearly once the payout formula exists
- Active customers, subscribers, vendors, and logistics agents
- One-time versus subscription revenue
- Under-count and over-count mismatch rates
- Recent operational activity

Metric cards should link to filtered admin screens.

### Orders

Table columns:

- Order ID
- Created date
- Pickup date
- Customer and Qaffy ID
- Order type
- Item count
- Customer count
- Vendor count
- Pickup location
- Invoice/payment status
- Order status
- Assigned vendor
- Actions

Filters/search:

- Date range
- Order status
- Payment status
- Order type
- Subscription versus one-time
- Pickup location
- Vendor
- Customer name, email, phone, Qaffy ID, or order ID
- Mismatch state

Order detail modal should show customer, location, item lines, prices, invoice, payments, logistics events, mismatch details, notes, and status history. Active OTPs must not be exposed unnecessarily. Paid and settled orders are read-only.

### Users

Customer table:

- Qaffy ID, name, email, phone, joined date
- Order count and total spend
- Regular/subscriber state
- Current plan
- Wallet and outstanding balance
- Last order

Customer detail:

- Profile and additive roles
- Orders, invoices, payments, wallet ledger
- Subscription and referral history
- Manual profile edits
- Controlled wallet adjustment with an audit/ledger entry

Search by name, email, Qaffy ID, or phone. Export should be CSV where appropriate.

### Vendors

Vendor table and detail screens must support:

- Pending/approved/rejected/suspended states
- Approval, rejection, suspension, and reinstatement
- Profile and activity
- Orders and mismatch rates
- Amount due and settlement history

Vendor assignment is not represented on `orders` yet. Add it before production assignment or settlement work.

### Logistics

Manage approved/pending/rejected/suspended logistics users and show pickup/delivery activity from `order_logistics_events`.

### Categories and Rates

Manage cloth categories and active/archive state. Manage wash, iron, wash+iron prices, subscription units, and weight. Avoid hard deletion after a category is referenced by an order.

### Pickup Locations

Manage location name, optional address, active state, and usage. Archive instead of deleting referenced locations. Customer and vendor UI should use location as the operational value; address is not required in the vendor workflow.

### Plans and Subscriptions

Plans must support name, monthly/semester type, price, weekly limit, semester end date, and active state. Show subscriber counts and expiration warnings. Semester expiration must end affected subscriptions consistently.

### Finance and Settlements

Build after vendor ownership and auditability are in place:

- Revenue by one-time, subscription, and extra-item billing
- Unpaid invoices and Paystack top-ups
- Settlement periods and included orders
- Settlement review and paid status
- CSV exports

Do not implement a vendor payout rate until the product decision is provided. Do not implement automated refunds or settlement reversals.

### Mismatches

- Admin reviews mismatches for accountability only; there is no admin approval or reviewed action.
- Full mismatch details are shown in a modal. The modal contains the `View order` link, which opens the exact Admin order detail using the internal order UUID in the query string while the UI displays the public `QO-######` reference.

Track over and under counts by order, vendor, customer, category, and date. Vendor confirmation changes the final customer amount due. Admin only reviews and references mismatch records; the admin screen does not approve or resolve billing math.

## Required Schema Work

Recommended migration sequence:

1. Add exclusive vendor ownership to orders, for example `orders.vendor_id references vendors(id)`, with guarded claim semantics.
2. Add admin audit events for role changes, order edits, mismatch decisions, wallet adjustments, and settlement actions.
3. Add mismatch difference count, review status, resolution, resolved by, and resolved date.
4. Add settlement paid date, payment reference, admin actor, notes, and adjustment metadata.
5. Add subscription payment/lifecycle metadata if renewals or detailed subscription reporting are implemented.
6. Add optional granular admin permissions.
7. Add rate history/versioning if historical rate reporting is required.

Never add a direct mutable wallet-balance admin path. Use the trusted wallet service and append-only ledger.

## Implementation Phases

### Phase 1: Real Admin Overview and Orders

Complete.
- Admin routes and loaders/actions are registered and active.
- Overview metrics are loaded from Supabase data.
- Shared table, search, filters, empty/loading states, and detail-modal patterns are implemented.
- Order detail views are active.
- Overview metrics are linked to filtered admin screens.
- Paid-and-settled immutability rules remain an ongoing enforcement point for future workflows.

### Phase 2: Operational Administration

Mostly complete for core operational screens.
- Vendor and logistics approvals are implemented in the partner management flow.
- Customer/user management screens are present.
- Categories and rates are implemented.
- Pickup locations are implemented.
- Read-only mismatch accountability is implemented with compact rows, filters, a detail modal, and exact-order navigation.

### Phase 3: Finance

Vendor-side finance preparation is complete; Admin payout execution remains the next workstream.
- Revenue and payout summary views are active.
- Invoice/payment and settlement summary data are being surfaced.
- Vendor ownership, confirmed-quantity payout calculation, settlement generation, and vendor payout-account verification are implemented.
- Vendor Finance is the single vendor settlement destination and excludes orders already assigned to settlement batches from outstanding payable totals.
- Admin still needs the trusted settlement release and payout-transfer workflow, including transfer metadata, Paystack recipient/transfer handling, and paid-settlement audit records.
- Historical payout-rate snapshots are implemented for settlement items through `supabase/migrations/20260917110000_admin_finance_ledger_and_settlement_snapshots.sql`.
- Finance-specific loading and query-error states remain future work.
- Manual wallet adjustment workflow still needs full validation against the approved wallet service rules.

### Referral MVP

- Referral attribution supports email OTP and Google OAuth signup flows with immutable database-generated codes.
- Admin can create, activate, pause, and end referral campaigns at `/admin/referrals`.
- Paid qualifying invoices issue idempotent rewards to both the referrer and referred customer.
- Promotional referral credit is stored separately from Paystack-funded wallet balances, expires per reward, and is consumed before ordinary one-off funds.
- Customer Settings shows referral sharing, referral history, and reward status.
- Remaining referral governance work is Admin reward history/export and audited exceptional reversal or correction workflows.

### Next Admin Workstream: Settlement Payouts

Implement this only after confirming the unresolved product decisions below:

- Review pending settlement batches and their included orders.
- Confirm the vendor payout account is verified before any transfer.
- Initiate the approved Paystack transfer from a trusted server action.
- Persist transfer reference, recipient metadata, actor, timestamps, status, and failure reason.
- Make payout status transitions auditable and prevent duplicate transfers.
- Keep settlement reversal and partial payment disabled until explicitly approved.

### Phase 4: Governance and Subscriptions

Partially implemented.
- Plan management and semester settings are in place.
- Referral campaign configuration is implemented; referral/reward history, exports, and exceptional governance actions remain future work.
- Granular permissions are not yet implemented.

## Unresolved Product Questions

Do not make assumptions about:

1. Vendor payout rate: invoice amount, item rate, or separate vendor rate.
2. Whether partial settlement payments are allowed.
3. Whether a settlement can ever be reopened or reversed.
4. Whether settlement adjustments are allowed after creation.
5. Exact admin approval/review statuses for mismatches.
6. Subscription renewal and payment behavior.

## Engineering Rules

- Check `git status --short` before editing.
- Read the owning loader, route, schema migration, and neighboring component first.
- Make the smallest focused change.
- Add or update a migration for every schema change.
- Validate server authorization in every admin action, not only in loaders.
- Run the narrowest check immediately after editing, then `npm run typecheck` and `npm run build`.
- Do not commit unless explicitly requested.
