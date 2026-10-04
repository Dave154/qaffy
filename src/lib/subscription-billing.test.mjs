import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSubscriptionBilling } from './subscription-billing.ts'

test('covers Wash and bills Iron separately for a Wash-only Wash + Iron line', () => {
  const result = calculateSubscriptionBilling(
    [
      {
        id: 'bedsheet',
        service: 'wash_iron',
        quantity: 2,
        unitsPerItem: 1,
        regularPrice: 900,
        regularWashPrice: 300,
        regularIronPrice: 250,
        subscriberWashPrice: 200,
        subscriberIronPrice: 180,
        subscriberWashIronPrice: 600,
      },
    ],
    { wash: true, iron: false },
    1,
  )

  assert.equal(result.coveredUnits, 1)
  assert.equal(result.subscriberAmount, 200)
  assert.equal(result.regularAmount, 500)
  assert.equal(result.totalAmount, 700)
})

test('uses the saved global combined-service rate for over-limit Wash + Iron', () => {
  const result = calculateSubscriptionBilling(
    [
      {
        id: 'shirt',
        service: 'wash_iron',
        quantity: 2,
        unitsPerItem: 1,
        regularPrice: 500,
        regularWashPrice: 300,
        regularIronPrice: 250,
        subscriberWashPrice: 220,
        subscriberIronPrice: 180,
        subscriberWashIronPrice: 400,
      },
    ],
    { wash: true, iron: true },
    1,
  )

  assert.equal(result.coveredUnits, 1)
  assert.equal(result.subscriberAmount, 400)
  assert.equal(result.regularAmount, 0)
  assert.equal(result.totalAmount, 400)
})

test('does not discount services outside the plan', () => {
  const result = calculateSubscriptionBilling(
    [
      {
        id: 'trousers',
        service: 'iron',
        quantity: 1,
        unitsPerItem: 1,
        regularPrice: 250,
        regularWashPrice: 300,
        regularIronPrice: 250,
        subscriberWashPrice: 200,
        subscriberIronPrice: 150,
        subscriberWashIronPrice: 400,
      },
    ],
    { wash: true, iron: false },
    5,
  )

  assert.equal(result.coveredUnits, 0)
  assert.equal(result.subscriberAmount, 0)
  assert.equal(result.regularAmount, 250)
  assert.equal(result.totalAmount, 250)
})

test('maximizes weighted coverage across covered service components', () => {
  const result = calculateSubscriptionBilling(
    [
      {
        id: 'shirt',
        service: 'wash',
        quantity: 2,
        unitsPerItem: 2,
        regularPrice: 300,
        regularWashPrice: 300,
        regularIronPrice: 200,
        subscriberWashPrice: 200,
        subscriberIronPrice: 150,
        subscriberWashIronPrice: 350,
      },
      {
        id: 'bedsheet',
        service: 'wash',
        quantity: 1,
        unitsPerItem: 3,
        regularPrice: 600,
        regularWashPrice: 600,
        regularIronPrice: 400,
        subscriberWashPrice: 400,
        subscriberIronPrice: 250,
        subscriberWashIronPrice: 700,
      },
    ],
    { wash: true, iron: false },
    3,
  )

  assert.equal(result.coveredUnits, 3)
  assert.equal(result.lines[0].coveredQuantity, 0)
  assert.equal(result.lines[1].coveredQuantity, 1)
})