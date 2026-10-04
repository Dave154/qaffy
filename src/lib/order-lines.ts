import type { OrderLine } from '../portals/customer/customer-store'

export function addOrIncrementOrderLine(lines: readonly OrderLine[], incoming: OrderLine): OrderLine[] {
  const existingIndex = lines.findIndex(
    (line) => line.category.trim().toLowerCase() === incoming.category.trim().toLowerCase() && line.service === incoming.service,
  )
  if (existingIndex < 0) return [...lines, incoming]
  return lines.map((line, index) => (index === existingIndex ? { ...line, quantity: line.quantity + incoming.quantity } : line))
}