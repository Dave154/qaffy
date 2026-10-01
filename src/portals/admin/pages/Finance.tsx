import { ArrowRight, Banknote, CheckCircle2, CircleDollarSign, Eye, Loader2, MoreVertical, Plus, RefreshCw, TrendingUp, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { data, useFetcher, useLoaderData, useRevalidator } from 'react-router'
import { useEffect, useRef, useState } from 'react'
import type { Route } from './+types/Finance'
import { requireRole } from '../../../lib/auth.server'
import { sql } from '../../../lib/db.server'
import { toast } from '../../../lib/toast'
import { buildSettlementVendorPreviews, getRateValueFromItem } from '../../../lib/rate-card'
import type { SettlementCandidateItem, SettlementCandidateOrder } from '../../../lib/rate-card'
import { reconcileSettlement, releaseSettlement } from '../../../lib/payouts.server'
import { createBulkSettlements } from '../../../lib/settlements.server'
import { releaseCreatedSettlements, summarizeSettlementPayouts } from '../../../lib/settlement-payouts'
import AdminSideDrawer from '../../../components/AdminSideDrawer'
import { sumSuccessfulPlanPayments } from '../../../lib/revenue-reporting'
import { supabase } from '../../../lib/supabase.client'

type SettlementRow = {
  id: string
  vendorId: string
  vendorName: string
  periodStart: string
  periodEnd: string
  amountDue: number
  status: 'pending' | 'paid'
  createdAt: string
  payoutAccountReady: boolean
  eligibleForPayout: boolean
  transferStatus: 'queued' | 'processing' | 'success' | 'failed' | 'reversed' | 'rejected' | null
  transferFailureReason: string | null
  transferReference: string | null
  orders: Array<{ id: string; publicOrderNumber: string; status: string; confirmedItems: number; invoicePaid: boolean }>
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

type FinanceData = {
  summary: {
    totalCollected: number
    subscriptionRevenue: number
    totalVendorPayout: number
    platformProfit: number
    pendingSettlements: number
    pendingAmount: number
    paidSettlements: number
    paystackBalance: number | null
    paystackBalanceError: string | null
    totalOwedToVendors: number
    withdrawalTotal: number
  }
  vendors: VendorSummary[]
  settlements: SettlementRow[]
}

type SettlementItemSnapshot = {
  settlement_id: string
  order_item_id: string
  confirmed_quantity: number
  vendor_unit_price: number
  amount: number
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
  if (!auth)
    return data<FinanceData>(
      {
        summary: {
          totalCollected: 0,
          subscriptionRevenue: 0,
          totalVendorPayout: 0,
          platformProfit: 0,
          pendingSettlements: 0,
          pendingAmount: 0,
          paidSettlements: 0,
          paystackBalance: null,
          paystackBalanceError: 'Paystack balance unavailable.',
          totalOwedToVendors: 0,
          withdrawalTotal: 0,
        },
        vendors: [],
        settlements: [],
      },
      { status: 200 },
    )

  const { supabase, headers } = auth
  const [paystackBalance, [{ amount: withdrawalTotal = 0 } = { amount: 0 }]] = await Promise.all([
    fetchPaystackBalance(process.env.PAYSTACK_SECRET_KEY ?? ''),
    sql`select coalesce(sum(amount), 0) as amount from admin_finance_transactions where transaction_type = 'profit_withdrawal'`,
  ])
  const [
    { data: vendors },
    { data: orders },
    { data: orderItems },
    { data: rates },
    { data: invoices },
    { data: settlements },
    { data: settlementOrders },
    { data: settlementItems },
    { data: settlementTransfers },
    { data: planPayments },
  ] = await Promise.all([
    supabase
      .from('vendors')
      .select('id, profile_id, business_name, status, payout_account_status, payout_recipient_code')
      .eq('status', 'approved')
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id, vendor_id, status, clothes_count_vendor, created_at')
      .not('vendor_id', 'is', null)
      .order('created_at', { ascending: false }),
    supabase.from('order_items').select('id, order_id, category_id, quantity, confirmed_quantity, service, unit_price'),
    supabase.from('cloth_category_rates').select('category_id, vendor_wash_price, vendor_iron_price, vendor_wash_iron_price'),
    supabase.from('invoices').select('id, order_id, amount, status, created_at'),
    supabase
      .from('vendor_settlements')
      .select('id, vendor_id, period_start, period_end, amount_due, status, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('vendor_settlement_orders').select('settlement_id, order_id'),
    supabase.from('vendor_settlement_items').select('settlement_id, order_item_id, confirmed_quantity, vendor_unit_price, amount'),
    supabase
      .from('vendor_settlement_transfers')
      .select('settlement_id, status, failure_reason, paystack_reference')
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('amount, status, plan_id, succeeded_at')
      .eq('status', 'success')
      .not('plan_id', 'is', null),
  ])
  const linkedOrderIds = (settlementOrders ?? []).map((record) => record.order_id)
  const { data: linkedOrders } = linkedOrderIds.length
    ? await supabase.from('orders').select('id, public_order_number, status, clothes_count_vendor').in('id', linkedOrderIds)
    : { data: [] as Array<{ id: string; public_order_number: string | null; status: string; clothes_count_vendor: number | null }> }

  const rateByCategory = new Map((rates ?? []).map((rate) => [rate.category_id, rate]))
  const invoiceByOrder = new Map((invoices ?? []).map((invoice) => [invoice.order_id, invoice]))
  const settlementItemByOrderItem = new Map(((settlementItems ?? []) as SettlementItemSnapshot[]).map((item) => [item.order_item_id, item]))
  const payoutByOrder = new Map<string, number>()
  for (const item of orderItems ?? []) {
    if (item.confirmed_quantity === null || item.confirmed_quantity === undefined) continue
    const snapshot = settlementItemByOrderItem.get(item.id)
    if (snapshot) {
      payoutByOrder.set(item.order_id, (payoutByOrder.get(item.order_id) ?? 0) + Number(snapshot.amount ?? 0))
      continue
    }
    const unitPrice = getRateValueFromItem(item, rateByCategory.get(item.category_id), 'vendor')
    payoutByOrder.set(item.order_id, (payoutByOrder.get(item.order_id) ?? 0) + unitPrice * Number(item.confirmed_quantity))
  }

  const vendorById = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor.business_name || 'Vendor']))
  const vendorPayoutReadyById = new Map(
    (vendors ?? []).map((vendor) => [vendor.id, vendor.payout_account_status === 'verified' && Boolean(vendor.payout_recipient_code)]),
  )
  const transferBySettlement = new Map((settlementTransfers ?? []).map((transfer) => [transfer.settlement_id, transfer]))
  const linkedOrderById = new Map((linkedOrders ?? []).map((order) => [order.id, order]))
  const settlementOrdersBySettlement = new Map<string, string[]>()
  const settledOrderIds = new Set<string>()
  for (const record of settlementOrders ?? []) {
    const existing = settlementOrdersBySettlement.get(record.settlement_id) ?? []
    existing.push(record.order_id)
    settlementOrdersBySettlement.set(record.settlement_id, existing)
  }
  for (const settlement of settlements ?? []) {
    if (settlement.status === 'paid') {
      for (const orderId of settlementOrdersBySettlement.get(settlement.id) ?? []) settledOrderIds.add(orderId)
    }
  }

  const summaryMap = new Map<
    string,
    {
      vendorId: string
      vendorName: string
      outstandingOrderCount: number
      outstandingCollected: number
      totalCollected: number
      totalVendorPayout: number
      vendorPayout: number
    }
  >()
  for (const vendor of vendors ?? []) {
    summaryMap.set(vendor.id, {
      vendorId: vendor.id,
      vendorName: vendor.business_name || 'Vendor',
      outstandingOrderCount: 0,
      outstandingCollected: 0,
      totalCollected: 0,
      totalVendorPayout: 0,
      vendorPayout: 0,
    })
  }
  for (const order of orders ?? []) {
    const vendorId = order.vendor_id
    if (!vendorId || order.status === 'cancelled' || order.clothes_count_vendor === null) continue
    const invoice = invoiceByOrder.get(order.id)
    if (invoice?.status !== 'paid') continue
    const vendorName = vendorById.get(vendorId) ?? 'Vendor'
    const current = summaryMap.get(vendorId) ?? {
      vendorId,
      vendorName,
      outstandingOrderCount: 0,
      outstandingCollected: 0,
      totalCollected: 0,
      totalVendorPayout: 0,
      vendorPayout: 0,
    }
    current.totalCollected += Number(invoice.amount ?? 0)
    const orderPayout = payoutByOrder.get(order.id) ?? 0
    current.totalVendorPayout += orderPayout
    if (!settledOrderIds.has(order.id)) {
      current.outstandingOrderCount += 1
      current.outstandingCollected += Number(invoice.amount ?? 0)
      current.vendorPayout += orderPayout
    }
    summaryMap.set(vendorId, current)
  }

  const vendorSummaries: VendorSummary[] = [...summaryMap.values()].map((vendor) => ({
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    outstandingOrderCount: vendor.outstandingOrderCount,
    outstandingCollected: vendor.outstandingCollected,
    totalCollected: vendor.totalCollected,
    totalVendorPayout: vendor.totalVendorPayout,
    vendorPayout: vendor.vendorPayout,
  }))
  const settlementRows: SettlementRow[] = (settlements ?? []).map((settlement) => {
    const orderIds = settlementOrdersBySettlement.get(settlement.id) ?? []
    return {
      id: settlement.id,
      vendorId: settlement.vendor_id,
      vendorName: vendorById.get(settlement.vendor_id) ?? 'Vendor',
      periodStart: settlement.period_start,
      periodEnd: settlement.period_end,
      amountDue: Number(settlement.amount_due ?? 0),
      status: settlement.status,
      createdAt: settlement.created_at,
      payoutAccountReady: vendorPayoutReadyById.get(settlement.vendor_id) ?? false,
      eligibleForPayout: orderIds.length > 0 && orderIds.every((orderId) => invoiceByOrder.get(orderId)?.status === 'paid'),
      transferStatus: (transferBySettlement.get(settlement.id)?.status as SettlementRow['transferStatus']) ?? null,
      transferFailureReason: transferBySettlement.get(settlement.id)?.failure_reason ?? null,
      transferReference: transferBySettlement.get(settlement.id)?.paystack_reference ?? null,
      orders: orderIds.map((orderId) => {
        const order = linkedOrderById.get(orderId)
        return {
          id: orderId,
          publicOrderNumber: order?.public_order_number ?? orderId,
          status: order?.status ?? 'unknown',
          confirmedItems: Number(order?.clothes_count_vendor ?? 0),
          invoicePaid: invoiceByOrder.get(orderId)?.status === 'paid',
        }
      }),
    }
  })
  const eligiblePendingSettlements = (settlements ?? []).filter((settlement) => {
    if (settlement.status !== 'pending') return false
    const orderIds = settlementOrdersBySettlement.get(settlement.id) ?? []
    return orderIds.length > 0 && orderIds.every((orderId) => invoiceByOrder.get(orderId)?.status === 'paid')
  })
  const subscriptionRevenue = sumSuccessfulPlanPayments(planPayments ?? [])
  const totalCollected = vendorSummaries.reduce((sum, vendor) => sum + vendor.totalCollected, 0) + subscriptionRevenue
  const totalVendorPayout = vendorSummaries.reduce((sum, vendor) => sum + vendor.totalVendorPayout, 0)
  const totalOwedToVendors = vendorSummaries.reduce((sum, vendor) => sum + vendor.vendorPayout, 0)

  return data(
    {
      summary: {
        totalCollected,
        subscriptionRevenue,
        totalVendorPayout,
        platformProfit: totalCollected - totalVendorPayout - Number(withdrawalTotal),
        pendingSettlements: eligiblePendingSettlements.length,
        pendingAmount: eligiblePendingSettlements.reduce((sum, settlement) => sum + Number(settlement.amount_due ?? 0), 0),
        paidSettlements: (settlements ?? []).filter((settlement) => settlement.status === 'paid').length,
        paystackBalance: paystackBalance.amount,
        paystackBalanceError: paystackBalance.error,
        totalOwedToVendors,
        withdrawalTotal: Number(withdrawalTotal),
      },
      vendors: vendorSummaries,
      settlements: settlementRows,
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
  const { supabase, headers } = auth

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
    return data(
      { error: 'Platform withdrawals are unavailable until a real payout flow is implemented.' },
      { headers, status: 410 },
    )

  if (intent === 'preview-bulk-settlement') {
    const periodStart = String(formData.get('periodStart') ?? '')
    const periodEnd = String(formData.get('periodEnd') ?? '')
    if (!isValidSettlementPeriod(periodStart, periodEnd))
      return data({ error: 'Choose a valid settlement date range.' }, { headers, status: 400 })

    const [{ data: approvedVendors, error: vendorError }, { data: rates, error: ratesError }] = await Promise.all([
      supabase
        .from('vendors')
        .select('id, business_name, payout_account_status, payout_recipient_code')
        .eq('status', 'approved')
        .order('business_name'),
      supabase.from('cloth_category_rates').select('category_id, vendor_wash_price, vendor_iron_price, vendor_wash_iron_price'),
    ])
    if (vendorError || ratesError)
      return data(
        { error: vendorError?.message ?? ratesError?.message ?? 'Settlement preview could not be loaded.' },
        { headers, status: 400 },
      )
    const vendorIds = (approvedVendors ?? []).map((vendor) => vendor.id)
    if (vendorIds.length === 0) return data({ ok: true, periodStart, periodEnd, vendors: [] }, { headers, status: 200 })

    const { data: queriedOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id, vendor_id, status, clothes_count_vendor')
      .in('vendor_id', vendorIds)
      .gte('created_at', new Date(`${periodStart}T00:00:00.000Z`).toISOString())
      .lte('created_at', new Date(`${periodEnd}T23:59:59.999Z`).toISOString())
    if (ordersError) return data({ error: ordersError.message }, { headers, status: 400 })
    const orders = (queriedOrders ?? []).filter(
      (order) => order.vendor_id && order.status !== 'cancelled' && order.clothes_count_vendor !== null,
    )
    const candidateOrderIds = orders.map((order) => order.id)
    const [{ data: paidInvoices, error: invoiceError }, { data: existingMappings, error: mappingError }] = await Promise.all([
      candidateOrderIds.length
        ? supabase.from('invoices').select('order_id').in('order_id', candidateOrderIds).eq('status', 'paid')
        : Promise.resolve({ data: [], error: null }),
      candidateOrderIds.length
        ? supabase.from('vendor_settlement_orders').select('order_id').in('order_id', candidateOrderIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (invoiceError || mappingError)
      return data(
        { error: invoiceError?.message ?? mappingError?.message ?? 'Settlement eligibility could not be loaded.' },
        { headers, status: 400 },
      )
    const paidOrderIds = new Set((paidInvoices ?? []).map((invoice) => invoice.order_id))
    const alreadySettledOrderIds = new Set((existingMappings ?? []).map((mapping) => mapping.order_id))
    const payableOrderIds = candidateOrderIds.filter((orderId) => paidOrderIds.has(orderId) && !alreadySettledOrderIds.has(orderId))
    const { data: previewItems, error: itemsError } = payableOrderIds.length
      ? await supabase
          .from('order_items')
          .select('id, order_id, category_id, confirmed_quantity, service, unit_price')
          .in('order_id', payableOrderIds)
      : { data: [], error: null }
    if (itemsError) return data({ error: itemsError.message }, { headers, status: 400 })

    const invoiceStatusByOrderId = new Map((paidInvoices ?? []).map((invoice) => [invoice.order_id, 'paid']))
    const settlementOrders: SettlementCandidateOrder[] = orders.map((order) => ({
      id: order.id,
      vendor_id: order.vendor_id!,
      status: order.status,
      clothes_count_vendor: order.clothes_count_vendor,
      invoice_status: invoiceStatusByOrderId.get(order.id) ?? null,
    }))
    const previews = buildSettlementVendorPreviews(
      (approvedVendors ?? []).map((vendor) => ({
        vendorId: vendor.id,
        vendorName: vendor.business_name || 'Vendor',
        payoutAccountReady: vendor.payout_account_status === 'verified' && Boolean(vendor.payout_recipient_code),
      })),
      settlementOrders,
      (previewItems ?? []) as SettlementCandidateItem[],
      rates ?? [],
      alreadySettledOrderIds,
    )
    return data(
      {
        ok: true,
        periodStart,
        periodEnd,
        vendors: previews.map(({ vendorId, vendorName, orderCount, amount, eligible, reason }) => ({
          vendorId,
          vendorName,
          orderCount,
          amount,
          eligible,
          reason,
        })),
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

export default function Finance() {
  const { summary, vendors, settlements } = useLoaderData<typeof loader>()
  const revalidator = useRevalidator()
  const vendorsWithBalance = vendors.filter((vendor) => vendor.vendorPayout > 0)
  const owedVendorCount = vendorsWithBalance.length
  const fetcher = useFetcher<typeof action>()
  const settlementFetcher = useFetcher<typeof action>()
  const previewFetcher = useFetcher<typeof action>()
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
    const refreshFinance = () => revalidator.revalidate()
    const channel = supabaseClient
      .channel('admin-finance-settlement-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_settlements' }, refreshFinance)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_settlement_transfers' }, refreshFinance)
      .subscribe()
    return () => {
      void supabaseClient.removeChannel(channel)
    }
  }, [revalidator.revalidate])

  useEffect(() => {
    if (!isCreateDrawerOpen || !startDate || !endDate || !dateRangeIsValid) return
    previewFetcher.submit({ intent: 'preview-bulk-settlement', periodStart: startDate, periodEnd: endDate }, { method: 'post' })
  }, [isCreateDrawerOpen, startDate, endDate, dateRangeIsValid])

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
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Paystack balance</p>
          <div className="mt-3 flex min-w-0 items-end justify-between gap-2">
            <p className="min-w-0 truncate text-2xl font-bold text-slate-900 sm:text-3xl">
              {summary.paystackBalance === null ? 'Unavailable' : money(summary.paystackBalance)}
            </p>
            <CircleDollarSign size={18} className="shrink-0 text-brand-primary" />
          </div>
          {summary.paystackBalanceError && (
            <p className="mt-2 truncate text-[11px] text-amber-700" title={summary.paystackBalanceError}>
              {summary.paystackBalanceError}
            </p>
          )}
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total collected</p>
          <div className="mt-3 flex min-w-0 items-end justify-between gap-2">
            <p className="min-w-0 truncate text-2xl font-bold text-slate-900 sm:text-3xl">{money(summary.totalCollected)}</p>
            <Banknote size={18} className="shrink-0 text-emerald-600" />
          </div>
          <p className="mt-2 text-xs text-slate-500">Includes {money(summary.subscriptionRevenue)} in subscription sales</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Owed to vendors</p>
          <div className="mt-3 flex min-w-0 items-end justify-between gap-2">
            <p className="min-w-0 truncate text-2xl font-bold text-slate-900 sm:text-3xl">{money(summary.totalOwedToVendors)}</p>
            <TrendingUp size={18} className="shrink-0 text-violet-600" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            ({owedVendorCount} vendor{owedVendorCount === 1 ? '' : 's'})
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Platform profit</p>
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
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
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
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Start date</span>
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
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">End date</span>
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
              <span className="text-sm text-slate-500">{settlements.length} records</span>
              <button
                type="button"
                aria-label="Refresh Finance data"
                title="Refresh Finance data"
                onClick={() => revalidator.revalidate()}
                disabled={revalidator.state !== 'idle'}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-brand-primary hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={16} className={revalidator.state !== 'idle' ? 'animate-spin' : ''} />
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
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
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
                      onClick={() => setSelectedSettlement(settlement)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedSettlement(settlement)
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
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${settlement.transferStatus === 'reversed' || settlement.transferStatus === 'failed' || settlement.transferStatus === 'rejected' ? 'bg-red-50 text-red-700' : settlement.status === 'paid' || settlement.transferStatus === 'success' ? 'bg-emerald-50 text-emerald-700' : !settlement.eligibleForPayout ? 'bg-orange-50 text-orange-700' : settlement.transferStatus === 'processing' || settlement.transferStatus === 'queued' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}
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
                  setSelectedSettlement(openSettlementMenu.settlement)
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
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${selectedSettlement.transferStatus === 'reversed' || selectedSettlement.transferStatus === 'failed' || selectedSettlement.transferStatus === 'rejected' ? 'bg-red-50 text-red-700' : selectedSettlement.status === 'paid' || selectedSettlement.transferStatus === 'success' ? 'bg-emerald-50 text-emerald-700' : selectedSettlement.transferStatus === 'processing' ? 'bg-blue-50 text-blue-700' : !selectedSettlement.eligibleForPayout ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-700'}`}
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Settlement total</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{money(selectedSettlement.amountDue)}</p>
              </div>
              <div className="py-3 sm:px-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Linked orders</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedSettlement.orders.length} order{selectedSettlement.orders.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="py-3 sm:pl-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Payout account</p>
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
                  {selectedSettlement.orders.length} order{selectedSettlement.orders.length === 1 ? '' : 's'}
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
              {selectedSettlement.orders.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No linked orders were found for this settlement.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {selectedSettlement.orders.map((order) => (
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
