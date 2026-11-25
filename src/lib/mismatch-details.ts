export type MismatchDetailLine = {
  itemId?: string
  category: string
  service: 'wash' | 'iron' | 'wash_iron'
  originalQuantity: number
  confirmedQuantity: number
  difference: number
  unitPrice: number
  extraAmount: number
}

export type SubscriptionBillingBreakdown = {
  coveredUnits: number
  subscriberAmount: number
  regularAmount: number
  items?: Array<{ itemId: string; creditsUsed: number }>
}

function parseJsonValue(value: unknown): unknown | null {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

function isMismatchDetailLine(value: unknown): value is MismatchDetailLine {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const line = value as Record<string, unknown>
  return (
    (line.itemId === undefined || typeof line.itemId === 'string') &&
    typeof line.category === 'string' &&
    (line.service === 'wash' || line.service === 'iron' || line.service === 'wash_iron') &&
    typeof line.originalQuantity === 'number' &&
    Number.isSafeInteger(line.originalQuantity) &&
    Number(line.originalQuantity) >= 0 &&
    typeof line.confirmedQuantity === 'number' &&
    Number.isSafeInteger(line.confirmedQuantity) &&
    Number(line.confirmedQuantity) >= 0 &&
    typeof line.difference === 'number' &&
    Number.isSafeInteger(line.difference) &&
    typeof line.unitPrice === 'number' &&
    Number.isFinite(line.unitPrice) &&
    Number(line.unitPrice) >= 0 &&
    typeof line.extraAmount === 'number' &&
    Number.isFinite(line.extraAmount) &&
    Number(line.extraAmount) >= 0
  )
}

export function normalizeMismatchDetails(value: unknown): MismatchDetailLine[] {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isMismatchDetailLine)
}

export function normalizeSubscriptionBillingBreakdown(value: unknown): SubscriptionBillingBreakdown | null {
  const parsed = parseJsonValue(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const breakdown = parsed as Record<string, unknown>
  if (
    !Number.isSafeInteger(breakdown.coveredUnits) ||
    typeof breakdown.coveredUnits !== 'number' ||
    Number(breakdown.coveredUnits) < 0 ||
    typeof breakdown.subscriberAmount !== 'number' ||
    !Number.isFinite(breakdown.subscriberAmount) ||
    Number(breakdown.subscriberAmount) < 0 ||
    typeof breakdown.regularAmount !== 'number' ||
    !Number.isFinite(breakdown.regularAmount) ||
    Number(breakdown.regularAmount) < 0
  ) {
    return null
  }
  const items = Array.isArray(breakdown.items)
    ? breakdown.items.filter(
        (item): item is { itemId: string; creditsUsed: number } =>
          typeof item === 'object' &&
          item !== null &&
          typeof item === 'object' &&
          typeof item.itemId === 'string' &&
          typeof item.creditsUsed === 'number' &&
          Number.isSafeInteger(item.creditsUsed) &&
          item.creditsUsed >= 0,
      )
    : undefined
  return {
    coveredUnits: Number(breakdown.coveredUnits),
    subscriberAmount: Number(breakdown.subscriberAmount),
    regularAmount: Number(breakdown.regularAmount),
    ...(items ? { items } : {}),
  }
}
