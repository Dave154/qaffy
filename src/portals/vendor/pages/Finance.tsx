import { Banknote, WalletCards } from 'lucide-react'
import { data, useLoaderData } from 'react-router'
import type { Route } from './+types/Finance'
import { requireRole } from '../../../lib/auth.server'
import { getRateValueFromItem } from '../../../lib/rate-card'

type SettlementRow = {
  id: string
  periodStart: string | null
  periodEnd: string | null
  amountDue: number
  status: 'pending' | 'paid'
  createdAt: string | null
}

type VendorFinanceData = {
  error: string | null
  summary: {
    totalPayable: number
    pendingAmount: number
    paidAmount: number
  }
  settlements: SettlementRow[]
}

function money(value: number) { return `₦${value.toLocaleString()}` }
function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return 'No period'
  return `${start ? new Date(start).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} — ${end ? new Date(end).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}`
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'vendor')
  if (!auth) return data<VendorFinanceData>({ error: 'Please sign in again.', summary: { totalPayable: 0, pendingAmount: 0, paidAmount: 0 }, settlements: [] }, { status: 401 })

  const { supabase, headers } = auth

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, business_name, status')
    .eq('profile_id', auth.profile.id)
    .maybeSingle()

  if (!vendor?.id) {
    return data<VendorFinanceData>({ error: 'Approved vendor access is required.', summary: { totalPayable: 0, pendingAmount: 0, paidAmount: 0 }, settlements: [] }, { headers, status: 403 })
  }

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, vendor_id, status, clothes_count_vendor, created_at')
    .eq('vendor_id', vendor.id)
    .order('created_at', { ascending: false })
  const orderIds = (orders ?? []).map((order) => order.id)
  const [{ data: orderItems, error: orderItemsError }, { data: rates, error: ratesError }, { data: settlements, error: settlementsError }, { data: settlementOrders, error: settlementOrdersError }] = await Promise.all([
    orderIds.length ? supabase.from('order_items').select('id, order_id, category_id, quantity, confirmed_quantity, service, unit_price').in('order_id', orderIds) : Promise.resolve({ data: [], error: null }),
    supabase.from('cloth_category_rates').select('category_id, vendor_wash_price, vendor_iron_price, vendor_wash_iron_price'),
    supabase.from('vendor_settlements').select('id, vendor_id, period_start, period_end, amount_due, status, created_at').eq('vendor_id', vendor.id).order('created_at', { ascending: false }),
    orderIds.length ? supabase.from('vendor_settlement_orders').select('order_id, settlement_id').in('order_id', orderIds) : Promise.resolve({ data: [], error: null }),
  ])

  const queryError = ordersError ?? orderItemsError ?? ratesError ?? settlementsError ?? settlementOrdersError
  if (queryError) {
    return data<VendorFinanceData>({ error: queryError.message, summary: { totalPayable: 0, pendingAmount: 0, paidAmount: 0 }, settlements: [] }, { headers, status: 500 })
  }

  const rateByCategory = new Map((rates ?? []).map((rate) => [rate.category_id, rate]))
  const settledOrderIds = new Set((settlementOrders ?? []).map((mapping) => mapping.order_id))
  const payableByOrder = new Map<string, number>()

  for (const item of orderItems ?? []) {
    const order = orders?.find((candidate) => candidate.id === item.order_id)
    if (!order || order.clothes_count_vendor === null || order.status === 'cancelled') continue
    const rate = rateByCategory.get(item.category_id)
    const unitPrice = getRateValueFromItem(item, rate, 'vendor')
    const current = payableByOrder.get(item.order_id) ?? 0
    payableByOrder.set(item.order_id, current + (unitPrice * Number(item.confirmed_quantity ?? 0)))
  }

  const totalPayable = (orders ?? []).reduce((sum, order) => settledOrderIds.has(order.id) ? sum : sum + (payableByOrder.get(order.id) ?? 0), 0)
  const pendingAmount = (settlements ?? []).filter((settlement) => settlement.status === 'pending').reduce((sum, settlement) => sum + Number(settlement.amount_due ?? 0), 0)
  const paidAmount = (settlements ?? []).filter((settlement) => settlement.status === 'paid').reduce((sum, settlement) => sum + Number(settlement.amount_due ?? 0), 0)

  return data<VendorFinanceData>({
    error: null,
    summary: {
      totalPayable,
      pendingAmount,
      paidAmount,
    },
    settlements: (settlements ?? []).map((settlement) => ({
      id: settlement.id,
      periodStart: settlement.period_start,
      periodEnd: settlement.period_end,
      amountDue: Number(settlement.amount_due ?? 0),
      status: settlement.status,
      createdAt: settlement.created_at,
    })),
  }, { headers, status: 200 })
}

export default function VendorFinancePage() {
  const { error, summary, settlements } = useLoaderData<typeof loader>()

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Finance</h2>
        </div>
      </header>

  {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">Finance data could not be loaded: {error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total payable</p>
          <div className="mt-3 flex items-end justify-between"><p className="text-2xl font-bold text-slate-900">{money(summary.totalPayable)}</p><Banknote size={18} className="text-emerald-600" /></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pending payout</p>
          <div className="mt-3 flex items-end justify-between"><p className="text-2xl font-bold text-slate-900">{money(summary.pendingAmount)}</p><WalletCards size={18} className="text-amber-600" /></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Paid to date</p>
          <div className="mt-3 flex items-end justify-between"><p className="text-2xl font-bold text-slate-900">{money(summary.paidAmount)}</p><WalletCards size={18} className="text-violet-600" /></div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-900">Settlement history</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="px-5 py-3 font-semibold">Period</th>
                <th className="px-5 py-3 font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {settlements.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-500">No settlements are available yet.</td></tr>
              ) : settlements.map((settlement) => (
                <tr key={settlement.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-4 text-sm text-slate-700">{formatRange(settlement.periodStart, settlement.periodEnd)}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-900">{money(settlement.amountDue)}</td>
                  <td className="px-5 py-4 text-sm">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${settlement.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{settlement.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
