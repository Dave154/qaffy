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
