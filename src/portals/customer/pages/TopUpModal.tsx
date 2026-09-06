import { useMemo, useState } from 'react'

type TopUpModalProps = {
  currentBalance: number
  onClose: () => void
}

const pendingOrders = [
  { id: 'QF-1038', amount: 7200 },
  { id: 'QF-1042', amount: 4800 },
]

export default function TopUpModal({ currentBalance, onClose }: TopUpModalProps) {
  const debt = useMemo(() => {
    const pendingTotal = pendingOrders.reduce((sum, order) => sum + order.amount, 0)
    return Math.max(pendingTotal - currentBalance, 0)
  }, [currentBalance])

  const suggestedAmount = useMemo(() => {
    const minimum = 1000
    return Math.max(debt > 0 ? debt : minimum, minimum)
  }, [debt])

  const [amount, setAmount] = useState<number>(suggestedAmount)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="top-up-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-[30px] bg-slate-50 p-4 shadow-2xl shadow-slate-950/20 sm:max-w-xl sm:rounded-[30px] sm:p-6"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="top-up-title" className="mt-1 text-2xl font-bold tracking-tight text-[#121212]">Add funds</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close top-up modal" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700">
            ×
          </button>
        </header>

        <div className="mt-5 rounded-[26px] bg-slate-900 p-5 text-white shadow-lg shadow-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-200">Current balance</p>
              <p className="mt-2 text-3xl font-bold">₦{currentBalance.toLocaleString()}</p>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-sky-50">Wallet</span>
          </div>
        </div>

        <div className="mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Top-up amount</span>
            <input
              type="number"
              min={1000}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value) || 0)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </label>

          <div className="mt-4 rounded-2xl bg-sky-50 p-3 text-sm text-slate-700">
            {debt > 0 ? (
              <p>
                Your recent unpaid orders total <span className="font-semibold text-sky-700">₦{debt.toLocaleString()}</span>. This amount is prefilled so the most recent debt is settled first.
              </p>
            ) : (
              <p>
                Minimum top-up is <span className="font-semibold text-sky-700">₦1,000</span>. You can add more if you want a larger balance.
              </p>
            )}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Pending orders</p>
            <div className="mt-3 space-y-2">
              {pendingOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between text-sm text-slate-600">
                  <span>{order.id}</span>
                  <span className="font-semibold text-slate-900">₦{order.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <button type="button" className="mt-5 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-slate-200 transition hover:bg-slate-800">
            Continue to Paystack
          </button>
        </div>
      </section>
    </div>
  )
}
