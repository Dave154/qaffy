import { useState } from 'react'
import { AlertTriangle, PackageCheck } from 'lucide-react'

export { getInitialReceivedCounts } from '../../lib/order-counts'

export type VendorReviewOrder = {
  id: string
  publicOrderNumber: string
  customer: string
  orderType: 'wash' | 'wash_iron' | 'mixed'
  orderStatus: 'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'
  confirmedCount: number | null
  notes: string
  items: Array<{
    id: string
    name: string
    quantity: number
    confirmedQuantity: number | null
    service: 'wash' | 'iron' | 'wash_iron'
    unitPrice: number
  }>
  mismatches: Array<{
    id: string
    direction: 'over' | 'under'
    detail: string
    createdAt: string
    lines: VendorReviewMismatchLine[]
  }>
}

export type VendorReviewAddedItem = { categoryName: string; service: 'wash' | 'iron' | 'wash_iron'; quantity: number }

type VendorReviewMismatchLine = {
  itemId?: string
  category: string
  service: 'wash' | 'iron' | 'wash_iron'
  confirmedQuantity: number
}

type VendorOrderReviewDialogProps = {
  order: VendorReviewOrder
  received: Record<string, number | undefined>
  hasMismatch: boolean
  notes: string
  addedItems: VendorReviewAddedItem[]
  categoryNames: string[]
  isPreClaim: boolean
  canEdit: boolean
  onReceivedChange: (itemId: string, value: number | undefined) => void
  onNotesChange: (value: string) => void
  onAddedItemsChange: (items: VendorReviewAddedItem[]) => void
  onClose: () => void
  onSave: () => void
  onClaim: () => void
  saving: boolean
}

function Detail({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1.5 break-words text-sm font-semibold text-slate-900">{value ?? 'Not recorded'}</p>
    </div>
  )
}

const orderTypeLabels: Record<VendorReviewOrder['orderType'], string> = {
  wash: 'Wash only',
  wash_iron: 'Wash + Iron',
  mixed: 'Mixed service',
}

const orderStatusLabels: Record<VendorReviewOrder['orderStatus'], string> = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Picked up',
  at_vendor: 'Processing',
  invoiced: 'Processing',
  paid: 'Processing',
  out_for_delivery: 'Processing',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const serviceLabels: Record<VendorReviewOrder['items'][number]['service'], string> = {
  wash: 'Wash',
  iron: 'Iron',
  wash_iron: 'Wash + Iron',
}

