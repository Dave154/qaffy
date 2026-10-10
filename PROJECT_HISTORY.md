# Qaffy Project History and Implementation Timeline

## The real story

This project did not evolve in a straight line from “idea” to “finished product.” It went through the familiar pattern of product work that is sometimes messy in public: feature wins, accidental regressions, design pivots, business-rule clarifications, and repeated returns to the system’s real constraints.

The honest story of Qaffy is that the team kept encountering the same truth again and again: the app was not just a laundry storefront. It was an operations platform with trust boundaries, financial rules, and workflows that had to behave correctly under real life.

The repo’s session history shows that plainly. Across multiple sessions, the conversation kept returning to the same underlying issues: portal polish, true operational data scoping, product wording accuracy, mobile usability, and—most importantly—whether something was truly trusted or merely looked correct in the UI.

This history is written as a story, not a polished marketing timeline: it includes the false starts, the pivots, the compromises, the brief “this should be enough” moments, and the later corrections that made the system more credible.

---

## The starting point: a laundry platform, not a generic app

The original brief and the legacy product analysis were always grounded in a specific service flow:

- customers place orders with pickup and delivery timing
- logistics manages handoff with OTP verification
- vendors confirm physical item counts and mismatches
- admins manage categories, plans, partners, and finance
- the platform has a billing model, settlement logic, and operational tracking

That was never a fake requirement. It was the business model from day one.

What changed over time was how much of that logic was treated as real vs cosmetic. Early work was about creating a product shell. Later work was about making the shell obey the actual business rules.

This is one of the core arcs of the project: the app kept becoming less “pretty mockup” and more “trusted business system.”

---

## Phase 1: app shell, portal separation, and the first fake comfort

The first implementation work created the project structure: React + TypeScript + Vite, routing, Supabase auth, and a multi-portal shell for customer, logistics, vendor, and admin.

That was the first major design compromise in the project’s favor: instead of trying to force everything into one portal, the team recognized that each role needed its own operational context. A customer does not need the same focus as a logistics operator or a vendor review screen, and the architecture reflected that.

At the same time, the project still had a lot of “this is enough for now” thinking in its bones. The shell looked like a real app, but many of the data flows behind it were still simplified. This was the stage where product storytelling and product logic were not yet fully aligned.

---

## Phase 2: OTP, state transitions, and the first “not really” moments

Once the app had enough surface area, the team started dealing with operational realities:

- login and OTP email templates required correct token rendering
- pickup/delivery flows became state transitions rather than just screens
- orders moved from “a list item” to “a tracked fulfillment object”
- the same order had to be visible to different roles without exposing the wrong data

A recurring theme began to surface here: the business logic is harder than the UI.

For example, OTP handling was never just a cosmetic UI pattern. It became a trust boundary. The project repeatedly corrected it because an OTP is not just “a code at the end of a form”; it is a control that proves a real action happened at a real point in the workflow. Similarly, logistics pickup and delivery actions had to be exact, atomic, and not re-usable.

This was one of the earliest real “burns” in the project: we could build a screen that looked right without actually enforcing the operational rule. That lesson came back many times.

---

## Phase 3: customer flows matured, and trust boundaries became obvious

The customer portal was the next major maturity phase. This is where the product became more serious and the team had to confront that a browser is not the authority on money or business state.

This is the phase where the project moved from:

- hardcoded categories and rates
- optimistic wallet updates in the UI
- mocked plan behavior
- client-side price trust

into:

- live rate-card-driven order pricing
- server-side authoritative price calculation
- Paystack-backed top-ups and subscriptions
- webhook-driven wallet and subscription activation
- invoice generation rooted in vendor-confirmed quantity and mismatch state

This was a major product correction, and it is still one of the strongest examples of the project’s epistemic growth. The team stopped pretending that front-end state could be the source of truth once money and customer obligations were involved.

The project had to do the unpleasant but correct thing: go back to the trusted path and remove client-driven logic that looked faster but was operationally unsafe.

---

## Phase 4: the admin layer finally became a real operational system

The admin portal was not the first thing to be built, and that delay was intentional. It became a serious operational layer only after the core business workflow existed. Once it was there, it grew quickly into:

- overview analytics
- order search and filtering
- partner management
- categories and rate cards
- mismatch accountability views
- finance tracking and settlement snapshots
- plan configuration
- admin approvals and access flows

