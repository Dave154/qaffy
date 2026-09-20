const PAYSTACK_PERCENTAGE_FEE = 0.015
const PAYSTACK_FIXED_FEE = 100
const PAYSTACK_FIXED_FEE_THRESHOLD = 2500
const PAYSTACK_FEE_CAP = 2000

export function calculatePaystackFee(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  const percentageFee = amount * PAYSTACK_PERCENTAGE_FEE
  const fixedFee = amount < PAYSTACK_FIXED_FEE_THRESHOLD ? 0 : PAYSTACK_FIXED_FEE
  return Math.min(Math.round((percentageFee + fixedFee) * 100) / 100, PAYSTACK_FEE_CAP)
}

export function calculatePaystackCharge(amount: number) {
  return Math.round((amount + calculatePaystackFee(amount)) * 100) / 100
}