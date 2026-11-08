export function CustomerBalanceSkeleton() {
  return (
    <div className="mt-3 space-y-3" aria-hidden="true">
      <div className="h-9 w-40 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-4 w-44 animate-pulse rounded bg-slate-100" />
    </div>
  )
}

export function CustomerOrderListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-3 border-b border-[#eeeeee] p-4 last:border-b-0" role="presentation">
          <div className="flex items-center justify-between gap-3">
            <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
      <span className="sr-only" role="status">
        Loading your recent orders
      </span>
    </div>
  )
}

export function CustomerActivityListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-4" role="presentation">
          <div className="h-10 w-10 animate-pulse rounded-2xl bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className={`h-4 animate-pulse rounded bg-slate-200 ${index % 2 === 0 ? 'w-2/5' : 'w-1/3'}`} />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
      <span className="sr-only" role="status">
        Loading wallet activity
      </span>
    </div>
  )
}

export function CustomerInlineSkeleton({ className = 'w-16' }: { className?: string }) {
  return <span className={`inline-block h-4 animate-pulse rounded bg-slate-200 align-middle ${className}`} aria-hidden="true" />
}

export function CustomerSectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <section className="space-y-4 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-2 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0" role="presentation">
          <div className={`h-4 animate-pulse rounded bg-slate-200 ${index % 2 === 0 ? 'w-2/5' : 'w-1/3'}`} />
          <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
      <span className="sr-only" role="status">
        Loading account information
      </span>
    </section>
  )
}
