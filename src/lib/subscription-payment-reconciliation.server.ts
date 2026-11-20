import { sendCustomerNotification } from './notifications.server'
import { sql } from './db.server'
import { getSafePendingCheckoutResolution, type PaystackPaymentStatus } from './subscription-checkout'
import { activateSubscriptionFromPayment } from './wallet.server'

type SubscriptionPaymentRow = {
  id: string
  customer_id: string
  reference: string
  amount: number | string
  status: 'pending' | 'success'
  subscription_id: string | null
  authorization_url: string | null
  subscription_checkout_state: 'legacy' | 'initializing' | 'ready' | 'failed' | 'completed'
  created_at: Date | string
  subscription_reconciliation_checked_at: Date | string | null
  subscription_reconciliation_result: string | null
}

type PaystackVerification = {
  status?: boolean
  message?: string
  data?: {
    status?: string
    reference?: string
    amount?: number
    currency?: string
  }
}

export type SubscriptionPaymentReconciliation =
  | { outcome: 'activated'; reference: string }
  | { outcome: 'failed'; reference: string; providerStatus: 'failed' | 'abandoned' | 'not_found' }
  | {
      outcome: 'pending' | 'unavailable' | 'mismatch' | 'missing' | 'recently_checked'
      reference: string
      message: string
      providerStatus?: string
    }

const reconciliationRetryIntervalMs = 15 * 60 * 1000
const reconciliationInProgressTimeoutMs = 2 * 60 * 1000

async function recordReconciliationResult(paymentId: string, result: string) {
  await sql`
    update payments
    set subscription_reconciliation_result = ${result}
    where id = ${paymentId}
  `
}

async function notifySubscriptionActivation(
  customerId: string,
  activation: Awaited<ReturnType<typeof activateSubscriptionFromPayment>>,
) {
  if (activation.alreadyActivated) return

  await sendCustomerNotification({
    eventKey: activation.scheduled
      ? `subscription:${activation.subscriptionId}:scheduled`
      : `subscription:${activation.subscriptionId}:activated`,
    customerId,
    notificationType: activation.scheduled ? 'subscription_renewal_scheduled' : 'subscription_activated',
    subscriptionId: activation.subscriptionId,
    payload: {
      title: activation.scheduled ? 'Plan renewal scheduled' : 'Plan activated',
      body: activation.scheduled
        ? `Your ${activation.planName} renewal is scheduled to start on ${activation.startDate}.`
        : `Your ${activation.planName} plan is now active.`,
      details: activation.scheduled
        ? [`Plan: ${activation.planName}`, `Starts: ${activation.startDate}`, `Ends: ${activation.endDate}`]
        : [`Plan: ${activation.planName}`, 'Your subscription benefits are now available.'],
      url: '/plans',
      tag: `subscription:${activation.subscriptionId}`,
    },
  })
}

