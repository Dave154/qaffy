import { useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { CustomerOrder, OrderLine } from '../customer-store'
import { useCustomerStore } from '../customer-store-hook'
import BubblyBackground from '../../../components/BubblyBackground'
import CopyableOrderId from '../../../components/CopyableOrderId'
import ProtectedOtp from '../../../components/ProtectedOtp'
import { toast } from '../../../lib/toast'

type Category = { name: string; price: number; subscriptionUnits: number; description: string }

const categories: Category[] = [
  { name: 'General clothing', price: 350, subscriptionUnits: 1, description: 'Shirts, trousers, blouses, skirts and native wear' },
  { name: 'Bedsheet', price: 700, subscriptionUnits: 3, description: 'Bedsheets and duvet covers' },
  { name: 'Towel', price: 700, subscriptionUnits: 1, description: 'Bath and hand towels' },
  { name: 'Suit', price: 3000, subscriptionUnits: 2, description: 'Two-piece and three-piece suits' },
  { name: 'Hoodie', price: 500, subscriptionUnits: 2, description: 'Hoodies and heavy tops' },
  { name: 'Duvet', price: 2500, subscriptionUnits: 6, description: 'Duvets and large bedding' },
  { name: 'Pair of shoes', price: 1200, subscriptionUnits: 2, description: 'One pair of shoes or one bag' },
]

const services = [
  { name: 'Wash', description: 'Clean and fold' },
  { name: 'Iron', description: 'Pressed and ready' },
  { name: 'Wash + Iron', description: 'Clean, pressed and folded' },
]

type NewOrderProps = { onClose: () => void; order?: CustomerOrder }

export default function NewOrder({ onClose, order }: NewOrderProps) {
  const { addOrder, pickupLocations, preferredPickupLocationId, preferredPickupLocationName, subscription, subscriptionRemainingUnits } = useCustomerStore()
  const isReadOnly = Boolean(order)
  const [category, setCategory] = useState(categories[0])
  const [service, setService] = useState(services[2])
  const [quantity, setQuantity] = useState(1)
  const [items, setItems] = useState<OrderLine[]>([])
  const [pickupLocation, setPickupLocation] = useState(preferredPickupLocationName ?? pickupLocations[0]?.name ?? '')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const draftLine: OrderLine = { category: category.name, service: service.name, quantity, unitPrice: category.price, subscriptionUnits: category.subscriptionUnits }
  const displayItems = order?.lines ?? (order ? [{ category: order.service, service: order.service, quantity: order.items, unitPrice: order.items ? order.total / order.items : order.total }] : items)
  const total = order?.total ?? items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const itemCount = order?.items ?? items.reduce((sum, item) => sum + item.quantity, 0)
  const weightedItemCount = items.reduce((sum, item) => sum + item.quantity * (item.subscriptionUnits ?? 1), 0)

  const addItem = () => {
    setItems((currentItems) => [...currentItems, draftLine])
    setQuantity(1)
  }

  const handleCreateOrder = async () => {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-order-title" onMouseDown={(event) => event.stopPropagation()} className="relative max-h-[94vh] w-full overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:max-w-3xl sm:p-8">
        <BubblyBackground contained centered count={4} scale={7} opacity={0.38} color="var(--color-brand-primary)" />
        <header className="flex items-start justify-between gap-4">
          <div><h2 id="new-order-title" className="text-2xl font-bold tracking-tight text-[#121212]">{isReadOnly ? 'Order details' : 'Create an order'}</h2><p className="mt-1.5 text-sm text-slate-500">{isReadOnly ? <><CopyableOrderId id={order?.id ?? ''} /> · {order?.status}</> : 'Add each type of item and choose how you want it cared for.'}</p></div>
          <button type="button" onClick={onClose} aria-label={isReadOnly ? 'Close order details' : 'Close new order'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-xl text-slate-400 shadow-sm transition hover:border-slate-300 hover:text-slate-600 hover:shadow-md">×</button>
        </header>

        {isReadOnly && <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Payment status</p><p className="mt-2.5 font-semibold text-slate-900">{order?.paymentStatus}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Customer ID</p><p className="mt-2.5 font-semibold text-slate-900">{order?.customerId}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Pickup OTP</p><div className="mt-2.5"><ProtectedOtp value={order?.pickupOtp} digitClassName="h-9 w-9 text-sm" /></div></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Delivery OTP</p><div className="mt-2.5"><ProtectedOtp value={order?.deliveryOtp} digitClassName="h-9 w-9 text-sm" /></div></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 shadow-sm sm:col-span-2"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Pickup date</p><p className="mt-2.5 font-semibold text-slate-900">{order?.pickupDate ?? 'Not confirmed yet'}</p></div>
        </section>}

        <section className="mt-6 rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">{isReadOnly ? 'Laundry items' : 'Add laundry items'}</h3><p className="mt-1 text-sm text-slate-500">{isReadOnly ? 'The items and service details for this order.' : 'Choose a category, service and quantity. Add another row for more items.'}</p></div><span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-primary">{displayItems.length} item type{displayItems.length === 1 ? '' : 's'}</span></div>
          {!isReadOnly && <div className="mt-4 grid gap-3 sm:grid-cols-[1.2fr_1fr_120px]">
            <label><span className="mb-1.5 block text-sm font-medium text-slate-600">Category</span><select value={category.name} onChange={(event) => setCategory(categories.find((item) => item.name === event.target.value) ?? categories[0])} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus">{categories.map((item) => <option key={item.name} value={item.name}>{item.name} · {subscription ? `${item.subscriptionUnits} unit${item.subscriptionUnits === 1 ? '' : 's'}` : `₦${item.price.toLocaleString()}`}</option>)}</select></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-600">Service</span><select value={service.name} onChange={(event) => setService(services.find((item) => item.name === event.target.value) ?? services[0])} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus">{services.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-600">Quantity</span><div className="flex h-[46px] items-center justify-between rounded-2xl border border-slate-200 px-2"><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-50"><Minus className="h-4 w-4" /></button><input type="number" min={1} inputMode="numeric" aria-label="Quantity" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="w-14 border-0 bg-transparent text-center font-semibold text-slate-900 outline-none focus:ring-0" /><button type="button" aria-label="Increase quantity" onClick={() => setQuantity((value) => value + 1)} className="flex h-8 w-8 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-50"><Plus className="h-4 w-4" /></button></div></label>
          </div>}
          {!isReadOnly && <><p className="mt-2 text-xs text-slate-500">{category.description} · {service.description}</p><button type="button" onClick={addItem} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-brand-border bg-brand-soft-hover px-3.5 py-2.5 text-sm font-semibold text-brand-primary hover:bg-brand-soft"><Plus className="h-4 w-4" /> Add item</button></>}
          {displayItems.length > 0 && <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200">{displayItems.map((item, index) => <div key={`${item.category}-${item.service}-${index}`} className="flex items-center gap-3 p-3 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{item.category}</p><p className="text-xs text-slate-500">{item.service} · {item.quantity} item{item.quantity === 1 ? '' : 's'}</p></div>{!isReadOnly && <input type="number" min={1} inputMode="numeric" aria-label={`Quantity for ${item.category}`} value={item.quantity} onChange={(event) => setItems((currentItems) => currentItems.map((currentItem, itemIndex) => itemIndex === index ? { ...currentItem, quantity: Math.max(1, Number(event.target.value) || 1) } : currentItem))} className="w-16 rounded-xl border border-slate-200 px-2 py-1 text-center font-semibold text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus" />}<span className="font-semibold text-slate-900">{subscription ? `${item.quantity * (item.subscriptionUnits ?? 1)} unit${item.quantity * (item.subscriptionUnits ?? 1) === 1 ? '' : 's'}` : `₦${(item.quantity * item.unitPrice).toLocaleString()}`}</span>{!isReadOnly && <button type="button" aria-label={`Remove ${item.category}`} onClick={() => setItems((currentItems) => currentItems.filter((_, itemIndex) => itemIndex !== index))} className="flex h-8 w-8 items-center justify-center rounded-2xl text-slate-400 hover:bg-brand-soft hover:text-brand-primary"><Trash2 className="h-4 w-4" /></button>}</div>)}</div>}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm"><label><span className="mb-1.5 block text-sm font-medium text-slate-600">Pickup instructions <span className="font-normal text-slate-400">(optional)</span></span><textarea rows={3} placeholder="Separate whites, handle silk carefully..." value={order?.notes ?? notes} onChange={(event) => setNotes(event.target.value)} readOnly={isReadOnly} className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus read-only:cursor-default read-only:bg-slate-50" /></label>{(!preferredPickupLocationId || isReadOnly) && <label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-slate-600">Pickup location</span><select value={order?.pickupLocation ?? pickupLocation} onChange={(event) => setPickupLocation(event.target.value)} disabled={isReadOnly} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus disabled:cursor-default disabled:bg-slate-50 disabled:opacity-100">{pickupLocations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}{order && !pickupLocations.some((location) => location.name === order.pickupLocation) && <option>{order.pickupLocation}</option>}</select></label>}{preferredPickupLocationId && !isReadOnly && <p className="mt-4 rounded-2xl bg-brand-soft p-3 text-sm text-brand-strong">Pickup location: {preferredPickupLocationName}</p>}</section>

        {!isReadOnly && subscription && <p className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm text-brand-strong shadow-sm border border-brand-border">{subscriptionRemainingUnits} weighted units remain on your {subscription.name} plan this week.</p>}

        <section className="mt-6 rounded-2xl border border-brand-border bg-brand-soft p-5 sm:p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-strong">{isReadOnly ? 'Order total' : 'Order estimate'}</p><p className="mt-2.5 text-sm text-slate-600">{subscription ? `${order ? itemCount : weightedItemCount} weighted unit${(order ? itemCount : weightedItemCount) === 1 ? '' : 's'}` : `${itemCount} item${itemCount === 1 ? '' : 's'}`} across {displayItems.length} item type{displayItems.length === 1 ? '' : 's'}</p></div>{!subscription && <p className="text-2xl font-bold text-brand-strong">₦{total.toLocaleString()}</p>}</div>{isReadOnly ? <button type="button" onClick={onClose} className="mt-5 w-full rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover hover:shadow-md">Close details</button> : <button type="button" disabled={items.length === 0 || isSaving} onClick={handleCreateOrder} className="mt-5 w-full rounded-2xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? 'Saving order...' : 'Continue to pickup details'}</button>}</section>
      </section>
    </div>
  )
}