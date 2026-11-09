import { Banknote, WalletCards } from 'lucide-react'
import { data, useLoaderData, useSearchParams } from 'react-router'
import type { Route } from './+types/Finance'
import { requireRole } from '../../../lib/auth.server'
import { sql } from '../../../lib/db.server'

const settlementPageSize = 10

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
  pagination: { page: number; pageSize: number; totalCount: number; pageCount: number }
}

const emptyPagination = { page: 1, pageSize: settlementPageSize, totalCount: 0, pageCount: 1 }

function money(value: number) {
  return `₦${value.toLocaleString()}`
}
function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return 'No period'
  return `${start ? new Date(start).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} — ${end ? new Date(end).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}`
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, 'vendor')
  if (!auth)
    return data<VendorFinanceData>(
      {
        error: 'Please sign in again.',
        summary: { totalPayable: 0, pendingAmount: 0, paidAmount: 0 },
        settlements: [],
        pagination: emptyPagination,
      },
      { status: 401 },
    )

  const { supabase, headers } = auth

  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id, business_name, status')
    .eq('profile_id', auth.profile.id)
    .maybeSingle()
  if (vendorError) {
    return data<VendorFinanceData>(
      {
        error: vendorError.message,
        summary: { totalPayable: 0, pendingAmount: 0, paidAmount: 0 },
        settlements: [],
        pagination: emptyPagination,
      },
      { headers, status: 500 },
    )
  }

  if (!vendor?.id) {
    return data<VendorFinanceData>(
      {
        error: 'Approved vendor access is required.',
        summary: { totalPayable: 0, pendingAmount: 0, paidAmount: 0 },
        settlements: [],
        pagination: emptyPagination,
      },
      { headers, status: 403 },
    )
  }

  const requestedPage = Number.parseInt(new URL(request.url).searchParams.get('page') ?? '1', 10)
  const requestedPageNumber = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [{ count: settlementCount, error: settlementCountError }, financeSummary] = await Promise.all([
    supabase.from('vendor_settlements').select('id', { count: 'exact', head: true }).eq('vendor_id', vendor.id),
    sql<
      {
        total_payable: number
        pending_amount: number
        paid_amount: number
      }[]
    >`
        with payable as (
          select coalesce(sum(
            coalesce(
              case item.service
                when 'wash' then rate.vendor_wash_price
                when 'iron' then rate.vendor_iron_price
                when 'wash_iron' then rate.vendor_wash_iron_price
              end,
              0
            ) * coalesce(item.confirmed_quantity, 0)
          ), 0) as amount
          from orders order_row
          join invoices invoice on invoice.order_id = order_row.id and invoice.status = 'paid'
          join order_items item on item.order_id = order_row.id
          left join cloth_category_rates rate on rate.category_id = item.category_id
          where order_row.vendor_id = ${vendor.id}
            and order_row.status <> 'cancelled'
            and order_row.clothes_count_vendor is not null
            and not exists (
              select 1 from vendor_settlement_orders settled where settled.order_id = order_row.id
            )
        ),
        settlements as (
          select
            coalesce(sum(settlement.amount_due) filter (where settlement.status = 'paid'), 0) as paid_amount,
            coalesce(sum(settlement.amount_due) filter (
              where settlement.status = 'pending'
                and exists (
                  select 1
                  from vendor_settlement_orders membership
                  where membership.settlement_id = settlement.id
                )
                and not exists (
                  select 1
                  from vendor_settlement_orders membership
                  join orders order_row on order_row.id = membership.order_id
                  left join invoices invoice on invoice.order_id = order_row.id
                  where membership.settlement_id = settlement.id
                    and invoice.status is distinct from 'paid'
                )
            ), 0) as pending_amount
          from vendor_settlements settlement
          where settlement.vendor_id = ${vendor.id}
        )
        select payable.amount as total_payable, settlements.pending_amount, settlements.paid_amount
        from payable, settlements
      `,
  ])

  if (settlementCountError) {
    return data<VendorFinanceData>(
      {
        error: settlementCountError.message,
        summary: { totalPayable: 0, pendingAmount: 0, paidAmount: 0 },
        settlements: [],
        pagination: emptyPagination,
      },
      { headers, status: 500 },
    )
  }

  const totalCount = settlementCount ?? 0
  const pageCount = Math.max(1, Math.ceil(totalCount / settlementPageSize))
  const page = Math.min(requestedPageNumber, pageCount)
  const { data: settlements, error: settlementsError } = await supabase
    .from('vendor_settlements')
    .select('id, vendor_id, period_start, period_end, amount_due, status, created_at')
    .eq('vendor_id', vendor.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * settlementPageSize, page * settlementPageSize - 1)

  if (settlementsError) {
    return data<VendorFinanceData>(
      {
        error: settlementsError.message,
        summary: { totalPayable: 0, pendingAmount: 0, paidAmount: 0 },
        settlements: [],
        pagination: emptyPagination,
      },
      { headers, status: 500 },
    )
  }

  return data<VendorFinanceData>(
    {
      error: null,
      summary: {
        totalPayable: Number(financeSummary[0]?.total_payable ?? 0),
        pendingAmount: Number(financeSummary[0]?.pending_amount ?? 0),
        paidAmount: Number(financeSummary[0]?.paid_amount ?? 0),
      },
      settlements: (settlements ?? []).map((settlement) => ({
        id: settlement.id,
        periodStart: settlement.period_start,
        periodEnd: settlement.period_end,
        amountDue: Number(settlement.amount_due ?? 0),
        status: settlement.status,
        createdAt: settlement.created_at,
      })),
      pagination: { page, pageSize: settlementPageSize, totalCount, pageCount },
    },
    { headers, status: 200 },
  )
}

export default function VendorFinancePage() {
  const { error, summary, settlements, pagination } = useLoaderData<typeof loader>()
  const [, setSearchParams] = useSearchParams()
  const changePage = (page: number) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (page <= 1) next.delete('page')
      else next.set('page', String(page))
      return next
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Finance</h2>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Finance data could not be loaded: {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Total payable</p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-2xl font-bold text-slate-900">{money(summary.totalPayable)}</p>
            <Banknote size={18} className="text-emerald-600" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Pending payout</p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-2xl font-bold text-slate-900">{money(summary.pendingAmount)}</p>
            <WalletCards size={18} className="text-amber-600" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Paid to date</p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-2xl font-bold text-slate-900">{money(summary.paidAmount)}</p>
            <WalletCards size={18} className="text-violet-600" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-900">Settlement history</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] capitalize tracking-[0.12em] text-slate-500">
                <th className="px-5 py-3 font-semibold">Period</th>
                <th className="px-5 py-3 font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {settlements.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-500">
                    No settlements are available yet.
                  </td>
                </tr>
              ) : (
                settlements.map((settlement) => (
                  <tr key={settlement.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-4 text-sm text-slate-700">{formatRange(settlement.periodStart, settlement.periodEnd)}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900">{money(settlement.amountDue)}</td>
                    <td className="px-5 py-4 text-sm">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize tracking-[0.12em] ${settlement.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                      >
                        {settlement.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {pagination && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-500">
            {pagination.totalCount === 0
              ? 'No settlements'
              : `${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of ${pagination.totalCount}`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => changePage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => changePage(pagination.page + 1)}
              disabled={pagination.page >= pagination.pageCount}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
