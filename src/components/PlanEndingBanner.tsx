import { useState } from 'react'
import { Clock3, X } from 'lucide-react'

type PlanEndingBannerProps = {
  planName: string
  endDate: string | null
}

function getDaysRemaining(endDate: string) {
  const end = new Date(`${endDate}T23:59:59`)
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.ceil((end.getTime() - startOfToday.getTime()) / 86_400_000)
}

export default function PlanEndingBanner({ planName, endDate }: PlanEndingBannerProps) {
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const daysRemaining = endDate ? getDaysRemaining(endDate) : null
  const storageKey = endDate ? `qaffy-plan-ending-banner:${endDate}` : null
  const storedDismissal = storageKey && typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
  const dismissalStage = dismissedAt ?? (storedDismissal ? Number(storedDismissal) : null)
  const shouldShow = dismissalStage === null || (daysRemaining !== null && daysRemaining <= 3 && dismissalStage === 7)

  if (!endDate || daysRemaining === null || daysRemaining < 0 || daysRemaining > 7 || !shouldShow) return null

  const dismiss = () => {
    const dismissalStage = daysRemaining <= 3 ? 3 : 7
    if (storageKey) window.localStorage.setItem(storageKey, String(dismissalStage))
    setDismissedAt(dismissalStage)
  }

  return (
    <section className="flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-soft p-4 text-slate-900 sm:p-5" role="status">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-primary shadow-sm">
          <Clock3 className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-bold text-brand-strong">Your {planName} plan is ending in {daysRemaining} days</p>
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss plan ending notification" title="Dismiss notification" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-brand-primary transition hover:bg-white">
        <X className="h-4 w-4" />
      </button>
    </section>
  )
}