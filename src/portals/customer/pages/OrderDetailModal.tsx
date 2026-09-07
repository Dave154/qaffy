import type { CustomerOrder } from '../customer-store'
import NewOrder from './NewOrder'

type OrderDetailModalProps = {
  order: CustomerOrder
  onClose: () => void
}

export default function OrderDetailModal({ order, onClose }: OrderDetailModalProps) {
  return <NewOrder order={order} onClose={onClose} />
}
