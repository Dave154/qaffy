import { useState } from 'react'
import ProtectedOtp from '../../../components/ProtectedOtp'
import { useCustomerStore } from '../customer-store-hook'

export default function OtpFlow() {
  const { orders } = useCustomerStore()
  const [activeStep, setActiveStep] = useState(0)
  const activeOrders = orders.filter((candidate) => candidate.status !== 'Delivered')
  const [selectedOrderId, setSelectedOrderId] = useState(activeOrders[0]?.id ?? '')
  const selectedOrder = activeOrders.find((candidate) => candidate.id === selectedOrderId) ?? activeOrders[0]
  const order = selectedOrder

  const otpSteps = [
    { label: 'Pickup OTP', detail: 'Share this when dropping off your bag', value: order?.pickedUp ? undefined : order?.pickupOtp },
    { label: 'Delivery OTP', detail: 'Use this to collect your clean clothes', value: order?.deliveryOtp },
  ]

  const currentStep = otpSteps[activeStep]
  const unavailableMessage = activeStep === 0 && order?.pickedUp
    ? 'Picked up'
    : activeStep === 1 && order?.status === 'Delivered'
      ? 'Delivered'
      : activeStep === 1
        ? 'Not ready'
        : 'Not ready'

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden">Pickup and delivery OTP</h2>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700">{order?.publicOrderNumber ?? 'No active order'}</span>
      </header>

      {activeOrders.length > 0 && <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Active order</span>
          <select value={order?.id ?? ''} onChange={(event) => { setSelectedOrderId(event.target.value); setActiveStep(0) }} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-focus">
            {activeOrders.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.publicOrderNumber} · {candidate.service} · {candidate.status}</option>)}
          </select>
        </label>
      </section>}

      {activeOrders.length === 0 && <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-100"><p className="text-sm text-slate-500">No active orders have OTPs available.</p></section>}

      <section className="rounded-[28px] bg-gradient-to-br from-brand-primary via-brand-primary to-brand-primary-hover p-5 text-white shadow-lg shadow-brand-border sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="w-full">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/80">Current code</p>
            <div className="mt-3">
              {currentStep.value ? <ProtectedOtp
                  value={currentStep.value}
                  className="gap-2 sm:gap-3"
                  digitClassName="h-14 w-14 rounded-md border-2 text-2xl sm:h-16 sm:w-16"
                  containerClassName="inline-block"
                /> : <p className="max-w-md rounded-xl border border-white/20 bg-white/10 p-3 text-sm font-medium text-white">{unavailableMessage}</p>}
            </div>
          </div>
          <button
            type="button"
            disabled={!currentStep.value}
            onClick={() => currentStep.value && navigator.clipboard?.writeText(currentStep.value)}
            className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-50"
          >Copy</button>
        </div>

        <p className="mt-4 text-sm text-white/80">{currentStep.detail}</p>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {otpSteps.map((step, index) => (
            <button
              key={step.label}
              type="button"
              onClick={() => setActiveStep(index)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                index === activeStep
                  ? 'bg-brand-primary text-white shadow-sm shadow-brand-border'
                  : 'bg-slate-50 text-slate-500 hover:bg-brand-soft hover:text-brand-primary'
              }`}
            >
              {step.label}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-[24px] bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Status</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{currentStep.value ? 'Ready for handoff' : unavailableMessage}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${currentStep.value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {currentStep.value ? 'Active' : 'Unavailable'}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Bag count</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{order?.items ?? 0} clothes</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Service</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{order?.service ?? 'No active order'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <h3 className="text-lg font-bold text-slate-900">How it works</h3>
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li>1. Present the pickup OTP when dropping off your clothes.</li>
            <li>2. Our team confirms the bag and marks it as received.</li>
            <li>3. After payment, the delivery OTP is generated for collection.</li>
          </ol>
        </div>

        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5">
          <h3 className="text-lg font-bold text-slate-900">Need help?</h3>
          <p className="mt-3 text-sm text-slate-600">
            If the code is not working, contact support or ask a staff member to verify the order manually.
          </p>
          <a href="mailto:support@qaffy.app" className="mt-5 inline-block rounded-full border border-brand-border bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-primary">Contact support</a>
        </div>
      </section>
    </div>
  )
}
