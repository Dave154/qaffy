import { useState } from 'react'
import { Printer } from 'lucide-react'
import { data, Link } from 'react-router'
import type { Route } from './+types/Invoice'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import { useCustomerStore } from '../customer-store-hook'
import { InsufficientBalanceError, payFromWallet } from '../../../lib/wallet.server'
import { sendCustomerNotification, walletInvoicePaidNotification } from '../../../lib/notifications.server'

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })

  const { supabase: serverSupabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await serverSupabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const formData = await request.formData()
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return data({ ok: false, message: 'Invoice is missing.' }, { status: 400, headers })

  try {
    const result = await payFromWallet(userData.user.id, invoiceId, 'one_off')
    await sendCustomerNotification({
      eventKey: `invoice:${result.invoiceId}:paid`,
      customerId: userData.user.id,
      notificationType: 'payment_confirmed',
      orderId: result.orderId,
      payload: walletInvoicePaidNotification(result.amount, result.publicOrderNumber, result.orderId),
    })
    return data({ ok: true, deliveryOtp: result.deliveryOtp }, { headers })
  } catch (error) {
    if (error instanceof InsufficientBalanceError)
      return data({ ok: false, message: 'Your wallet balance is too low for this invoice.' }, { status: 402, headers })
    const message = error instanceof Error ? error.message : 'The invoice could not be paid.'
    return data({ ok: false, message }, { status: 500, headers })
  }
}

