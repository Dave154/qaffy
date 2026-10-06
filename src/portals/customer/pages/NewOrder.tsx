import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { ChevronDown, Minus, Plus, Trash2 } from 'lucide-react'
import type { CustomerOrder, OrderLine } from '../customer-store'
import { useCustomerStore } from '../customer-store-hook'
import { supabase } from '../../../lib/supabase.client'
import BubblyBackground from '../../../components/BubblyBackground'
import CopyableOrderId from '../../../components/CopyableOrderId'
import ProtectedOtp from '../../../components/ProtectedOtp'
import DeliveryOtpStatus from '../../../components/DeliveryOtpStatus'
import { toast } from '../../../lib/toast'
import { calculateSubscriptionBilling } from '../../../lib/subscription-billing'
import { addOrIncrementOrderLine } from '../../../lib/order-lines'

type Category = {
  id: string
  name: string
  isMain: boolean
  subscriptionUnits: number
  rates: Record<string, number>
  subscriberRates: Record<string, number>
  description: string
}

const services = [
  { name: 'Wash', description: 'Clean and fold' },
  { name: 'Iron', description: 'Pressed and ready' },
  { name: 'Wash + Iron', description: 'Clean, pressed and folded' },
]

type NewOrderProps = { onClose: () => void; order?: CustomerOrder }

const parsePositiveQuantity = (value: string) => {
  if (!/^\d+$/.test(value)) return null
  const quantity = Number(value)
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null
}

const getOrderLineKey = (item: Pick<OrderLine, 'category' | 'service'>) => `${item.category}\u0000${item.service}`

