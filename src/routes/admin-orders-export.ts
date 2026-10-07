import type { Route } from './+types/admin-orders-export'
import { loadAdminOrders } from '../lib/admin-orders.server'

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdminOrders(request)
}
