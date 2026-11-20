import { data } from 'react-router'
import { reconcileStaleSubscriptionPayments } from '../lib/subscription-payment-reconciliation.server'

export async function loader({ request }: { request: Request }) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return data({ ok: false, message: 'Unauthorized.' }, { status: 401 })
  }

  const results = await reconcileStaleSubscriptionPayments()
  return data({
    ok: true,
    checked: results.length,
    activated: results.filter((result) => result.outcome === 'activated').length,
    failed: results.filter((result) => result.outcome === 'failed').length,
    unresolved: results.filter((result) => !['activated', 'failed'].includes(result.outcome)).length,
  })
}
