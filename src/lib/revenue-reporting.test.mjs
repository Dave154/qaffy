import assert from 'node:assert/strict'
import test from 'node:test'
import { successfulPlanPayments, sumSuccessfulPlanPayments } from './revenue-reporting.ts'

const payments = [
  { amount: '125000.00', status: 'success', plan_id: 'plan-a', succeeded_at: '2026-10-01T10:00:00Z' },
  { amount: '185000.00', status: 'pending', plan_id: 'plan-b', succeeded_at: null },
  { amount: '50000.00', status: 'success', plan_id: null, succeeded_at: '2026-10-01T10:05:00Z' },
]

test('counts only successful subscription plan payments as revenue', () => {
  assert.deepEqual(successfulPlanPayments(payments), [payments[0]])
  assert.equal(sumSuccessfulPlanPayments(payments), 125000)
})
