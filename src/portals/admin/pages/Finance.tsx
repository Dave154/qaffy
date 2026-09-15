import { ArrowRight, Banknote, CheckCircle2, CircleDollarSign, Loader2, TrendingUp } from 'lucide-react'
import { data, useFetcher, useLoaderData } from 'react-router'
import { useState } from 'react'
import type { Route } from './+types/Finance'
import { requireRole } from '../../../lib/auth.server'
import { getRateValueFromItem } from '../../../lib/rate-card'

type SettlementRow = {
  id: string
  vendorId: string
  vendorName: string
  periodStart: string
  periodEnd: string
  amountDue: number
  status: 'pending' | 'paid'
  createdAt: string
}

type VendorSummary = {
  vendorId: string
  vendorName: string
  orderCount: number
  totalCollected: number
  vendorPayout: number
  unpaidAmount: number
  settlementStatus: 'pending' | 'paid' | 'none'
  lastSettlementAt: string | null
}

type FinanceData = {
  summary: {
    totalCollected: number
    totalVendorPayout: number
    platformProfit: number
    pendingSettlements: number
    pendingAmount: number
    paidSettlements: number
    paystackBalance: number
    totalOwedToVendors: number
  }
  vendors: VendorSummary[]
  settlements: SettlementRow[]
}

function money(value: number) { return `₦${value.toLocaleString()}` }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'No period' }

