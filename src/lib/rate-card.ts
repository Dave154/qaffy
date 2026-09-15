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

export function getRateValue(rate: RateCardRow | null | undefined, service: RateCardService, type: 'customer' | 'vendor' = 'customer') {
  const key = type === 'vendor'
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

export function getRateValueFromItem(item: { service: RateCardService; unit_price?: number | string | null }, rate: RateCardRow | null | undefined, type: 'customer' | 'vendor' = 'customer') {
  const configured = getRateValue(rate, item.service, type)
  return configured > 0 ? configured : Number(item.unit_price ?? 0)
}
