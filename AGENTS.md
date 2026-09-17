# Qaffy Development Agents & System Documentation

## Overview

This document outlines the content structure, features, and requirements for the Qaffy laundry service platform based on analysis of the legacy system and product specifications.

---

## Part 1: Old Qaffy System Content Analysis

### Video Analysis Reference
- **Source**: Screen Recording 2026-09-05 222827.mp4
- **Segment Analyzed**: 19:39 - 22:00 (2min 21sec)
- **System**: Legacy Qaffy Platform (pre-current version)

---

## Part 2: Content Architecture & Features

### 2.1 Customer-Facing Interfaces

#### Order Creation Interface
**Purpose**: Enable customers to create new laundry service orders

**Key Content Elements**:
- Service item selection with category taxonomy
- Service type selection (Wash, Iron, Wash + Iron)
- Quantity management (+ / - controls per item)
- Multi-item support ("Add Other Items" button)
- Pickup location selection (dropdown)
- Order summary/CTA ("Wash My Clothes" button)

**Service Categories Available**:
- General clothing (Shirts, Trousers, Blouses, Skirts, Native tops/trouser)
- Bedsheet
- Towel  
- Suit
- Hoodie
- Duvet
- Pair of shoes/bags

**Service Types**:
- Wash only
- Iron only
- Wash + Iron (combination)

**Data Required**:
- Pricing per category/service combination
- Pickup location list
- Customer selection/auth context
- Order validation rules

---

### 2.2 Vendor/Logistics Interfaces

#### Scheduled Pickups/Orders List
**Purpose**: Display customer orders awaiting collection by vendor

**Table Columns/Data Points**:
1. **Scheduled Date** - When pickup is scheduled
2. **Created Date** - When order was placed
3. **Service Type** - Designation (One-Time, Subscription, etc.)
4. **Customer Name** - Full customer name
5. **Customer ID** - QA-XXXX format identifier
6. **Pickup Location** - Venue (Gris Hostel, Boys Hostel, etc.)
7. **Est. Items Count** - Number of items in order
8. **Payment Status** - Paid / Pending
9. **Status Badge** - Ready / Washing / In Progress
10. **Action Buttons** - Contact / Collect / View & Process

**Notable Features**:
- Multi-view capability (same data, different layouts)
- Date-range filtering (Today, This week, All time)
- Inline action buttons for quick operations
- Status color-coding (green for Ready, orange for Washing)

**Content NOT in Current System**:
- "Contact Cloth" messaging button
- Two-tier date system (scheduled + created)
- Historical pickup views with older dates

---

#### Order Detail & Verification View
**Purpose**: Show detailed order information for processing/QA

**Content Sections**:
1. **Category Details**
   - Full category name with item subtypes
   - Service type abbreviation
   - Quantity count

2. **Order Actions**
   - "Verify Delivery" button (primary action)
   - Other processing steps as needed

3. **Order Metadata**
   - Customer info
   - Dates (scheduled/created)
   - Payment status
   - Location

**Missing from New System**:
- Delivery verification workflow
- Detailed order QA interface
- Item-by-item verification UI

---

### 2.3 Admin/Settings Interfaces

#### Admin Dashboard (partially observed)
**Sections Identified**:
- Dashboard overview
- Revenue tracking
- Order management  
- User/Vendor listings
- Users administration
- Wallet system
- Payouts management
- Settings configuration

**Notable Features**:
- Financial reporting
- Vendor payout processing
- User account management

**Status in New System**: NOT YET IMPLEMENTED

---

## Part 3: Data Models & Structures

### Customer Order Model
```
{
  id: "QA-1822",           // Customer-facing order ID
  customerId: "ID-1822",   // Internal customer identifier
  customerName: "Olapu David",
  status: "Awaiting review" | "Pending" | "In progress" | "Completed",
  scheduledDate: Date,
  createdDate: Date,
  paymentStatus: "Paid" | "Pending",
  pickupLocation: string,
  items: [
    {
      category: string,    // e.g., "General clothing"
      service: string,     // e.g., "Wash + Iron"
      quantity: number,
      unitPrice: number,
      subscriptionUnits?: number
    }
  ],
  totalAmount?: number,
  totalItems: number,
  deliveryOtp?: string,
  pickupOtp?: string,
  notes?: string,
  service?: string  // Observed as redundant with items[].service
}
```

### Pickup Location Model
```
{
  id: string,
  name: string,  // e.g., "Gris Hostel (Nile)", "Boys Hostel"
  address?: string,
  coordinates?: { lat, lng }
}
```

### Service Category Model
```
{
  id: string,
  name: string,
  description: string,
  itemTypes: string[],  // e.g., ["Shirts", "Trousers", "Blouses"]
  basePrice?: number,
  subscriptionUnits?: number
}
```

### Service Type Model
```
{
  id: string,
  name: string,  // "Wash", "Iron", "Wash + Iron"
  description: string,
  priceMultiplier?: number
}
```

---

## Part 4: Missing Features (Not in Current System)

