import { LockKeyhole } from 'lucide-react'
import ProtectedOtp from './ProtectedOtp'

type DeliveryOtpPaywallProps = {
  amount: number
  walletBalance: number
  onClick: () => void
}

export default function DeliveryOtpPaywall({ amount, walletBalance, onClick }: DeliveryOtpPaywallProps) {
  const topUpAmount = Math.max(0, amount - walletBalance)

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold capitalize tracking-[0.16em] text-brand-primary">Delivery OTP</p>
      <button
        type="button"
        onClick={onClick}
        aria-label={
          topUpAmount > 0
            ? `Top up ₦${topUpAmount.toLocaleString()} to reveal your delivery OTP`
            : 'Your wallet balance covers this invoice'
        }
        className="relative mt-2 inline-flex h-11 w-[208px] items-center justify-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
      >
        <span aria-hidden="true" className="pointer-events-none">
          <ProtectedOtp masked />
        </span>
        <span className="absolute inset-x-0 top-[4.5%] bottom-[4.5%] flex items-center justify-center gap-1.5 bg-white px-2 text-xs font-bold text-brand-primary backdrop-blur-md drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)] [-webkit-mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]">
          <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {topUpAmount > 0 ? `Top up ₦${topUpAmount.toLocaleString()} to see` : 'Balance covers invoice'}
          </span>
        </span>
      </button>
    </div>
  )
}