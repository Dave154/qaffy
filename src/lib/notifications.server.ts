import { sql } from './db.server'
import { sendCustomerPush, type PushPayload } from './push.server'

export function walletInvoicePaidNotification(amount: number, publicOrderNumber: string, orderId: string): PushPayload {
  const formattedAmount = `₦${amount.toLocaleString()}`
  return {
    title: 'Wallet payment successful',
    body: `${formattedAmount} has been deducted from your wallet for order ${publicOrderNumber}.`,
    details: [
      `Amount deducted: ${formattedAmount}`,
      `Order: ${publicOrderNumber}`,
      'Your order can continue to delivery.',
    ],
    url: `/orders?order=${encodeURIComponent(publicOrderNumber)}`,
    tag: `order:${orderId}:payment`,
  }
}

export async function sendAdminWalletTopUpNotification(customerId: string, amount: number, transactionId: string) {
  const formattedAmount = `₦${amount.toLocaleString()}`
  await sendCustomerNotification({
    eventKey: `wallet:admin-topup:${transactionId}`,
    customerId,
    notificationType: 'wallet_topup_confirmed',
    payload: {
      title: 'Wallet top-up received',
      body: `An admin added ${formattedAmount} to your wallet.`,
      details: [
        `Top-up amount: ${formattedAmount}`,
        'The credit was applied to any subscription debt and eligible unpaid invoices first.',
      ],
      url: '/transactions',
      tag: `wallet:admin-topup:${transactionId}`,
    },
  })
}

export async function sendWalletInvoicePaidNotifications(
  customerId: string,
  invoices: Array<{ invoiceId: string; orderId: string; publicOrderNumber: string; amount: number }>,
) {
  for (const invoice of invoices) {
    await sendCustomerNotification({
      eventKey: `invoice:${invoice.invoiceId}:paid`,
      customerId,
      notificationType: 'payment_confirmed',
      orderId: invoice.orderId,
      payload: walletInvoicePaidNotification(invoice.amount, invoice.publicOrderNumber, invoice.orderId),
    })
  }
}

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
