import { useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { OrderLine } from '../customer-store'
import { useCustomerStore } from '../customer-store-hook'
import BubblyBackground from '../../../components/BubblyBackground'

type Category = { name: string; price: number; description: string }

const categories: Category[] = [
  { name: 'General clothing', price: 350, description: 'Shirts, trousers, blouses, skirts and native wear' },
  { name: 'Bedsheet', price: 700, description: 'Bedsheets and duvet covers' },
  { name: 'Towel', price: 700, description: 'Bath and hand towels' },
  { name: 'Suit', price: 3000, description: 'Two-piece and three-piece suits' },
  { name: 'Hoodie', price: 500, description: 'Hoodies and heavy tops' },
  { name: 'Duvet', price: 2500, description: 'Duvets and large bedding' },
  { name: 'Pair of shoes', price: 1200, description: 'One pair of shoes or one bag' },
]

const services = [
  { name: 'Wash', description: 'Clean and fold' },
  { name: 'Iron', description: 'Pressed and ready' },
  { name: 'Wash + Iron', description: 'Clean, pressed and folded' },
]

type NewOrderProps = { onClose: () => void }

export default function NewOrder({ onClose }: NewOrderProps) {
  const { addOrder, pickupLocations } = useCustomerStore()
  const [category, setCategory] = useState(categories[0])
  const [service, setService] = useState(services[2])
  const [quantity, setQuantity] = useState(1)
  const [items, setItems] = useState<OrderLine[]>([])
  const [pickupLocation, setPickupLocation] = useState(pickupLocations[0])
  const [notes, setNotes] = useState('')
  const draftLine: OrderLine = { category: category.name, service: service.name, quantity, unitPrice: category.price }
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

  const addItem = () => {
    setItems((currentItems) => [...currentItems, draftLine])
    setQuantity(1)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-order-title" onMouseDown={(event) => event.stopPropagation()} className="relative max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-[#e7e7e7] bg-white p-4 shadow-xl sm:max-w-3xl sm:p-6">
        <BubblyBackground contained centered count={4} scale={7} opacity={0.38} color="#00b7d4" />
        <header className="flex items-start justify-between gap-3">
          <div><h2 id="new-order-title" className="text-2xl font-bold tracking-tight text-[#121212]">Create an order</h2><p className="mt-1 text-sm text-slate-500">Add each type of item and choose how you want it cared for.</p></div>
          <button type="button" onClick={onClose} aria-label="Close new order" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl text-slate-500 transition hover:border-[#a8eaf0] hover:text-[#00b7d4]">×</button>
        </header>

        <section className="mt-5 rounded-2xl border border-[#e7e7e7] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">Add laundry items</h3><p className="mt-1 text-sm text-slate-500">Choose a category, service and quantity. Add another row for more items.</p></div><span className="rounded-full bg-[#e8fbfd] px-2.5 py-1 text-xs font-medium text-[#00b7d4]">{items.length} item type{items.length === 1 ? '' : 's'}</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1.2fr_1fr_120px]">
            <label><span className="mb-1.5 block text-sm font-medium text-slate-600">Category</span><select value={category.name} onChange={(event) => setCategory(categories.find((item) => item.name === event.target.value) ?? categories[0])} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:border-[#00b7d4] focus:ring-2 focus:ring-[#d1f5f8]">{categories.map((item) => <option key={item.name} value={item.name}>{item.name} · ₦{item.price.toLocaleString()}</option>)}</select></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-600">Service</span><select value={service.name} onChange={(event) => setService(services.find((item) => item.name === event.target.value) ?? services[0])} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:border-[#00b7d4] focus:ring-2 focus:ring-[#d1f5f8]">{services.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
            <label><span className="mb-1.5 block text-sm font-medium text-slate-600">Quantity</span><div className="flex h-[46px] items-center justify-between rounded-2xl border border-slate-200 px-2"><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-50"><Minus className="h-4 w-4" /></button><span className="font-semibold text-slate-900">{quantity}</span><button type="button" aria-label="Increase quantity" onClick={() => setQuantity((value) => value + 1)} className="flex h-8 w-8 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-50"><Plus className="h-4 w-4" /></button></div></label>
          </div>
          <p className="mt-2 text-xs text-slate-500">{category.description} · {service.description}</p>
          <button type="button" onClick={addItem} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-[#a8eaf0] bg-[#f0fcfd] px-3.5 py-2.5 text-sm font-semibold text-[#00b7d4] hover:bg-[#e8fbfd]"><Plus className="h-4 w-4" /> Add item</button>
          {items.length > 0 && <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200">{items.map((item, index) => <div key={`${item.category}-${item.service}-${index}`} className="flex items-center gap-3 p-3 text-sm"><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{item.category}</p><p className="text-xs text-slate-500">{item.service} · {item.quantity} item{item.quantity === 1 ? '' : 's'}</p></div><span className="font-semibold text-slate-900">₦{(item.quantity * item.unitPrice).toLocaleString()}</span><button type="button" aria-label={`Remove ${item.category}`} onClick={() => setItems((currentItems) => currentItems.filter((_, itemIndex) => itemIndex !== index))} className="flex h-8 w-8 items-center justify-center rounded-2xl text-slate-400 hover:bg-[#e8fbfd] hover:text-[#00b7d4]"><Trash2 className="h-4 w-4" /></button></div>)}</div>}
        </section>

        <section className="mt-4 rounded-2xl border border-[#e7e7e7] p-4 sm:p-5"><label><span className="mb-1.5 block text-sm font-medium text-slate-600">Pickup instructions <span className="font-normal text-slate-400">(optional)</span></span><textarea rows={3} placeholder="Separate whites, handle silk carefully..." value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#00b7d4] focus:ring-2 focus:ring-[#d1f5f8]" /></label><label className="mt-4 block"><span className="mb-1.5 block text-sm font-medium text-slate-600">Pickup location</span><select value={pickupLocation} onChange={(event) => setPickupLocation(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-[#00b7d4] focus:ring-2 focus:ring-[#d1f5f8]">{pickupLocations.map((location) => <option key={location}>{location}</option>)}</select></label></section>

        <section className="mt-4 rounded-2xl border border-[#a7d7d2] bg-[#eef9f7] p-5 text-slate-900 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#418d87]">Order estimate</p><p className="mt-2 text-sm text-slate-600">{itemCount} item{itemCount === 1 ? '' : 's'} across {items.length} item type{items.length === 1 ? '' : 's'}</p></div><p className="text-2xl font-bold">₦{total.toLocaleString()}</p></div><button type="button" disabled={items.length === 0} onClick={() => { addOrder({ items, notes, pickupLocation }); onClose() }} className="mt-5 w-full rounded-2xl bg-[#00b7d4] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#007f99] disabled:cursor-not-allowed disabled:opacity-50">Continue to pickup details</button></section>
      </section>
    </div>
  )
}