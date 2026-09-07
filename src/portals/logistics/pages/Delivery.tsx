import { useState } from 'react'

const stats = [
  { label: 'Collected today', value: '0', accent: 'bg-violet-100 text-violet-700' },
  { label: 'Delivered', value: '0', accent: 'bg-emerald-100 text-emerald-700' },
]

export default function Delivery() {
  const [otp, setOtp] = useState('')
  const [message, setMessage] = useState('')

  const confirmDelivery = () => {
    setMessage(otp.trim() ? 'No delivery was found for that OTP.' : 'Enter a customer OTP to search.')
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        {stats.map((item) => (
          <div key={item.label} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100">
            <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.accent}`}>
              {item.label}
            </div>
            <p className="mt-4 text-3xl font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 md:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Search OTP</h2>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Delivery</span>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Customer OTP</span>
          <input
            type="text"
            placeholder="Enter OTP"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 placeholder:text-slate-400"
            onChange={(event) => setOtp(event.target.value)}
            value={otp}
          />
        </label>

        <div className="mt-4 rounded-[22px] bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Customer</p>
          <p className="mt-2 text-lg font-bold text-slate-900">No customer selected</p>
          <p className="mt-1 text-sm text-slate-500">Search with a valid delivery OTP.</p>
        </div>

        {message && <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}
        <button type="button" onClick={confirmDelivery} className="mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-200">
          Confirm delivery
        </button>
      </div>
    </div>
  )
}
