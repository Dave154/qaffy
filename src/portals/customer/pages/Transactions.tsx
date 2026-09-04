type Transaction = {
  title: string
  reference: string
  date: string
  amount: string
  direction: 'credit' | 'debit'
  status: string
}

const transactions: Transaction[] = [
  {
    title: 'Wallet top up',
    reference: 'via Paystack • QF-8821',
    date: 'Today, 09:42 AM',
    amount: '+₦10,000',
    direction: 'credit',
    status: 'Successful',
  },
  {
    title: 'Order payment',
    reference: 'QF-1042 • Wash + Iron',
    date: 'Yesterday, 04:18 PM',
    amount: '-₦4,800',
    direction: 'debit',
    status: 'Successful',
  },
  {
    title: 'Wallet top up',
    reference: 'via Paystack • QF-8794',
    date: '28 Aug 2026, 11:06 AM',
    amount: '+₦15,000',
    direction: 'credit',
    status: 'Successful',
  },
  {
    title: 'Order payment',
    reference: 'QF-1038 • Wash',
    date: '27 Aug 2026, 02:35 PM',
    amount: '-₦7,200',
    direction: 'debit',
    status: 'Successful',
  },
]

const filterItems = ['All activity', 'Top ups', 'Payments']

export default function Transactions() {
  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">Money movement</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Transactions</h2>
        </div>
        <p className="text-sm text-slate-500">Your wallet activity</p>
      </header>

      <section className="rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-100 sm:p-4">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filterItems.map((item, index) => (
            <button
              key={item}
              type="button"
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                index === 0 ? 'bg-slate-900 text-white shadow-sm shadow-slate-200' : 'bg-slate-50 text-slate-500 hover:bg-sky-50 hover:text-sky-700'
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
          <button type="button" className="hidden rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-sky-200 hover:text-sky-700 sm:block">
            Export
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {transactions.map((transaction) => (
            <div key={`${transaction.title}-${transaction.date}`} className="flex items-center gap-3 py-4 first:pt-1 last:pb-1">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg ${transaction.direction === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-700'}`}>
                {transaction.direction === 'credit' ? '↓' : '↑'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{transaction.title}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{transaction.reference}</p>
                <p className="mt-1 text-[11px] text-slate-400">{transaction.date}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`font-semibold ${transaction.direction === 'credit' ? 'text-emerald-600' : 'text-slate-900'}`}>{transaction.amount}</p>
                <p className="mt-1 text-[11px] font-medium text-emerald-600">{transaction.status}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