### 1. Settings/Admin Dashboard
- **Scope**: Admin configuration interface
- **Content**: General settings, system configuration
- **Priority**: Medium (infrastructure feature)

### 2. Revenue/Financial Dashboard
- **Scope**: Revenue tracking, financial analytics
- **Content**: Earnings, payouts, financial reports
- **Priority**: High (business-critical)

### 3. Delivery Verification Workflow
- **Scope**: QA process for delivered orders
- **Content**: Verification UI, item-by-item checks
- **Priority**: High (operational)

### 4. Messaging/Contact Integration
- **Scope**: "Contact Cloth" customer communication
- **Content**: In-app or external messaging link
- **Priority**: Medium (customer service)

### 5. Payout/Settlement System
- **Scope**: Vendor payment processing
- **Content**: Payout scheduling, settlement reports
- **Priority**: High (business-critical)

### 6. User Management Administration
- **Scope**: Admin user controls
- **Content**: User creation, permissions, account management
- **Priority**: Medium (operational)

### 7. Wallet/Credit System
- **Scope**: Customer wallet balance tracking
- **Content**: Balance, transactions, top-ups
- **Priority**: Medium (customer feature)

### 8. Historical/Archive Views
- **Scope**: Past orders and data browsing
- **Content**: Date-range filtering, historical data
- **Priority**: Low (reporting feature)

---

## Part 5: Navigation & Sidebar Structure

### Expected Navigation (based on old system)
```
Dashboard
├── Home/Overview
├── Orders
│   ├── Pending
│   ├── In Progress
│   └── Completed
├── Scheduled Pickups
├── Revenue (Admin)
├── Users (Admin)
├── Wallet (Customer)
├── Payouts (Vendor/Admin)
├── Settings
└── Back to Site
```

---

## Part 6: Content Gaps - Feature Mapping

| Feature | Old System | New System | Status | Notes |
|---------|-----------|-----------|--------|-------|
| Order Creation | ✓ | ✓ | Implemented | Both have category/service selection |
| Scheduled Pickups | ✓ | ✓ | Implemented | List view with customer details |
| Payment Status | ✓ | ✓ | Implemented | Paid/Pending indicators |
| Pickup Locations | ✓ | ✓ | Implemented | Dropdown selection |
| Service Categories | ✓ | ✓ | Implemented | Same taxonomy |
| Delivery Verification | ✓ | ✗ | Missing | Important for QA workflow |
| Admin Dashboard | ✓ | ✗ | Missing | Financial/user management |
| Revenue Tracking | ✓ | ✗ | Missing | Business analytics |
| Messaging/Contact | ✓ | ✗ | Missing | Customer communication |
| Payout System | ✓ | ✗ | Missing | Vendor payment processing |
| User Management | ✓ | ✗ | Missing | Admin controls |
| Wallet/Credits | ✓ | ✗ | Missing | Customer balance management |

---

## Part 7: Pricing & Rates

### Observed Service Rates (from video)
- General item wash: ₦200 - ₦350
- General item iron: ₦200 - ₦350
- Bedsheet/Towel wash: ₦600
- Bedsheet/Towel wash+iron: ₦900
- Suit services: ₦2,000
- Subscription unit cost: Variable based on category

---

## Part 8: Design Patterns Used

### UI Components & Patterns
1. **Sidebar Navigation** - Vertical navigation with back-to-site link
2. **Table Views** - Multi-column data tables with inline actions
3. **Dropdown Selections** - Location/service type selection
4. **Quantity Controls** - Increment/decrement buttons
5. **Status Badges** - Color-coded status labels
6. **Action Buttons** - Primary CTAs (green/teal colors)
7. **Form Fields** - Text, dropdown, numeric inputs

### Interaction Patterns
- Click to collect/verify
- Dropdown selection for location
- Quantity adjustment with +/- buttons
- Inline status updates
- Direct action buttons on list items

---

## Part 9: Development Priorities

### Phase 1 (Current - In Progress)
- ✓ Customer order creation
- ✓ Vendor pickup scheduling
- ✓ Order detail views
- ✓ UI/Design system alignment

### Phase 2 (Planned - Next)
- [ ] Delivery verification workflow
- [ ] Payment/settlement integration
- [ ] Revenue dashboard
- [ ] Vendor analytics

### Phase 3 (Future)
- [ ] Admin user management
- [ ] Messaging system
- [ ] Wallet/credit system
- [ ] Historical archive views

---

## Part 10: Content Audit Checklist

Before updating UI components, verify:
- [ ] All service categories are represented
- [ ] All service types are supported (Wash, Iron, Wash+Iron)
- [ ] Pickup locations dropdown is populated
- [ ] Order status states match (Pending, In Progress, Awaiting review, Completed)
- [ ] Action buttons align with workflow (Collect, Contact, Verify, Process)
- [ ] Payment status indicators are present (Paid/Pending)
- [ ] Date formatting matches platform conventions
- [ ] Customer ID format is QA-XXXX
- [ ] Column order matches expected data hierarchy
- [ ] Mobile responsiveness maintained

---

