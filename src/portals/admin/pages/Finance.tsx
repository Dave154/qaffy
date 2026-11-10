import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { data, useFetcher, useLoaderData, useRevalidator, useSearchParams, type ShouldRevalidateFunctionArgs } from 'react-router'
import { useEffect, useRef, useState } from 'react'
import type { Route } from './+types/Finance'
import { requireRole } from '../../../lib/auth.server'
import { sql } from '../../../lib/db.server'
import { toast } from '../../../lib/toast'
import { summarizeSettlementVendorTotals } from '../../../lib/rate-card'
import { reconcileSettlement, releaseSettlement } from '../../../lib/payouts.server'
import { createBulkSettlements } from '../../../lib/settlements.server'
import { releaseCreatedSettlements, summarizeSettlementPayouts } from '../../../lib/settlement-payouts'
import AdminSideDrawer from '../../../components/AdminSideDrawer'
import { supabase } from '../../../lib/supabase.client'
import { createRefreshScheduler } from '../../../lib/live-refresh.client'

const settlementPageSize = 20

type SettlementRow = {
  id: string
  vendorId: string
  vendorName: string
  periodStart: string
  periodEnd: string
  amountDue: number
  status: 'pending' | 'paid'
  createdAt: string
  orderCount: number
  payoutAccountReady: boolean
  eligibleForPayout: boolean
  transferStatus: 'queued' | 'processing' | 'success' | 'failed' | 'reversed' | 'rejected' | null
  transferFailureReason: string | null
  transferReference: string | null
}

type VendorSummary = {
  vendorId: string
  vendorName: string
  outstandingOrderCount: number
  outstandingCollected: number
  totalCollected: number
  totalVendorPayout: number
  vendorPayout: number
}

