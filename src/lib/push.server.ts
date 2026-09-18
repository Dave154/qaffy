import webpush from 'web-push'
import { sql } from './db.server'

export type PushPayload = {
  title: string
  body: string
  url: string
  tag?: string
}

type StoredSubscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

let configured = false

function configureWebPush() {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export async function sendCustomerPush(customerId: string, payload: PushPayload) {
  if (!configureWebPush()) return

  const subscriptions = await sql<StoredSubscription[]>`
    select id, endpoint, p256dh, auth
    from push_subscriptions
    where customer_id = ${customerId}
  `

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload))
      await sql`
        update push_subscriptions
        set last_used_at = now()
        where id = ${subscription.id}
      `
    } catch (error) {
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined
      if (statusCode === 404 || statusCode === 410) {
        await sql`delete from push_subscriptions where id = ${subscription.id}`
        return
      }
      console.error('Customer push notification failed:', error)
    }
  }))
}
