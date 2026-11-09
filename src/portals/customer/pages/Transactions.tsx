import { Link, useNavigation, useSearchParams } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { useCustomerStore } from '../customer-store-hook'
import CopyableOrderId from '../../../components/CopyableOrderId'
import { CustomerActivityListSkeleton } from '../../../components/customer/CustomerDataSkeleton'

const filterItems = ['All activity', 'Top ups', 'Payments', 'Rewards']

export default function Transactions() {
  const { transactions, transactionError, transactionPagination, isDataLoading, dataLoadError } = useCustomerStore()
  const navigation = useNavigation()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedFilter = searchParams.get('filter') ?? 'All activity'
  const activeFilter = filterItems.includes(requestedFilter) ? requestedFilter : 'All activity'
  const isLoading = isDataLoading || navigation.state === 'loading'
  const filteredTransactions = transactionPagination
    ? transactions
    : activeFilter === 'Top ups'
      ? transactions.filter((transaction) => transaction.category === 'topup')
      : activeFilter === 'Payments'
        ? transactions.filter((transaction) => transaction.category === 'payment')
        : activeFilter === 'Rewards'
          ? transactions.filter((transaction) => transaction.category === 'reward')
          : transactions
  const totalCount = transactionPagination?.totalCount ?? filteredTransactions.length
  const pageCount = transactionPagination ? Math.max(1, Math.ceil(totalCount / transactionPagination.pageSize)) : 1
  const updateTransactionPage = (page: number, filter = activeFilter) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (filter === 'All activity') next.delete('filter')
      else next.set('filter', filter)
      if (page <= 1) next.delete('page')
      else next.set('page', String(page))
      return next
    })
  }
  const exportTransactions = () => {
    const rows = [
      ['Type', 'Reference', 'Amount', 'Date', 'Status'],
      ...filteredTransactions.map((transaction) => [
        transaction.title,
        transaction.reference,
        transaction.amount,
        transaction.date,
        transaction.status,
      ]),
    ]
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'qaffy-transactions.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Transactions</h2>
        </div>
        <p className="text-sm text-slate-500">Your wallet activity</p>
      </header>

      <section className="rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-100 sm:p-4">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filterItems.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => updateTransactionPage(1, item)}
              aria-pressed={activeFilter === item}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                activeFilter === item
                  ? 'bg-slate-900 text-white shadow-sm shadow-slate-200'
                  : 'bg-slate-50 text-slate-500 hover:bg-sky-50 hover:text-sky-700'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-100 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">Recent activity</h3>
            <p className="mt-1 text-xs text-slate-500">Your wallet and payment activity</p>
          </div>
          <button
            type="button"
            onClick={exportTransactions}
            className="hidden rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-sky-200 hover:text-sky-700 sm:block"
          >
            Export page
          </button>
        </div>

        {transactionError && (
          <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Payment activity could not be loaded. Please refresh and try again.
          </div>
        )}
        {isLoading ? (
          <CustomerActivityListSkeleton rows={3} />
        ) : dataLoadError ? null : filteredTransactions.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
            {totalCount === 0
              ? activeFilter === 'All activity'
                ? 'No wallet activity yet.'
                : `No ${activeFilter.toLowerCase()} found.`
              : `No ${activeFilter.toLowerCase()} found.`}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTransactions.map((transaction) => (
              <div key={transaction.id} className="flex min-w-0 items-start gap-2 py-4 first:pt-1 last:pb-1">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg ${transaction.direction === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-700'}`}
                  >
                    {transaction.direction === 'credit' ? '↓' : '↑'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{transaction.title}</p>
                    {transaction.orderReference && (
                      <Link
                        to={`/orders?order=${encodeURIComponent(transaction.orderReference)}&returnTo=%2Ftransactions`}
                        aria-label={`View order ${transaction.orderReference}`}
                        className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-brand-border bg-brand-soft/60 px-2 py-1 text-xs font-semibold text-brand-primary transition hover:border-brand-primary/40 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1"
                      >
                        <span className="shrink-0 text-slate-500">Order</span>
                        <span className="truncate">{transaction.orderReference}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      </Link>
                    )}
                    {!transaction.orderReference && (
                      <CopyableOrderId
                        id={transaction.reference}
                        label="Transaction reference"
                        className="mt-0.5 max-w-full text-xs text-slate-500"
                      />
                    )}
                    <p className="mt-1.5 text-[11px] text-slate-400">{transaction.date}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-semibold ${transaction.direction === 'credit' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {transaction.amount}
                  </p>
                  <p
                    className={`mt-1 text-[11px] font-medium ${transaction.status === 'Successful' ? 'text-emerald-600' : transaction.status === 'Failed' ? 'text-rose-600' : 'text-amber-600'}`}
                  >
                    {transaction.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        {transactionPagination && totalCount > transactionPagination.pageSize && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Showing {(transactionPagination.page - 1) * transactionPagination.pageSize + 1}–
              {Math.min(transactionPagination.page * transactionPagination.pageSize, totalCount)} of {totalCount.toLocaleString()}{' '}
              activities
            </p>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => updateTransactionPage(transactionPagination.page - 1)}
                disabled={transactionPagination.page <= 1 || isLoading}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="whitespace-nowrap text-sm text-slate-600">
                Page {transactionPagination.page} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => updateTransactionPage(transactionPagination.page + 1)}
                disabled={transactionPagination.page >= pageCount || isLoading}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