async function fetchPaystackBalance(secretKey: string) {
  if (!secretKey) return 0

  try {
    const response = await fetch('https://api.paystack.co/balance', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Paystack balance request failed:', response.status, await response.text())
      return 0
    }

    const payload = await response.json() as { data?: Array<{ balance?: number | string }> }
    const totalBalanceKobo = (payload.data ?? []).reduce((sum, item) => sum + Number(item.balance ?? 0), 0)
    return totalBalanceKobo / 100
  } catch (error) {
    console.error('Paystack balance lookup error:', error)
    return 0
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data<FinanceData>({ summary: { totalCollected: 0, totalVendorPayout: 0, platformProfit: 0, pendingSettlements: 0, pendingAmount: 0, paidSettlements: 0, paystackBalance: 0, totalOwedToVendors: 0 }, vendors: [], settlements: [] }, { status: 200 })

  const { supabase, headers } = auth
  const [{ data: vendors }, { data: orders }, { data: orderItems }, { data: rates }, { data: invoices }, { data: settlements }, { data: settlementOrders }] = await Promise.all([
    supabase.from('vendors').select('id, profile_id, business_name, status').eq('status', 'approved').order('created_at', { ascending: false }),
    supabase.from('orders').select('id, vendor_id, status, clothes_count_vendor, created_at').not('vendor_id', 'is', null).order('created_at', { ascending: false }),
    supabase.from('order_items').select('id, order_id, category_id, quantity, confirmed_quantity, service, unit_price'),
    supabase.from('cloth_category_rates').select('category_id, vendor_wash_price, vendor_iron_price, vendor_wash_iron_price'),
    supabase.from('invoices').select('id, order_id, amount, status, created_at'),
    supabase.from('vendor_settlements').select('id, vendor_id, period_start, period_end, amount_due, status, created_at').order('created_at', { ascending: false }),
    supabase.from('vendor_settlement_orders').select('settlement_id, order_id'),
  ])

  const rateByCategory = new Map((rates ?? []).map((rate) => [rate.category_id, rate]))
  const invoiceByOrder = new Map((invoices ?? []).map((invoice) => [invoice.order_id, invoice]))
  const payoutByOrder = new Map<string, number>()
  for (const item of orderItems ?? []) {
    if (item.confirmed_quantity === null || item.confirmed_quantity === undefined) continue
    const rate = rateByCategory.get(item.category_id)
    const unitPrice = getRateValueFromItem(item, rate, 'vendor')
    const current = payoutByOrder.get(item.order_id) ?? 0
    payoutByOrder.set(item.order_id, current + (unitPrice * Number(item.confirmed_quantity)))
  }

  const vendorById = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor.business_name || 'Vendor']))
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

  const summaryMap = new Map<string, { vendorId: string; vendorName: string; orderCount: number; totalCollected: number; vendorPayout: number; unpaidAmount: number; settlementStatus: 'pending' | 'paid' | 'none'; lastSettlementAt: string | null }>()

  for (const order of orders ?? []) {
    const vendorId = order.vendor_id
    if (!vendorId) continue
    if (order.status === 'cancelled' || order.clothes_count_vendor === null) continue
    const vendorName = vendorById.get(vendorId) ?? 'Vendor'
    const current = summaryMap.get(vendorId) ?? {
      vendorId,
      vendorName,
      orderCount: 0,
      totalCollected: 0,
      vendorPayout: 0,
      unpaidAmount: 0,
      settlementStatus: 'none' as const,
      lastSettlementAt: null,
    }

    current.orderCount += 1
    if (!settledOrderIds.has(order.id)) current.vendorPayout += payoutByOrder.get(order.id) ?? 0
    const invoice = invoiceByOrder.get(order.id)
    if (invoice?.status === 'paid') {
      current.totalCollected += Number(invoice.amount ?? 0)
    } else {
      current.unpaidAmount += Number(invoice?.amount ?? 0)
    }
    summaryMap.set(vendorId, current)
  }

  for (const settlement of settlements ?? []) {
    const current = summaryMap.get(settlement.vendor_id)
    if (!current) continue
    current.settlementStatus = settlement.status === 'paid' ? 'paid' : 'pending'
    current.lastSettlementAt = settlement.created_at
  }

  const vendorSummaries: VendorSummary[] = [...summaryMap.values()].map((vendor) => ({
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    orderCount: vendor.orderCount,
    totalCollected: vendor.totalCollected,
    vendorPayout: vendor.vendorPayout,
    unpaidAmount: vendor.unpaidAmount,
    settlementStatus: vendor.settlementStatus,
    lastSettlementAt: vendor.lastSettlementAt,
  }))

  const settlementRows: SettlementRow[] = (settlements ?? []).map((settlement) => ({
    id: settlement.id,
    vendorId: settlement.vendor_id,
    vendorName: vendorById.get(settlement.vendor_id) ?? 'Vendor',
    periodStart: settlement.period_start,
    periodEnd: settlement.period_end,
    amountDue: Number(settlement.amount_due ?? 0),
    status: settlement.status,
    createdAt: settlement.created_at,
  }))

  const totalCollected = vendorSummaries.reduce((sum, vendor) => sum + vendor.totalCollected, 0)
  const totalVendorPayout = vendorSummaries.reduce((sum, vendor) => sum + vendor.vendorPayout, 0)
  const pendingSettlements = (settlements ?? []).filter((settlement) => settlement.status === 'pending').length
  const pendingAmount = (settlements ?? []).filter((settlement) => settlement.status === 'pending').reduce((sum, settlement) => sum + Number(settlement.amount_due ?? 0), 0)
  const paidSettlements = (settlements ?? []).filter((settlement) => settlement.status === 'paid').length
  const paidSettlementAmount = (settlements ?? []).filter((settlement) => settlement.status === 'paid').reduce((sum, settlement) => sum + Number(settlement.amount_due ?? 0), 0)
  const totalOwedToVendors = Math.max(totalVendorPayout - paidSettlementAmount, 0)
  const paystackBalance = await fetchPaystackBalance(process.env.PAYSTACK_SECRET_KEY ?? '')

  return data<FinanceData>({
    summary: {
      totalCollected,
      totalVendorPayout,
      platformProfit: totalCollected - totalVendorPayout,
      pendingSettlements,
      pendingAmount,
      paidSettlements,
      paystackBalance,
      totalOwedToVendors,
    },
    vendors: vendorSummaries,
    settlements: settlementRows,
  }, { headers, status: 200 })
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  const auth = await requireRole(request, 'admin')
  if (!auth) return data({ error: 'Admin access required.' }, { status: 403 })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  const { supabase, headers } = auth

  if (intent === 'record-withdrawal') {
    const amount = Number(formData.get('amount') ?? 0)
    const note = String(formData.get('note') ?? '').trim()
    if (!Number.isFinite(amount) || amount <= 0) return data({ error: 'Withdrawal amount must be greater than zero.' }, { headers, status: 400 })

    const { error } = await supabase.from('admin_audit_events').insert({
      admin_profile_id: auth.profile.id,
      action: 'platform_profit_withdrawal',
      entity_type: 'finance',
      entity_id: null,
      metadata: { amount, note: note || 'Admin profit withdrawal recorded', createdAt: new Date().toISOString() },
    })
    if (error) return data({ error: error.message }, { headers, status: 400 })
    return data({ ok: true }, { headers, status: 200 })
  }

  if (intent === 'create-settlement') {
    const vendorId = String(formData.get('vendorId') ?? '')
    const periodStart = String(formData.get('periodStart') ?? '')
    const periodEnd = String(formData.get('periodEnd') ?? '')
    if (!vendorId || !periodStart || !periodEnd) return data({ error: 'Vendor and settlement dates are required.' }, { headers, status: 400 })

    const { data: orders } = await supabase
      .from('orders')
      .select('id, vendor_id, created_at')
      .eq('vendor_id', vendorId)
      .gte('created_at', new Date(periodStart).toISOString())
      .lte('created_at', new Date(`${periodEnd}T23:59:59.999Z`).toISOString())
    const orderIds = (orders ?? []).map((order) => order.id)
    if (orderIds.length === 0) return data({ error: 'No payable orders are available for this vendor in the selected period.' }, { headers, status: 400 })

    const { data: payoutRows } = await supabase.from('order_items').select('id, order_id, category_id, quantity, service, unit_price')
    const { data: rates } = await supabase.from('cloth_category_rates').select('category_id, vendor_wash_price, vendor_iron_price, vendor_wash_iron_price')
    const rateByCategory = new Map((rates ?? []).map((rate) => [rate.category_id, rate]))
    const amountDue = (payoutRows ?? []).filter((item) => orderIds.includes(item.order_id)).reduce((sum, item) => {
      const rate = rateByCategory.get(item.category_id)
      const unitPrice = getRateValueFromItem(item, rate, 'vendor')
      return sum + (unitPrice * Number(item.quantity ?? 0))
    }, 0)

    const { data: settlement, error: settlementError } = await supabase
      .from('vendor_settlements')
      .insert({
        vendor_id: vendorId,
        period_start: periodStart,
        period_end: periodEnd,
        amount_due: amountDue,
        status: 'pending',
      })
      .select('id')
      .single()

    if (settlementError) return data({ error: settlementError.message }, { headers, status: 400 })

    const mappings = orderIds.map((orderId) => ({ settlement_id: settlement.id, order_id: orderId }))
    const { error: mappingError } = await supabase.from('vendor_settlement_orders').insert(mappings)
    if (mappingError) return data({ error: mappingError.message }, { headers, status: 400 })

    return data({ ok: true }, { headers, status: 200 })
  }

  return data({ error: 'Unsupported finance action.' }, { headers, status: 400 })
}

