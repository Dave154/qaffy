export type PlanPaymentRevenueRow = {
  amount: number | string
  status: string
  plan_id: string | null
  succeeded_at?: string | null
}

export function successfulPlanPayments<T extends PlanPaymentRevenueRow>(payments: readonly T[]): T[] {
  return payments.filter((payment) => payment.status === 'success' && payment.plan_id !== null)
}

export function sumSuccessfulPlanPayments(payments: readonly PlanPaymentRevenueRow[]) {
  return successfulPlanPayments(payments).reduce((total, payment) => total + Number(payment.amount), 0)
}