## Document History
- **Created**: 2026-09-11
- **Analysis Source**: Screen Recording 2026-09-05 222827.mp4 (19:39-22:00)
- **Next Review**: After Phase 1 completion

---

## Part 11: Current Implementation Handoff

**Read this section first when continuing work in a new chat.** It describes the current codebase state as of 2026-09-13. Preserve existing user changes and inspect the relevant files before editing.

### Technology and Structure

- React + TypeScript + Vite + React Router
- Supabase authentication, database, and SQL migrations
- The app is a single SPA with customer, logistics, vendor, and admin portals.
- Important source areas are under `src/portals/<portal>/`, shared code is under `src/components/` and `src/lib/`, and database migrations are under `supabase/migrations/`.
- Use `npm run typecheck` and `npm run build` for validation. `npm run lint` is also available.

### Completed Work

#### Additive roles

- Users can have multiple portal roles at the same time. A person may be a customer, vendor, logistics user, and admin in any combination.
- Role assignments are stored in `public.profile_roles`.
- Legacy vendor/logistics tables remain supported for compatibility.
- Role gating in `src/lib/auth.server.ts` and callback access checks use additive role detection rather than one exclusive profile role.
- The migration is `supabase/migrations/20260912100000_partner_access_roles.sql`.

#### Logistics workflow

- Pickup and delivery are tabs on one logistics page, controlled by local state in `src/portals/logistics/LogisticsLayout.tsx`.
- The separate `/logistics/delivery` route was removed from `src/routes.ts`.
- Picked-up orders appear under search.
- The confirm-pickup button was removed.
- After a successful pickup, the OTP input is cleared.
- Logistics pickup and delivery results now show the globally unique public order reference (`QO-######`) for handoff and event history; UUIDs remain internal action identifiers.
- The logistics pickup/delivery action validates the intent, requires logistics access when Supabase is configured, and uses separate pickup/delivery OTP error messages.
- Delivery dispatch is restricted to paid orders; unpaid invoices cannot enter `out_for_delivery`.
- Final delivery atomically changes the status to `delivered` and clears `delivery_otp`, so a delivery OTP cannot be reused after handoff.
- The duplicate pickup SQL statement was removed; do not reintroduce a second `update orders` in the pickup branch.
- Pickup OTP search requires all four digits and performs an exact match; partial OTP input never reveals an order.
- Pickup confirmation atomically sets `picked = true`, records `picked_up_date`, changes the status to `picked_up`, and nullifies `pickup_otp`.
- Logistics displays the globally unique public order reference (`QO-######`) in pickup/delivery results and event history; UUIDs remain internal action identifiers.
- The Pickup/Delivery switch is outside the header navigation, beside the date filter, and remains a horizontal compact control on small screens. The logistics header uses padded spacing, a smaller title, and a red logout icon action.

#### Customer overview and orders

- Recent orders are at the top of the customer home page, above Quick access, using the same visual treatment as the Orders page.
- Overview summary cards and the New order card were removed.
- Order cards show one status badge with status-specific colors.
- OTP is shown instead of price when appropriate. Pickup OTP is hidden after pickup; delivery OTP is shown only when applicable.
- The customer Orders page has no export action or Spend metric.
- Orders use row layout, the filter tabs stay on one line, the scrollbar is hidden, and tabs have an active dot plus underline indicator.
- Use “Delivered” rather than “Completed” in customer-facing order filters/labels.

#### Vendor orders

- The vendor Orders table has responsive spacing and truncation to prevent column collisions.
- Vendor review quantity inputs are keyed by the underlying `order_items.id`, matching the trusted finalization payload and preventing category names from being submitted as item IDs.
- Unclaimed vendor orders show a direct Claim action before details; count-entry review is available after the order is claimed.
- Vendor count review does not expose customer order metadata or pickup OTPs; the review starts with item quantities and count confirmation.
- Vendor count review does not expose invoice, payment, subscription, or order-total metadata; billing remains a trusted server-side outcome after count confirmation.
- Vendor count review shows only physical customer and received item quantities; subscription-unit accounting remains hidden and server-side.
- Physical customer/vendor counts are stored separately from weighted subscription units; mismatch review compares physical counts, while subscription allowance and billing use dedicated unit fields.
- Subscription usage meters count only units covered by the plan; excess units charged from the general wallet do not increase the weekly allowance meter.
- Vendor-confirmed final count is the billing and payout source of truth. Added categories are included in the displayed count, invoice calculation, mismatch handling, and `confirmed_quantity` payout data; extra billing excludes them from the original-order baseline.
- Vendor Realtime subscriptions use the stable revalidation callback, and vendor fetcher responses are handled once to avoid duplicate revalidation, toasts, or subscription churn.
- Customer identifiers should use the customer Qaffy ID, formatted as `QF-XXXX` where available, rather than exposing a raw UUID.
- The vendor overview now loads live category rates from the database and the “Orders needing attention” queue defaults to real orders.

#### Vendor confirmation audit (2026-09-16)

#### Vendor finance progress (2026-09-16)

