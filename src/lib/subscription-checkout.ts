export type SubscriptionCheckoutState = 'legacy' | 'initializing' | 'ready' | 'failed' | 'completed'
export type PaystackPaymentStatus = 'success' | 'pending' | 'failed' | 'abandoned' | 'not_found' | null | undefined

export type PendingCheckoutAction = 'activate' | 'resume' | 'retry' | 'support' | 'wait'

export function getPendingCheckoutAction(
  checkoutState: SubscriptionCheckoutState,
  authorizationUrl: string | null,
  providerStatus: PaystackPaymentStatus,
): PendingCheckoutAction {
  if (providerStatus === 'success') return 'activate'
  if (providerStatus === 'failed' || providerStatus === 'abandoned') return 'retry'
  if (providerStatus === 'not_found') {
    if (authorizationUrl) return 'wait'
    if (checkoutState === 'legacy') return 'support'
    if (checkoutState === 'initializing') return 'retry'
    return 'wait'
  }
  if (providerStatus === 'pending') {
    if (authorizationUrl) return 'resume'
    if (checkoutState === 'initializing') return 'retry'
    if (checkoutState === 'legacy') return 'support'
  }
  return 'wait'
}
