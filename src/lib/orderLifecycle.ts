export type OrderLifecycleStatus =
  | 'pending_pickup'
  | 'picked_up'
  | 'at_vendor'
  | 'invoiced'
  | 'paid'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'

export function isReadyForDispatch(status: OrderLifecycleStatus) {
  return status === 'paid'
}

export function isReadyForFinalDelivery(status: OrderLifecycleStatus) {
  return status === 'out_for_delivery'
}

export function getDeliveryAction(status: OrderLifecycleStatus) {
  if (status === 'out_for_delivery') return 'final_delivery'
  return 'delivery'
}
