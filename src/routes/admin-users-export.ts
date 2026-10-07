import type { Route } from './+types/admin-users-export'
import { loadUsers } from '../lib/admin-users.server'

export async function loader({ request }: Route.LoaderArgs) {
  return loadUsers(request)
}