export default function NewOrder({ onClose, order }: NewOrderProps) {
  const {
    activePlan,
    addOrder,
    invoices,
    pickupLocations,
    preferredPickupLocationId,
    preferredPickupLocationName,
    subscription,
    subscriptionRemainingUnits,
  } = useCustomerStore()
  const isReadOnly = Boolean(order)
  const [categories, setCategories] = useState<Category[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'empty' | 'error'>(isReadOnly ? 'ready' : 'loading')
  const [catalogError, setCatalogError] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [service, setService] = useState(services[2])
  const [quantity, setQuantity] = useState(1)
  const [quantityInput, setQuantityInput] = useState<string | null>(null)
  const [items, setItems] = useState<OrderLine[]>([])
  const [itemQuantityInputs, setItemQuantityInputs] = useState<Record<string, string>>({})
  const [pickupLocation, setPickupLocation] = useState('')
  const automaticPickupLocation = preferredPickupLocationId ? (preferredPickupLocationName ?? '') : ''
  const previousAutomaticPickupLocation = useRef('')
  const [notes, setNotes] = useState('')
  const [pickupLocationError, setPickupLocationError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const invoicePaymentFetcher = useFetcher<{ ok: boolean; message?: string }>()
  const payableInvoice = order
    ? invoices.find((invoice) => invoice.orderId === order.id && invoice.status === 'Awaiting payment')
    : undefined
  useEffect(() => {
    if (isReadOnly || !automaticPickupLocation) return
    if (!pickupLocation || pickupLocation === previousAutomaticPickupLocation.current) {
      setPickupLocation(automaticPickupLocation)
      previousAutomaticPickupLocation.current = automaticPickupLocation
    }
  }, [automaticPickupLocation, isReadOnly, pickupLocation])

  useEffect(() => {
    if (isReadOnly) return
    let cancelled = false
    const loadCatalog = async () => {
      if (!supabase) {
        setCatalogError('Laundry services are unavailable right now.')
        setCatalogState('error')
        return
      }
      const { data: categoryRows, error: categoryError } = await supabase
        .from('cloth_categories')
        .select('id, name, active, is_main')
        .eq('active', true)
        .order('name')
      if (categoryError) {
        if (!cancelled) {
          setCatalogError('Laundry categories could not be loaded. Please try again.')
          setCatalogState('error')
        }
        return
      }
      const categoryIds = (categoryRows ?? []).map((row) => row.id)
      const { data: rateRows, error: rateError } =
        categoryIds.length > 0
          ? await supabase
              .from('cloth_category_rates')
              .select(
                'category_id, wash_price, iron_price, wash_iron_price, subscriber_wash_price, subscriber_iron_price, subscriber_wash_iron_price, subscription_units',
              )
              .in('category_id', categoryIds)
          : { data: [], error: null }
      if (rateError) {
        if (!cancelled) {
          setCatalogError('Laundry prices could not be loaded. Please try again.')
          setCatalogState('error')
        }
        return
      }
      const ratesByCategory = new Map((rateRows ?? []).map((row) => [row.category_id, row]))
      const liveCategories = (categoryRows ?? [])
        .flatMap((row) => {
          const rate = ratesByCategory.get(row.id)
          if (!rate) return []
          return [
            {
              id: row.id,
              name: row.name,
              isMain: Boolean(row.is_main),
              subscriptionUnits: Number(rate.subscription_units),
              rates: { Wash: Number(rate.wash_price), Iron: Number(rate.iron_price), 'Wash + Iron': Number(rate.wash_iron_price) },
              subscriberRates: {
                Wash: Number(rate.subscriber_wash_price),
                Iron: Number(rate.subscriber_iron_price),
                'Wash + Iron': Number(rate.subscriber_wash_iron_price),
              },
              description: 'Live pricing and subscription units from Qaffy rates.',
            },
          ]
        })
        .filter((row) => row.subscriptionUnits > 0 && Object.values(row.rates).every((price) => price > 0))
      if (!cancelled) {
        setCategories(liveCategories)
        setCategory(liveCategories.find((item) => item.isMain) ?? liveCategories[0] ?? null)
        setCatalogState(liveCategories.length > 0 ? 'ready' : 'empty')
      }
    }
    void loadCatalog()
    return () => {
      cancelled = true
    }
  }, [isReadOnly])

  const draftLine: OrderLine | null = category
    ? {
        category: category.name,
        service: service.name,
        quantity,
        unitPrice: category.rates[service.name],
        subscriptionUnits: category.subscriptionUnits,
      }
    : null
  const displayItems =
    order?.lines ??
    (order
      ? [
          {
            category: order.service,
            service: order.service,
            quantity: order.items,
            unitPrice: order.items ? order.total / order.items : order.total,
          },
        ]
      : items)
  const total = order?.total ?? items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const itemCount = isReadOnly
    ? displayItems.reduce((sum, item) => sum + item.quantity, 0)
    : items.reduce((sum, item) => sum + item.quantity, 0)
  const availableCategories = categories
  const subscriptionBillingPreview = useMemo(() => {
    if (!activePlan) return null
    return calculateSubscriptionBilling(
      items.map((item, index) => {
        const categoryRow = categories.find((candidate) => candidate.name.trim().toLowerCase() === item.category.trim().toLowerCase())
        const regularWashPrice = categoryRow?.rates.Wash ?? item.unitPrice
        const regularIronPrice = categoryRow?.rates.Iron ?? item.unitPrice
        return {
          id: `${item.category}:${item.service}:${index}`,
          service: item.service === 'Wash + Iron' ? 'wash_iron' : item.service === 'Iron' ? 'iron' : 'wash',
          quantity: item.quantity,
          unitsPerItem: item.subscriptionUnits ?? 1,
          regularPrice: item.unitPrice,
          regularWashPrice,
          regularIronPrice,
          subscriberWashPrice: categoryRow?.subscriberRates.Wash ?? regularWashPrice,
          subscriberIronPrice: categoryRow?.subscriberRates.Iron ?? regularIronPrice,
          subscriberWashIronPrice: categoryRow?.subscriberRates['Wash + Iron'] ?? item.unitPrice,
        }
      }),
      { wash: activePlan.covers_wash, iron: activePlan.covers_iron },
      subscriptionRemainingUnits ?? 0,
    )
  }, [activePlan, categories, items, subscriptionRemainingUnits])
  const pickupDetailsFields = (
    <>
      <label>
        <span className="mb-1.5 block text-sm font-medium text-slate-600">
          Pickup instructions <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <textarea
          rows={3}
          placeholder="Separate whites, handle silk carefully..."
          value={order?.notes ?? notes}
          onChange={(event) => setNotes(event.target.value)}
          readOnly={isReadOnly}
          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus read-only:cursor-default read-only:bg-slate-50"
        />
      </label>
      {(!preferredPickupLocationId || isReadOnly) && (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">
            Pickup location <span className="text-rose-600">*</span>
          </span>
          <select
            value={order?.pickupLocation ?? pickupLocation}
            onChange={(event) => {
              setPickupLocation(event.target.value)
              setPickupLocationError('')
            }}
            disabled={isReadOnly}
            required={!isReadOnly}
            aria-invalid={Boolean(pickupLocationError)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus disabled:cursor-default disabled:bg-slate-50 disabled:opacity-100"
          >
            {!order && <option value="">Select a pickup location</option>}
            {pickupLocations.map((location) => (
              <option key={location.id} value={location.name}>
                {location.name}
                {location.address ? ` (${location.address})` : ''}
              </option>
            ))}
            {order && !pickupLocations.some((location) => location.name === order.pickupLocation) && (
              <option>{order.pickupLocation}</option>
            )}
          </select>
          {pickupLocationError && (
            <span className="mt-1.5 block text-sm text-rose-600" role="alert">
              {pickupLocationError}
            </span>
          )}
        </label>
      )}
      {preferredPickupLocationId && !isReadOnly && (
        <p className="mt-4 rounded-2xl bg-brand-soft p-3 text-sm text-brand-strong">
          Pickup location <span className="text-rose-600">*</span>: {preferredPickupLocationName}
        </p>
      )}
    </>
  )
  const addItem = () => {
    if (!draftLine) return
    setItems((currentItems) => addOrIncrementOrderLine(currentItems, draftLine))
    setCategory(category)
    setQuantity(1)
    setQuantityInput(null)
  }

  const handleCreateOrder = async () => {
    if (!pickupLocation) {
      setPickupLocationError('Please select a pickup location before continuing.')
      return
    }
    setPickupLocationError('')
    setIsSaving(true)
    try {
      await addOrder({ items, notes, pickupLocation })
      onClose()
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Order could not be saved. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-order-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="relative max-h-[94vh] w-full overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:max-w-3xl sm:p-8"
      >
        <BubblyBackground contained centered count={4} scale={7} opacity={0.38} color="var(--color-brand-primary)" />
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="new-order-title" className="text-2xl font-bold tracking-tight text-[#121212]">
              {isReadOnly ? 'Order details' : 'Create an order'}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {isReadOnly ? (
                <>
                  <CopyableOrderId id={order?.publicOrderNumber ?? ''} /> · {order?.status}
                </>
              ) : (
                'Add each type of item and choose how you want it cared for.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isReadOnly ? 'Close order details' : 'Close new order'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-xl text-slate-400 shadow-sm transition hover:border-slate-300 hover:text-slate-600 hover:shadow-md"
          >
            ×
          </button>
        </header>

        <section className="mt-6 rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900">{isReadOnly ? 'Laundry items' : 'Add laundry items'}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {isReadOnly
                  ? 'The items and service details for this order.'
                  : 'Choose a category, service and quantity. Add another row for more items.'}
              </p>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-primary">
              {displayItems.length} item type{displayItems.length === 1 ? '' : 's'}
            </span>
          </div>
          {!isReadOnly && catalogState === 'loading' && (
            <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Loading live laundry services...</p>
          )}
          {!isReadOnly && catalogState === 'error' && (
            <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{catalogError}</p>
          )}
          {!isReadOnly && catalogState === 'empty' && (
            <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">No laundry services are available right now.</p>
          )}
          {!isReadOnly && catalogState === 'ready' && availableCategories.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-[1.2fr_1fr_120px]">
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Category</span>
                <select
                  value={category?.name ?? availableCategories[0].name}
                  onChange={(event) => setCategory(availableCategories.find((item) => item.name === event.target.value) ?? null)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
                >
                  {availableCategories.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name} ·{' '}
                      {subscription
                        ? `${item.subscriptionUnits} unit${item.subscriptionUnits === 1 ? '' : 's'}`
                        : `₦${item.rates[service.name].toLocaleString()}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Service</span>
                <select
                  value={service.name}
                  onChange={(event) => setService(services.find((item) => item.name === event.target.value) ?? services[0])}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
                >
                  {services.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Quantity</span>
                <div className="flex h-[46px] items-center justify-between rounded-2xl border border-slate-200 px-2">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => {
                      setQuantity((value) => Math.max(1, value - 1))
                      setQuantityInput(null)
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-50"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label="Quantity"
                    value={quantityInput ?? quantity}
                    onChange={(event) => {
                      const value = event.target.value
                      setQuantityInput(value)
                      const parsedQuantity = parsePositiveQuantity(value)
                      if (parsedQuantity !== null) setQuantity(parsedQuantity)
                    }}
                    onBlur={() => {
                      setQuantityInput(null)
                    }}
                    className="w-14 border-0 bg-transparent text-center font-semibold text-slate-900 outline-none focus:ring-0"
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => {
                      setQuantity((value) => value + 1)
                      setQuantityInput(null)
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </label>
            </div>
          )}
          {!isReadOnly && availableCategories.length === 0 && (
            <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">All available categories have been added.</p>
          )}
          {!isReadOnly && category && (
            <button
              type="button"
              onClick={addItem}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-brand-border bg-brand-soft-hover px-3.5 py-2.5 text-sm font-semibold text-brand-primary hover:bg-brand-soft"
            >
              <Plus className="h-4 w-4" /> Add item
            </button>
          )}
          {displayItems.length > 0 && (
            <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {displayItems.map((item, index) => {
                const subscriptionLineAmount = subscriptionBillingPreview?.lines[index]?.totalAmount ?? 0
                const isCoveredSubscriptionLine = Boolean(subscription && !isReadOnly && subscriptionLineAmount === 0)
                const lineKey = getOrderLineKey(item)
                return (
                  <div
                    key={`${item.category}-${item.service}-${index}`}
                    className={`flex gap-3 p-3 text-sm ${isCoveredSubscriptionLine ? 'items-center' : 'flex-col sm:flex-row sm:items-center'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{item.category}</p>
                      <p className="text-xs text-slate-500">
                        {item.service} · {item.quantity} item{item.quantity === 1 ? '' : 's'}
                        {isReadOnly && item.vendorAdded ? (
                          <span className="font-semibold text-emerald-600"> (+{item.quantity}, vendor-added)</span>
                        ) : isReadOnly && item.vendorCountDifference ? (
                          <span className={`font-semibold ${item.vendorCountDifference > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {' '}({item.vendorCountDifference > 0 ? '+' : ''}{item.vendorCountDifference})
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className={`flex items-center gap-2 ${isCoveredSubscriptionLine ? 'shrink-0' : 'self-stretch sm:self-auto'}`}>
                      {!isReadOnly && (
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          aria-label={`Quantity for ${item.category}`}
                          value={itemQuantityInputs[lineKey] ?? item.quantity}
                          onChange={(event) => {
                            const value = event.target.value
                            setItemQuantityInputs((currentInputs) => ({ ...currentInputs, [lineKey]: value }))
                            const parsedQuantity = parsePositiveQuantity(value)
                            if (parsedQuantity !== null) {
                              setItems((currentItems) =>
                                currentItems.map((currentItem) =>
                                  getOrderLineKey(currentItem) === lineKey
                                    ? { ...currentItem, quantity: parsedQuantity }
                                    : currentItem,
                                ),
                              )
                            }
                          }}
                          onBlur={() =>
                            setItemQuantityInputs((currentInputs) => {
                              const nextInputs = { ...currentInputs }
                              delete nextInputs[lineKey]
                              return nextInputs
                            })
                          }
                          className="w-16 rounded-xl border border-slate-200 px-2 py-1 text-center font-semibold text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
                        />
                      )}
                      {subscription && !isReadOnly ? (
                        subscriptionLineAmount > 0 && (
                          <span className="min-w-0 flex-1 text-right font-semibold text-brand-strong">
                            + ₦{subscriptionLineAmount.toLocaleString()}
                          </span>
                        )
                      ) : (
                        <span className="min-w-0 flex-1 text-right font-semibold text-slate-900">
                          {subscription
                            ? `${item.quantity * (item.subscriptionUnits ?? 1)} unit${item.quantity * (item.subscriptionUnits ?? 1) === 1 ? '' : 's'}`
                            : `₦${(item.quantity * item.unitPrice).toLocaleString()}`}
                        </span>
                      )}
                      {!isReadOnly && (
                        <button
                          type="button"
                          aria-label={`Remove ${item.category}`}
                          onClick={() => {
                            setItems((currentItems) => currentItems.filter((_, itemIndex) => itemIndex !== index))
                            setItemQuantityInputs((currentInputs) => {
                              const nextInputs = { ...currentInputs }
                              delete nextInputs[lineKey]
                              return nextInputs
                            })
                          }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl text-slate-400 hover:bg-brand-soft hover:text-brand-primary"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {isReadOnly && (
          <section className="mt-6 grid gap-3 sm:grid-cols-2">
            {!order?.pickedUp && order?.pickupOtp && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
                <p className="text-[10px] font-semibold capitalize tracking-[0.16em] text-slate-500">Pickup OTP</p>
                <div className="mt-2.5">
                  <ProtectedOtp value={order?.pickupOtp} digitClassName="h-9 w-9 text-sm" />
                </div>
              </div>
            )}
            {order?.paymentStatus === 'Paid' && order.status !== 'Delivered' && (
              order.dispatched && order.deliveryOtp ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
                  <p className="text-[10px] font-semibold capitalize tracking-[0.16em] text-slate-500">Delivery OTP</p>
                  <div className="mt-2.5">
                    <ProtectedOtp value={order.deliveryOtp} digitClassName="h-9 w-9 text-sm" />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
                  <DeliveryOtpStatus />
                </div>
              )
            )}
          </section>
        )}

        {isReadOnly && order?.mismatch && (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <p className="text-sm font-semibold text-amber-800">
              {order.mismatch.direction === 'over' ? 'Extra items confirmed' : 'Fewer items confirmed'}
            </p>
            <p className="mt-1.5 break-words text-sm text-amber-700">{order.mismatch.detail}</p>
          </section>
        )}

        {isReadOnly ? (
          <details className="group mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold text-slate-800 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary sm:px-5">
              <span>Additional details</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="border-t border-slate-100 p-4 sm:p-5">{pickupDetailsFields}</div>
          </details>
        ) : (
          <section className="mt-6 rounded-2xl border border-slate-200 p-4 shadow-sm sm:p-5">{pickupDetailsFields}</section>
        )}

        {!isReadOnly && subscription && (
          <p className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm text-brand-strong shadow-sm border border-brand-border">
            {subscriptionRemainingUnits} weighted units remain on your {subscription.name} plan this week.
          </p>
        )}

        <section className="mt-6 rounded-2xl border border-brand-border bg-brand-soft p-5 sm:p-6 shadow-sm">
          <div className="space-y-4">
            <div className={isReadOnly ? 'flex items-center justify-between gap-3' : ''}>
              <p className="text-xs font-semibold capitalize tracking-[0.16em] text-brand-strong">
                {isReadOnly ? 'Order total' : 'Order estimate'}
              </p>
              {isReadOnly && !subscription && (
                <p className="text-right text-base font-semibold text-brand-strong">
                  {order?.total ? `₦${order.total.toLocaleString()}` : 'Final billing after review'}
                </p>
              )}
              {!isReadOnly && (
                <p className="mt-2.5 text-sm text-slate-600">
                  {subscription
                    ? `${subscriptionBillingPreview?.coveredUnits ?? 0} units covered by your plan`
                    : `${itemCount} item${itemCount === 1 ? '' : 's'} across ${displayItems.length} item type${displayItems.length === 1 ? '' : 's'}`}
                </p>
              )}
            </div>
            {subscription && !isReadOnly && subscriptionBillingPreview && (
              <div className="space-y-2 border-t border-brand-border/70 pt-3 text-sm">
                {subscriptionBillingPreview.subscriberAmount > 0 && (
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-slate-600">Extra laundry after your weekly plan limit</p>
                    <p className="shrink-0 font-semibold text-brand-strong">
                      + ₦{subscriptionBillingPreview.subscriberAmount.toLocaleString()}
                    </p>
                  </div>
                )}
                {subscriptionBillingPreview.regularAmount > 0 && (
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-slate-600">Laundry not covered by your plan</p>
                    <p className="shrink-0 font-semibold text-brand-strong">
                      + ₦{subscriptionBillingPreview.regularAmount.toLocaleString()}
                    </p>
                  </div>
                )}
                {subscriptionBillingPreview.subscriberAmount > 0 && subscriptionBillingPreview.regularAmount > 0 && (
                  <div className="flex items-start justify-between gap-3 border-t border-brand-border/70 pt-2 font-bold text-brand-strong">
                    <p>Estimated total</p>
                    <p className="shrink-0">₦{subscriptionBillingPreview.totalAmount.toLocaleString()}</p>
                  </div>
                )}
                {subscriptionBillingPreview.totalAmount === 0 && <p className="font-semibold text-brand-strong">No extra charge</p>}
              </div>
            )}
            {!subscription && !isReadOnly && (
                <p className="text-2xl font-bold text-brand-strong">₦{total.toLocaleString()}</p>
            )}
          </div>
          {isReadOnly && order?.paymentStatus === 'Pending' && order.status !== 'Delivered' && order.total > 0 ? (
            <div className="mt-5 border-t border-brand-border/70 pt-4">
              <p className="text-sm text-brand-strong">Your final invoice is ready. Pay it from your wallet here.</p>
              {payableInvoice ? (
                <invoicePaymentFetcher.Form method="post" action="/invoice">
                  <input type="hidden" name="invoiceId" value={payableInvoice.id} />
                  <button
                    type="submit"
                    disabled={invoicePaymentFetcher.state !== 'idle' || invoicePaymentFetcher.data?.ok === true}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover disabled:cursor-wait disabled:opacity-70"
                  >
                    {invoicePaymentFetcher.state !== 'idle'
                      ? 'Processing payment...'
                      : invoicePaymentFetcher.data?.ok
                        ? 'Payment received'
                        : `Pay ₦${payableInvoice.total.toLocaleString()}`}
                  </button>
                  {invoicePaymentFetcher.data && !invoicePaymentFetcher.data.ok && (
                    <p className="mt-2 text-sm font-medium text-rose-700" role="alert">
                      {invoicePaymentFetcher.data.message ?? 'The invoice could not be paid.'}
                    </p>
                  )}
                  {invoicePaymentFetcher.data?.message?.includes('wallet balance is too low') && (
                    <Link
                      to="/?topup=1"
                      onClick={onClose}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-brand-primary px-4 py-3 text-sm font-semibold text-brand-primary transition hover:bg-white"
                    >
                      Top up wallet
                    </Link>
                  )}
                </invoicePaymentFetcher.Form>
              ) : (
                <p className="mt-3 text-sm text-amber-700">Invoice payment details are loading. Please try again in a moment.</p>
              )}
            </div>
          ) : isReadOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover hover:shadow-md"
            >
              Close details
            </button>
          ) : (
            <button
              type="button"
              disabled={items.length === 0 || isSaving || catalogState !== 'ready'}
              onClick={handleCreateOrder}
              className="mt-5 w-full rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover hover:shadow-md"
            >
              {isSaving ? 'Saving order...' : 'Continue to pickup details'}
            </button>
          )}
        </section>
      </section>
    </div>
  )
}
