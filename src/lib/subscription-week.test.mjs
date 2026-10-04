import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSubscriptionUnitsUsed, getSubscriptionWeekStart } from './subscription-week.ts'

test('starts the subscription week at Sunday midnight in Africa/Lagos', () => {
  assert.equal(getSubscriptionWeekStart(new Date('2026-10-04T00:59:59.000Z')).toISOString(), '2026-10-03T23:00:00.000Z')
  assert.equal(getSubscriptionWeekStart(new Date('2026-10-03T22:59:59.000Z')).toISOString(), '2026-09-26T23:00:00.000Z')
  assert.equal(getSubscriptionWeekStart(new Date('2026-10-03T23:00:00.000Z')).toISOString(), '2026-10-03T23:00:00.000Z')
})

test('meters subscription units by application time, excluding cancelled and one-time orders', () => {
  const reference = new Date('2026-10-04T00:30:00.000Z')
  const orders = [
    {
      is_subscription_order: true,
      status: 'invoiced',
      clothes_count_vendor: 2,
      subscription_units_applied: 4,
      created_at: '2026-10-03T20:00:00.000Z',
      subscription_units_applied_at: '2026-10-03T23:15:00.000Z',
    },
    {
      is_subscription_order: true,
      status: 'invoiced',
      clothes_count_vendor: 1,
      subscription_units_applied: 3,
      created_at: '2026-10-04T00:10:00.000Z',
      subscription_units_applied_at: '2026-10-03T22:59:00.000Z',
    },
    {
      is_subscription_order: true,
      status: 'cancelled',
      clothes_count_vendor: 1,
      subscription_units_applied: 2,
      created_at: '2026-10-04T00:10:00.000Z',
      subscription_units_applied_at: '2026-10-04T00:10:00.000Z',
    },
    {
      is_subscription_order: false,
      status: 'paid',
      clothes_count_vendor: 1,
      subscription_units_applied: null,
      created_at: '2026-10-04T00:10:00.000Z',
      subscription_units_applied_at: null,
    },
  ]

  assert.equal(calculateSubscriptionUnitsUsed(orders, reference), 4)
})

test('carries this week usage across a midweek subscription change', () => {
  const orders = [
    {
      subscription_id: 'previous-plan',
      is_subscription_order: true,
      status: 'invoiced',
      clothes_count_vendor: 2,
      subscription_units_applied: 6,
      created_at: '2026-10-04T10:00:00.000Z',
      subscription_units_applied_at: '2026-10-04T11:00:00.000Z',
    },
    {
      subscription_id: 'new-plan',
      is_subscription_order: true,
      status: 'invoiced',
      clothes_count_vendor: 1,
      subscription_units_applied: 3,
      created_at: '2026-10-06T10:00:00.000Z',
      subscription_units_applied_at: '2026-10-06T11:00:00.000Z',
    },
  ]

  assert.equal(calculateSubscriptionUnitsUsed(orders, new Date('2026-10-07T12:00:00.000Z')), 9)
})