export default function Finance() {
  const { summary, vendors, settlements } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [withdrawAmount, setWithdrawAmount] = useState(String(summary.platformProfit || 0))

  return (
    <div className="space-y-6">
      {fetcher.state === 'idle' && fetcher.data && 'error' in fetcher.data && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{fetcher.data.error}</div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Paystack balance</p><div className="mt-3 flex items-end justify-between"><p className="text-3xl font-bold text-slate-900">{money(summary.paystackBalance)}</p><CircleDollarSign size={18} className="text-brand-primary" /></div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total collected</p><div className="mt-3 flex items-end justify-between"><p className="text-3xl font-bold text-slate-900">{money(summary.totalCollected)}</p><Banknote size={18} className="text-emerald-600" /></div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Owed to vendors</p><div className="mt-3 flex items-end justify-between"><p className="text-3xl font-bold text-slate-900">{money(summary.totalOwedToVendors)}</p><TrendingUp size={18} className="text-violet-600" /></div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Platform profit</p><div className="mt-3 flex items-end justify-between"><p className="text-3xl font-bold text-slate-900">{money(summary.platformProfit)}</p><CheckCircle2 size={18} className="text-amber-600" /></div></div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900">Vendor payouts</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Rate card basis</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Orders</th>
                  <th className="px-4 py-3 font-semibold">Collected</th>
                  <th className="px-4 py-3 font-semibold">Payout</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {vendors.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No approved vendor payouts yet.</td></tr>
                ) : vendors.map((vendor) => (
                  <tr key={vendor.vendorId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{vendor.vendorName}</p>
                        <p className="truncate text-xs text-slate-500">{vendor.orderCount} order{vendor.orderCount !== 1 ? 's' : ''}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-700">{vendor.orderCount}</td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-700">{money(vendor.totalCollected)}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-900">{money(vendor.vendorPayout)}</td>
                    <td className="px-4 py-4 text-sm">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${vendor.settlementStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' : vendor.settlementStatus === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {vendor.settlementStatus === 'none' ? 'Unsettled' : vendor.settlementStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Create settlement</h3>
          <fetcher.Form method="post" className="mt-4 space-y-4">
            <input type="hidden" name="intent" value="create-settlement" />
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Vendor</span>
              <select name="vendorId" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" defaultValue={vendors[0]?.vendorId ?? ''}>
                {vendors.length === 0 ? <option value="">No vendors</option> : vendors.map((vendor) => <option key={vendor.vendorId} value={vendor.vendorId}>{vendor.vendorName}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Start date</span>
              <input type="date" name="periodStart" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">End date</span>
              <input type="date" name="periodEnd" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
            </label>
            <button type="submit" disabled={fetcher.state !== 'idle'} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
              {fetcher.state !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {fetcher.state !== 'idle' ? 'Creating...' : 'Create payout batch'}
            </button>
          </fetcher.Form>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Settlement history</h3>
            <span className="text-sm text-slate-500">{settlements.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Period</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No settlements have been created yet.</td></tr>
                ) : settlements.map((settlement) => (
                  <tr key={settlement.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-4 text-sm font-semibold text-slate-900">{settlement.vendorName}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{formatDate(settlement.periodStart)} — {formatDate(settlement.periodEnd)}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-900">{money(settlement.amountDue)}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${settlement.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{settlement.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Admin profit withdrawal</h3>
          <p className="mt-2 text-sm text-slate-500">Record a withdrawal from the platform profit ledger. This is a controlled admin action; actual bank transfer logic will be handled by the payment provider layer.</p>
          <fetcher.Form method="post" className="mt-5 space-y-4">
            <input type="hidden" name="intent" value="record-withdrawal" />
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Amount</span>
              <input type="number" min="1" step="100" name="amount" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Note</span>
              <textarea name="note" placeholder="e.g. Monthly admin drawdown" className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />
            </label>
            <button type="submit" disabled={fetcher.state !== 'idle'} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
              {fetcher.state !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
              {fetcher.state !== 'idle' ? 'Recording...' : 'Record withdrawal'}
            </button>
          </fetcher.Form>
        </div>
      </section>
    </div>
  )
}
