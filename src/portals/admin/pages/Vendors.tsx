import type { Route } from './+types/Vendors'
import { PartnerPage, action, loader } from './Partners'

export { action, loader }

export default function Vendors(_props: Route.ComponentProps) {
  return <PartnerPage type="vendor" />
}