# Qaffy

Qaffy is a multi-portal laundry platform built with React, TypeScript, Vite, and Supabase. It supports customer ordering, logistics pickup/delivery, vendor review, and admin operations in a single app shell.

## Status snapshot

As of 2026-10-07, the codebase includes the following active workstreams:

- Customer portal: live wallet, Paystack-backed top-ups, plan purchases, order flow, invoices, notifications, reward activity, and OTP experience
- Reward center: cashback configuration for top-ups plus referral campaign and reward issuance flows
- Logistics portal: signed-in agent scope, pickup/delivery workflows, and agency-specific event history
- Vendor portal: review workflow, settlement finance context, and responsive partner UI
- Admin portal: overview, server-paginated users and orders, full-filter CSV exports, partners, categories, mismatches, finance, plans, reward management, and notifications
- Profile/subscription administration: guarded customer profile completion, plan-aware manual subscription dates, subscription cancellation, and active subscription end-date editing

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
- [PROJECT_HISTORY.md](PROJECT_HISTORY.md) — implementation timeline and major product/architecture decisions
- [ADMIN_PLAN.md](ADMIN_PLAN.md) — admin roadmap, confirmed rules, and priority sequencing
- [REFERRAL_PLAN.md](REFERRAL_PLAN.md) — reward center logic, including cashback and referral campaigns
- [FINANCE_AND_PAYMENT_FLOW.md](FINANCE_AND_PAYMENT_FLOW.md) — payment, wallet, and finance flow documentation

## Local setup

Prerequisites: Node.js compatible with the versions in `package.json`/`package-lock.json`, npm, and a Supabase project for authenticated/data-backed routes.

```bash
npm install
npm run dev
```

Create `.env` from `.env.example` and set the keys required for the features being run. The public `VITE_*` Supabase values are needed by the browser. The server also needs `SUPABASE_URL` and `SUPABASE_ANON_KEY`; trusted database actions, including the admin user/order list queries, require `DATABASE_URL` (direct Postgres connection string). Never expose server-only keys through a `VITE_` variable or commit `.env`.

Feature-specific configuration:

- `SUPABASE_SERVICE_ROLE_KEY` is required for admin provisioning and other explicitly privileged auth-admin actions.
- `PAYSTACK_SECRET_KEY` and webhook configuration are required for trusted Paystack payment, account verification, and payout flows. Configure the Paystack webhook URL to `/api/paystack/webhook`.
- `VITE_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` are required for Web Push. `CRON_SECRET` protects subscription reminder jobs.
- Configure Supabase Auth site and redirect URLs for the local and deployed origins. Email OTP templates must use `{{ .Token }}` as documented in `.env.example`.

Database schema is managed through ordered migrations in `supabase/migrations`. Before applying migrations, confirm the linked Supabase project/environment and inspect the CLI dry run; never assume a linked project is staging. Some recent admin work adds indexes in `20261007100000_admin_user_pagination_indexes.sql` and `20261007110000_admin_order_pagination_indexes.sql`. These indexes are additive performance improvements; server-side filtering/pagination works without them, but production rollout should apply them after environment verification. Other feature migrations and any required manual dashboard configuration are documented in [AGENTS.md](AGENTS.md) and their owning plan documents.

## Validation

Use the repo checks before shipping changes:

```bash
npm run typecheck
npm run build
npm run lint
```

`npm test` runs the configured Node test suite. Focused eslint can be run against the touched TypeScript files when a full lint reports unrelated baseline issues.

## Required environment notes

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` where server-side actions require them
- Paystack and wallet configuration for trusted payment/webhook flows
- VAPID keys for browser push delivery when enabling customer notifications

## Current implementation priorities

- Continue live smoke testing against Supabase and Paystack flows
- Continue scalability work on other admin tables; Users and Orders are currently server-paginated
- Keep docs aligned with the live product status before shipping or handoff
