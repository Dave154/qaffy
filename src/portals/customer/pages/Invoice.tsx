import { useEffect } from 'react'
import { data, Link, useFetcher, useRevalidator } from 'react-router'
import type { Route } from './+types/Invoice'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { toast } from '../../../lib/toast'
import { useCustomerStore } from '../customer-store-hook'

// Normal invoice debt is recorded when the order is created and settled by top-ups.
// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })

  const { supabase: serverSupabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await serverSupabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const formData = await request.formData()
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return data({ ok: false, message: 'Invoice is missing.' }, { status: 400, headers })

  return data({ ok: false, message: 'Top up your wallet from the overview to settle this invoice.' }, { status: 409, headers })
}

export default function Invoice() {
  const { invoice } = useCustomerStore()
  const fetcher = useFetcher<typeof action>()
  const revalidator = useRevalidator()

  useEffect(() => {
    if (fetcher.data?.ok) {
      toast.success('Invoice paid. Delivery OTP is now available.')
      revalidator.revalidate()
    }
    if (fetcher.data && !fetcher.data.ok && 'message' in fetcher.data) toast.error(fetcher.data.message)
  }, [fetcher.data, revalidator])

  if (!invoice) {
    return (
      <div className="space-y-5 pb-8">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">Billing</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Invoice</h2>
          </div>
        </header>
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100">
          <p className="text-sm text-slate-500">No invoice is available yet for this account.</p>
        </section>
      </div>
    )
  }

  const total = `₦${invoice.total.toLocaleString()}`
  const paymentBreakdown = [
    { label: 'Subtotal', value: total },
    { label: 'Service', value: 'Included' },
    { label: 'Status', value: invoice.status },
  ]

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-600">Billing</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Invoice</h2>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-sm font-medium ${invoice.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{invoice.status}</span>
      </header>

      <section className="rounded-[28px] bg-gradient-to-br from-slate-950 via-violet-950 to-violet-700 p-5 text-white shadow-lg shadow-violet-200 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">Order reference</p>
            <h3 className="mt-3 text-3xl font-bold">{invoice.reference}</h3>
            <p className="mt-2 text-sm text-violet-100">{invoice.dueDate}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-medium text-violet-50">{invoice.status}</div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Laundry summary</h3>
              <p className="mt-1 text-sm text-slate-500">This invoice reflects your active bag count</p>
            </div>
            <button type="button" onClick={() => window.print()} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">Print invoice</button>
          </div>

          <div className="mt-5 space-y-3">
            {invoice.items.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                <div>
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.quantity}</p>
                </div>
                <p className="font-semibold text-slate-900">₦{item.amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <h3 className="text-lg font-bold text-slate-900">Payment breakdown</h3>

          <div className="mt-4 space-y-3">
            {paymentBreakdown.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm text-slate-600">
                <span>{item.label}</span>
                <span className="font-semibold text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Total due</span>
              <span className="text-2xl font-bold text-slate-900">{total}</span>
            </div>
          </div>

          <fetcher.Form method="post">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button
              type="submit"
              disabled
              className="mt-6 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-200 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {invoice.status === 'Paid' ? 'Paid' : 'Top up from overview to pay'}
            </button>
          </fetcher.Form>

          <Link
            to="/otp"
            className={`mt-3 block w-full rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-center text-sm font-semibold text-violet-700 transition hover:bg-violet-100 ${invoice.status !== 'Paid' ? 'pointer-events-none opacity-50' : ''}`}
            aria-disabled={invoice.status !== 'Paid'}
          >
            Continue to delivery OTP
          </Link>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <h3 className="text-lg font-bold text-slate-900">Pickup instructions</h3>
        <p className="mt-3 text-sm text-slate-600">
          Please drop off the bag at the nearest pickup point. Keep whites separate and note any silk items before handover.
        </p>
      </section>
    </div>
  )
}