- Vendor Finance is the single vendor settlement destination; the duplicate Clearing history route and navigation entry were removed.
- Vendor Finance now excludes orders already assigned to a settlement batch from Total payable, scopes order-item loading to the vendor's orders, and shows loader errors instead of silently rendering zero totals.
- Vendor Settings now loads a Nigerian bank dropdown, resolves the account automatically after the tenth digit through Paystack, shows the resolved account name, and saves only after the vendor clicks Save details. Verification state and masked account details persist through `supabase/migrations/20260916150000_vendor_payout_accounts.sql`.
- Remaining vendor finance gaps: actual payout transfer metadata/workflow, historical payout-rate versioning, and finance-specific loading states.
- Vendor portal handoff is complete for the current phase. Continue with Admin settlement release and payout transfer work; do not add payout transfers to the vendor portal.

- The trusted vendor review path correctly locks finalization to orders in `at_vendor`; finalized orders must remain read-only.
- Audit findings requiring follow-up: broad vendor RLS writes, normal-order wallet auto-settlement, subscription usage summing excess units, current-rate billing instead of stored order prices, duplicate settlement membership, order-dependent subscription allowance allocation, missing-rate handling, strict payload completeness, finalized-order confirmed quantity display, settlement transaction atomicity, mismatch detail structure, cancellation allowance handling, and vendor confirmation audit events.
- The first remediation moves vendor claiming to the trusted database path and removes direct vendor writes to orders, order items, and mismatches through `supabase/migrations/20260916110000_restrict_vendor_writes.sql`.
- The follow-up billing remediation auto-settles normal invoices when the one-off wallet covers them, uses stored order-item prices, counts only `subscription_units_applied` for weekly allowance usage, excludes cancelled orders from usage, and prevents duplicate settlement membership.
- Vendor confirmation now requires one safe integer quantity for every original order item, rejects duplicate or added-item IDs in the received payload, and finalized review details display persisted `confirmed_quantity` values.
- Subscription allowance allocation now uses deterministic bounded allocation to maximize covered weighted units instead of depending on database item order.
- Vendor finalization now appends a trusted `order_confirmation_events` record with actor, counts, mismatch detail, and invoice outcome.
- New mismatch records now include structured JSONB item lines, and customer invoices display category, service, declared quantity, confirmed quantity, difference, unit price, and extra charge.
- Invoice payment now requires an unpaid invoice in the `invoiced` order state; cancelled subscription orders no longer count toward the customer usage meter; duplicate mismatch line keys are avoided in the invoice view.
- Customer layouts now subscribe to customer-owned order changes and remount their data provider on lifecycle changes, so pickup status, pickup OTP removal, delivery state, invoices, and mismatch indicators update without a reload.
- Customer wallet and wallet-ledger realtime subscriptions now also include customer payment status; the top-up spinner clears when the signed webhook marks the payment successful.
- Logistics already revalidates on order changes; migration `supabase/migrations/20260916130000_logistics_order_realtime.sql` now publishes orders and logistics events so newly created customer orders appear in OTP search without a reload.
- Vendor layout now also has a visible-page fallback revalidation, so pickup status changes remove orders from the available-claim count even if realtime publication setup is delayed.
- Vendor lifecycle is logistics `pending_pickup` -> `picked_up`, vendor claim `picked_up` -> `at_vendor`; pending pickup orders are excluded from the vendor loader entirely.

#### Admin portal implementation

#### Admin and Finance continuation update (2026-09-17)

- `src/portals/admin/pages/Mismatches.tsx` is read-only for accountability. It has compact/truncated rows, search and direction filters, a details modal, and a modal-only `View order` link to the exact `/admin/orders?orderId=<uuid>` detail view. The table no longer has a Reviewed/Resolve button.
- `src/portals/admin/pages/Finance.tsx` persists admin profit withdrawals in `admin_finance_transactions` and subtracts them from displayed platform profit. This is an internal ledger entry, not a bank transfer.
- Finance settlement batches snapshot each confirmed order-item quantity, vendor unit rate, and payout amount in `vendor_settlement_items`, so later rate-card edits do not rewrite historical payouts.
- Paystack balance failures display as unavailable with an error message instead of being represented as `₦0`.
- Apply `supabase/migrations/20260917110000_admin_finance_ledger_and_settlement_snapshots.sql` before using the new Finance ledger or settlement snapshot paths. The generated Supabase TypeScript types do not yet include these new tables; Finance uses a local snapshot row type until types are regenerated.
- Finance uses compact Naira formatting at million values, such as `₦7.36M`, and its cards, payout table, and side forms stack more safely at narrower widths.
- Vendor and admin login landing screens use role-specific copy and imagery. Vendor uses the requested Unsplash laundry image; admin uses a separate operations image.

#### Next Admin reporting slice

- Admin Orders: date filtering and CSV export based on the current filters **implemented 2026-09-16**. Date filtering currently uses created date.
- Admin Overview: date filtering for the order graph and related statistics, plus live Wash, Iron, and Wash + Iron clothes metrics.
- Admin User Details: the Cancelled metric is hidden for now; subscription dates should derive automatically from the selected plan and semester settings.

