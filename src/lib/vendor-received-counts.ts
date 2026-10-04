export function isValidVendorReceivedItems(items: readonly { itemId: string; quantity: number }[]) {
  return items.every(
    (item) => typeof item.itemId === 'string' && item.itemId.length > 0 && Number.isSafeInteger(item.quantity) && item.quantity >= 1,
  )
}