This was a major milestone because Qaffy stopped being a customer-app-plus-mini-ops layer and became a business system with management needs.

The admin plan also reveals a key compromise: admin was designed to review and monitor, not to invent or override the math in unsupported ways. That decision protected the workflow from chaos. It was a recognition that not every issue is “admin decides.” In many cases, the system must preserve trust boundaries and keep the math in the operational path.

---

## Phase 5: the deep financial and settlement rules were the hardest part

This is where the project got serious enough that the codebase started reacting to actual audit and system concerns rather than just feature requests.

The vendor review and settlement history shows repeated issues around:

- direct vendor writes to sensitive tables
- duplicate settlement membership
- subscription allowance being miscounted
- mismatch lines being insufficiently structured
- customer billing depending on the wrong source of truth
- missing rate handling and historical settlement accuracy
- inconsistent store of final confirmed quantities

The session history reflects this as a recurring “we need to fix the actual accounting path, not just the screen.” There were clear periods where the team did not just add UI polish; they tightened the trusted database path.

This is one of the strongest examples of the project’s actual maturity. It was no longer just “where do I show the number?” It was “what is the system allowed to trust?”

This is also where the project developed a very practical compromise: the vendor portal does not initiate settlements or payouts; the admin system owns that release flow after proper verification. That choice kept the business model and operational control clearer.

---

## Phase 6: referrals, notification flows, and the rise of real customer communication

Later sessions show the team pushing from pure operations into customer communication and lifecycle reminders:

- referral attribution and rewards
- promotional wallet credits
- notification center and push subscriptions
- mismatch notifications and payment reminders
- subscription renewal and expiry reminders
- overview banners and notification prompts

This was another product-level growth point. It expanded the app beyond “do the laundry” into “keep the customer informed and moving.” The user experience got more active, but the team also had to preserve truthfulness: referral rewards could not be described as earned before the qualifying action; mismatch notices could not be phrased as admin review when the customer was the person who had to understand the result.

This produced some of the most useful small but important product language corrections. The project kept learning that a system with operational data must be honest about pending states, not optimistic about the customer experience.

---

## The repeated product problem: the team kept going back to first principles

The session history reveals a recognizable pattern.

The same themes came back again and again across months of work:

- “this should be live data, not hardcoded”
- “this should not be client-authoritative”
- “this should be sorted by timestamp, not urgency”
- “this should be agent-scoped, not global”
- “this should be centered and consistent with desktop styling”
- “this should say pending, not already earned”
- “this must be honest to the customer and not make false claims”

That pattern matters. It tells the story of a project that repeatedly returned to the same principle: the app must match the operation, not the wishful version of the operation.

These were not random bug fixes. They were the project re-grounding itself in the actual business rules every time the UI got ahead of the system.

---

## The biggest burns we had on the way

The repo and session history capture some very real “burns” that shaped the system.

1. Client-side pricing looked easy but was not trustworthy.
   This was probably the single most repeated lesson: if the app handles billing, the price must be authoritative in the trusted path.

2. Browser-side wallet updates were not safe.
   The team learned the hard way that money and subscription state require server-side mutation and webhook validation.

3. Product messaging could lie even when the UI looked polished.
   “Reward earned” language, mismatches presented as admin review, or “normal order” clues that were not actually normal created trust problems for the customer.

4. Global dashboards were misleading when the user context was actually scoped.
   Logistics views had to show only the signed-in agent, and customer recent orders had to sort by actual time rather than visible urgency.

5. UI polish could hide structural problems.
   Mobile nav spacing, chart labels, and sidebar layout looked small, but they often reflected a bigger issue: the interface was not fully aligned with the real product structure.

6. Operational state transitions were easier to imagine than to enforce.
   OTP clearing, final delivery locking, payout release, and settlement snapshots all required migration, audit, and trust-aware logic rather than a skinned front-end button.

These are the kinds of problems that don’t show up in a simple feature list. They show up in the actual build conversation and in the codebase’s repeated corrections.

---

## The compromises that made the product better

Not everything was rework. The project also made productive compromises that kept it moving without permanently muddying the product model.

