export type RateCardService = 'wash' | 'iron' | 'wash_iron'

export type RateCardRow = Partial<{
  wash_price: number | string | null
  iron_price: number | string | null
  wash_iron_price: number | string | null
  vendor_wash_price: number | string | null
  vendor_iron_price: number | string | null
  vendor_wash_iron_price: number | string | null
  subscription_units: number | string | null
}>

export type SettlementCandidateOrder = {
  id: string
  vendor_id: string
  status: string
  clothes_count_vendor: number | null
  invoice_status: string | null
}

export type SettlementCandidateItem = {
  id: string
  order_id: string
  category_id: string
  confirmed_quantity: number | null
  service: RateCardService
  unit_price: number | string | null
}

export type SettlementVendorPreview = {
  vendorId: string
  vendorName: string
  orderIds: string[]
  orderCount: number
  amount: number
  items: Array<{
    orderItemId: string
    confirmedQuantity: number
    vendorUnitPrice: number
    amount: number
  }>
  eligible: boolean
  reason: string | null
}

export function getRateValue(rate: RateCardRow | null | undefined, service: RateCardService, type: 'customer' | 'vendor' = 'customer') {
  const key =
    type === 'vendor'
      ? service === 'wash'
        ? 'vendor_wash_price'
        : service === 'iron'
          ? 'vendor_iron_price'
          : 'vendor_wash_iron_price'
      : service === 'wash'
        ? 'wash_price'
        : service === 'iron'
          ? 'iron_price'
          : 'wash_iron_price'

  return Number(rate?.[key as keyof RateCardRow] ?? 0)
}

export function getRateValueFromItem(
  item: { service: RateCardService; unit_price?: number | string | null },
  rate: RateCardRow | null | undefined,
  type: 'customer' | 'vendor' = 'customer',
) {
  const configured = getRateValue(rate, item.service, type)
  return type === 'vendor' || configured > 0 ? configured : Number(item.unit_price ?? 0)
}

export function buildSettlementVendorPreviews(
  vendors: Array<{ vendorId: string; vendorName: string; payoutAccountReady?: boolean }>,
  orders: SettlementCandidateOrder[],
  items: SettlementCandidateItem[],
  rates: Array<RateCardRow & { category_id: string }>,
  alreadySettledOrderIds: Iterable<string>,
): SettlementVendorPreview[] {
  const rateByCategory = new Map(rates.map((rate) => [rate.category_id, rate]))
  const settledOrderIds = new Set(alreadySettledOrderIds)

  return vendors.map((vendor) => {
    const eligibleOrders = orders.filter(
      (order) =>
        order.vendor_id === vendor.vendorId &&
        order.status !== 'cancelled' &&
        order.clothes_count_vendor !== null &&
        order.invoice_status === 'paid' &&
        !settledOrderIds.has(order.id),
    )
    const orderIds = eligibleOrders.map((order) => order.id)
    const eligibleOrderIds = new Set(orderIds)
    const snapshots = items
      .filter((item) => eligibleOrderIds.has(item.order_id) && item.confirmed_quantity !== null)
      .map((item) => {
        const vendorUnitPrice = getRateValueFromItem(item, rateByCategory.get(item.category_id), 'vendor')
        const confirmedQuantity = Number(item.confirmed_quantity)
        return {
          orderItemId: item.id,
          confirmedQuantity,
          vendorUnitPrice,
          amount: vendorUnitPrice * confirmedQuantity,
        }
      })
    const amount = snapshots.reduce((sum, item) => sum + item.amount, 0)
    const payoutAccountReady = vendor.payoutAccountReady !== false
    const eligible = payoutAccountReady && orderIds.length > 0 && Number.isFinite(amount) && amount > 0

    return {
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      orderIds,
      orderCount: orderIds.length,
      amount,
      items: snapshots,
      eligible,
      reason: eligible
        ? null
        : !payoutAccountReady
          ? 'Verify the vendor payout account before creating a settlement.'
          : orderIds.length === 0
            ? 'No paid, payable orders are available in this period.'
            : 'The payable amount must be greater than zero.',
    }
  })
}
