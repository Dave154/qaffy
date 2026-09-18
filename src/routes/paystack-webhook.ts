import { createHmac, timingSafeEqual } from 'node:crypto'
import { data } from 'react-router'
import { sql } from '../lib/db.server'
import { activateSubscriptionFromPayment, creditWallet } from '../lib/wallet.server'
import { sendCustomerNotification } from '../lib/notifications.server'

// Paystack calls this endpoint independently of the customer's browser.
export async function action({ request }: { request: Request }) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY
  if (!secretKey) return data({ ok: false, message: 'Paystack is not configured.' }, { status: 503 })

  const signature = request.headers.get('x-paystack-signature') ?? ''
  const rawBody = await request.text()
  const expectedSignature = createHmac('sha512', secretKey).update(rawBody).digest('hex')
  const signaturesMatch = signature.length === expectedSignature.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  if (!signaturesMatch) return data({ ok: false, message: 'Invalid webhook signature.' }, { status: 401 })

  let payload: { event?: string; data?: { reference?: string; amount?: number; status?: string } }
  try {
    payload = JSON.parse(rawBody) as typeof payload
  } catch {
    return data({ ok: false, message: 'Invalid webhook payload.' }, { status: 400 })
  }

  if (payload.event !== 'charge.success' || payload.data?.status !== 'success' || !payload.data.reference) {
    return data({ ok: true, ignored: true }, { status: 200 })
  }

  const reference = payload.data.reference
  const amountInKobo = Number(payload.data.amount ?? 0)
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
      if (!activation.alreadyActivated) await sendCustomerNotification({ eventKey: `subscription:${activation.subscriptionId}:activated`, customerId: payment.customer_id, notificationType: 'subscription_activated', subscriptionId: activation.subscriptionId, payload: { title: 'Plan activated', body: `Your ${activation.planName} plan is now active.`, url: '/plans', tag: `subscription:${activation.subscriptionId}` } })
    }
    return data({ ok: true, alreadyProcessed: true }, { status: 200 })
  }

  if (payment.plan_id) {
    await sql`update payments set status = 'success' where reference = ${reference}`
    const activation = await activateSubscriptionFromPayment(payment.customer_id, reference)
    if (!activation.alreadyActivated) await sendCustomerNotification({ eventKey: `subscription:${activation.subscriptionId}:activated`, customerId: payment.customer_id, notificationType: 'subscription_activated', subscriptionId: activation.subscriptionId, payload: { title: 'Plan activated', body: `Your ${activation.planName} plan is now active.`, url: '/plans', tag: `subscription:${activation.subscriptionId}` } })
  } else {
    const result = await creditWallet(payment.customer_id, 'one_off', Number(payment.amount), reference)
    await sendCustomerNotification({ eventKey: `payment:${reference}:confirmed`, customerId: payment.customer_id, notificationType: 'wallet_topup_confirmed', payload: { title: 'Top-up successful', body: `Your ₦${Number(payment.amount).toLocaleString()} top-up is now available.`, url: '/transactions', tag: `payment:${reference}` } })
    for (const invoice of result.settledInvoices) {
      await sendCustomerNotification({ eventKey: `invoice:${invoice.invoiceId}:paid`, customerId: payment.customer_id, notificationType: 'payment_confirmed', orderId: invoice.orderId, payload: { title: 'Payment confirmed', body: `Your invoice for ${invoice.publicOrderNumber} has been paid.`, url: `/orders?order=${encodeURIComponent(invoice.publicOrderNumber)}`, tag: `order:${invoice.orderId}:payment` } })
    }
  }
  return data({ ok: true }, { status: 200 })
}

export async function loader() {
  return data({ ok: false, message: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST' } })
}
