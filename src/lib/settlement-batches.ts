import { buildSettlementVendorPreviews } from './rate-card.ts'
import type { RateCardRow, SettlementCandidateItem, SettlementCandidateOrder } from './rate-card.ts'

export type BulkSettlementInput = {
  vendorIds: string[]
  periodStart: string
  periodEnd: string
  adminProfileId: string
}

export type BulkSettlementRepository = {
  getApprovedVendor(vendorId: string): Promise<{ id: string; businessName: string; payoutAccountReady: boolean } | null>
  getPaidUnsettledOrders(vendorId: string, periodStart: string, periodEnd: string): Promise<SettlementCandidateOrder[]>
  getOrderItems(orderIds: string[]): Promise<SettlementCandidateItem[]>
  getRates(): Promise<Array<RateCardRow & { category_id: string }>>
  createSettlement(input: { vendorId: string; periodStart: string; periodEnd: string; amount: number }): Promise<string>
  linkOrder(settlementId: string, orderId: string): Promise<void>
  saveItemSnapshot(
    settlementId: string,
    item: { orderItemId: string; confirmedQuantity: number; vendorUnitPrice: number; amount: number },
  ): Promise<void>
  writeAudit(input: {
    adminProfileId: string
    settlementId: string
    vendorId: string
    orderCount: number
    amount: number
    periodStart: string
    periodEnd: string
  }): Promise<void>
}

export type BulkSettlementResult = {
  settlements: Array<{ settlementId: string; vendorId: string; vendorName: string; orderCount: number; amount: number }>
  totalAmount: number
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function createBulkSettlementBatches(
  input: BulkSettlementInput,
  runInTransaction: (work: (repository: BulkSettlementRepository) => Promise<BulkSettlementResult>) => Promise<BulkSettlementResult>,
): Promise<BulkSettlementResult> {
  const vendorIds = [...new Set(input.vendorIds)]
  if (vendorIds.length === 0 || vendorIds.length > 100 || vendorIds.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error('Select between 1 and 100 valid vendors for settlement.')
  }
  if (!isCalendarDate(input.periodStart) || !isCalendarDate(input.periodEnd) || input.periodStart > input.periodEnd) {
    throw new Error('Choose a valid settlement date range.')
  }

  return runInTransaction(async (repository) => {
    const settlements: BulkSettlementResult['settlements'] = []
    const rates = await repository.getRates()

    for (const vendorId of vendorIds) {
      const vendor = await repository.getApprovedVendor(vendorId)
      if (!vendor) throw new Error('A selected vendor is no longer approved. Refresh the preview and try again.')
      if (!vendor.payoutAccountReady) {
        throw new Error(`${vendor.businessName}: Payout account is not ready. Verify the vendor account before creating a settlement.`)
      }

      const orders = await repository.getPaidUnsettledOrders(vendorId, input.periodStart, input.periodEnd)
      const items = await repository.getOrderItems(orders.map((order) => order.id))
      const [preview] = buildSettlementVendorPreviews([{ vendorId, vendorName: vendor.businessName }], orders, items, rates, [])
      if (!preview?.eligible) {
        throw new Error(
          `${vendor.businessName}: ${preview?.reason ?? 'No payable orders are available.'} Refresh the preview and try again.`,
        )
      }

      const settlementId = await repository.createSettlement({
        vendorId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        amount: preview.amount,
      })
      for (const orderId of preview.orderIds) await repository.linkOrder(settlementId, orderId)
      for (const item of preview.items) await repository.saveItemSnapshot(settlementId, item)
      await repository.writeAudit({
        adminProfileId: input.adminProfileId,
        settlementId,
        vendorId,
        orderCount: preview.orderCount,
        amount: preview.amount,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      })
      settlements.push({
        settlementId,
        vendorId,
        vendorName: vendor.businessName,
        orderCount: preview.orderCount,
        amount: preview.amount,
      })
    }

    return {
      settlements,
      totalAmount: settlements.reduce((sum, settlement) => sum + settlement.amount, 0),
    }
  })
}