function money(value: number) {
  if (Math.abs(value) >= 1_000_000) return `₦${(value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`
  return `₦${value.toLocaleString()}`
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'No period'
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fetchPaystackBalance(secretKey: string) {
  if (!secretKey) return { amount: null, error: 'Paystack secret key is not configured.' }
  try {
    const response = await fetch('https://api.paystack.co/balance', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    })
    if (!response.ok) {
      console.error('Paystack balance request failed:', response.status, await response.text())
      return { amount: null, error: `Paystack balance unavailable (${response.status}).` }
    }
    const payload = (await response.json()) as { data?: Array<{ balance?: number | string }> }
    const totalBalanceKobo = (payload.data ?? []).reduce((sum, item) => sum + Number(item.balance ?? 0), 0)
    return { amount: totalBalanceKobo / 100, error: null }
  } catch (error) {
    console.error('Paystack balance lookup error:', error)
    return { amount: null, error: 'Paystack balance could not be reached.' }
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) {
    return data(
      {
        summary: {
          totalCollected: 0,
          subscriptionRevenue: 0,
          totalVendorPayout: 0,
          platformProfit: 0,
          pendingSettlements: 0,
          pendingAmount: 0,
          paidSettlements: 0,
          totalOwedToVendors: 0,
          withdrawalTotal: 0,
        },
        vendors: [],
        settlements: [],
        settlementPagination: { page: 1, pageSize: settlementPageSize, totalCount: 0, pageCount: 1 },
      },
      { status: 200 },
    )
  }

  const { headers } = auth
  const requestedPage = Number.parseInt(new URL(request.url).searchParams.get('page') ?? '1', 10)
  const safeRequestedPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [reportRows, settlementCountRows] = await Promise.all([
    sql<{ report: { summary: Record<string, number>; vendors: Array<Record<string, string | number>> } }[]>`
      with item_payouts as (
        select item.order_id,
          sum(case
            when snapshot.order_item_id is not null then snapshot.amount
            else coalesce(case item.service::text
              when 'wash' then rates.vendor_wash_price
              when 'iron' then rates.vendor_iron_price
              else rates.vendor_wash_iron_price
            end, 0) * item.confirmed_quantity
          end) as amount
        from order_items item
        left join vendor_settlement_items snapshot on snapshot.order_item_id = item.id
        left join cloth_category_rates rates on rates.category_id = item.category_id
        where item.confirmed_quantity is not null
        group by item.order_id
      ),
      paid_orders as (
        select order_row.id, order_row.vendor_id, invoice.amount as invoice_amount,
          coalesce(item_payouts.amount, 0) as payout_amount,
          exists (
            select 1 from vendor_settlement_orders membership
            join vendor_settlements paid_settlement on paid_settlement.id = membership.settlement_id
            where membership.order_id = order_row.id and paid_settlement.status = 'paid'
          ) as already_paid
        from orders order_row
        join invoices invoice on invoice.order_id = order_row.id and invoice.status = 'paid'
        left join item_payouts on item_payouts.order_id = order_row.id
        where order_row.vendor_id is not null
          and order_row.status <> 'cancelled'
          and order_row.clothes_count_vendor is not null
      ),
      vendor_totals as (
        select vendor_id,
          count(*) filter (where not already_paid)::int as outstanding_order_count,
          coalesce(sum(invoice_amount) filter (where not already_paid), 0) as outstanding_collected,
          coalesce(sum(invoice_amount), 0) as total_collected,
          coalesce(sum(payout_amount), 0) as total_vendor_payout,
          coalesce(sum(payout_amount) filter (where not already_paid), 0) as vendor_payout
        from paid_orders
        group by vendor_id
      ),
      vendor_rows as (
        select vendor.id as vendor_id, coalesce(vendor.business_name, 'Vendor') as vendor_name,
          coalesce(totals.outstanding_order_count, 0) as outstanding_order_count,
          coalesce(totals.outstanding_collected, 0) as outstanding_collected,
          coalesce(totals.total_collected, 0) as total_collected,
          coalesce(totals.total_vendor_payout, 0) as total_vendor_payout,
          coalesce(totals.vendor_payout, 0) as vendor_payout
        from vendors vendor
        left join vendor_totals totals on totals.vendor_id = vendor.id
        where vendor.status = 'approved'
        union all
        select totals.vendor_id, 'Vendor', totals.outstanding_order_count, totals.outstanding_collected,
          totals.total_collected, totals.total_vendor_payout, totals.vendor_payout
        from vendor_totals totals
        where not exists (
          select 1 from vendors approved_vendor
          where approved_vendor.id = totals.vendor_id and approved_vendor.status = 'approved'
        )
      ),
      finance_summary as (
        select
          (select coalesce(sum(amount), 0) from invoices where status = 'paid')
            + (select coalesce(sum(amount), 0) from payments where status = 'success' and plan_id is not null) as total_collected,
          (select coalesce(sum(amount), 0) from payments where status = 'success' and plan_id is not null) as subscription_revenue,
          coalesce((select sum(total_vendor_payout) from vendor_totals), 0) as total_vendor_payout,
          (select coalesce(sum(amount), 0) from invoices where status = 'paid')
            + (select coalesce(sum(amount), 0) from payments where status = 'success' and plan_id is not null)
            - (select coalesce(sum(amount), 0) from vendor_settlement_transfers where status = 'success' and completed_at is not null) as platform_profit,
          (select count(*) from vendor_settlements settlement
            where settlement.status = 'pending'
              and exists (select 1 from vendor_settlement_orders membership where membership.settlement_id = settlement.id)
              and not exists (
                select 1 from vendor_settlement_orders membership
                left join invoices invoice on invoice.order_id = membership.order_id
                where membership.settlement_id = settlement.id and invoice.status is distinct from 'paid'
              )
          ) as pending_settlements,
          (select coalesce(sum(settlement.amount_due), 0) from vendor_settlements settlement
            where settlement.status = 'pending'
              and exists (select 1 from vendor_settlement_orders membership where membership.settlement_id = settlement.id)
              and not exists (
                select 1 from vendor_settlement_orders membership
                left join invoices invoice on invoice.order_id = membership.order_id
                where membership.settlement_id = settlement.id and invoice.status is distinct from 'paid'
              )
          ) as pending_amount,
          (select count(*) from vendor_settlements where status = 'paid') as paid_settlements,
          coalesce((select sum(vendor_payout) from vendor_totals), 0) as total_owed_to_vendors,
          (select coalesce(sum(amount), 0) from admin_finance_transactions where transaction_type = 'profit_withdrawal') as withdrawal_total
      )
      select jsonb_build_object(
        'summary', (select to_jsonb(finance_summary) from finance_summary),
        'vendors', coalesce((select jsonb_agg(to_jsonb(vendor_rows) order by vendor_name) from vendor_rows), '[]'::jsonb)
      ) as report
    `,
    sql<{ total_count: number }[]>`
      select count(*)::int as total_count from vendor_settlements
    `,
  ])
  const totalCount = Number(settlementCountRows[0]?.total_count ?? 0)
  const pageCount = Math.max(1, Math.ceil(totalCount / settlementPageSize))
  const page = Math.min(safeRequestedPage, pageCount)
  const settlementRows = await sql`
      select settlement.id, settlement.vendor_id,
        coalesce(vendor.business_name, 'Vendor') as vendor_name,
        settlement.period_start, settlement.period_end, settlement.amount_due,
        settlement.status, settlement.created_at,
        (vendor.payout_account_status = 'verified' and vendor.payout_recipient_code is not null) as payout_account_ready,
        count(membership.order_id)::int as order_count,
        count(membership.order_id) filter (where invoice.status = 'paid')::int as paid_order_count,
        transfer.status as transfer_status,
        transfer.failure_reason as transfer_failure_reason,
        transfer.paystack_reference as transfer_reference
      from vendor_settlements settlement
      left join vendors vendor on vendor.id = settlement.vendor_id
      left join vendor_settlement_orders membership on membership.settlement_id = settlement.id
      left join invoices invoice on invoice.order_id = membership.order_id
      left join vendor_settlement_transfers transfer on transfer.settlement_id = settlement.id
      group by settlement.id, vendor.id, transfer.id
      order by settlement.created_at desc, settlement.id desc
      limit ${settlementPageSize}
      offset ${(page - 1) * settlementPageSize}
    `
  const report = reportRows[0]?.report
  if (!report) throw new Error('Finance report could not be calculated.')

  const numberValue = (value: string | number | null | undefined) => Number(value ?? 0)
  const vendorSummaries: VendorSummary[] = report.vendors.map((vendor) => ({
    vendorId: String(vendor.vendor_id),
    vendorName: String(vendor.vendor_name),
    outstandingOrderCount: numberValue(vendor.outstanding_order_count),
    outstandingCollected: numberValue(vendor.outstanding_collected),
    totalCollected: numberValue(vendor.total_collected),
    totalVendorPayout: numberValue(vendor.total_vendor_payout),
    vendorPayout: numberValue(vendor.vendor_payout),
  }))
  const mappedSettlementRows: SettlementRow[] = settlementRows.map((settlement) => ({
    id: settlement.id,
    vendorId: settlement.vendor_id,
    vendorName: settlement.vendor_name,
    periodStart: settlement.period_start,
    periodEnd: settlement.period_end,
    amountDue: numberValue(settlement.amount_due),
    status: settlement.status,
    createdAt: settlement.created_at,
    orderCount: numberValue(settlement.order_count),
    payoutAccountReady: Boolean(settlement.payout_account_ready),
    eligibleForPayout:
      numberValue(settlement.order_count) > 0 && numberValue(settlement.order_count) === numberValue(settlement.paid_order_count),
    transferStatus: settlement.transfer_status,
    transferFailureReason: settlement.transfer_failure_reason,
    transferReference: settlement.transfer_reference,
  }))

  return data(
    {
      summary: {
        totalCollected: numberValue(report.summary.total_collected),
        subscriptionRevenue: numberValue(report.summary.subscription_revenue),
        totalVendorPayout: numberValue(report.summary.total_vendor_payout),
        platformProfit: numberValue(report.summary.platform_profit),
        pendingSettlements: numberValue(report.summary.pending_settlements),
        pendingAmount: numberValue(report.summary.pending_amount),
        paidSettlements: numberValue(report.summary.paid_settlements),
        totalOwedToVendors: numberValue(report.summary.total_owed_to_vendors),
        withdrawalTotal: numberValue(report.summary.withdrawal_total),
      },
      vendors: vendorSummaries,
      settlements: mappedSettlementRows,
      settlementPagination: { page, pageSize: settlementPageSize, totalCount, pageCount },
    },
    { headers, status: 200 },
  )
}

