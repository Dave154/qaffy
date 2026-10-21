import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getMixedServiceGroups,
  hasMinimumMixedServiceInstructions,
  MIN_MIXED_SERVICE_INSTRUCTION_LENGTH,
} from './mixed-service-orders.ts'

test('identifies a category ordered under different services and combines repeated service lines', () => {
  assert.deepEqual(
    getMixedServiceGroups([
      { category: 'General clothing', service: 'Wash', quantity: 2 },
      { category: 'general clothing', service: 'Wash', quantity: 1 },
      { category: 'General clothing', service: 'Wash + Iron', quantity: 3 },
    ]),
    [
      {
        category: 'General clothing',
        services: [
          { service: 'Wash', quantity: 3 },
          { service: 'Wash + Iron', quantity: 3 },
        ],
      },
    ],
  )
})

test('ignores categories using only one service and invalid lines', () => {
  assert.deepEqual(
    getMixedServiceGroups([
      { category: 'Towel', service: 'wash', quantity: 2 },
      { category: 'Shirt', service: 'iron', quantity: 0 },
      { category: '', service: 'wash_iron', quantity: 1 },
    ]),
    [],
  )
})

test('requires at least 20 non-whitespace characters for mixed-service instructions', () => {
  assert.equal(MIN_MIXED_SERVICE_INSTRUCTION_LENGTH, 20)
  assert.equal(hasMinimumMixedServiceInstructions(' hey '), false)
  assert.equal(hasMinimumMixedServiceInstructions('1234567890123456789'), false)
  assert.equal(hasMinimumMixedServiceInstructions('12345678901234567890'), true)
  assert.equal(hasMinimumMixedServiceInstructions('                    '), false)
})