- It kept a single SPA with role-based portals instead of exploding into several disconnected apps.
- It separated finance and payout control instead of letting the vendor portal own unsupported payout logic.
- It kept admin review read-only where product rules were not approved for managed override.
- It accepted the reality that some features must remain deferred until the trusted workflow is ready.
- It kept a small but deliberate scope for the product while still making the primary operational flows real.

Those compromises were not failures. They were necessary trade-offs. They kept the product moving while preserving enough discipline to avoid breaking the operating model.

---

## The session history is the real story arc

The workspace session history from September 15 through September 22 is especially revealing about how the project evolved in practice.

The pattern is consistent:

- September 15: handoff and continuity between chat sessions, plus foundation corrections and new chat/context transfer
- September 16: admin UX and data filtering improvements, order export polish, and operational screen refinement
- September 17: OTP and finance logic, extra product constraints, referral flow corrections, and the current admin state
- September 18: notifications, push integration, PWA install affordances, and customer communication design
- September 19–22: mobile layout consistency, brand alignment, referral modal behavior, logistics scoping, and timestamp correctness

The same product truth underpins all of it: the product became more robust each time the team corrected it to reflect the actual business process, not the imagined one.

---

## Current state: real product, not fake completion

As of 2026-10-10, Qaffy is in a strong implementation phase. The major portals are operating with product-like behavior:

- customer flows cover ordering, payment, subscriptions, invoices, notifications, settings, reward activity, and referral behavior
- reward center covers both cashback configuration and referral campaigns in one admin surface
- logistics flows are scoped to the signed-in operator and grounded in OTP-based handoff steps
- vendors can review and finalize counts with mismatch-aware logic
- admin supports live analytics, operational management, categories, rates, plans, reward configuration, and financial summary views
- Admin Users and Orders apply search and filters server-side before returning ten-row pages; their CSV exports include all filtered results rather than only the current page
- Admin Orders additionally filters payment status server-side and keeps that filter in pagination and all-matching CSV exports; Admin User Details positive wallet credits follow top-up allocation, exclude Paystack cashback, and notify customers
- Customer New Order defaults the service selector to match active plan coverage while keeping other services selectable
- customer profile completion and subscription administration enforce required profile data and plan/semester-aware dates, with active subscription end-date editing for Admins

At the same time, the project still has open work in the trust-heavy areas:

- deeper settlement audit records
- historical payout-rate management
- advanced admin governance and archive views
- more live end-to-end payment and operations smoke testing

This is the state of a mature product conversation: not a finished system, but a system that has crossed the threshold from mock app to real operations platform.

## October 6–7, 2026: account management and scalable admin tables

The October 6–7 pass addressed two kinds of operational correctness. First, subscription and profile administration were tightened: required name and phone data are enforced on the authenticated incomplete-profile route; complete users are redirected home; semester subscriptions use the configured semester end date; and Admins can edit an active subscription's end date without a redundant completion button.

Second, Admin Users and Orders no longer rely on loading the entire matching data set into the browser. Search and filters are applied server-side before pagination, each table returns ten rows per page, and page/filter navigation uses an in-table loading state rather than the global Qaffy loader. Separate export resource routes stream all matching filtered rows in bounded batches, regardless of the currently selected page. Order search/filter/detail queries and customer search/aggregate queries live in server-only modules, keeping privileged database logic outside browser bundles.

Supporting query indexes were added as migrations `20261007100000_admin_user_pagination_indexes.sql` and `20261007110000_admin_order_pagination_indexes.sql`. Their presence in the repository is not evidence that they have been applied to a remote database. The deployment handoff must verify the linked Supabase environment and migration state before applying them.

The new implementation was checked in the browser for pagination, details, CSV responses, and table-local loading, and validated with typecheck, build, focused lint, and diff checks. No commit or remote migration application was part of this pass. Settlement release and payout transfer work is complete: the staging migration and Paystack test-mode transfer were verified, with the transfer confirmed by Paystack and the local ledger. Further SQL-adapter and asynchronous pending-result tests are follow-up confidence work; see [ADMIN_PLAN.md](ADMIN_PLAN.md).

## October 10, 2026: wallet operations and payment visibility

Admin Orders gained a server-side paid/pending payment filter. Its state is preserved in URL navigation, pagination, and all-filtered CSV exports, so Admins can find unpaid orders across pages.