export async function reconcilePaystackSubscriptionPayment(
  customerId: string,
  reference: string,
  force = false,
): Promise<SubscriptionPaymentReconciliation> {
  const claim = await sql.begin(async (tx) => {
    const [payment] = await tx<SubscriptionPaymentRow[]>`
      select id, customer_id, reference, amount, status, subscription_id, authorization_url,
        subscription_checkout_state, created_at, subscription_reconciliation_checked_at,
        subscription_reconciliation_result
      from payments
      where customer_id = ${customerId}
        and reference = ${reference}
        and provider = 'paystack'
        and plan_id is not null
        and status in ('pending', 'success')
      limit 1
      for update
    `
    if (!payment) return { kind: 'missing' as const }

    if (
      payment.subscription_reconciliation_result === 'checking' &&
      payment.subscription_reconciliation_checked_at &&
      Date.now() - new Date(payment.subscription_reconciliation_checked_at).getTime() < reconciliationInProgressTimeoutMs
    ) {
      return { kind: 'recently_checked' as const, payment }
    }

    if (
      !force &&
      (payment.status === 'pending' || (payment.status === 'success' && !payment.subscription_id)) &&
      payment.subscription_reconciliation_checked_at &&
      Date.now() - new Date(payment.subscription_reconciliation_checked_at).getTime() < reconciliationRetryIntervalMs
    ) {
      return { kind: 'recently_checked' as const, payment }
    }

    const [claimed] = await tx`
      update payments
      set subscription_reconciliation_checked_at = now(),
          subscription_reconciliation_attempts = subscription_reconciliation_attempts + 1,
          subscription_reconciliation_result = 'checking'
      where id = ${payment.id}
        and status in ('pending', 'success')
      returning id
    `
    return claimed ? { kind: 'claimed' as const, payment } : { kind: 'missing' as const }
  })

  if (claim.kind === 'missing') {
    return {
      outcome: 'missing',
      reference,
      message: 'No matching subscription payment was found.',
    }
  }
  if (claim.kind === 'recently_checked') {
    return {
      outcome: 'recently_checked',
      reference,
      message: 'This checkout was checked recently. Wait briefly, then check its status again.',
    }
  }

  const payment = claim.payment
  const secretKey = process.env.PAYSTACK_SECRET_KEY
  if (!secretKey) {
    await recordReconciliationResult(payment.id, 'unavailable')
    return {
      outcome: 'unavailable',
      reference,
      message: 'Paystack is not configured, so the checkout cannot be reconciled.',
    }
  }

  let response: Response
  let verification: PaystackVerification | null = null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: controller.signal,
    })
    if (response.status !== 404) verification = (await response.json()) as PaystackVerification
  } catch (error) {
    console.error('[subscription-payment-reconciliation] Paystack verification request failed', { reference, error })
    await recordReconciliationResult(payment.id, 'unavailable')
    return {
      outcome: 'unavailable',
      reference,
      message: 'Paystack could not be reached. The pending checkout remains blocked until its status can be confirmed.',
    }
  } finally {
    clearTimeout(timeout)
  }

  if (response.status !== 404 && (!response.ok || verification?.status !== true)) {
    console.error('[subscription-payment-reconciliation] Paystack returned an unsuccessful verification response', {
      reference,
      message: verification?.message,
      status: response.status,
    })
    await recordReconciliationResult(payment.id, 'unavailable')
    return {
      outcome: 'unavailable',
      reference,
      message: 'Paystack could not confirm the checkout. Its pending status has been preserved.',
    }
  }

  const providerStatus: PaystackPaymentStatus =
    response.status === 404
      ? 'not_found'
      : verification?.data?.status === 'success' ||
          verification?.data?.status === 'pending' ||
          verification?.data?.status === 'failed' ||
          verification?.data?.status === 'abandoned'
        ? verification.data.status
        : null
  const verifiedPayment = verification?.data

  if (
    response.status !== 404 &&
    (!verifiedPayment ||
      verifiedPayment.reference !== reference ||
      Number(verifiedPayment.amount) !== Number(payment.amount) * 100 ||
      verifiedPayment.currency !== 'NGN')
  ) {
    await recordReconciliationResult(payment.id, 'mismatch')
    return {
      outcome: 'mismatch',
      reference,
      providerStatus: providerStatus ?? undefined,
      message: 'Paystack’s transaction details do not match this saved payment. It remains blocked for review.',
    }
  }

  const resolution = getSafePendingCheckoutResolution(
    payment.subscription_checkout_state,
    payment.authorization_url,
    providerStatus,
    payment.created_at,
  )

  if (resolution === 'activate') {
    const activation = await activateSubscriptionFromPayment(customerId, reference, true)
    await recordReconciliationResult(payment.id, 'success')
    await notifySubscriptionActivation(customerId, activation)
    return { outcome: 'activated', reference }
  }

  if (
    resolution === 'fail' &&
    (providerStatus === 'failed' || providerStatus === 'abandoned' || providerStatus === 'not_found')
  ) {
    const terminalStatus = providerStatus
    if (payment.status === 'success') {
      await recordReconciliationResult(payment.id, 'mismatch')
      return {
        outcome: 'mismatch',
        reference,
        providerStatus: terminalStatus,
        message: 'The saved payment is successful but Paystack reports a terminal failure. It remains blocked for review.',
      }
    }
    const [failedPayment] = await sql`
      update payments
      set status = 'failed',
          subscription_checkout_state = 'failed',
          subscription_reconciliation_result = ${terminalStatus}
      where id = ${payment.id}
        and status = 'pending'
      returning id
    `
    if (failedPayment) return { outcome: 'failed', reference, providerStatus: terminalStatus }
  }

  const lastResult = providerStatus ?? 'unknown'
  await recordReconciliationResult(payment.id, lastResult)
  return {
    outcome: 'pending',
    reference,
    providerStatus: providerStatus ?? undefined,
    message:
      providerStatus === 'not_found'
        ? 'Paystack could not find this checkout, but it has a saved payment link or legacy state. It remains blocked for review.'
        : providerStatus === 'pending'
          ? 'Paystack still reports this checkout as pending. It remains blocked to prevent a duplicate subscription.'
          : 'The checkout status could not be conclusively resolved. It remains blocked for review.',
  }
}

export async function reconcileCustomerSubscriptionPayments(customerId: string) {
  const payments = await sql<Array<{ reference: string }>>`
    select reference
    from payments
    where customer_id = ${customerId}
      and plan_id is not null
      and (
        status = 'pending'
        or (status = 'success' and subscription_id is null)
      )
    order by created_at asc
  `

  for (const payment of payments) {
    const result = await reconcilePaystackSubscriptionPayment(customerId, payment.reference, true)
    if (result.outcome === 'activated') return result
    if (result.outcome === 'missing') continue
    if (result.outcome !== 'failed') return result
  }

  return { outcome: 'clear' as const }
}

export async function reconcileStaleSubscriptionPayments(limit = 50) {
  const payments = await sql<Array<{ customer_id: string; reference: string }>>`
    select customer_id, reference
    from payments
    where plan_id is not null
      and (
        status = 'pending'
        or (status = 'success' and subscription_id is null)
      )
      and created_at <= now() - interval '15 minutes'
      and (
        subscription_reconciliation_checked_at is null
        or subscription_reconciliation_checked_at <= now() - interval '15 minutes'
      )
    order by created_at asc
    limit ${limit}
  `

  const results: SubscriptionPaymentReconciliation[] = []
  for (const payment of payments) {
    try {
      results.push(await reconcilePaystackSubscriptionPayment(payment.customer_id, payment.reference))
    } catch (error) {
      console.error('[subscription-payment-reconciliation] Scheduled reconciliation failed', {
        reference: payment.reference,
        error,
      })
      results.push({
        outcome: 'unavailable',
        reference: payment.reference,
        message: 'The checkout could not be reconciled.',
      })
    }
  }
  return results
}
