export type OrderLifecycleStatus =
  'pending_pickup' | 'picked_up' | 'at_vendor' | 'invoiced' | 'paid' | 'out_for_delivery' | 'delivered' | 'cancelled'

export type OrderInvoiceStatus = 'unpaid' | 'paid' | null | undefined

export function isReadyForDispatch(status: OrderLifecycleStatus, invoiceStatus: OrderInvoiceStatus) {
  return (status === 'paid' && invoiceStatus === 'paid') || (status === 'invoiced' && invoiceStatus === 'unpaid')
}

export function isReadyForFinalDelivery(status: OrderLifecycleStatus, invoiceStatus: OrderInvoiceStatus) {
  return status === 'out_for_delivery' && invoiceStatus === 'paid'
}

export function getDeliveryAction(status: OrderLifecycleStatus) {
  if (status === 'out_for_delivery') return 'final_delivery'
  return 'delivery'
}