Outstanding Admin work is highlighted in `ADMIN_PLAN.md` under **Outstanding Admin Work**. The highest-priority unfinished item is trusted settlement payout release through Paystack Transfers, including transfer metadata, duplicate-transfer prevention, and paid-settlement audit records.

- `src/portals/admin/pages/Home.tsx` loads live dashboard metrics, revenue, vendor/logistics counts, recent activity, and subscription analytics.
- `src/portals/admin/pages/Orders.tsx` is routed at `/admin/orders` and supports search, filtering, and read-only detail views.
- `src/portals/admin/pages/Partners.tsx` supports vendor and logistics partner creation, approval, rejection, suspension, and deletion flows.
- `src/portals/admin/pages/Categories.tsx` manages category creation, updates, main-category designation, activation, and rate-card pricing for customer and vendor values.
- `src/portals/admin/pages/Mismatches.tsx` provides read-only mismatch accountability with search, filtering, truncation, a details modal, and exact-order navigation.
- `src/portals/admin/pages/Finance.tsx` loads live vendor settlement and payout summaries, finance totals, settlement creation actions, persistent withdrawal ledger totals, historical payout snapshots, and explicit Paystack availability errors.
- `src/portals/admin/pages/Plans.tsx` manages plan records and the semester configuration settings.
- `src/routes.ts` registers the admin screens and their `/admin/*` routes.

#### Authentication callback

- First-time customer authentication may create the missing `profiles` row during `AuthCallback`.
- Vendor, logistics, and admin callbacks still require an approved matching role assignment, with the existing admin legacy-role fallback.

### Important Existing Conventions

- Pickup and delivery OTPs are exactly four numeric digits.
- Do not expose pickup OTP after an order has been picked up.
- Use `profile_roles` for new role checks; do not reintroduce exclusive-role logic.
- Keep same-page logistics tab switching local so changing tabs does not trigger a route loader or page transition.
- Preserve the current customer order badge and tab styling when making adjacent UI changes.

---

## Part 13: Customer Portal Completion Pass

**Started:** 2026-09-15

The customer portal is the current completion target. Do not move to another portal until its customer-facing flows use live data, enforce the approved payment model, and have complete loading, error, empty, and responsive states.

### Audit findings

- Customer top-up currently calls `creditWallet` directly from the page action and does not initialize or verify a Paystack transaction. It must become a real Paystack top-up flow; wallet credit must happen only after server-side verification or webhook confirmation.
- Plan cards in `src/portals/customer/pages/Plans.tsx` are hardcoded even though admin plans exist in Supabase. Plan purchase currently inserts a subscription without payment and is explicitly marked as test activation.
- `src/portals/customer/pages/NewOrder.tsx` uses hardcoded categories and prices. The store later fetches category IDs/rates, but the client still controls `unit_price`; the customer selector must be driven by active database categories and the server must determine prices.
- `src/portals/customer/pages/Invoice.tsx` shows only the latest invoice. Invoice history and invoice/order selection are incomplete.
- `src/portals/customer/pages/Transactions.tsx` renders filter buttons without filtering; transaction status is always `Successful`; there is no loading/error state.
- `src/portals/customer/pages/Settings.tsx` contains a hardcoded renewal date, read-only phone/email fields, a `Coming soon` referral value, and a hardcoded empty recent-payments section.
- `src/portals/customer/pages/OtpFlow.tsx` uses the first order rather than selecting an active order, so OTP details are wrong when multiple active orders exist.
- Customer order mapping uses `pickup_location_id` as the display value instead of the pickup location name.

### Completion order

1. Replace simulated top-up with Paystack initialization and trusted verification/webhook crediting.
2. Load active plans and rates from Supabase; make plan purchase payment-backed and prevent duplicate active subscriptions.
3. Make new-order categories, prices, services, and subscription units live; move authoritative price calculation to the server/trusted path.
4. Complete invoice history and expose mismatch/extra-charge details only after vendor confirmation.
5. Add working transaction filters, real payment statuses, and complete loading/error/empty states.
6. Finish profile editing, renewal dates, referral state, and remove customer-facing placeholders.
7. Make OTP flow select an order and verify all customer-visible lifecycle rules.

### Validation checkpoint

- `npm run typecheck` and `npm run build` passed before this pass.
- `npm run lint` now ignores `.kilo/worktrees` but still reports 21 pre-existing source lint errors in unrelated files.
- Existing uncommitted files before this pass: `eslint.config.js`, `src/portals/admin/pages/Finance.tsx`, and `src/portals/vendor/pages/Home.tsx`.

### Completed in this pass

