export type InvoicePaymentAllocation = {
  balanceType: 'one_off' | 'subscription' | 'promotional'
  amount: number
  referralRewardId: string | null
}

export class RefundAccountingError extends Error {}

function toCents(value: number) {
  return Math.round(value * 100)
}

export function getRefundAllocations(
  invoiceAmount: number,
  paymentMethod: 'wallet' | 'offline' | null,
  allocations: InvoicePaymentAllocation[],
): InvoicePaymentAllocation[] {
  if (!Number.isFinite(invoiceAmount) || invoiceAmount < 0) {
    throw new RefundAccountingError('The invoice amount is invalid, so this refund cannot be calculated.')
  }
  if (invoiceAmount === 0) return []
  if (paymentMethod === 'offline') {
    if (allocations.length > 0) {
      throw new RefundAccountingError('This offline-paid invoice has wallet allocations. Review its payment ledger before refunding.')
    }
    return [{ balanceType: 'one_off', amount: invoiceAmount, referralRewardId: null }]
  }
  if (allocations.length === 0) {
    throw new RefundAccountingError('The wallet payment source could not be verified. No refund was issued; review the invoice ledger.')
  }

  const valid = allocations.every(
    (allocation) =>
      Number.isFinite(allocation.amount) &&
      allocation.amount > 0 &&
      (allocation.balanceType === 'promotional' ? Boolean(allocation.referralRewardId) : allocation.referralRewardId === null),
  )
  const allocatedCents = allocations.reduce((total, allocation) => total + toCents(allocation.amount), 0)
  if (!valid || allocatedCents !== toCents(invoiceAmount)) {
    throw new RefundAccountingError('The wallet payment sources do not match the invoice total. Review the invoice ledger before refunding.')
  }

  return allocations
}

export function getRestoredRewardExpiry(
  expiresAt: string | Date,
  originalExpiryDays: number | null,
  now: Date,
): Date {
  const currentExpiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  if (!Number.isFinite(currentExpiry.getTime())) throw new RefundAccountingError('The promotional reward expiry is invalid.')
  if (currentExpiry.getTime() > now.getTime()) return currentExpiry
  if (!Number.isInteger(originalExpiryDays) || originalExpiryDays === null || originalExpiryDays <= 0) {
    throw new RefundAccountingError('The promotional reward’s original expiry terms are unavailable. Review this refund manually.')
  }
  return new Date(now.getTime() + originalExpiryDays * 24 * 60 * 60 * 1000)
}
