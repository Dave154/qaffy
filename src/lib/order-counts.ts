export type OrderCountItem = {
  id: string
  name: string
  service: 'wash' | 'iron' | 'wash_iron'
  quantity: number
  confirmedQuantity: number | null
}

type MismatchCountLine = {
  itemId?: string
  category: string
  service: OrderCountItem['service']
  confirmedQuantity: number
}

export function getInitialReceivedCounts(
  items: OrderCountItem[],
  mismatches: Array<{ id: string; lines: unknown }>,
  confirmedCount: number | null,
): Record<string, number | undefined> {
  const normalizeLines = (value: unknown): MismatchCountLine[] => {
    let parsedValue = value
    if (typeof parsedValue === 'string') {
      try {
        parsedValue = JSON.parse(parsedValue)
      } catch {
        return []
      }
    }
    if (!Array.isArray(parsedValue)) return []
    return parsedValue.filter(
      (line): line is MismatchCountLine =>
        typeof line === 'object' &&
        line !== null &&
        typeof line.category === 'string' &&
        (line.service === 'wash' || line.service === 'iron' || line.service === 'wash_iron') &&
        Number.isSafeInteger(line.confirmedQuantity) &&
        line.confirmedQuantity >= 0,
    )
  }

  const confirmedByItemId = new Map<string, number>()
  const usedLines = new Set<string>()

  for (const mismatch of mismatches) {
    normalizeLines(mismatch.lines).forEach((line, index) => {
      if (!line.itemId) return
      confirmedByItemId.set(line.itemId, line.confirmedQuantity)
      usedLines.add(`${mismatch.id}:${index}`)
    })
  }

  for (const item of items) {
    if (item.confirmedQuantity !== null || confirmedByItemId.has(item.id)) continue
    for (const mismatch of mismatches) {
      const lines = normalizeLines(mismatch.lines)
      const matchingLine = lines.findIndex(
        (line, index) =>
          !usedLines.has(`${mismatch.id}:${index}`) &&
          line.category === item.name &&
          line.service === item.service,
      )
      if (matchingLine < 0) continue
      confirmedByItemId.set(item.id, lines[matchingLine].confirmedQuantity)
      usedLines.add(`${mismatch.id}:${matchingLine}`)
      break
    }
  }

  const counts = Object.fromEntries(
    items.map((item) => [
      item.id,
      item.confirmedQuantity ?? confirmedByItemId.get(item.id) ?? (confirmedCount !== null ? item.quantity : undefined),
    ]),
  )
  const inferredTotal = Object.values(counts).reduce<number>((total, quantity) => total + (quantity ?? 0), 0)
  if (confirmedCount !== null && inferredTotal !== confirmedCount) {
    return Object.fromEntries(
      items.map((item) => [
        item.id,
        item.confirmedQuantity ?? (confirmedByItemId.has(item.id) ? confirmedByItemId.get(item.id) : undefined),
      ]),
    )
  }
  return counts
}