Admin User Details now treats a positive wallet entry as an admin top-up. It uses the same debt-first and eligible-invoice auto-settlement allocation as a Paystack top-up, but does not create a Paystack payment or award cashback. The wallet ledger and customer Transactions identify the credit as an admin top-up; customers receive a top-up notification, and invoices settled by the credit continue to produce the usual invoice-paid notification. Negative entries remain adjustments. Admin identity is not recorded, and no migration is required.

The customer New Order service selector now initially matches the active plan: Wash-only defaults to Wash, Iron-only to Iron, and both-service or no-plan customers default to Wash + Iron. Customers can still change the selection.

These code changes passed typecheck, build, all 52 tests, and `git diff --check`. No new migration or remote database change was needed.

---

## Final takeaway

Qaffy’s real history is not a clean “feature build.” It is a sequence of corrections to reality.

The team kept redoing the work because the domain required it: money had to be trusted, OTPs had to be enforced, billing had to be accurate, roles had to be additive and operational, and UI polish had to stop misleading the user.

That is what made the project healthy. It did not move in a straight line. It moved by returning to fundamentals after each wave of polish.

And in the end, that is the project’s most honest story: it became a serious laundry operations system because the team kept refusing to let the UI lie about the business.


Admin-facing:
- overview analytics and dashboard metrics
- order list, search, status filter, and export
- categories and rate-card management
- partner approval and management
- mismatches accountability review
- plans and semester configuration
- admin provisioning and role assignment
- finance summaries and settlement records
- referral admin management surface

These are substantial and meaningful accomplishments that align with the original operational model.

### Not yet complete or still intentionally deferred

The repository also clearly documents unfinished areas:
- trusted Admin settlement payout transfers through Paystack
- historical payout-rate versioning
- finance-specific loading states for some screens
- messaging system
- historical archive views
- full granular admin permissions
- broader customer-facing archive and analytics work
- settlement reversal or partial settlement logic, pending explicit product approval

This is important because it shows that the project is not “complete” in the broadest product sense; it is a multi-phase system whose current completion is bounded by operational and financial requirements.

---

## Major product and technical decisions

## 1) Multi-role additive model

The project intentionally moved away from a single exclusive profile role and supports additive roles via `profile_roles`. This is important because a user can be both customer and vendor or customer and logistics or hold more than one access path simultaneously.

This is a significant system design decision because it changes:
- access control logic
- route guards
- auth callback handling
- internal role expectations
- partner approval flows

It also allows the same user to interact with multiple portals without forcing a one-role-per-user model.

## 2) Post-paid billing model

Qaffy’s business model is specifically documented as post-paid. The wallet is a general balance that is only consumed when the vendor confirms the final count, not at original order creation.

This decision is central to the platform because it affects:
- invoice generation timing
- customer wallet top-up UX
- vendor review and billing rules
- subscription logic
- status handling for unpaid orders

This is one of the clearest strategic product decisions in the project and one of the hardest parts to implement correctly.

## 3) Trusted server-side payment and wallet architecture

The project explicitly decided that browser code does not verify Paystack payments or credit wallets. Instead:
- a pending payment row is created first
- the browser initializes the Paystack transaction
- the webhook validates the signature and authorizes balance changes
- wallet credits and subscription activation happen only in the server path

This is a crucial technical decision that improved trust and prevented client-side tampering. It also explains why the project needed server action patterns and dedicated webhook handlers.

## 4) Database-backed pricing rather than client-specified values

A major correction happened when the team realized the client should not control `unit_price`. The actual solution was to move pricing to the database and overwrite client-provided values in trusted logic.

This is a strong example of a lifecycle from earlier mock data to production-grade trust boundaries.

## 5) Public order references for customer-facing clarity

The project eventually introduced a public order reference such as `QO-######` while keeping internal UUIDs for database integrity. This shows the team chose user-facing, readable identifiers without abandoning internal relational integrity.

The same principle was later extended to the customer and admin-facing order references and is part of the operational UX design.

## 6) OTP-first operational enforcement

The team consistently treated OTPs as a critical control point, not a visual detail. The product spec and operational notes repeatedly emphasize:
- OTP must be exactly four digits
- OTP is tied to a specific action
- OTP is cleared after successful action
- OTP cannot be reused
- partial OTP matches are not revealing

This is one of the most operationally important design decisions. It makes the platform not just user-friendly but also safe and auditable in real-world operations.