export default function Invoice() {
  const { invoices, orders } = useCustomerStore()
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(invoices[0]?.id ?? '')
  const invoice = invoices.find((item) => item.id === selectedInvoiceId) ?? invoices[0] ?? null
  const selectedOrder = invoice ? orders.find((order) => order.id === invoice.orderId) ?? null : null
  if (!invoice) {
    return (
      <div className="space-y-5 pb-8">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
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
  const invoiceItems =
    selectedOrder?.lines?.map((item) => ({
      label: item.category,
      service: item.service,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.quantity * item.unitPrice,
    })) ?? []
  const itemizedTotal = invoiceItems.reduce((sum, item) => sum + item.amount, 0)
  const pricingAdjustment = Math.round((invoice.total - itemizedTotal) * 100) / 100
  const paymentBreakdown = [
    { label: 'Invoice total', value: total },
    { label: 'Status', value: invoice.status },
  ]

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Invoice</h2>
        </div>
        <span
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${invoice.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-soft text-brand-primary'}`}
        >
          {invoice.status}
        </span>
      </header>

      <section className="print:hidden rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Select order</span>
          <select
            value={invoice.id}
            onChange={(event) => setSelectedInvoiceId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
          >
            {invoices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.orderReference} · {item.status} · ₦{item.total.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-[28px] bg-gradient-to-br from-brand-primary via-brand-primary to-brand-primary-hover p-5 text-white shadow-lg shadow-brand-border sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium capitalize tracking-[0.18em] text-cyan-50">Order reference</p>
            <h3 className="mt-3 text-3xl font-bold">{invoice.orderReference}</h3>
            <p className="mt-2 text-sm text-cyan-50">{invoice.dueDate}</p>
          </div>
          <div className="whitespace-nowrap rounded-2xl bg-white/10 px-3 py-2 text-sm font-medium text-white">{invoice.status}</div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="min-w-0 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Items and charges</h3>
              <p className="mt-1 text-sm text-slate-500">Vendor-confirmed items for this order</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              aria-label="Print invoice"
              title="Print invoice"
              className="print:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Item</th>
                  <th scope="col" className="px-4 py-3 text-right">Quantity</th>
                  <th scope="col" className="px-4 py-3 text-right">Unit rate</th>
                  <th scope="col" className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
            {invoiceItems.length > 0 ? (
              <tbody className="divide-y divide-slate-100">
                {invoiceItems.map((item, index) => (
                  <tr key={`${item.label}-${item.service}-${index}`}>
                    <th scope="row" className="px-4 py-3 font-semibold text-slate-900">
                      <span className="block">{item.label}</span>
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">{item.service}</span>
                    </th>
                    <td className="px-4 py-3 text-right text-slate-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-600">₦{item.unitPrice.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">₦{item.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((item) => (
                  <tr key={item.label}>
                    <th scope="row" className="px-4 py-3 font-semibold text-slate-900">{item.label}</th>
                    <td className="px-4 py-3 text-right text-slate-600" colSpan={2}>{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">₦{item.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            )}
            </table>
            {selectedOrder?.isSubscriptionOrder && invoiceItems.length > 0 && pricingAdjustment !== 0 && (
              <div className="flex items-start justify-between gap-3 border-t border-slate-200 bg-amber-50 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-amber-900">Subscription pricing adjustment</p>
                  <p className="mt-0.5 text-xs text-amber-800">Plan coverage and subscriber rates are reflected in the invoice total.</p>
                </div>
                <p className="shrink-0 font-semibold text-amber-900">
                  {pricingAdjustment > 0 ? '+' : '−'}₦{Math.abs(pricingAdjustment).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {invoice.originalCount !== null && invoice.finalCount !== null && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Customer declared</span>
                <strong className="text-slate-900">{invoice.originalCount} items</strong>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                <span>Vendor confirmed</span>
                <strong className="text-slate-900">{invoice.finalCount} items</strong>
              </div>
              {invoice.mismatch && (
                <div className="mt-3 min-w-0 border-t border-slate-200 pt-3 text-sm text-amber-700">
                  <strong>{invoice.mismatch.direction === 'over' ? 'Extra billing due to over-count' : 'Under-count adjustment'}</strong>
                  <p className="mt-1 min-w-0 [overflow-wrap:anywhere]">{invoice.mismatch.detail}</p>
                  {Array.isArray(invoice.mismatch.lines) && invoice.mismatch.lines.length > 0 && (
                    <>
                      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-amber-200 bg-white sm:block">
                        <table className="w-full min-w-[620px] text-left text-xs">
                        <thead className="border-b border-amber-100 bg-amber-50 text-[10px] capitalize tracking-[0.08em] text-amber-700">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Item</th>
                            <th className="px-3 py-2 font-semibold">Service</th>
                            <th className="px-3 py-2 text-right font-semibold">Declared</th>
                            <th className="px-3 py-2 text-right font-semibold">Confirmed</th>
                            <th className="px-3 py-2 text-right font-semibold">Difference</th>
                            <th className="px-3 py-2 text-right font-semibold">Unit price</th>
                            <th className="px-3 py-2 text-right font-semibold">Extra</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.mismatch.lines.map((line, index) => (
                            <tr key={`${line.category}-${line.service}-${index}`} className="border-b border-amber-50 last:border-0">
                              <td className="px-3 py-2.5 font-semibold text-slate-800">{line.category}</td>
                              <td className="px-3 py-2.5 text-slate-600">
                                {line.service === 'wash_iron' ? 'Wash + Iron' : line.service === 'wash' ? 'Wash' : 'Iron'}
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{line.originalQuantity}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{line.confirmedQuantity}</td>
                              <td className="px-3 py-2.5 text-right font-semibold text-amber-700">
                                {line.difference > 0 ? '+' : ''}
                                {line.difference}
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-600">₦{line.unitPrice.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-right font-semibold text-amber-700">₦{line.extraAmount.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                        </table>
                      </div>
                      <div className="mt-3 divide-y divide-amber-100 rounded-xl border border-amber-200 bg-white sm:hidden">
                        {invoice.mismatch.lines.map((line, index) => (
                          <div key={`${line.category}-${line.service}-${index}`} className="space-y-3 p-3">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="break-words font-semibold text-slate-800">{line.category}</p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {line.service === 'wash_iron' ? 'Wash + Iron' : line.service === 'wash' ? 'Wash' : 'Iron'}
                                </p>
                              </div>
                              <p className="shrink-0 text-right text-xs font-semibold text-amber-700">
                                Extra: ₦{line.extraAmount.toLocaleString()}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                              <div>
                                <p className="text-slate-500">Declared</p>
                                <p className="mt-0.5 font-semibold text-slate-800">{line.originalQuantity}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Confirmed</p>
                                <p className="mt-0.5 font-semibold text-slate-800">{line.confirmedQuantity}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Difference</p>
                                <p className="mt-0.5 font-semibold text-amber-700">
                                  {line.difference > 0 ? '+' : ''}
                                  {line.difference}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500">Unit price</p>
                                <p className="mt-0.5 font-semibold text-slate-800">₦{line.unitPrice.toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {invoice.extraAmount > 0 && (
                <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm text-amber-700">
                  <span>Extra confirmed items charge</span>
                  <strong>₦{invoice.extraAmount.toLocaleString()}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <h3 className="text-lg font-bold text-slate-900">Payment breakdown</h3>

          <div className="mt-4 space-y-3">
            {paymentBreakdown.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm text-slate-600">
                <span>{item.label}</span>
                <span className="font-semibold text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>

          {invoice.billingBreakdown && (
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
              {invoice.billingBreakdown.coveredUnits > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span>Covered by plan</span>
                  <span className="shrink-0 font-semibold text-slate-900">{invoice.billingBreakdown.coveredUnits} units</span>
                </div>
              )}
              {invoice.billingBreakdown.subscriberAmount > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span>Subscriber-rate extra</span>
                  <span className="shrink-0 font-semibold text-slate-900">₦{invoice.billingBreakdown.subscriberAmount.toLocaleString()}</span>
                </div>
              )}
              {invoice.billingBreakdown.regularAmount > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span>Uncovered services</span>
                  <span className="shrink-0 font-semibold text-slate-900">₦{invoice.billingBreakdown.regularAmount.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Total due</span>
              <span className="text-2xl font-bold text-slate-900">{total}</span>
            </div>
          </div>

          {invoice.status === 'Paid' ? (
            <button
              type="button"
              disabled
              className="mt-6 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-100"
            >
              Paid
            </button>
          ) : (
            <Link
              to="/?topup=1"
              className="mt-6 block w-full rounded-2xl bg-brand-primary px-4 py-3 text-center text-sm font-semibold text-white shadow-md shadow-brand-primary/20 transition hover:bg-brand-primary-hover"
            >
              Top up wallet to pay
            </Link>
          )}

          <Link
            to="/otp"
            prefetch="intent"
            className={`mt-3 block w-full rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-center text-sm font-semibold text-violet-700 transition hover:bg-violet-100 ${invoice.status !== 'Paid' ? 'pointer-events-none opacity-50' : ''}`}
            aria-disabled={invoice.status !== 'Paid'}
          >
            Continue to delivery OTP
          </Link>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <h3 className="text-lg font-bold text-slate-900">Order details</h3>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-slate-500">Order date</p>
            <p className="mt-1 font-semibold text-slate-900">{selectedOrder?.date ?? invoice.dueDate}</p>
          </div>
          <div>
            <p className="text-slate-500">Service</p>
            <p className="mt-1 font-semibold text-slate-900">{selectedOrder?.service ?? 'Laundry service'}</p>
          </div>
          <div>
            <p className="text-slate-500">Pickup location</p>
            <p className="mt-1 font-semibold text-slate-900">{selectedOrder?.pickupLocation ?? 'Not available'}</p>
          </div>
          <div>
            <p className="text-slate-500">Order status</p>
            <p className="mt-1 font-semibold text-slate-900">{selectedOrder?.status ?? invoice.status}</p>
          </div>
        </div>
        {selectedOrder?.notes && selectedOrder.notes !== 'No special instructions added.' && (
          <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
            <p className="text-slate-500">Pickup instructions</p>
            <p className="mt-1 break-words font-medium text-slate-900">{selectedOrder.notes}</p>
          </div>
        )}
      </section>
    </div>
  )
}
