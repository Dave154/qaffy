import type { CustomerOrder } from '../customer-store'

type OrderDetailModalProps = {
  order: CustomerOrder
  onClose: () => void
}

export default function OrderDetailModal({ order, onClose }: OrderDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-details-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-[30px] bg-slate-50 p-4 shadow-2xl shadow-slate-950/20 sm:max-w-2xl sm:rounded-[30px] sm:p-6"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="order-details-title" className="mt-1 text-2xl font-bold tracking-tight text-[#121212]">{order.id}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close order details" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700">
            ×
          </button>
        </header>

        <div className="mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Status</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{order.status}</p>
            </div>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${order.statusTone}`}>
              {order.paymentStatus}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Pickup OTP</p>
              <p className="mt-2 text-2xl font-bold tracking-[0.18em] text-slate-900">{order.pickupOtp}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Delivery OTP</p>
              <p className="mt-2 text-2xl font-bold tracking-[0.18em] text-slate-900">{order.deliveryOtp ?? 'Pending'}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
            <h3 className="text-lg font-bold text-slate-900">Order summary</h3>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <dt>Service</dt>
                <dd className="font-semibold text-slate-900">{order.service}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Items</dt>
                <dd className="font-semibold text-slate-900">{order.items} clothes</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Total</dt>
                <dd className="font-semibold text-slate-900">₦{order.total.toLocaleString()}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Customer ID</dt>
                <dd className="font-semibold text-slate-900">{order.customerId}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
            <h3 className="text-lg font-bold text-slate-900">Pickup details</h3>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <dt>Picked up</dt>
                <dd className="font-semibold text-slate-900">{order.pickedUp ? 'Yes' : 'No'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Pickup date</dt>
                <dd className="font-semibold text-slate-900">{order.pickupDate ?? 'Not confirmed yet'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Pickup time</dt>
                <dd className="font-semibold text-slate-900">{order.pickup}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <h3 className="text-lg font-bold text-slate-900">Notes</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">{order.notes}</p>
        </div>
      </section>
    </div>
  )
}