## 7) Audit-forward billing and settlement modeling

The later documentation repeatedly emphasizes event logs, ledger entries, snapshots, and auditability. The project did not just create a simple payment and settlement system; it explicitly documented the need for:
- vendor confirmation events
- admin finance withdrawals
- settlement item snapshots
- rejection of duplicate transfer execution
- log trails for key operational actions

This is a strong signal that the business grew from a prototype to an internal accounting and operations system that must support trust, debugging, and reconciliation.

---

## Difficult parts and problem-solving moments

### 1) The price and billing model was not simple

One of the hardest product challenges was reconciling the expected operational flow with the accounting model. The team had to handle:
- initial order creation before final confirmation
- final vendor counts after pickup and processing
- under-count and over-count mismatch logic
- customer wallet balances and payment timing
- subscription usage allocation versus general wallet excess
- invoices that remain unpaid when insufficient funds exist

This was far more complex than a normal e-commerce checkout because the final amount is determined after the item review stage.

### 2) Moving from mock data to trusted server state

The project repeatedly had to replace fake or client-managed data with authoritative database data. Examples include:
- category pricing and subscription rule data
- plans and rates from admin-managed tables
- top-up and subscription activation from webhook-backed wallet changes
- order status updates occurring through trusted DB actions
- vendor final quantities being persisted and then read back instead of trusting client-side inputs

This was a real engineering shift from prototype to production logic.

### 3) Multi-role access and permission boundaries

The team had to support additive roles while preserving compatibility with older server-side logic. This was not a simple feature; it required careful migration and role gating logic to ensure access checks were additive rather than exclusive.

The AGENTS document specifically identifies this as a significant change and describes migration work and guard logic updates.

### 4) OTP handling complexity

The system had to ensure OTP is:
- unique to an action
- valid only for the intended order
- hidden when no longer valid
- cleared after use
- secure enough not to leak partial matches

This is a classic “small feature, huge operational risk” area. OTP flows are often deceptively simple but become complex once real business and status transitions are involved.

### 5) Subscription allowance logic with overage charges

The project had to compute:
- how much weekly allowance remained
- how much of a subscription order is covered by allowance
- what excess amount should be charged from the general wallet
- when to block delivery if the excess is unpaid

This required deterministic algorithm design and careful handling of edge cases. The docs explicitly mention that previous logic had problems such as counting excess units toward usage or depending on database row order. These were serious correctness issues.

### 6) Vendor review and settlement trust boundaries

The system had to make sure vendors could not directly write sensitive state that impacts billing and ownership. The project repeatedly made fixes to prevent unsafe vendor writes and ensure vendor confirmation is a trusted operation. This was essential because vendor-confirmed quantities become the generated billing source of truth.

### 7) Realtime updates and stale UI states

The documentation repeatedly mentions Realtime subscriptions and refresh fallback logic. This was necessary because customer and vendor state had to update without reload after order changes, pickup status changes, payment success, and wallet updates.

This demonstrates a real challenge in a workflow-heavy application: many state transitions are not triggered by direct user action alone; they are triggered by trusted server events and must propagate across portals.

### 8) Tunnel-based testing and webhook validation

The project had to support public-host testing through ngrok. This created a real issue because Vite host protection could block requests before the Paystack webhook even reached the app. The notes explicitly distinguish between Vite’s block and invalid webhook signature issues, showing that the team had to debug both server trust and local host configuration.

### 9) Financial/profit logic and historical consistency

The admin and vendor finance lifts made it clear that financial statements must not be broken by later rate edits. The team solved this by snapshotting rates, payout amounts, and settlement-item data. This is classic accounting integrity work and a large problem-solving step for the product.

---

## Roadblocks and changes in direction

### 1) Moving from hardcoded mock flow to live Supabase-backed flows

This was a clear change in direction and a necessary correction. The project initially used hardcoded categories, prices, and plan cards. Later, the team changed to database-driven categories, live plan records, server-side pricing, and real rate-card logic.

This shift was required to support real operations and to prevent tampering with billing data.

### 2) Replacing browser-side payment logic with webhook-only settlement

A major change in direction occurred when the team moved from an optimistic or browser-based payment approach to a signed webhook-only model. This was a stronger, more secure architecture but required significant adjustments to user flow, UI messaging, and testing practice.

### 3) Tightening the vendor trust model

