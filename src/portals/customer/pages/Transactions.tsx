import { useState } from 'react'
import { useNavigation } from 'react-router'
import { useCustomerStore } from '../customer-store-hook'

const filterItems = ['All activity', 'Top ups', 'Payments']

export default function Transactions() {
  const { transactions, transactionError } = useCustomerStore()
  const navigation = useNavigation()
  const [activeFilter, setActiveFilter] = useState('All activity')
  const isLoading = navigation.state === 'loading'
  const filteredTransactions = activeFilter === 'Top ups'
    ? transactions.filter((transaction) => transaction.category === 'topup')
    : activeFilter === 'Payments'
      ? transactions.filter((transaction) => transaction.category === 'payment')
      : transactions
  const exportTransactions = () => {
    const rows = [['Type', 'Reference', 'Amount', 'Date', 'Status'], ...filteredTransactions.map((transaction) => [transaction.title, transaction.reference, transaction.amount, transaction.date, transaction.status])]
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
              onClick={() => setActiveFilter(item)}
              aria-pressed={activeFilter === item}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                activeFilter === item ? 'bg-slate-900 text-white shadow-sm shadow-slate-200' : 'bg-slate-50 text-slate-500 hover:bg-sky-50 hover:text-sky-700'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Recent activity</h3>
            <p className="mt-1 text-sm text-slate-500">A record of your wallet and payments</p>
          </div>
          <button type="button" onClick={exportTransactions} className="hidden rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-sky-200 hover:text-sky-700 sm:block">
            Export
          </button>
        </div>

        {transactionError && <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Payment activity could not be loaded. Please refresh and try again.</div>}
        {isLoading ? <div className="space-y-3" aria-live="polite">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}</div> : filteredTransactions.length === 0 ? <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">{transactions.length === 0 ? 'No wallet activity yet.' : `No ${activeFilter.toLowerCase()} found.`}</div> : <div className="divide-y divide-slate-100">
          {filteredTransactions.map((transaction) => (
            <div key={transaction.id} className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 sm:flex-1">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg ${transaction.direction === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-700'}`}>
                  {transaction.direction === 'credit' ? '↓' : '↑'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{transaction.title}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{transaction.reference}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{transaction.date}</p>
                </div>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className={`font-semibold ${transaction.direction === 'credit' ? 'text-emerald-600' : 'text-slate-900'}`}>{transaction.amount}</p>
                <p className={`mt-1 text-[11px] font-medium ${transaction.status === 'Successful' ? 'text-emerald-600' : transaction.status === 'Failed' ? 'text-rose-600' : 'text-amber-600'}`}>{transaction.status}</p>
              </div>
            </div>
          ))}
        </div>}
      </section>
    </div>
  )
}
