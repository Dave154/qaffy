import { useState } from 'react'

type Service = {
  name: string
  description: string
  price: number
  icon: string
}

const services: Service[] = [
  {
    name: 'Wash',
    description: 'Clean and fold',
    price: 600,
    icon: '◌',
  },
  {
    name: 'Iron',
    description: 'Pressed and ready',
    price: 500,
    icon: '◇',
  },
  {
    name: 'Wash + Iron',
    description: 'Clean, pressed and folded',
    price: 800,
    icon: '✦',
  },
]

type NewOrderProps = {
  onClose: () => void
}

export default function NewOrder({ onClose }: NewOrderProps) {
  const [selectedService, setSelectedService] = useState('Wash + Iron')
  const [clothes, setClothes] = useState(6)
  const selected = services.find((service) => service.name === selectedService) ?? services[2]
  const estimatedTotal = Math.max(clothes, 1) * selected.price

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-order-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-[30px] bg-slate-50 p-4 shadow-2xl shadow-slate-950/20 sm:max-w-2xl sm:rounded-[30px] sm:p-6"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
          <h2 id="new-order-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Create an order</h2>
          <p className="mt-1 text-sm text-slate-500">Tell us what you would like us to care for.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close new order" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700">
            ×
          </button>
        </header>

      <section className="mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Choose a service</h3>
            <p className="mt-1 text-sm text-slate-500">Select one option for this pickup.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">Step 1 of 3</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {services.map((service) => {
            const isSelected = service.name === selectedService

            return (
              <button
                key={service.name}
                type="button"
                onClick={() => setSelectedService(service.name)}
                className={`relative rounded-2xl border p-4 text-left transition ${
                  isSelected
                    ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100'
                    : 'border-slate-200 bg-slate-50 hover:border-violet-200 hover:bg-violet-50/50'
                }`}
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${isSelected ? 'bg-violet-600 text-white' : 'bg-white text-violet-600'}`}>
                  {service.icon}
                </span>
                <span className="mt-3 block font-semibold text-slate-900">{service.name}</span>
                <span className="mt-1 block text-xs text-slate-500">{service.description}</span>
                <span className="mt-3 block text-sm font-semibold text-violet-700">From ₦{service.price.toLocaleString()}</span>
                {isSelected && <span className="absolute right-3 top-3 text-sm font-bold text-violet-600">✓</span>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Your laundry</h3>
            <p className="mt-1 text-sm text-slate-500">Give us an estimate of the items in your bag.</p>
          </div>
          <span className="text-2xl">🧺</span>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Number of clothes</span>
          <input
            type="number"
            min="1"
            value={clothes}
            onChange={(event) => setClothes(Number(event.target.value))}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Pickup instructions <span className="font-normal text-slate-400">(optional)</span></span>
          <textarea
            rows={3}
            placeholder="Separate whites, handle silk carefully..."
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </label>
      </section>

      <section className="rounded-[26px] bg-slate-950 p-5 text-white shadow-lg shadow-slate-200 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-300">Order estimate</p>
            <p className="mt-2 text-sm text-slate-300">{clothes || 0} clothes × {selected.name}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">₦{estimatedTotal.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-400">Final amount after intake</p>
          </div>
        </div>

        <button type="button" className="mt-5 w-full rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-950 transition hover:bg-violet-400">
          Continue to pickup details
        </button>
      </section>
      </section>
    </div>
  )
}