The project repeatedly revised how vendor writes and claim actions were permitted. What began as a more permissive flow was later constrained to database-trusted operations. This was a necessary move to protect invoice, mismatch, and settlement correctness.

### 4) Admin and finance became more operational, not just reporting

The admin work grew beyond dashboards into operational controls, partner management, account verification, and settlement review. This reflects the project’s evolution from a basic service app into a management platform with serious operational and financial needs.

### 5) Deferring unsupported rules rather than inventing them

The admin and finance plans repeatedly state not to invent vendor payout formulas or settlement reversal logic before explicit approval. This is an important product discipline: the team avoided building speculative financial features without a confirmed rule set.

### 6) Maintainability and auditability became first-class concerns

Rather than shipping fast but brittle features, the project kept adding ledgering, event recording, snapshots, and audit-related constraints. This indicates the team recognized that operational correctness matters more than UI speed in a laundry logistics and finance platform.

---

## Bugs, issues, and remediation themes captured in the repo

The repository documentation does not list every bug, but it does document many recurring issue classes and the fixes applied. These are especially useful to include in the project history because they show the real engineering work behind the product.

Examples from the repo:
- duplicate pickup SQL update risk eliminated
- partial OTP search that leaked order data was fixed
- pickup and delivery OTP reuse prevented
- incorrect order selection in OTP flow fixed
- customer mapping using pickup location ID instead of location name corrected
- duplicate settlement membership prevented
- mismatch line duplication avoided
- subscription usage counting excess units incorrectly fixed
- stale vendor counts and stale order visibility fixed through realtime and refresh fallback
- hardcoded category and pricing logic replaced with authoritative Supabase data paths
- client-submitted unit_price values overwritten by server-side rate logic
- multiple attempts to handle route and tunnel host protection for webhook testing
- delayed Realtime state refresh for customer, vendor, and logistics views handled with fallback revalidation

These are not minor quality issues; several of them directly affect money, order status correctness, or customer trust.

---

## Current state as of the repository and docs

As of the current repository state captured by AGENTS.md and the commit history:

The platform is substantially built across all four core portals and has progressed through several major phases:
- customer auth and profile onboarding
- customer orders, payments, plans, wallet, and invoice flows
- logistics pickup/delivery OTP flow
- vendor review and confirmation flow
- admin dashboards and operational management screens
- referral and promotional wallet logic
- finance summaries, settlement snapshots, and trusted Paystack settlement release

At the same time, the documentation clearly says the project is still not feature-complete in the broad business sense. The most important next implementation areas are:
- historical payout-rate versioning
- deeper finance loading states
- messaging features
- archive and historical views
- remaining admin operational and permission work

This means the project is in a mature but unfinished operational phase. The system is real enough to support actual workflow usage, but not yet a final, fully closed-loop production operating system across all business surfaces.

---

## Key lesson from the project history

The strongest pattern that emerges from the repository is this: Qaffy was built in layers, and each new layer exposed a deeper business problem that had to be solved correctly before the system could be trusted for production usage.

The progression was roughly:
1. basic app and portal structure
2. core operational flows and auth
3. order lifecycle, OTPs, and logistics operations
4. vendor confirmation and mismatch logic
5. billing, subscriptions, and payment trust boundaries
6. admin reporting, finance, and settlement operations
7. referral logic and promotional balance behavior

The product is not simply a laundry ordering app. It is a workflow system that manages operational handoffs, customer billing, subscription accounting, vendor payouts, and admin oversight. Each of those layers required more precise logic and more trustworthy data flows than a simple SaaS dashboard would require.

That is why the project history is rich with product-rule documents, migration files, audit notes, and explicit decisions to defer or redesign features instead of forcing a quick or unsupported implementation.

---

## Final judgment

Qaffy’s history shows a disciplined, iterative product build with clear operational goals, a strong emphasis on trust and accounting correctness, and repeated progress made by replacing placeholders and assumptions with database-backed, auditable flows. The project’s biggest wins were not simply shipping screens; they were making the platform behave like a real service operation with safe financial and fulfillment boundaries.

The project is clearly built enough to demonstrate operational viability across customer, logistics, vendor, and admin flows. Settlement release is complete; remaining roadmap work is focused on finance reporting polish, governance, archive, and broader operational validation before the platform can be considered fully feature-complete.