export default function VendorOrderReviewDialog({
  order,
  received,
  hasMismatch,
  notes,
  addedItems,
  categoryNames,
  isPreClaim,
  canEdit,
  onReceivedChange,
  onNotesChange,
  onAddedItemsChange,
  onClose,
  onSave,
  onClaim,
  saving,
}: VendorOrderReviewDialogProps) {
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  const [addedItemQuantityInputs, setAddedItemQuantityInputs] = useState<Record<number, string>>({})
  const allReceivedEntered = order.items.every((item) => received[item.id] !== undefined)
  const enteredReceivedTotal =
    Object.values(received).reduce<number>((total, quantity) => total + (quantity ?? 0), 0) +
    addedItems.reduce((total, item) => total + item.quantity, 0)
  const receivedTotal = canEdit ? enteredReceivedTotal : (order.confirmedCount ?? enteredReceivedTotal)
  const formattedDate = (value: string) => new Date(value).toLocaleString()
  const parsePositiveQuantity = (value: string) => {
    if (!/^\d+$/.test(value)) return null
    const quantity = Number(value)
    return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null
  }
  const removeAddedItem = (index: number) => {
    onAddedItemsChange(addedItems.filter((_, itemIndex) => itemIndex !== index))
    setAddedItemQuantityInputs((currentInputs) => {
      const nextInputs: Record<number, string> = {}
      Object.entries(currentInputs).forEach(([key, value]) => {
        const itemIndex = Number(key)
        if (itemIndex < index) nextInputs[itemIndex] = value
        if (itemIndex > index) nextInputs[itemIndex - 1] = value
      })
      return nextInputs
    })
  }

  return (
    <div className="vendor-review-dialog fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-0 sm:items-center sm:p-4">
      <style>{`.vendor-review-dialog table th:nth-last-child(-n+2), .vendor-review-dialog table td:nth-last-child(-n+2), .vendor-review-dialog > div > section:nth-of-type(4) { display: none; }`}</style>
      <div className="max-h-[calc(100vh-1rem)] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold capitalize tracking-[0.16em] text-brand-primary">
              {isPreClaim ? 'Order details' : 'Order review'}
            </p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{order.customer}</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              {order.publicOrderNumber} · {orderStatusLabels[order.orderStatus]} · {orderTypeLabels[order.orderType]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close order review"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-xl text-slate-400 shadow-sm transition hover:border-slate-300 hover:text-slate-600 hover:shadow-md"
          >
            ×
          </button>
        </header>

        {!isPreClaim && canEdit && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-slate-900">Found another category?</h4>
                <p className="mt-1 text-sm text-slate-500">Add any cloth type that was not in the customer&apos;s list.</p>
              </div>
              <button
                type="button"
                onClick={() => onAddedItemsChange([...addedItems, { categoryName: categoryNames[0] ?? '', service: 'wash', quantity: 1 }])}
                className="rounded-lg border border-brand-border bg-white px-3 py-2 text-sm font-semibold text-brand-primary"
              >
                Add category
              </button>
            </div>
            {addedItems.length > 0 && (
              <div className="mt-4 space-y-3">
                {addedItems.map((item, index) => (
                  <div key={`${item.categoryName}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_100px_auto]">
                    <select
                      value={item.categoryName}
                      onChange={(event) =>
                        onAddedItemsChange(
                          addedItems.map((current, itemIndex) =>
                            itemIndex === index ? { ...current, categoryName: event.target.value } : current,
                          ),
                        )
                      }
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Choose category</option>
                      {categoryNames.map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                    <select
                      value={item.service}
                      onChange={(event) =>
                        onAddedItemsChange(
                          addedItems.map((current, itemIndex) =>
                            itemIndex === index ? { ...current, service: event.target.value as typeof item.service } : current,
                          ),
                        )
                      }
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="wash">Wash</option>
                      <option value="iron">Iron</option>
                      <option value="wash_iron">Wash + Iron</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={addedItemQuantityInputs[index] ?? item.quantity}
                      onChange={(event) => {
                        const value = event.target.value
                        setAddedItemQuantityInputs((currentInputs) => ({ ...currentInputs, [index]: value }))
                        const quantity = parsePositiveQuantity(value)
                        if (quantity !== null) {
                          onAddedItemsChange(
                            addedItems.map((current, itemIndex) =>
                              itemIndex === index ? { ...current, quantity } : current,
                            ),
                          )
                        }
                      }}
                      onBlur={() =>
                        setAddedItemQuantityInputs((currentInputs) => {
                          const nextInputs = { ...currentInputs }
                          delete nextInputs[index]
                          return nextInputs
                        })
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      aria-label="Added category quantity"
                    />
                    <button
                      type="button"
                      onClick={() => removeAddedItem(index)}
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-brand-primary" />
                <h4 className="font-bold text-slate-900">Items and service</h4>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {isPreClaim
                  ? 'Review the service details before claiming.'
                  : allReceivedEntered
                    ? `Vendor received ${receivedTotal} ${receivedTotal === 1 ? 'item' : 'items'}.`
                    : 'Enter a received count for each item.'}
              </p>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-primary">
              <span className="sm:hidden">{order.items.length} {order.items.length === 1 ? 'type' : 'types'}</span>
              <span className="hidden sm:inline">
                {order.items.length} item {order.items.length === 1 ? 'type' : 'types'}
              </span>
            </span>
          </div>
          <div className="mt-4 space-y-2 md:hidden">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{serviceLabels[item.service]}</p>
                </div>
                {!isPreClaim && (
                  <label className="w-24 shrink-0 text-xs font-semibold text-slate-500">
                    Received
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={received[item.id] ?? ''}
                      disabled={!canEdit}
                      onChange={(event) =>
                        onReceivedChange(item.id, event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0))
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-center text-base font-semibold text-slate-900 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus disabled:bg-slate-100 disabled:text-slate-500"
                      aria-label={`Received ${item.name}`}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-155 text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] capitalize tracking-[0.14em] text-slate-500">
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Service</th>
                  {!isPreClaim && <th className="pb-3 font-semibold">Received</th>}
                  <th className="pb-3 text-right font-semibold">Unit price</th>
                  <th className="pb-3 text-right font-semibold">Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 text-sm font-semibold text-slate-800">{item.name}</td>
                    <td className="py-3 text-sm text-slate-600">{serviceLabels[item.service]}</td>
                    {!isPreClaim && (
                      <td className="py-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={received[item.id] ?? ''}
                          disabled={!canEdit}
                          onChange={(event) =>
                            onReceivedChange(item.id, event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0))
                          }
                          className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-sm font-semibold outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus disabled:bg-slate-100 disabled:text-slate-500"
                          aria-label={`Received ${item.name}`}
                        />
                      </td>
                    )}
                    <td className="py-3 text-right text-sm text-slate-600">₦{item.unitPrice.toLocaleString()}</td>
                    <td className="py-3 text-right text-sm font-semibold text-brand-primary">
                      ₦{(item.quantity * item.unitPrice).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isPreClaim && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Detail label="Received items" value={receivedTotal} />
              <Detail label="Item types" value={order.items.length + addedItems.length} />
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5">
          <h4 className="font-bold text-slate-900">Notes and verification</h4>
          <Detail label="Customer notes" value={order.notes || 'No notes added'} />
          {!isPreClaim && canEdit && hasMismatch && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="font-semibold text-amber-800">Mismatch detected</p>
              <p className="mt-1.5 text-sm text-amber-700">
                Write the exact description of the clothes you received, e.g. 1 red shirt, 1 brown trouser.
              </p>
              <textarea
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="e.g. 1 red shirt, 1 brown trouser"
                className="mt-3 min-h-24 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              />
            </div>
          )}
          {order.mismatches.length > 0 && (
            <div className="mt-4 space-y-2">
              {order.mismatches.map((mismatch) => (
                <div key={mismatch.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                  <strong className="text-amber-800">{mismatch.direction === 'over' ? 'Overage' : 'Shortage'}</strong>
                  <span className="ml-2 text-amber-700">{mismatch.detail}</span>
                  <p className="mt-1 text-xs text-amber-600">{formattedDate(mismatch.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {(isPreClaim || canEdit) && (
          <button
            type="button"
            onClick={isPreClaim ? onClaim : () => setIsConfirmationOpen(true)}
            disabled={saving || (!isPreClaim && (!allReceivedEntered || (hasMismatch && !notes.trim())))}
            className="mt-6 w-full rounded-2xl bg-brand-primary px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (isPreClaim ? 'Claiming...' : 'Confirming count...') : isPreClaim ? 'Claim order' : 'Confirm final count'}
          </button>
        )}
        {isConfirmationOpen && !isPreClaim && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !saving) setIsConfirmationOpen(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !saving) setIsConfirmationOpen(false)
            }}
          >
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-vendor-count-title"
              aria-describedby="confirm-vendor-count-description"
              onMouseDown={(event) => event.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="border-b border-slate-100 p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold capitalize tracking-[0.12em] text-amber-700">Final confirmation</p>
                    <h4 id="confirm-vendor-count-title" className="mt-1 text-lg font-bold leading-6 text-slate-900">
                      Confirm final count?
                    </h4>
                  </div>
                </div>
                <p id="confirm-vendor-count-description" className="mt-4 text-sm leading-5 text-slate-600">
                  This will finalize the received quantities and update the customer&apos;s invoice. You can&apos;t edit this review afterward.
                </p>
              </div>
              <div className="space-y-3 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-600">Vendor received</p>
                  <p className="shrink-0 text-right text-2xl font-bold text-slate-900">
                    {receivedTotal} <span className="text-sm font-medium text-slate-500">{receivedTotal === 1 ? 'item' : 'items'}</span>
                  </p>
                </div>
                {hasMismatch && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p className="leading-5">The count difference and your note will be shared with the customer.</p>
                  </div>
                )}
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsConfirmationOpen(false)}
                    disabled={saving}
                    className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    Go back
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving || !allReceivedEntered || (hasMismatch && !notes.trim())}
                    className="h-11 w-full rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {saving ? 'Confirming...' : 'Yes, confirm count'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}