- Customer top-up now initializes a Paystack transaction instead of directly crediting the wallet.
- The Paystack return reference is used only to show payment status; it does not verify or credit the wallet in the browser flow.
- A signed Paystack webhook is registered at `/api/paystack/webhook` and processes `charge.success` events as the browser-independent fallback.
- Wallet crediting is idempotent for an already-successful payment reference, preventing duplicate callback credits.
- RLS remains responsible for allowing customers to create only their own pending payment rows; wallet balances and success status are changed through the trusted server wallet path.
- The top-up modal now explains the Paystack handoff, pending-order coverage, subscription-debt priority, and webhook-confirmed wallet timing without showing an optimistic post-payment balance.
- Customer plans now load from active Supabase plan records; choosing a plan creates a pending Paystack payment with `plan_id`, and only the signed webhook activates the subscription. Subscription payments do not credit either wallet balance.
- The customer Plans page chooses an available billing period by default and shows an explicit empty state when no active database plans exist for the selected period; it does not fall back to hardcoded plan cards.
- Customers cannot choose another plan while an active subscription exists; the UI disables all plan purchase buttons and the server action rejects duplicate active subscriptions. Expired subscriptions no longer count as current.
- After Paystack subscription checkout, customers return to `/plans?payment=pending`; the page revalidates until the webhook-created subscription appears, then cleans the URL. This is navigation/data refresh only, never payment verification.
- Supabase Realtime is the preferred subscription update path; the return-page refresh is bounded to 15 attempts as a fallback and must not become an unbounded polling loop.

### Payment configuration

- Configure `PAYSTACK_SECRET_KEY` on the server and `DATABASE_URL` for the trusted wallet service.
- Configure the Paystack dashboard webhook URL as `https://<production-host>/api/paystack/webhook`.
- The webhook validates `x-paystack-signature`, checks the stored customer payment and exact amount, and then credits the wallet through `creditWallet`.
- The local `.env` now contains non-empty values for the required Supabase, Paystack secret, and direct database variables; restart the dev server after changing them.
- Top-up initialization now uses React Router's `useFetcher` action submission and surfaces initialization errors in the modal; do not replace it with a raw `fetch('/?index')` call.
- No Paystack callback or browser-side payment-status flow is used; the signed webhook is the sole path that credits the wallet.
- Paystack receives a return URL only for navigation back to `/`; it does not perform verification or wallet mutation.
- Customer wallet and wallet-ledger realtime updates revalidate the customer loader after webhook changes; apply `supabase/migrations/20260915110000_customer_wallet_realtime.sql` before relying on live balance updates.
- React Router action-origin protection must allow the active public webhook host during tunnel testing; update `react-router.config.ts` when the ngrok hostname changes, and replace it with the production host before deployment.
- Vite development host protection also requires the active ngrok hostname in `vite.config.ts`; update both files when the tunnel URL changes.
- A `403 Blocked request. This host ... is not allowed.` from the public tunnel is Vite host protection, not an invalid Paystack signature. After allowlisting the host, an unsigned probe should return the webhook's `401 Invalid webhook signature`.

### Next slice

- Customer NewOrder categories, Wash/Iron/Wash + Iron rates, and subscription units now load from active Supabase categories and `cloth_category_rates`.
- Customer order creation recalculates customer prices from database rates, preserves post-paid billing, and uses `20260915130000_authoritative_order_item_pricing.sql` to prevent client-supplied `unit_price` values from being stored.
- Validation for this slice: `npm run typecheck` and `npm run build` pass.

### Next customer task

- Customer invoice history now loads all invoices, supports order/invoice selection, and shows mismatch and extra-charge detail only after vendor confirmation.
- Confirmed vendor mismatches appear as customer notifications and on the affected order in Home, Orders, and order details; mismatch visibility begins only after vendor confirmation.
- Customer Home shows a dismissible mismatch banner, following the subscription-ending banner pattern, with a link to affected orders.
- Mismatch banner lifecycle: unpaid mismatches remain visible until the invoice is paid; paid mismatches show once and can be dismissed, while the mismatch remains on the order details.
- Customer order details hide pickup OTP after pickup and delivery OTP after delivery; trusted logistics updates also nullify both OTPs at handoff.
- Validation for this slice: `npm run typecheck` and `npm run build` pass.

### Next customer task

- Customer Transactions now combines real Paystack payment rows with wallet debit ledger rows, supports working All activity/Top ups/Payments filters, and includes loading, error, and empty states.
- Validation for this slice: `npm run typecheck` and `npm run build` pass.

### Next customer task

- Customer Settings now supports profile name/phone editing, live subscription renewal dates, live referral-code display, live recent payment rows, and independent pickup-location saving.
- Validation for this slice: `npm run typecheck` and `npm run build` pass.

### Next customer task

- Customer OTP flow now selects the correct active order, uses the public order reference, resets OTP step state when switching orders, and excludes delivered orders.
- Vendor confirmation now calculates weighted subscription units, applies the remaining subscription allowance first, and charges only any excess from the customer's general wallet. Insufficient excess funds leave the invoice unpaid and delivery blocked.
- Validation for this slice: `npm run typecheck` and `npm run build` pass.

### Next customer task

- Run live payment, invoice, order, and OTP smoke tests after applying the pending Supabase migrations.

### Public order references

