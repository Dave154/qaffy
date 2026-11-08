export function AdminTablePageSkeleton({ columns = 8, rows = 10 }: { columns?: number; rows?: number }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-busy="true">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100 sm:max-w-md" />
        <div className="flex items-center justify-end gap-2">
          <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
          <div className="h-10 w-28 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
      <div className="overflow-x-auto p-4 md:p-5">
        <div className="min-w-[900px]">
          <div className="grid gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }, (_, index) => (
              <div key={index} className="h-3 animate-pulse rounded bg-slate-200" />
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: rows }, (_, row) => (
              <div
                key={row}
                className="grid items-center gap-4 px-4 py-5"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: columns }, (_, column) => (
                  <div
                    key={column}
                    className={`h-4 animate-pulse rounded bg-slate-100 ${column === 0 ? 'max-w-28' : 'max-w-36'}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only" role="status">
        Loading table data
      </span>
    </section>
  )
}

export function AdminDashboardSkeleton({ label = 'Loading dashboard' }: { label?: string }) {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label={label} role="status">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="h-5 w-24 rounded bg-slate-200" />
          <div className="h-9 w-32 rounded-lg bg-slate-200" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="h-3 w-28 rounded bg-slate-200" />
              <div className="mt-4 h-7 w-32 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-20 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <section key={index} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="h-5 w-36 rounded bg-slate-200" />
            <div className="mt-5 h-56 rounded-xl bg-slate-100" />
          </section>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <section key={index} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="h-5 w-40 rounded bg-slate-200" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 4 }, (_, row) => (
                <div key={row} className="h-10 rounded-lg bg-slate-100" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function AdminContentPageSkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-40 rounded bg-slate-200" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-24 rounded-xl bg-slate-100" />
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-32 rounded bg-slate-200" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-12 rounded-lg bg-slate-100" />
          ))}
        </div>
      </section>
      <span className="sr-only" role="status">
        Loading page data
      </span>
    </div>
  )
}

export function AdminRouteSkeleton({ pathname }: { pathname: string }) {
  if (pathname === '/admin') return <AdminDashboardSkeleton />

  if (
    pathname === '/admin/orders' ||
    pathname === '/admin/users' ||
    pathname === '/admin/mismatches' ||
    pathname === '/admin/partners' ||
    pathname === '/admin/partners/vendors' ||
    pathname === '/admin/partners/logistics' ||
    pathname === '/admin/pickup-locations'
  ) {
    const columns = pathname === '/admin/orders' ? 12 : pathname === '/admin/users' ? 11 : 7
    return <AdminTablePageSkeleton columns={columns} />
  }

  return <AdminContentPageSkeleton />
}

export function AdminPageLoadError({ page }: { page: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
      {page} data could not be loaded. Refresh the page to try again.
    </div>
  )
}
