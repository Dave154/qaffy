import assert from 'node:assert/strict'
import test from 'node:test'
import { addOrIncrementOrderLine } from './order-lines.ts'

const line = (category, service, quantity = 1) => ({ category, service, quantity, unitPrice: 300, subscriptionUnits: 2 })

test('increments quantity for an existing category and service pair', () => {
  assert.deepEqual(addOrIncrementOrderLine([line('Bedsheet', 'Wash', 2)], line(' bedsheet ', 'Wash', 1)), [
    line('Bedsheet', 'Wash', 3),
  ])
})

test('keeps the same category as a separate line for a different service', () => {
  assert.deepEqual(addOrIncrementOrderLine([line('Bedsheet', 'Wash')], line('Bedsheet', 'Iron')), [
    line('Bedsheet', 'Wash'),
    line('Bedsheet', 'Iron'),
  ])
})

test('keeps different categories as separate lines for the same service', () => {
  assert.deepEqual(addOrIncrementOrderLine([line('Bedsheet', 'Wash')], line('Towel', 'Wash')), [
    line('Bedsheet', 'Wash'),
    line('Towel', 'Wash'),
  ])
})