- Orders retain their UUID primary key for internal relationships and trusted actions.
- Customer, vendor, and admin-facing order references use the globally unique database-generated `public_order_number` format `QO-######`.
- Migration `supabase/migrations/20260915140000_public_order_numbers.sql` backfills existing orders and assigns future numbers from one database sequence; it does not use RPC.

### Current Customer Portal Handoff

The customer portal payment and subscription foundation is now implemented as of 2026-09-15.

#### Payment architecture

- One-time wallet top-ups initialize Paystack from `src/portals/customer/pages/Home.tsx`.
- Subscription purchases initialize Paystack from `src/portals/customer/pages/Plans.tsx`.
- Both payment types create a pending `payments` row before Paystack initialization.
- One-time payments have `plan_id = null`; subscription payments store the selected `plan_id`.
- `src/routes/paystack-webhook.ts` is the only payment authority that can mark payments successful, credit one-time wallet funds, or activate subscriptions.
- The browser never verifies Paystack payments and never mutates wallet balances or subscriptions.
- Paystack return URLs are navigation-only: `/` for top-ups and `/plans?payment=pending` for subscriptions.
- Subscription return handling uses Supabase Realtime first and a bounded 15-attempt loader refresh fallback; it does not verify payment.
- Wallet and subscription Realtime subscriptions are in `src/portals/customer/CustomerLayout.tsx`.

#### Customer subscription behavior

- Customer plans are loaded from active Supabase `plans` rows; no hardcoded customer plan catalog remains.
- Purchase actions re-read the selected active plan server-side, so the client cannot control price or weekly limit.
- A customer with an unexpired active subscription cannot select another plan; the UI disables all purchase buttons and the server rejects duplicates.
- Expired subscriptions no longer count as current. Active subscriptions with no end date remain active.
- Subscription purchase price does not credit `one_off_balance` or `subscription_balance`; it creates the subscription after webhook success.
- The active-plan usage bar uses live `subscriptionUsedUnits / weekly_limit` data in both the Plans page and customer sidebar.

#### Required migrations

Apply these migrations to the connected Supabase project before relying on live payment/subscription behavior:

- `supabase/migrations/20260915110000_customer_wallet_realtime.sql`
- `supabase/migrations/20260915120000_subscription_payment_plan.sql`

The first enables Realtime for wallets, wallet transactions, and subscriptions. The second adds `payments.plan_id`.

#### Recent customer UI updates

- Top-up modal no longer lists pending orders and does not show an optimistic balance.
- Top-up modal clearly hands off to Paystack and explains webhook-confirmed wallet crediting.
- Customer Home displays the live Qaffy ID, with Qaffy ID and date justified across the mobile header.
- Customer Plans no longer shows the removed informational note or admin-facing empty-state explanation.

#### Validation

- `npm run typecheck` passes.
- `npm run build` passed after the subscription and realtime changes; rerun after future edits.
- `npm run lint` ignores `.kilo/worktrees` but still reports pre-existing source lint errors unrelated to this pass.

#### Next customer completion slices

1. Make `NewOrder.tsx` categories, services, subscription units, and prices fully live and move authoritative price calculation server-side.
2. Complete invoice history and order/invoice selection; expose mismatch and extra-charge detail only after vendor confirmation.
3. Make Transactions filters functional, load real payment rows/statuses, and add complete loading/error/empty states.
4. Finish Settings profile editing, real renewal dates, referral state, and remove remaining placeholders.
5. Make OTP flow select an active order instead of always using the first order.
6. Run live Supabase/Paystack smoke tests after applying migrations, including webhook delivery through the current public tunnel.

### Current Validation State

- `npm run typecheck` passed.
- `npm run build` passed.
- The recently edited logistics action and customer callback have no typecheck errors.
- `npm run lint` still reports one unrelated existing `react-hooks/set-state-in-effect` error in `src/components/RouteLoadingScreen.tsx`.
- After the 2026-09-17 Finance and mismatch changes, `npm run typecheck` and `npm run build` pass. Build output contains only existing React Router/Vite deprecation and future-flag warnings.

### Next Required Actions

1. Apply `supabase/migrations/20260912100000_partner_access_roles.sql` and `supabase/migrations/20260917110000_admin_finance_ledger_and_settlement_snapshots.sql` to the deployed Supabase project. The local repository has the migrations, but the live database must be linked and migrated before relying on multi-role access or the new Finance ledger/snapshot paths in production. The Supabase CLI is not currently installed locally.
2. Run a live smoke test with real data: sign in with multiple roles, switch logistics Pickup/Delivery tabs, search picked-up orders, verify OTP visibility and clearing, inspect customer Home/Orders, and check the responsive vendor Orders table.
3. Continue the logistics operational audit, including delivery exceptions, public-order-number search, event-history visibility, and permission boundaries.
4. Implement trusted Admin settlement payout release using verified vendor payout accounts and Paystack Transfers. Persist transfer reference, recipient metadata, actor, timestamps, status, and failure reason; prevent duplicate transfers. Do not add payout transfers to the vendor portal.
5. After that, prioritize admin user management, messaging, wallet/credits, and historical archive views.