function isValidSettlementPeriod(periodStart: string, periodEnd: string) {
  const isDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  return isDate(periodStart) && isDate(periodEnd) && periodStart <= periodEnd
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data({ error: 'Admin access required.' }, { status: 403 })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  const { headers } = auth

  if (intent === 'load-paystack-balance') {
    return data(await fetchPaystackBalance(process.env.PAYSTACK_SECRET_KEY ?? ''), { headers, status: 200 })
  }

  if (intent === 'load-settlement-orders') {
    const settlementId = String(formData.get('settlementId') ?? '').trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(settlementId)) {
      return data({ intent, error: 'A valid settlement is required.', settlementId }, { headers, status: 400 })
    }
    let orders
    try {
      orders = await sql<
        Array<{
          id: string
          public_order_number: string | null
          status: string
          clothes_count_vendor: number | null
          invoice_status: string | null
        }>
      >`
        select order_row.id, order_row.public_order_number, order_row.status,
          order_row.clothes_count_vendor, invoice.status as invoice_status
        from vendor_settlement_orders membership
        join orders order_row on order_row.id = membership.order_id
        left join invoices invoice on invoice.order_id = order_row.id
        where membership.settlement_id = ${settlementId}
        order by order_row.created_at desc
      `
    } catch (error) {
      console.error('Admin Finance settlement details query failed:', error)
      return data({ intent, settlementId, error: 'Settlement details could not be loaded.' }, { headers, status: 500 })
    }
    return data(
      {
        intent,
        settlementId,
        orders: orders.map((order) => ({
          id: order.id,
          publicOrderNumber: order.public_order_number ?? order.id,
          status: order.status,
          confirmedItems: Number(order.clothes_count_vendor ?? 0),
          invoicePaid: order.invoice_status === 'paid',
        })),
      },
      { headers, status: 200 },
    )
  }

  if (intent === 'release-settlement' || intent === 'reconcile-settlement') {
    const settlementId = String(formData.get('settlementId') ?? '').trim()
    if (!settlementId) return data({ error: 'A settlement is required for this payout action.' }, { headers, status: 400 })
    const result =
      intent === 'release-settlement'
        ? await releaseSettlement(settlementId, auth.profile.id)
        : await reconcileSettlement(settlementId, auth.profile.id)
    if (result.status === 'processing')
      return data(
        { ok: true, message: 'Payout pending confirmation.', payoutStatus: result.status, reference: result.reference ?? null },
        { headers, status: 200 },
      )
    if (!result.ok)
      return data(
        { error: result.message, payoutStatus: result.status, reference: result.reference ?? null },
        { headers, status: result.status === 'rejected' ? 400 : 502 },
      )
    return data(
      { ok: true, message: result.message, payoutStatus: result.status, reference: result.reference ?? null },
      { headers, status: 200 },
    )
  }

  if (intent === 'record-withdrawal')
    return data({ error: 'Platform withdrawals are unavailable until a real payout flow is implemented.' }, { headers, status: 410 })

  if (intent === 'preview-bulk-settlement') {
    const periodStart = String(formData.get('periodStart') ?? '')
    const periodEnd = String(formData.get('periodEnd') ?? '')
    if (!isValidSettlementPeriod(periodStart, periodEnd))
      return data({ error: 'Choose a valid settlement date range.' }, { headers, status: 400 })

    const previewRows = await sql<
      {
        vendor_id: string
        business_name: string | null
        payout_account_status: string
        payout_recipient_code: string | null
        order_count: number
        amount: number | string
      }[]
    >`
      select
        vendor.id::text as vendor_id,
        vendor.business_name,
        vendor.payout_account_status,
        vendor.payout_recipient_code,
        count(distinct order_row.id)::int as order_count,
        coalesce(sum(
          coalesce(case item.service
            when 'wash' then rate.vendor_wash_price
            when 'iron' then rate.vendor_iron_price
            when 'wash_iron' then rate.vendor_wash_iron_price
            else 0
          end, 0) * item.confirmed_quantity
        ), 0) as amount
      from vendors vendor
      left join orders order_row
        on order_row.vendor_id = vendor.id
        and order_row.created_at >= ${new Date(`${periodStart}T00:00:00.000Z`).toISOString()}::timestamptz
        and order_row.created_at <= ${new Date(`${periodEnd}T23:59:59.999Z`).toISOString()}::timestamptz
        and order_row.status <> 'cancelled'
        and order_row.clothes_count_vendor is not null
        and exists (
          select 1 from invoices invoice
          where invoice.order_id = order_row.id and invoice.status = 'paid'
        )
        and not exists (
          select 1 from vendor_settlement_orders settlement_order
          where settlement_order.order_id = order_row.id
        )
      left join order_items item
        on item.order_id = order_row.id
        and item.confirmed_quantity is not null
      left join cloth_category_rates rate on rate.category_id = item.category_id
      where vendor.status = 'approved'
      group by vendor.id
      order by vendor.business_name
    `
    const vendors = summarizeSettlementVendorTotals(
      previewRows.map((vendor) => ({
        vendorId: vendor.vendor_id,
        vendorName: vendor.business_name || 'Vendor',
        payoutAccountReady: vendor.payout_account_status === 'verified' && Boolean(vendor.payout_recipient_code),
        orderCount: Number(vendor.order_count),
        amount: Number(vendor.amount),
      })),
    )
    return data(
      {
        ok: true,
        periodStart,
        periodEnd,
        vendors,
      },
      { headers, status: 200 },
    )
  }

  if (intent === 'create-bulk-settlements') {
    const vendorIds = formData
      .getAll('vendorIds')
      .map((value) => String(value).trim())
      .filter(Boolean)
    const periodStart = String(formData.get('periodStart') ?? '')
    const periodEnd = String(formData.get('periodEnd') ?? '')
    if (!isValidSettlementPeriod(periodStart, periodEnd))
      return data({ error: 'Choose a valid settlement date range.' }, { headers, status: 400 })
    if (vendorIds.length === 0) return data({ error: 'Select at least one eligible vendor.' }, { headers, status: 400 })
    try {
      const result = await createBulkSettlements({ vendorIds, periodStart, periodEnd, adminProfileId: auth.profile.id })
      const payoutOutcomes = await releaseCreatedSettlements(result.settlements, auth.profile.id, releaseSettlement)
      return data(
        {
          ok: true,
          message: summarizeSettlementPayouts(payoutOutcomes),
          payoutOutcomes: payoutOutcomes.map(({ settlementId, vendorId, vendorName, status, message, reference }) => ({
            settlementId,
            vendorId,
            vendorName,
            status,
            message,
            reference: reference ?? null,
          })),
          createdCount: result.settlements.length,
          totalAmount: result.totalAmount,
          createdVendorIds: result.settlements.map((settlement) => settlement.vendorId),
          periodStart,
          periodEnd,
        },
        { headers, status: 200 },
      )
    } catch (error) {
      return data({ error: error instanceof Error ? error.message : 'Bulk settlements could not be created.' }, { headers, status: 400 })
    }
  }

  return data({ error: 'Unsupported finance action.' }, { headers, status: 400 })
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldRevalidate({ formMethod, actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const actionIntent = actionResult && typeof actionResult === 'object' && 'intent' in actionResult ? String(actionResult.intent) : ''
  const readOnlyFinanceAction = actionIntent === 'load-paystack-balance' || actionIntent === 'load-settlement-orders'
  return formMethod?.toUpperCase() === 'POST' && readOnlyFinanceAction ? false : defaultShouldRevalidate
}

export default function Finance() {
  const { summary, vendors, settlements, settlementPagination } = useLoaderData<typeof loader>()
  const { revalidate, state: revalidationState } = useRevalidator()
  const [, setSearchParams] = useSearchParams()
  const vendorsWithBalance = vendors.filter((vendor) => vendor.vendorPayout > 0)
  const owedVendorCount = vendorsWithBalance.length
  const fetcher = useFetcher<typeof action>()
  const settlementFetcher = useFetcher<typeof action>()
  const previewFetcher = useFetcher<typeof action>()
  const paystackFetcher = useFetcher<typeof action>()
  const settlementDetailsFetcher = useFetcher<typeof action>()
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([])
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementRow | null>(null)
  const [openSettlementMenu, setOpenSettlementMenu] = useState<{
    settlement: SettlementRow
    anchor: HTMLButtonElement
    top: number
    left: number
  } | null>(null)
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false)
  const handledPayoutResponse = useRef<unknown>(null)
  const handledCreationResponse = useRef<unknown>(null)
  const changeSettlementPage = (page: number) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (page <= 1) next.delete('page')
      else next.set('page', String(page))
      return next
    })
  }

  const loadPaystackBalance = paystackFetcher.submit
  useEffect(() => {
    loadPaystackBalance({ intent: 'load-paystack-balance' }, { method: 'post' })
  }, [loadPaystackBalance])

  const openSettlementDetails = (settlement: SettlementRow) => {
    setSelectedSettlement(settlement)
    settlementDetailsFetcher.submit({ intent: 'load-settlement-orders', settlementId: settlement.id }, { method: 'post' })
  }
  const paystackBalance = paystackFetcher.data && 'amount' in paystackFetcher.data ? paystackFetcher.data : null
  const selectedSettlementOrders =
    settlementDetailsFetcher.data &&
    'orders' in settlementDetailsFetcher.data &&
    'settlementId' in settlementDetailsFetcher.data &&
    settlementDetailsFetcher.data.settlementId === selectedSettlement?.id
      ? settlementDetailsFetcher.data.orders
      : null
  const selectedSettlementDetailsError =
    settlementDetailsFetcher.data &&
    'error' in settlementDetailsFetcher.data &&
    'settlementId' in settlementDetailsFetcher.data &&
    settlementDetailsFetcher.data.settlementId === selectedSettlement?.id
      ? String(settlementDetailsFetcher.data.error)
      : null

  const dateRangeIsValid = Boolean(startDate && endDate && new Date(startDate) <= new Date(endDate))
  const previewData =
    previewFetcher.data && 'vendors' in previewFetcher.data
      ? (previewFetcher.data as unknown as {
          periodStart: string
          periodEnd: string
          vendors: Array<{
            vendorId: string
            vendorName: string
            orderCount: number
            amount: number
            eligible: boolean
            reason: string | null
          }>
        })
      : null
  const previewIsCurrent = previewFetcher.state === 'idle' && previewData?.periodStart === startDate && previewData?.periodEnd === endDate
  const previewVendors = previewIsCurrent ? (previewData?.vendors ?? []) : []
  const eligiblePreviewVendors = previewVendors.filter((vendor) => vendor.eligible)
  const selectedPreviewVendors = eligiblePreviewVendors.filter((vendor) => selectedVendorIds.includes(vendor.vendorId))
  const selectedSettlementTotal = selectedPreviewVendors.reduce((sum, vendor) => sum + Number(vendor.amount), 0)
  const selectedOrderCount = selectedPreviewVendors.reduce((sum, vendor) => sum + Number(vendor.orderCount), 0)
  const previewErrorMessage =
    previewFetcher.state === 'idle' && previewFetcher.data && 'error' in previewFetcher.data ? String(previewFetcher.data.error) : null
  const previewHasError = Boolean(previewErrorMessage)
  const creationResult =
    settlementFetcher.data && 'createdVendorIds' in settlementFetcher.data
      ? (settlementFetcher.data as unknown as {
          message: string
          createdVendorIds: string[]
          periodStart: string
          periodEnd: string
          payoutOutcomes: Array<{
            vendorId: string
            vendorName: string
            settlementId: string
            status: 'success' | 'processing' | 'failed' | 'reversed' | 'rejected'
            message: string
            reference: string | null
          }>
        })
      : null
  const createSucceeded =
    settlementFetcher.state === 'idle' &&
    Boolean(creationResult) &&
    creationResult?.periodStart === startDate &&
    creationResult?.periodEnd === endDate &&
    creationResult?.createdVendorIds.length === selectedPreviewVendors.length &&
    creationResult.createdVendorIds.every((vendorId) => selectedPreviewVendors.some((vendor) => vendor.vendorId === vendorId))
  const canCreateSettlement =
    previewIsCurrent &&
    selectedPreviewVendors.length > 0 &&
    dateRangeIsValid &&
    selectedSettlementTotal > 0 &&
    fetcher.state === 'idle' &&
    settlementFetcher.state === 'idle' &&
    !createSucceeded

  useEffect(() => {
    const supabaseClient = supabase
    if (!supabaseClient) return
    // A payout run updates settlements and transfers together; coalesce into one revalidation.
    const refresher = createRefreshScheduler(revalidate, { disconnectedPollMs: 0 })
    const channel = supabaseClient
      .channel('admin-finance-settlement-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_settlements' }, refresher.schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_settlement_transfers' }, refresher.schedule)
      .subscribe((status) => refresher.setChannelStatus(status))
    return () => {
      refresher.dispose()
      void supabaseClient.removeChannel(channel)
    }
  }, [revalidate])

  const submitSettlementPreview = previewFetcher.submit
  useEffect(() => {
    if (!isCreateDrawerOpen || !startDate || !endDate || !dateRangeIsValid) return
    submitSettlementPreview({ intent: 'preview-bulk-settlement', periodStart: startDate, periodEnd: endDate }, { method: 'post' })
  }, [isCreateDrawerOpen, startDate, endDate, dateRangeIsValid, submitSettlementPreview])

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data || fetcher.data === handledPayoutResponse.current) return
    handledPayoutResponse.current = fetcher.data
    if ('error' in fetcher.data) {
      toast.error(String(fetcher.data.error))
      return
    }
    if ('message' in fetcher.data) {
      const message = String(fetcher.data.message)
      if ('payoutStatus' in fetcher.data && fetcher.data.payoutStatus === 'processing') {
        toast(message, { description: 'It will remain pending until Paystack confirms it.', duration: 8000 })
      } else {
        toast.success(message)
      }
    }
  }, [fetcher.data, fetcher.state])

  useEffect(() => {
    if (settlementFetcher.state !== 'idle' || !creationResult || settlementFetcher.data === handledCreationResponse.current) return
    handledCreationResponse.current = settlementFetcher.data
    const hasAttentionItems = creationResult.payoutOutcomes.some((outcome) => outcome.status !== 'success')
    if (hasAttentionItems) toast(creationResult.message, { duration: 8000 })
    else toast.success(creationResult.message)

    for (const outcome of creationResult.payoutOutcomes) {
      if (outcome.status === 'processing') {
        toast(`Payout pending: ${outcome.vendorName}`, {
          description: 'Paystack has not confirmed it yet.',
          duration: 15000,
          action: {
            label: 'Reconcile',
            onClick: () => fetcher.submit({ intent: 'reconcile-settlement', settlementId: outcome.settlementId }, { method: 'post' }),
          },
        })
      } else if (outcome.status === 'failed' || outcome.status === 'rejected' || outcome.status === 'reversed') {
        toast.error(`${outcome.vendorName}: ${outcome.message}`, { duration: 10000 })
      }
    }
  }, [creationResult, fetcher, settlementFetcher.data, settlementFetcher.state])

  useEffect(() => {
    if (!openSettlementMenu) return
    const reposition = () => {
      if (!openSettlementMenu.anchor.isConnected) {
        setOpenSettlementMenu(null)
        return
      }
      const bounds = openSettlementMenu.anchor.getBoundingClientRect()
      const menuHeight = Math.min(240, window.innerHeight - 16)
      const top =
        bounds.bottom + menuHeight + 8 <= window.innerHeight
          ? window.scrollY + bounds.bottom + 4
          : window.scrollY + Math.max(8, bounds.top - menuHeight - 4)
      const left = window.scrollX + Math.max(8, Math.min(bounds.right - 208, window.innerWidth - 216))
      setOpenSettlementMenu((current) => (current?.anchor === openSettlementMenu.anchor ? { ...current, top, left } : current))
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [openSettlementMenu])

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="truncate text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Paystack balance</p>
          <div className="mt-3 flex min-w-0 items-end justify-between gap-2">
            <p className="min-w-0 truncate text-2xl font-bold text-slate-900 sm:text-3xl">
              {paystackBalance ? (
                paystackBalance.amount === null ? (
                  'Unavailable'
                ) : (
                  money(paystackBalance.amount)
                )
              ) : (
                <span className="inline-flex h-9 items-center" role="status" aria-label="Loading Paystack balance">
                  <Loader2 size={22} className="animate-spin text-brand-primary" aria-hidden="true" />
                </span>
              )}
            </p>
            <CircleDollarSign size={18} className="shrink-0 text-brand-primary" />
          </div>
          {paystackBalance?.error && (
            <p className="mt-2 truncate text-[11px] text-amber-700" title={paystackBalance.error}>
              {paystackBalance.error}
            </p>
          )}
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="truncate text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Total collected</p>
          <div className="mt-3 flex min-w-0 items-end justify-between gap-2">
            <p className="min-w-0 truncate text-2xl font-bold text-slate-900 sm:text-3xl">{money(summary.totalCollected)}</p>
            <Banknote size={18} className="shrink-0 text-emerald-600" />
          </div>
          <p className="mt-2 text-xs text-slate-500">Includes {money(summary.subscriptionRevenue)} in subscription sales</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="truncate text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Owed to vendors</p>
          <div className="mt-3 flex min-w-0 items-end justify-between gap-2">
            <p className="min-w-0 truncate text-2xl font-bold text-slate-900 sm:text-3xl">{money(summary.totalOwedToVendors)}</p>
            <TrendingUp size={18} className="shrink-0 text-violet-600" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            ({owedVendorCount} vendor{owedVendorCount === 1 ? '' : 's'})
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="truncate text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Platform profit</p>
          <div className="mt-3 flex min-w-0 items-end justify-between gap-2">
            <p className="min-w-0 truncate text-2xl font-bold text-slate-900 sm:text-3xl">{money(summary.platformProfit)}</p>
            <CheckCircle2 size={18} className="shrink-0 text-amber-600" />
          </div>
        </div>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900">Vendor balances</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  settlementFetcher.reset()
                  setSelectedVendorIds([])
                  setIsCreateDrawerOpen(true)
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:bg-brand-primary-hover hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                <Plus size={16} strokeWidth={2.5} /> New settlement
              </button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] capitalize tracking-[0.12em] text-slate-500">
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Orders</th>
                  <th className="px-4 py-3 font-semibold">Collected</th>
                  <th className="px-4 py-3 font-semibold">Payout</th>
                </tr>
              </thead>
              <tbody>
                {vendorsWithBalance.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                      No outstanding vendor balances.
                    </td>
                  </tr>
                ) : (
                  vendorsWithBalance.map((vendor) => (
                    <tr key={vendor.vendorId} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{vendor.vendorName}</p>
                          <p className="truncate text-xs text-slate-500">
                            {vendor.outstandingOrderCount} outstanding order{vendor.outstandingOrderCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-slate-700">{vendor.outstandingOrderCount}</td>
                      <td className="px-4 py-4 text-sm font-medium text-slate-700">{money(vendor.outstandingCollected)}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-900">{money(vendor.vendorPayout)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <AdminSideDrawer
        isOpen={isCreateDrawerOpen && !createSucceeded}
        onClose={() => setIsCreateDrawerOpen(false)}
        title="Create settlements"
        description="Create one batch per selected vendor and release each payout immediately. Processing or failed payouts can be reconciled or retried in Settlement history."
      >
        <settlementFetcher.Form method="post" className="mt-0 flex flex-1 flex-col gap-5">
          <input type="hidden" name="intent" value="create-bulk-settlements" />
          <input type="hidden" name="periodStart" value={startDate} />
          <input type="hidden" name="periodEnd" value={endDate} />
          {selectedPreviewVendors.map((vendor) => (
            <input key={vendor.vendorId} type="hidden" name="vendorIds" value={vendor.vendorId} />
          ))}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value)
                  setSelectedVendorIds([])
                }}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">End date</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value)
                  setSelectedVendorIds([])
                }}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              />
            </label>
          </div>

          {!dateRangeIsValid && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              End date must be on or after the start date.
            </div>
          )}
          {previewFetcher.state !== 'idle' && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-600">
              <Loader2 size={16} className="animate-spin text-brand-primary" />
              Checking paid orders and payout totals...
            </div>
          )}
          {previewFetcher.state === 'idle' && previewHasError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {previewErrorMessage}
            </p>
          )}

          {previewIsCurrent && (
            <div className="min-h-0 flex-1 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Eligible vendors</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {eligiblePreviewVendors.length} of {previewVendors.length} approved vendors have payable orders.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedVendorIds(eligiblePreviewVendors.map((vendor) => vendor.vendorId))}
                  disabled={eligiblePreviewVendors.length === 0}
                  className="shrink-0 text-xs font-semibold text-brand-primary hover:text-brand-primary-hover disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Select all
                </button>
              </div>

              {previewVendors.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No approved vendors are available.
                </p>
              ) : (
                <div className="max-h-[36vh] space-y-2 overflow-y-auto pr-1">
                  {previewVendors.map((vendor) => (
                    <label
                      key={vendor.vendorId}
                      className={`flex items-start gap-3 rounded-xl border p-3 ${vendor.eligible ? 'cursor-pointer border-slate-200 bg-white hover:border-brand-primary/50' : 'border-slate-100 bg-slate-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={vendor.eligible && selectedVendorIds.includes(vendor.vendorId)}
                        disabled={!vendor.eligible}
                        onChange={(event) =>
                          setSelectedVendorIds((current) =>
                            event.target.checked
                              ? [...new Set([...current, vendor.vendorId])]
                              : current.filter((id) => id !== vendor.vendorId),
                          )
                        }
                        className="mt-1 h-4 w-4 accent-(--color-brand-primary) disabled:cursor-not-allowed"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className={`truncate text-sm font-semibold ${vendor.eligible ? 'text-slate-900' : 'text-slate-500'}`}>
                            {vendor.vendorName}
                          </span>
                          <span className="shrink-0 text-sm font-bold text-slate-900">{money(Number(vendor.amount))}</span>
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {vendor.eligible ? `${vendor.orderCount} paid order${vendor.orderCount === 1 ? '' : 's'}` : vendor.reason}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {settlementFetcher.state === 'idle' && settlementFetcher.data && 'error' in settlementFetcher.data && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {String(settlementFetcher.data.error)}
            </p>
          )}
          <div className="mt-auto border-t border-slate-100 pt-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Selected · {selectedPreviewVendors.length} vendor{selectedPreviewVendors.length === 1 ? '' : 's'} · {selectedOrderCount}{' '}
                  orders
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{money(selectedSettlementTotal)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVendorIds([])}
                disabled={selectedVendorIds.length === 0}
                className="mb-1 text-xs font-semibold text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Clear
              </button>
            </div>
            <button
              type="submit"
              disabled={!canCreateSettlement}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {settlementFetcher.state !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {settlementFetcher.state !== 'idle'
                ? 'Creating and releasing payouts...'
                : `Create ${selectedPreviewVendors.length || ''} settlement${selectedPreviewVendors.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </settlementFetcher.Form>
      </AdminSideDrawer>

      <section className="grid gap-5">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900">Settlement history</h3>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm text-slate-500">{settlementPagination.totalCount.toLocaleString()} records</span>
              <button
                type="button"
                aria-label="Refresh Finance data"
                title="Refresh Finance data"
                onClick={() => revalidate()}
                disabled={revalidationState !== 'idle'}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-brand-primary hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={16} className={revalidationState !== 'idle' ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] table-fixed text-left">
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '23%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] capitalize tracking-[0.12em] text-slate-500">
                  <th className="px-2 py-3 font-semibold">Vendor</th>
                  <th className="px-2 py-3 font-semibold">Created</th>
                  <th className="px-2 py-3 font-semibold">Period</th>
                  <th className="px-2 py-3 font-semibold">Amount</th>
                  <th className="px-2 py-3 font-semibold">Status</th>
                  <th className="px-2 py-3 font-semibold">Payout action</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      No settlements have been created yet.
                    </td>
                  </tr>
                ) : (
                  settlements.map((settlement) => (
                    <tr
                      key={settlement.id}
                      tabIndex={0}
                      aria-label={`View settlement details for ${settlement.vendorName}`}
                      onClick={() => openSettlementDetails(settlement)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openSettlementDetails(settlement)
                        }
                      }}
                      className="cursor-pointer border-b border-slate-100 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary last:border-0"
                    >
                      <td className="truncate px-2 py-4 text-sm font-semibold text-slate-900">{settlement.vendorName}</td>
                      <td className="whitespace-nowrap px-2 py-4 text-sm text-slate-600">{formatTimestamp(settlement.createdAt)}</td>
                      <td className="px-2 py-4 text-sm text-slate-600">
                        {formatDate(settlement.periodStart)} — {formatDate(settlement.periodEnd)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-4 text-sm font-semibold text-slate-900">{money(settlement.amountDue)}</td>
                      <td className="px-2 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span
                            title={settlement.transferFailureReason ?? undefined}
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize tracking-[0.12em] ${settlement.transferStatus === 'reversed' || settlement.transferStatus === 'failed' || settlement.transferStatus === 'rejected' ? 'bg-red-50 text-red-700' : settlement.status === 'paid' || settlement.transferStatus === 'success' ? 'bg-emerald-50 text-emerald-700' : !settlement.eligibleForPayout ? 'bg-orange-50 text-orange-700' : settlement.transferStatus === 'processing' || settlement.transferStatus === 'queued' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}
                          >
                            {settlement.transferStatus === 'reversed'
                              ? 'reversed · review'
                              : settlement.status === 'paid'
                                ? 'paid'
                                : settlement.status === 'pending' && !settlement.eligibleForPayout
                                  ? 'payment pending'
                                  : settlement.transferStatus === 'processing' || settlement.transferStatus === 'queued'
                                    ? 'pending'
                                    : (settlement.transferStatus ?? 'unreleased')}
                          </span>
                          {settlement.status === 'pending' && settlement.eligibleForPayout && !settlement.payoutAccountReady && (
                            <span className="text-xs font-medium text-amber-700">Account not ready</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-2">
                          {settlement.transferStatus === 'reversed' ? (
                            <span className="text-xs font-semibold text-red-700">Review reversal</span>
                          ) : settlement.status === 'pending' &&
                            (settlement.transferStatus === 'queued' || settlement.transferStatus === 'processing') ? (
                            <fetcher.Form method="post">
                              <input type="hidden" name="intent" value="reconcile-settlement" />
                              <input type="hidden" name="settlementId" value={settlement.id} />
                              <button
                                type="submit"
                                disabled={fetcher.state !== 'idle'}
                                className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Reconcile payout
                              </button>
                            </fetcher.Form>
                          ) : settlement.status === 'pending' &&
                            (settlement.transferStatus === null ||
                              settlement.transferStatus === 'failed' ||
                              settlement.transferStatus === 'rejected') ? (
                            <fetcher.Form method="post">
                              <input type="hidden" name="intent" value="release-settlement" />
                              <input type="hidden" name="settlementId" value={settlement.id} />
                              <button
                                type="submit"
                                disabled={fetcher.state !== 'idle' || !settlement.eligibleForPayout || !settlement.payoutAccountReady}
                                title={
                                  !settlement.eligibleForPayout
                                    ? 'Every linked order must have a paid customer invoice.'
                                    : !settlement.payoutAccountReady
                                      ? 'Verify the vendor payout account before releasing payment.'
                                      : undefined
                                }
                                className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg bg-brand-primary px-2 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                {settlement.transferStatus === 'failed' || settlement.transferStatus === 'rejected'
                                  ? 'Retry payout'
                                  : 'Release payout'}
                              </button>
                            </fetcher.Form>
                          ) : (
                            <span className="text-xs font-medium text-slate-500">
                              {settlement.status === 'paid' || settlement.transferStatus === 'success' ? 'Paid' : 'No action'}
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label={`More actions for ${settlement.vendorName}`}
                            title="More actions"
                            onClick={(event) => {
                              const bounds = event.currentTarget.getBoundingClientRect()
                              const anchor = event.currentTarget
                              const menuHeight = Math.min(240, window.innerHeight - 16)
                              const top =
                                bounds.bottom + menuHeight + 8 <= window.innerHeight
                                  ? window.scrollY + bounds.bottom + 4
                                  : window.scrollY + Math.max(8, bounds.top - menuHeight - 4)
                              const left = window.scrollX + Math.max(8, Math.min(bounds.right - 208, window.innerWidth - 216))
                              setOpenSettlementMenu((current) =>
                                current?.settlement.id === settlement.id ? null : { settlement, anchor, top, left },
                              )
                            }}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                          >
                            <MoreVertical size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-500">
              {settlementPagination.totalCount === 0
                ? 'No settlements'
                : `${(settlementPagination.page - 1) * settlementPagination.pageSize + 1}–${Math.min(
                    settlementPagination.page * settlementPagination.pageSize,
                    settlementPagination.totalCount,
                  )} of ${settlementPagination.totalCount}`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => changeSettlementPage(settlementPagination.page - 1)}
                disabled={settlementPagination.page <= 1}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => changeSettlementPage(settlementPagination.page + 1)}
                disabled={settlementPagination.page >= settlementPagination.pageCount}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>

      {openSettlementMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close settlement actions"
              tabIndex={-1}
              onClick={() => setOpenSettlementMenu(null)}
              className="fixed inset-0 z-[60] cursor-default bg-transparent"
            />
            <div
              role="menu"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpenSettlementMenu(null)
              }}
              style={{ top: openSettlementMenu.top, left: openSettlementMenu.left }}
              className="absolute z-[61] max-h-[calc(100vh-16px)] w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openSettlementDetails(openSettlementMenu.settlement)
                  setOpenSettlementMenu(null)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Eye size={15} /> View details
              </button>
              {openSettlementMenu.settlement.transferReference && (
                <p className="truncate px-3 py-1 text-[11px] text-slate-400" title={openSettlementMenu.settlement.transferReference}>
                  Ref: {openSettlementMenu.settlement.transferReference}
                </p>
              )}
              {openSettlementMenu.settlement.transferFailureReason && (
                <p className="px-3 py-1 text-xs text-red-600">{openSettlementMenu.settlement.transferFailureReason}</p>
              )}
            </div>
          </>,
          document.body,
        )}

      {selectedSettlement && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedSettlement(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="settlement-orders-title"
            className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="settlement-orders-title" className="truncate text-xl font-bold text-slate-900">
                    {selectedSettlement.vendorName}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize tracking-[0.1em] ${selectedSettlement.transferStatus === 'reversed' || selectedSettlement.transferStatus === 'failed' || selectedSettlement.transferStatus === 'rejected' ? 'bg-red-50 text-red-700' : selectedSettlement.status === 'paid' || selectedSettlement.transferStatus === 'success' ? 'bg-emerald-50 text-emerald-700' : selectedSettlement.transferStatus === 'processing' ? 'bg-blue-50 text-blue-700' : !selectedSettlement.eligibleForPayout ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-700'}`}
                  >
                    {selectedSettlement.transferStatus === 'reversed'
                      ? 'Reversed · review'
                      : selectedSettlement.status === 'paid'
                        ? 'Paid'
                        : selectedSettlement.status === 'pending' && !selectedSettlement.eligibleForPayout
                          ? 'Awaiting customer payment'
                          : (selectedSettlement.transferStatus ?? 'Unreleased')}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {formatDate(selectedSettlement.periodStart)} — {formatDate(selectedSettlement.periodEnd)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close settlement details"
                onClick={() => setSelectedSettlement(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </header>
            <div className="grid grid-cols-1 divide-y divide-slate-200 border-b border-slate-200 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
              <div className="py-3 sm:pr-4">
                <p className="text-[10px] font-semibold capitalize tracking-[0.12em] text-slate-500">Settlement total</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{money(selectedSettlement.amountDue)}</p>
              </div>
              <div className="py-3 sm:px-4">
                <p className="text-[10px] font-semibold capitalize tracking-[0.12em] text-slate-500">Linked orders</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedSettlement.orderCount} order{selectedSettlement.orderCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="py-3 sm:pl-4">
                <p className="text-[10px] font-semibold capitalize tracking-[0.12em] text-slate-500">Payout account</p>
                <p
                  className={`mt-1 text-sm font-semibold ${selectedSettlement.payoutAccountReady ? 'text-emerald-700' : 'text-amber-700'}`}
                >
                  {selectedSettlement.payoutAccountReady ? 'Verified and ready' : 'Not ready'}
                </p>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900">Linked orders</h3>
                <span className="text-xs text-slate-500">
                  {selectedSettlement.orderCount} order{selectedSettlement.orderCount === 1 ? '' : 's'}
                </span>
              </div>
              {selectedSettlement.transferFailureReason && (
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {selectedSettlement.transferFailureReason}
                </p>
              )}
              {selectedSettlement.transferReference && (
                <p className="mb-3 truncate text-xs text-slate-500" title={selectedSettlement.transferReference}>
                  Transfer reference: {selectedSettlement.transferReference}
                </p>
              )}
              {selectedSettlementDetailsError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">
                  {selectedSettlementDetailsError}
                </p>
              ) : selectedSettlementOrders === null ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500" aria-live="polite">
                  Loading linked orders...
                </p>
              ) : selectedSettlementOrders.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No linked orders were found for this settlement.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {selectedSettlementOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between gap-4 p-4">
                      <div>
                        <p className="font-semibold text-slate-900">{order.publicOrderNumber}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {order.confirmedItems} confirmed item{order.confirmedItems === 1 ? '' : 's'} · {order.status.replaceAll('_', ' ')}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ${order.invoicePaid ? 'text-emerald-700' : 'text-orange-700'}`}>
                        {order.invoicePaid ? 'Customer invoice paid' : 'Waiting for customer payment'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
