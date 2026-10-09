import { LockKeyhole } from 'lucide-react'
import { useFetcher } from 'react-router'
import ProtectedOtp from './ProtectedOtp'

type DeliveryOtpPaywallProps = {
  amount: number
  walletBalance: number
  invoiceId?: string
  onClick: () => void
}

export default function DeliveryOtpPaywall({ amount, walletBalance, invoiceId, onClick }: DeliveryOtpPaywallProps) {
  const paymentFetcher = useFetcher<{ ok: boolean; message?: string }>()
  const topUpAmount = Math.max(0, amount - walletBalance)
  const canPayFromWallet = topUpAmount === 0
  const isProcessing = paymentFetcher.state !== 'idle'
  const isPaid = paymentFetcher.data?.ok === true
  const label = isProcessing
    ? 'Processing payment...'
    : isPaid
      ? 'Payment received'
      : canPayFromWallet
        ? `Pay ₦${amount.toLocaleString()}`
        : `Top up ₦${topUpAmount.toLocaleString()} to see`
  const buttonLabel = canPayFromWallet && !invoiceId ? 'Loading invoice...' : label

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold capitalize tracking-[0.16em] text-brand-primary">Delivery OTP</p>
      {canPayFromWallet && invoiceId ? (
        <paymentFetcher.Form
          method="post"
          action="/invoice"
          className="mt-2"
        >
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <button
            type="submit"
            disabled={isProcessing || isPaid}
            aria-label={buttonLabel}
            className="relative inline-flex h-11 w-[208px] items-center justify-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
          >
            <span aria-hidden="true" className="pointer-events-none">
              <ProtectedOtp masked />
            </span>
            <span className="absolute inset-x-0 top-[4.5%] bottom-[4.5%] flex items-center justify-center gap-1.5 bg-white px-2 text-xs font-bold text-brand-primary backdrop-blur-md drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)] [-webkit-mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]">
              <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </span>
          </button>
          {paymentFetcher.data && !paymentFetcher.data.ok && (
            <p role="alert" className="mt-2 max-w-[208px] text-xs font-medium text-rose-700">
              {paymentFetcher.data.message ?? 'The invoice could not be paid.'}
            </p>
          )}
          {paymentFetcher.data?.message?.includes('wallet balance is too low') && (
            <button
              type="button"
              onClick={onClick}
              className="mt-2 inline-flex w-[208px] items-center justify-center rounded-xl border border-brand-primary px-3 py-2 text-xs font-semibold text-brand-primary transition hover:bg-white"
            >
              Top up wallet
            </button>
          )}
        </paymentFetcher.Form>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!canPayFromWallet) onClick()
          }}
          disabled={canPayFromWallet}
          aria-label={buttonLabel}
          className="relative mt-2 inline-flex h-11 w-[208px] items-center justify-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        >
          <span aria-hidden="true" className="pointer-events-none">
            <ProtectedOtp masked />
          </span>
          <span className="absolute inset-x-0 top-[4.5%] bottom-[4.5%] flex items-center justify-center gap-1.5 bg-white px-2 text-xs font-bold text-brand-primary backdrop-blur-md drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)] [-webkit-mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]">
            <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{buttonLabel}</span>
          </span>
        </button>
      )}
    </div>
  )
}