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
- The logistics pickup/delivery action validates the intent, requires logistics access when Supabase is configured, and uses separate pickup/delivery OTP error messages.
- The duplicate pickup SQL statement was removed; do not reintroduce a second `update orders` in the pickup branch.

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
- Customer identifiers should use the customer Qaffy ID, formatted as `QF-XXXX` where available, rather than exposing a raw UUID.

#### Authentication callback

- First-time customer authentication may create the missing `profiles` row during `AuthCallback`.
- Vendor, logistics, and admin callbacks still require an approved matching role assignment, with the existing admin legacy-role fallback.

### Important Existing Conventions

- Pickup and delivery OTPs are exactly four numeric digits.
- Do not expose pickup OTP after an order has been picked up.
- Use `profile_roles` for new role checks; do not reintroduce exclusive-role logic.
- Keep same-page logistics tab switching local so changing tabs does not trigger a route loader or page transition.
- Preserve the current customer order badge and tab styling when making adjacent UI changes.

### Current Validation State

- `npm run typecheck` passed.
- `npm run build` passed.
- The recently edited logistics action and customer callback have no typecheck errors.
- `npm run lint` still reports one unrelated existing `react-hooks/set-state-in-effect` error in `src/components/RouteLoadingScreen.tsx`.

### Next Required Actions

1. Apply `supabase/migrations/20260912100000_partner_access_roles.sql` to the deployed Supabase project. The local repository has the migration, but the live database must be linked and migrated before relying on multi-role access in production. The Supabase CLI is not currently installed locally.
2. Run a live smoke test with real data: sign in with multiple roles, switch logistics Pickup/Delivery tabs, search picked-up orders, verify OTP visibility and clearing, inspect customer Home/Orders, and check the responsive vendor Orders table.
3. Implement the next operational priority: delivery verification, including item-by-item QA and the final delivery status transition.
4. After that, prioritize payment settlement/payouts and revenue reporting, followed by admin user management, messaging, wallet/credits, and historical archive views.

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
- Admin sidebar paths were corrected to `/admin/*`.
- No financial mutation actions or settlement assumptions were added. Continue with vendor/logistics approvals and customer management next.
