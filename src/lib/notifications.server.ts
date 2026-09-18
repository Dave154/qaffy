import { sql } from './db.server'
import { sendCustomerPush, type PushPayload } from './push.server'

type NotificationInput = {
  eventKey: string
  customerId: string
  notificationType: string
  payload: PushPayload
  orderId?: string
  subscriptionId?: string
}

export async function sendCustomerNotification(input: NotificationInput) {
  let event: { id: string } | undefined
  try {
    ;[event] = await sql`
      insert into notification_events (event_key, customer_id, notification_type, order_id, subscription_id, payload)
      values (${input.eventKey}, ${input.customerId}, ${input.notificationType}, ${input.orderId ?? null}, ${input.subscriptionId ?? null}, ${JSON.stringify(input.payload)}::jsonb)
      on conflict (event_key) do nothing
      returning id
    `
  } catch (error) {
    console.error('Customer notification event could not be recorded:', error)
    return { duplicate: false, sent: false }
  }
  if (!event) return { duplicate: true }

  try {
    await sendCustomerPush(input.customerId, input.payload)
    await sql`update notification_events set status = 'sent', sent_at = now() where id = ${event.id}`
    return { duplicate: false, sent: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push delivery failed'
    await sql`update notification_events set status = 'failed', error_message = ${message} where id = ${event.id}`
    console.error('Customer notification failed:', error)
    return { duplicate: false, sent: false }
  }
}
