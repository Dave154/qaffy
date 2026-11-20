import assert from 'node:assert/strict'
import test from 'node:test'
import { getPendingCheckoutAction, getSafePendingCheckoutResolution } from './subscription-checkout.ts'

test('resumes a pending Paystack checkout when its saved URL is available', () => {
  assert.equal(getPendingCheckoutAction('ready', 'https://checkout.paystack.com/example', 'pending'), 'resume')
})

test('retries an initialization that never exposed a checkout URL', () => {
  assert.equal(getPendingCheckoutAction('initializing', null, 'pending'), 'retry')
  assert.equal(getPendingCheckoutAction('initializing', null, 'not_found'), 'retry')
})

test('does not replace legacy checkouts without reconciling their provider status', () => {
  assert.equal(getPendingCheckoutAction('legacy', null, 'pending'), 'support')
  assert.equal(getPendingCheckoutAction('legacy', null, 'not_found'), 'support')
})

test('waits rather than guessing when a provider status cannot be reconciled', () => {
  assert.equal(getPendingCheckoutAction('ready', null, 'pending'), 'wait')
  assert.equal(getPendingCheckoutAction('ready', 'https://checkout.paystack.com/example', 'not_found'), 'wait')
  assert.equal(getPendingCheckoutAction('initializing', null, null), 'wait')
})

test('only releases a checkout after a definitive provider failure or an old missing initialization', () => {
  const now = new Date('2026-11-20T12:00:00.000Z')

  assert.equal(getSafePendingCheckoutResolution('ready', 'https://checkout.paystack.com/example', 'failed', now, now), 'fail')
  assert.equal(getSafePendingCheckoutResolution('ready', 'https://checkout.paystack.com/example', 'abandoned', now, now), 'fail')
  assert.equal(getSafePendingCheckoutResolution('initializing', null, 'not_found', '2026-11-20T11:44:00.000Z', now), 'fail')
  assert.equal(getSafePendingCheckoutResolution('initializing', null, 'not_found', '2026-11-20T11:55:00.000Z', now), 'wait')
  assert.equal(getSafePendingCheckoutResolution('ready', 'https://checkout.paystack.com/example', 'not_found', '2026-11-20T11:00:00.000Z', now), 'wait')
})
