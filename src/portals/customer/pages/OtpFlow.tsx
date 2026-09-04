import { useMemo, useState } from 'react'

const otpSteps = [
  { label: 'Pickup OTP', detail: 'Share this when dropping off your bag', value: 'QF-2048' },
  { label: 'Delivery OTP', detail: 'Use this to collect your clean clothes', value: 'QF-4187' },
]

export default function OtpFlow() {
  const [activeStep, setActiveStep] = useState(0)

  const currentStep = useMemo(() => otpSteps[activeStep], [activeStep])

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Pickup and delivery OTP</h2>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">Order verified</span>
      </header>

      <section className="rounded-[28px] bg-gradient-to-br from-violet-600 via-violet-700 to-fuchsia-500 p-5 text-white shadow-lg shadow-violet-200 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-100">Current code</p>
            <h3 className="mt-3 text-4xl font-bold tracking-[0.24em]">{currentStep.value}</h3>
          </div>
          <button type="button" className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm">Copy</button>
        </div>

        <p className="mt-4 text-sm text-violet-100">{currentStep.detail}</p>
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
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                  : 'bg-slate-50 text-slate-500 hover:bg-violet-50 hover:text-violet-700'
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
              <p className="mt-2 text-lg font-bold text-slate-900">Ready for handoff</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Active</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Bag count</p>
              <p className="mt-2 text-xl font-bold text-slate-900">6 clothes</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Service</p>
              <p className="mt-2 text-xl font-bold text-slate-900">Wash + Iron</p>
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
          <button type="button" className="mt-5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700">Contact support</button>
        </div>
      </section>
    </div>
  )
}