### Referral Implementation Handoff

- Referral attribution, campaign configuration, reward issuance, promotional wallet credit, expiry, and customer referral history are implemented.
- Referral attribution works through email OTP and Google OAuth signup flows and is protected by the trusted server/database path.
- Referral rewards are issued after a qualifying paid invoice, once per recipient, and do not affect vendor settlement amounts.
- Promotional credit is consumed before ordinary one-off wallet funds and is tracked separately from Paystack top-ups.
- Required migrations are `20260917120000_referral_attribution_foundation.sql`, `20260917130000_referral_campaign_reward_ledger.sql`, and `20260917140000_promotional_wallet_rewards.sql`.
- Remaining work is live Supabase/payment smoke testing, Admin referral/reward history and export, and audited exceptional reversal/correction workflows.

### Suggested Continuation Workflow

- Start by checking `git status --short` so existing user work is not overwritten.
- Read the owning component and its neighboring route/store before editing.
- Make the smallest focused change, then run the narrowest available validation immediately.
- Finish with `npm run typecheck` and `npm run build` when source code changes are made.
- Do not commit changes unless the user explicitly requests a commit.

---

## Part 12: Admin Implementation Plan and Confirmed Product Decisions

**Read [ADMIN_PLAN.md](ADMIN_PLAN.md) before implementing the admin portal.** This is the current source of truth for admin screens, schema sequencing, and finance constraints.

### Confirmed Business Rules

- Vendor claims are exclusive. Once claimed, an order cannot be claimed by another vendor.
- Vendor payout-rate rules, partial settlement payment, and settlement adjustment rules are not decided. Do not invent them.
- Settlement reversal is most likely not allowed and must not be implemented without explicit approval.
- Customer billing is finalized after vendor confirmation. Over-counts and under-counts change the customer amount due and the customer is billed accordingly.
- Customer payments are Paystack transactions that top up the wallet, not Paystack virtual accounts.
- Refunds are not currently a feature. Exceptional refunds are handled manually by an admin.
- Subscription orders are included in vendor settlement calculations.
- Extra clothes are billed to the customer; vendors use the normal review flow based on the final paid item count.
- Paid and settled orders cannot be edited.
- The platform uses a post-paid flow: the customer may top up to the general wallet before final billing, and wallet funds are only consumed when the vendor confirms the final quantity.
- Under-counts are auto-billed from the vendor-confirmed final count; no admin approval is required.
- Over-counts are also billed from the vendor-confirmed final count, and the same invoice must clearly show the extra charge and reason in customer-readable detail.
- The customer should only see mismatch information after the vendor confirms it.
- If the wallet balance is insufficient after vendor confirmation, the order remains unpaid and shows as pending payment until the wallet is topped up.
- Admin is not the billing decision-maker for mismatch math; they review mismatches for tracking, reference, and operational visibility only.
- A subscription order is classified as a subscription order as a whole; subscription coverage is not allocated as separate payment decisions per item.
- Subscription allowance covers the order first, and any excess is charged from the general wallet. If the general wallet cannot cover the excess, the entire order remains unpaid and delivery is blocked until the customer tops up.
- Vendors enter bank name and account number in their dashboard; Paystack must verify and resolve the account before it can be used for payouts, and the vendor must confirm the resolved account name.

### Admin Build Order

1. Real Admin Overview and Admin Orders **(implemented 2026-09-13)**
2. Vendor/logistics approvals and customer management
3. Categories, rates, and pickup locations
4. Mismatch review and resolution
5. Vendor ownership and finance/settlement reporting
6. Plans/subscriptions, referrals, audit log, and granular permissions

### Schema Priorities

Before production assignment or settlement work, add vendor ownership to orders. Then add admin audit events, mismatch resolution fields, settlement payment metadata, and any subscription lifecycle metadata required by the approved payment model. Keep wallet changes inside the trusted wallet service and append-only transaction ledger.

### Admin Phase 1 Implementation State

- `src/portals/admin/pages/Home.tsx` now loads live dashboard metrics, seven-day order/revenue analytics, order pipeline counts, plan subscriber mix, and recent activity.
- `src/portals/admin/pages/Orders.tsx` is registered at `/admin/orders` and loads live orders with customer, location, item, and invoice data.
- Admin Orders supports search, status filtering, truncated responsive table rows, and a read-only detail modal.
- `src/portals/admin/pages/Partners.tsx` now supports vendor and logistics onboarding, approval/rejection/suspension, and removal flows.
- `src/portals/admin/pages/Categories.tsx` supports category and rate-card management, including vendor and customer pricing fields.
- `src/portals/admin/pages/Mismatches.tsx` supports mismatch review and resolution by order.
- `src/portals/admin/pages/Finance.tsx` loads live payout/settlement summaries and supports settlement recording actions.
- `src/portals/admin/pages/Plans.tsx` supports plan creation/editing and semester settings.
- Admin sidebar paths were corrected to `/admin/*`.
- Delivery verification and the final customer-facing payout workflow remain the next major operational gaps.
