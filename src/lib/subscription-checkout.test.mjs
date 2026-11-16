import assert from 'node:assert/strict'
import test from 'node:test'
import { getPendingCheckoutAction } from './subscription-checkout.ts'

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
