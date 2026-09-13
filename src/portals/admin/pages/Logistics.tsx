import type { Route } from './+types/Logistics'
import { PartnerPage, action, loader } from './Partners'

export { action, loader }

export default function Logistics(_props: Route.ComponentProps) {
  return <PartnerPage type="logistics" />
}