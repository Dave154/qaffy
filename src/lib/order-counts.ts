import { normalizeMismatchDetails } from './mismatch-details'

export type OrderCountItem = {
  id: string
  name: string
  service: 'wash' | 'iron' | 'wash_iron'
  quantity: number
  confirmedQuantity: number | null
}

export function getInitialReceivedCounts(
  items: OrderCountItem[],
  mismatches: Array<{ id: string; lines: unknown }>,
  confirmedCount: number | null,
): Record<string, number | undefined> {
  const confirmedByItemId = new Map<string, number>()
  const usedLines = new Set<string>()

  for (const mismatch of mismatches) {
    normalizeMismatchDetails(mismatch.lines).forEach((line, index) => {
      if (!line.itemId) return
      confirmedByItemId.set(line.itemId, line.confirmedQuantity)
      usedLines.add(`${mismatch.id}:${index}`)
    })
  }

  for (const item of items) {
    if (item.confirmedQuantity !== null || confirmedByItemId.has(item.id)) continue
    for (const mismatch of mismatches) {
      const lines = normalizeMismatchDetails(mismatch.lines)
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
