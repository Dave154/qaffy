import { createHmac, timingSafeEqual } from 'node:crypto'
import { data } from 'react-router'
import { sql } from '../lib/db.server'
import { activateSubscriptionFromPayment, creditWallet } from '../lib/wallet.server'
import { sendCustomerNotification } from '../lib/notifications.server'
import { processPaystackTransferWebhook } from '../lib/payouts.server'
import { TransferWebhookValidationError } from '../lib/payout-webhooks'

// Paystack calls this endpoint independently of the customer's browser.
export async function action({ request }: { request: Request }) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY
  if (!secretKey) return data({ ok: false, message: 'Paystack is not configured.' }, { status: 503 })

  const signature = request.headers.get('x-paystack-signature') ?? ''
  const rawBody = await request.text()
  const expectedSignature = createHmac('sha512', secretKey).update(rawBody).digest('hex')
  const signaturesMatch =
    signature.length === expectedSignature.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  if (!signaturesMatch) return data({ ok: false, message: 'Invalid webhook signature.' }, { status: 401 })

  let payload: { event?: string; data?: Record<string, unknown> }
  try {
    payload = JSON.parse(rawBody) as typeof payload
  } catch {
    return data({ ok: false, message: 'Invalid webhook payload.' }, { status: 400 })
  }

  if (payload.event?.startsWith('transfer.')) {
    try {
      const result = await processPaystackTransferWebhook(payload as Parameters<typeof processPaystackTransferWebhook>[0])
      return data(result.handled ? { ok: true, ...result } : { ok: true, ignored: true, reason: result.reason }, { status: 200 })
    } catch (error) {
      if (error instanceof TransferWebhookValidationError) {
        return data({ ok: false, message: error.message }, { status: 409 })
      }
      console.error('Paystack transfer webhook processing failed:', error)
      return data({ ok: false, message: 'Transfer status could not be recorded.' }, { status: 500 })
    }
  }

  const paymentData = payload.data
  const reference = typeof paymentData?.reference === 'string' ? paymentData.reference : ''
  if (payload.event !== 'charge.success' || paymentData?.status !== 'success' || !reference) {
    return data({ ok: true, ignored: true }, { status: 200 })
  }

  const amountInKobo = Number(paymentData.amount ?? 0)
  const [payment] = await sql`
    select customer_id, amount, status, plan_id
    from payments
    where reference = ${reference}
      and provider = 'paystack'
    limit 1
  `

  if (!payment) return data({ ok: false, message: 'Payment reference was not found.' }, { status: 404 })
  if (Number(payment.amount) * 100 !== amountInKobo) return data({ ok: false, message: 'Payment amount does not match.' }, { status: 409 })
  if (payment.status === 'success') {
    if (payment.plan_id) {
      const activation = await activateSubscriptionFromPayment(payment.customer_id, reference)
      if (!activation.alreadyActivated)
        await sendCustomerNotification({
          eventKey: `subscription:${activation.subscriptionId}:activated`,
          customerId: payment.customer_id,
          notificationType: 'subscription_activated',
          subscriptionId: activation.subscriptionId,
          payload: {
            title: 'Plan activated',
            body: `Your ${activation.planName} plan is now active.`,
            details: [`Plan: ${activation.planName}`, 'Your subscription benefits are now available.'],
            url: '/plans',
            tag: `subscription:${activation.subscriptionId}`,
          },
        })
    }
    return data({ ok: true, alreadyProcessed: true }, { status: 200 })
  }

  if (payment.plan_id) {
    await sql`
      update payments
      set status = 'success', succeeded_at = coalesce(succeeded_at, now())
      where reference = ${reference}
    `
    const activation = await activateSubscriptionFromPayment(payment.customer_id, reference)
    if (!activation.alreadyActivated)
      await sendCustomerNotification({
        eventKey: `subscription:${activation.subscriptionId}:activated`,
        customerId: payment.customer_id,
        notificationType: 'subscription_activated',
        subscriptionId: activation.subscriptionId,
        payload: {
          title: 'Plan activated',
          body: `Your ${activation.planName} plan is now active.`,
          details: [`Plan: ${activation.planName}`, 'Your subscription benefits are now available.'],
          url: '/plans',
          tag: `subscription:${activation.subscriptionId}`,
        },
      })
  } else {
    const result = await creditWallet(payment.customer_id, 'one_off', Number(payment.amount), reference)
    await sendCustomerNotification({
      eventKey: `payment:${reference}:confirmed`,
      customerId: payment.customer_id,
      notificationType: 'wallet_topup_confirmed',
      payload: {
        title: 'Top-up successful',
        body: `Your ₦${Number(payment.amount).toLocaleString()} top-up is now available.`,
        details: [`Amount added: ₦${Number(payment.amount).toLocaleString()}`, `Reference: ${reference}`],
        url: '/transactions',
        tag: `payment:${reference}`,
      },
    })
    if (result.cashbackAmount > 0) {
      await sendCustomerNotification({
        eventKey: `payment:${reference}:cashback`,
        customerId: payment.customer_id,
        notificationType: 'cashback_earned',
        payload: {
          title: 'Cashback credited',
          body: `You earned ₦${Number(result.cashbackAmount).toLocaleString()} cashback on this top-up.`,
          details: [`Top-up: ₦${Number(payment.amount).toLocaleString()}`, `Cashback earned: ₦${Number(result.cashbackAmount).toLocaleString()}`],
          url: '/transactions',
          tag: `payment:${reference}:cashback`,
        },
      })
    }
    for (const invoice of result.settledInvoices) {
      await sendCustomerNotification({
        eventKey: `invoice:${invoice.invoiceId}:paid`,
        customerId: payment.customer_id,
        notificationType: 'payment_confirmed',
        orderId: invoice.orderId,
        payload: {
          title: 'Payment confirmed',
          body: `Your invoice for ${invoice.publicOrderNumber} has been paid.`,
          details: [`Order: ${invoice.publicOrderNumber}`, 'The invoice is fully paid.', 'Your order can continue to delivery.'],
          url: `/orders?order=${encodeURIComponent(invoice.publicOrderNumber)}`,
          tag: `order:${invoice.orderId}:payment`,
        },
      })
    }
  }
  return data({ ok: true }, { status: 200 })
}

export async function loader() {
  return data({ ok: false, message: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST' } })
}
