import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeMismatchDetails, normalizeSubscriptionBillingBreakdown } from './mismatch-details.ts'

const addedWashLine = {
  itemId: 'wash-item',
  category: 'Bedsheet',
  service: 'wash',
  originalQuantity: 0,
  confirmedQuantity: 1,
  difference: 1,
  unitPrice: 420,
  extraAmount: 0,
}

test('normalizes string-encoded mismatch details and preserves added-item counts', () => {
  assert.deepEqual(normalizeMismatchDetails(JSON.stringify([addedWashLine])), [addedWashLine])
})

test('rejects invalid mismatch detail values', () => {
  assert.deepEqual(normalizeMismatchDetails('not json'), [])
  assert.deepEqual(normalizeMismatchDetails(JSON.stringify({ ...addedWashLine, originalQuantity: -1 })), [])
})

test('normalizes string-encoded subscription billing breakdowns', () => {
  const breakdown = { coveredUnits: 4, subscriberAmount: 0, regularAmount: 250 }
  assert.deepEqual(normalizeSubscriptionBillingBreakdown(JSON.stringify(breakdown)), breakdown)
})
