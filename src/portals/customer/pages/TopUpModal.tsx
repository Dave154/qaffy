import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'

type TopUpModalProps = {
  currentBalance: number
  subscriptionBalance: number
  pendingPaymentTotal: number
  onTopUp: (amount: number) => Promise<void>
  isProcessing: boolean
  error: string | null
  onClose: () => void
}

export default function TopUpModal({ currentBalance, subscriptionBalance, pendingPaymentTotal, onTopUp, isProcessing, error, onClose }: TopUpModalProps) {
  const negativeBalance = Math.max(0, -subscriptionBalance)
  const debt = negativeBalance

  const suggestedAmount = useMemo(() => {
    const minimum = 1000
    return Math.max(pendingPaymentTotal, debt, minimum)
  }, [debt, pendingPaymentTotal])

  const [amount, setAmount] = useState<number>(suggestedAmount)
  const appliedToDebt = Math.min(Math.max(amount, 0), negativeBalance)
  const walletCredit = Math.max(0, amount - negativeBalance)

  const handleTopUp = async () => {
    if (amount < 1000) return
    await onTopUp(amount)
  }

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
            <h2 id="top-up-title" className="mt-1 text-2xl font-bold tracking-tight text-[#121212]">Top up your wallet</h2>
            <p className="mt-1 text-sm text-slate-500">Choose an amount and pay securely with Paystack.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close top-up modal" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700">
            ×
          </button>
        </header>

        <div className="mt-5 rounded-[26px] bg-slate-900 p-5 text-white shadow-lg shadow-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-200">One-time balance</p>
              <p className="mt-2 text-3xl font-bold">₦{currentBalance.toLocaleString()}</p>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-sky-50">Current balance</span>
          </div>
        </div>

        <div className="mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">How much would you like to add?</span>
            <input
              type="number"
              min={1000}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value) || 0)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </label>

          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-3 text-sm text-slate-700">
            {negativeBalance > 0 ? (
              <p>
                Your subscription debt of <span className="font-semibold text-sky-700">₦{negativeBalance.toLocaleString()}</span> will be cleared first. Any remaining amount becomes your one-time balance.
              </p>
            ) : (
              <p>
                Minimum top-up is <span className="font-semibold text-sky-700">₦1,000</span>. You can add more if you want a larger balance.
              </p>
            )}
          </div>

          <div className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm">
            <div className="flex items-center justify-between text-slate-600"><span>Amount to pay</span><span className="font-semibold text-slate-900">₦{Math.max(0, amount).toLocaleString()}</span></div>
            {negativeBalance > 0 && <div className="flex items-center justify-between text-slate-600"><span>Clears subscription debt</span><span className="font-semibold text-slate-900">₦{appliedToDebt.toLocaleString()}</span></div>}
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-slate-600"><span>Added to wallet</span><span className="font-semibold text-emerald-700">₦{walletCredit.toLocaleString()}</span></div>
          </div>

          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

          <button type="button" disabled={amount < 1000 || isProcessing} onClick={() => void handleTopUp()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-primary/20 transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
            {isProcessing ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> Opening secure checkout...</> : <>Continue to Paystack <ArrowRight className="h-4 w-4" /></>}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Your wallet updates automatically after payment confirmation.</p>
        </div>
      </section>
    </div>
  )
}
