# Qaffy

Qaffy is a multi-portal laundry platform built with React, TypeScript, Vite, and Supabase. It supports customer ordering, logistics pickup/delivery, vendor review, and admin operations in a single app shell.

## Status snapshot

As of 2026-09-22, the codebase includes the following active workstreams:

- Customer portal: live wallet, Paystack-backed top-ups, plan purchases, order flow, invoices, notifications, referrals, and OTP experience
- Logistics portal: signed-in agent scope, pickup/delivery workflows, and agency-specific event history
- Vendor portal: review workflow, settlement finance context, and responsive partner UI
- Admin portal: overview, orders, partners, categories, mismatches, finance, plans, and notifications

## Core architecture

- Frontend: React + TypeScript + Vite + React Router
- Data/auth: Supabase Postgres + auth + migrations + realtime
- Roles: additive portal roles via `profile_roles` with legacy compatibility support
- Primary portals:
  - customer
  - logistics
  - vendor
  - admin

## Key docs

- [AGENTS.md](AGENTS.md) — product and system architecture history, operational requirements, and portal handoff notes
- [ADMIN_PLAN.md](ADMIN_PLAN.md) — admin roadmap, confirmed rules, and priority sequencing
- [REFERRAL_PLAN.md](REFERRAL_PLAN.md) — referral attribution, rewards, and campaign logic
- [FINANCE_AND_PAYMENT_FLOW.md](FINANCE_AND_PAYMENT_FLOW.md) — payment, wallet, and finance flow documentation

## Local setup

```bash
npm install
npm run dev
```

## Validation

Use the repo checks before shipping changes:

```bash
npm run typecheck
npm run build
npm run lint
```

## Required environment notes

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` where server-side actions require them
- Paystack and wallet configuration for trusted payment/webhook flows
- VAPID keys for browser push delivery when enabling customer notifications

## Current implementation priorities

- Complete customer portal polish and live data reconciliation
- Finalize trusted settlement payout execution for admin finance
- Continue live smoke testing against Supabase and Paystack flows
- Keep docs aligned with the live product status before shipping or handoff

