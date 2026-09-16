import { AlertTriangle, ArrowRight, X } from 'lucide-react'
import { useState } from 'react'
import type { CustomerOrder } from '../portals/customer/customer-store'

type MismatchBannerProps = {
  orders: CustomerOrder[]
}

export default function MismatchBanner({ orders }: MismatchBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(window.localStorage.getItem('qaffy-dismissed-mismatches') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const mismatches = orders
    .filter((order) => order.mismatch && (order.paymentStatus === 'Pending' || !dismissedIds.includes(order.mismatch.id)))
    .map((order) => ({ order, mismatch: order.mismatch! }))
  const latestMismatch = mismatches[0]?.mismatch

  if (!latestMismatch) return null

  const hasUnpaidMismatch = mismatches.some(({ order }) => order.paymentStatus === 'Pending')
  const dismiss = () => {
    if (hasUnpaidMismatch) return
    const nextDismissedIds = [...new Set([...dismissedIds, ...mismatches.map(({ mismatch }) => mismatch.id)])]
    window.localStorage.setItem('qaffy-dismissed-mismatches', JSON.stringify(nextDismissedIds))
    setDismissedIds(nextDismissedIds)
  }

  return (
    <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-slate-900 sm:p-5" role="status">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-600 shadow-sm">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-amber-900">
          {mismatches.length === 1 ? 'Your order count was updated' : `${mismatches.length} order counts were updated`}
        </p>
        <p className="mt-1 text-sm text-amber-800">{latestMismatch.detail}</p>
        <a href="/orders?filter=Needs%20attention" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-900 hover:text-amber-950">
          Review affected orders <ArrowRight className="h-4 w-4" />
        </a>
      </div>
      {!hasUnpaidMismatch && <button type="button" onClick={dismiss} aria-label="Dismiss mismatch notification" title="Dismiss notification" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-700 transition hover:bg-white">
        <X className="h-4 w-4" />
      </button>}
    </section>
  )
}
