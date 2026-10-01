import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { CustomerOrder } from '../portals/customer/customer-store'

type MismatchBannerProps = {
  orders: CustomerOrder[]
}

export default function MismatchBanner({ orders }: MismatchBannerProps) {
  const mismatches = orders
    .filter((order) => order.mismatch && order.paymentStatus === 'Pending')
    .map((order) => ({ order, mismatch: order.mismatch! }))
  const latestMismatch = mismatches[0]?.mismatch

  if (!latestMismatch) return null

  return (
    <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-slate-900 sm:p-5" role="status">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-600 shadow-sm">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-amber-900">
          {mismatches.length === 1 ? 'Your order count was updated' : `${mismatches.length} order counts were updated`}
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-sm text-amber-800" title={latestMismatch.detail}>
            {latestMismatch.detail}
          </p>
          <a
            href="/orders?filter=Needs%20attention"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-900 hover:text-amber-950"
          >
            Review <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  )
}
