import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateSubscriptionAllowance,
  calculateSubscriptionAllowanceThroughCurrentMonth,
  calculateSubscriptionUnitsApplied,
  calculateSubscriptionUnitsUsed,
  calculateRetroactiveSubscriptionUnits,
  getAuthorizedSubscriptionBorrowUnits,
  getSubscriptionWeekStart,
} from './subscription-week.ts'

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

test('rolls unused units into later weeks instead of resetting the balance', () => {
  const allowance = calculateSubscriptionAllowance(
    { weeklyLimit: 20, startDate: '2026-10-02', endDate: '2026-11-02', usedUnits: 5 },
    new Date('2026-10-12T12:00:00.000Z'),
  )

  assert.equal(allowance.accruedUnits, 60)
  assert.equal(allowance.balance, 55)
})

test('caps each plan month at four weekly credits even when it contains five Sundays', () => {
  const allowance = calculateSubscriptionAllowance(
    { weeklyLimit: 20, startDate: '2026-10-01', endDate: '2026-11-01', usedUnits: 0 },
    new Date('2026-11-01T12:00:00.000Z'),
  )

  assert.equal(allowance.accruedUnits, 80)
  assert.equal(allowance.balance, 80)
})

test('scheduled subscriptions do not receive allowance before their start date', () => {
  const beforeStart = calculateSubscriptionAllowance(
    {
      weeklyLimit: 10,
      startDate: '2026-11-20',
      startAt: '2026-11-10T12:00:00.000Z',
      endDate: '2026-12-20',
      usedUnits: 0,
    },
    new Date('2026-11-15T12:00:00.000Z'),
  )
  const onStartDate = calculateSubscriptionAllowance(
    {
      weeklyLimit: 10,
      startDate: '2026-11-20',
      startAt: '2026-11-10T12:00:00.000Z',
      endDate: '2026-12-20',
      usedUnits: 0,
    },
    new Date('2026-11-20T12:00:00.000Z'),
  )

  assert.equal(beforeStart.accruedUnits, 0)
  assert.equal(onStartDate.accruedUnits, 10)
})

test('allows Admin to use the remaining allowance through the current subscription month', () => {
  const allowance = calculateSubscriptionAllowanceThroughCurrentMonth(
    { weeklyLimit: 20, startDate: '2026-10-02', endDate: '2026-11-02', usedUnits: 30 },
    new Date('2026-10-05T12:00:00.000Z'),
  )

  assert.equal(allowance.accruedUnits, 80)
  assert.equal(allowance.usedUnits, 30)
  assert.equal(allowance.unitsAvailableForConfirmation, 50)
})

test('does not borrow allowance from a future subscription month', () => {
  const allowance = calculateSubscriptionAllowanceThroughCurrentMonth(
    { weeklyLimit: 20, startDate: '2026-10-02', endDate: '2027-01-02', usedUnits: 0 },
    new Date('2026-10-05T12:00:00.000Z'),
  )

  assert.equal(allowance.accruedUnits, 80)
  assert.equal(allowance.unitsAvailableForConfirmation, 80)
})

test('grants the first weekly allowance immediately when the subscription activates', () => {
  const allowance = calculateSubscriptionAllowance(
    {
      weeklyLimit: 20,
      startDate: '2026-10-04',
      startAt: '2026-10-04T10:00:00.000Z',
      endDate: '2026-11-04',
      usedUnits: 0,
    },
    new Date('2026-10-04T12:00:00.000Z'),
  )

  assert.equal(allowance.accruedUnits, 20)
  assert.equal(allowance.balance, 20)
  assert.equal(allowance.nextCreditAt, '2026-10-10T23:00:00.000Z')
})

test('does not add the first allowance before the subscription activation time', () => {
  const allowance = calculateSubscriptionAllowance(
    {
      weeklyLimit: 20,
      startDate: '2026-10-04',
      startAt: '2026-10-04T10:00:00.000Z',
      endDate: '2026-11-04',
      usedUnits: 0,
    },
    new Date('2026-10-04T09:59:59.000Z'),
  )

  assert.equal(allowance.accruedUnits, 0)
  assert.equal(allowance.nextCreditAt, '2026-10-04T10:00:00.000Z')
})

test('does not accrue backdated weekly credits before subscription creation', () => {
  const allowance = calculateSubscriptionAllowance(
    {
      weeklyLimit: 20,
      startDate: '2026-09-01',
      startAt: '2026-10-30T12:00:00.000Z',
      endDate: '2026-12-01',
      usedUnits: 0,
    },
    new Date('2026-11-02T12:00:00.000Z'),
  )

  assert.equal(allowance.accruedUnits, 40)
  assert.equal(allowance.balance, 40)
  assert.equal(allowance.nextCreditAt, '2026-11-07T23:00:00.000Z')
})

test('separates historical credits from the current allowance without duplicating creation-week credit', () => {
  const createdAt = '2026-11-14T12:00:00.000Z'
  const reference = new Date(createdAt)
  const sharedInput = {
    weeklyLimit: 10,
    startAt: createdAt,
    endDate: '2026-12-04',
  }

  assert.equal(
    calculateRetroactiveSubscriptionUnits(
      { ...sharedInput, startDate: '2026-11-04' },
      reference,
    ),
    20,
  )
  const afterBackdatedGrant = calculateSubscriptionAllowance(
    { ...sharedInput, startDate: '2026-11-04', usedUnits: 0, retroactiveUnits: 20 },
    reference,
  )
  assert.equal(afterBackdatedGrant.balance, 0)
  assert.equal(afterBackdatedGrant.nextCreditAt, '2026-11-14T23:00:00.000Z')
  const followingWeek = calculateSubscriptionAllowance(
    {
      ...sharedInput,
      startDate: '2026-11-04',
      usedUnits: 0,
      retroactiveUnits: 20,
    },
    new Date('2026-11-15T12:00:00.000Z'),
  )
  assert.equal(followingWeek.balance, 10)

  assert.equal(
    calculateRetroactiveSubscriptionUnits(
      { ...sharedInput, startDate: '2026-11-11' },
      reference,
    ),
    0,
  )
  assert.equal(
    calculateSubscriptionAllowance(
      { ...sharedInput, startDate: '2026-11-11', usedUnits: 0 },
      reference,
    ).accruedUnits,
    10,
  )
})

test('permits borrowing from the next weekly credit and reports the resulting balance', () => {
  const allowance = calculateSubscriptionAllowance(
    { weeklyLimit: 20, startDate: '2026-10-02', endDate: '2026-11-02', usedUnits: 45 },
    new Date('2026-10-05T12:00:00.000Z'),
  )

  assert.equal(allowance.balance, -5)
  assert.equal(allowance.unitsAvailableForConfirmation, 15)
  assert.equal(allowance.nextBalanceAfterCredit, 15)
})

test('semester confirmation can use the current balance and at most one upcoming weekly credit', () => {
  const allowance = calculateSubscriptionAllowance(
    {
      weeklyLimit: 20,
      semesterWeeks: 17,
      startDate: '2026-10-04',
      startAt: '2026-10-04T00:00:00.000Z',
      endDate: '2027-01-31',
      usedUnits: 56,
    },
    new Date('2026-10-23T12:00:00.000Z'),
  )

  assert.equal(allowance.balance, 4)
  assert.equal(allowance.borrowableUnits, 20)
  assert.equal(allowance.unitsAvailableForConfirmation, 24)
})

test('only borrows units the customer explicitly consented to and caps it to one upcoming allowance', () => {
  const allowance = calculateSubscriptionAllowance(
    { weeklyLimit: 20, startDate: '2026-10-02', endDate: '2026-11-02', usedUnits: 20 },
    new Date('2026-10-05T12:00:00.000Z'),
  )

  assert.equal(getAuthorizedSubscriptionBorrowUnits(allowance, 0), 0)
  assert.equal(getAuthorizedSubscriptionBorrowUnits(allowance, 7), 7)
  assert.equal(getAuthorizedSubscriptionBorrowUnits(allowance, 100), 20)
})

test('does not allow borrowing after the final scheduled credit or after plan expiry', () => {
  const afterFinalCredit = calculateSubscriptionAllowance(
    { weeklyLimit: 20, startDate: '2026-10-01', endDate: '2026-10-31', usedUnits: 80 },
    new Date('2026-11-01T12:00:00.000Z'),
  )
  const afterExpiry = calculateSubscriptionAllowance(
    { weeklyLimit: 20, startDate: '2026-10-02', endDate: '2026-10-31', usedUnits: 80 },
    new Date('2026-11-02T12:00:00.000Z'),
  )

  assert.equal(afterFinalCredit.balance, 0)
  assert.equal(afterFinalCredit.unitsAvailableForConfirmation, 0)
  assert.equal(afterFinalCredit.nextCreditAt, null)
  assert.equal(afterExpiry.nextCreditAt, null)
  assert.equal(afterExpiry.unitsAvailableForConfirmation, 0)
})

test('preserves the legacy four-credit monthly cap for semester subscriptions without a week snapshot', () => {
  const allowance = calculateSubscriptionAllowance(
    { weeklyLimit: 20, startDate: '2026-09-01', endDate: '2027-01-01', usedUnits: 0 },
    new Date('2027-01-01T12:00:00.000Z'),
  )

  assert.equal(allowance.accruedUnits, 320)
})

test('semester subscriptions accrue on Sundays across months up to their snapshotted week count', () => {
  const allowance = calculateSubscriptionAllowance(
    {
      weeklyLimit: 20,
      semesterWeeks: 17,
      startDate: '2026-10-01',
      startAt: '2026-10-01T10:00:00.000Z',
      endDate: '2026-11-30',
      usedUnits: 0,
    },
    new Date('2026-11-30T12:00:00.000Z'),
  )

  assert.equal(allowance.accruedUnits, 200)
  assert.equal(allowance.nextCreditAt, null)
})

test('semester allowance never exceeds weekly limit multiplied by configured weeks', () => {
  const allowance = calculateSubscriptionAllowance(
    {
      weeklyLimit: 20,
      semesterWeeks: 17,
      startDate: '2026-09-01',
      startAt: '2026-09-01T10:00:00.000Z',
      endDate: '2027-01-31',
      usedUnits: 0,
    },
    new Date('2027-02-01T12:00:00.000Z'),
  )

  assert.equal(allowance.accruedUnits, 340)
  assert.equal(allowance.balance, 340)
  assert.equal(allowance.nextCreditAt, null)
})

test('semester borrowing advances a capped credit and cannot extend the total allowance', () => {
  const beforeFinalCredit = calculateSubscriptionAllowance(
    {
      weeklyLimit: 20,
      semesterWeeks: 2,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      usedUnits: 20,
    },
    new Date('2026-09-02T12:00:00.000Z'),
  )
  const afterFinalCredit = calculateSubscriptionAllowance(
    {
      weeklyLimit: 20,
      semesterWeeks: 2,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      usedUnits: 40,
    },
    new Date('2026-09-13T12:00:00.000Z'),
  )

  assert.equal(beforeFinalCredit.borrowableUnits, 20)
  assert.equal(beforeFinalCredit.unitsAvailableForConfirmation, 20)
  assert.equal(afterFinalCredit.accruedUnits, 40)
  assert.equal(afterFinalCredit.balance, 0)
  assert.equal(afterFinalCredit.borrowableUnits, 0)
  assert.equal(afterFinalCredit.nextCreditAt, null)
})

test('sums applied units only for the subscription and its legacy unlinked orders', () => {
  const orders = [
    {
      subscription_id: 'active-subscription',
      is_subscription_order: true,
      status: 'invoiced',
      clothes_count_vendor: 3,
      subscription_units_applied: 5,
      subscription_units_applied_at: '2026-10-05T12:00:00.000Z',
      created_at: '2026-10-04T12:00:00.000Z',
    },
    {
      subscription_id: null,
      is_subscription_order: true,
      status: 'paid',
      clothes_count_vendor: 2,
      subscription_units_applied: 4,
      subscription_units_applied_at: '2026-10-06T12:00:00.000Z',
      created_at: '2026-10-05T12:00:00.000Z',
    },
    {
      subscription_id: 'old-subscription',
      is_subscription_order: true,
      status: 'invoiced',
      clothes_count_vendor: 1,
      subscription_units_applied: 7,
      subscription_units_applied_at: '2026-10-06T12:00:00.000Z',
      created_at: '2026-10-05T12:00:00.000Z',
    },
    {
      subscription_id: 'old-subscription',
      is_subscription_order: true,
      status: 'invoiced',
      clothes_count_vendor: 1,
      subscription_units_applied: 9,
      subscription_units_applied_at: '2026-10-03T22:59:00.000Z',
      created_at: '2026-10-03T12:00:00.000Z',
    },
  ]

  assert.equal(
    calculateSubscriptionUnitsApplied(
      orders,
      {
        id: 'active-subscription',
        startDate: '2026-10-01',
        endDate: '2026-11-01',
      },
      new Date('2026-10-07T12:00:00.000Z'),
    ),
    16,
  )
})

test('attributes retroactively applied units to their allowance subscription across weeks', () => {
  const orders = [
    {
      subscription_id: 'order-time-subscription',
      subscription_allowance_subscription_id: 'active-subscription',
      is_subscription_order: true,
      status: 'delivered',
      clothes_count_vendor: 2,
      subscription_units_applied: 12,
      subscription_units_applied_at: '2026-10-01T12:00:00.000Z',
      created_at: '2026-09-30T12:00:00.000Z',
    },
    {
      subscription_id: 'active-subscription',
      subscription_allowance_subscription_id: 'order-time-subscription',
      is_subscription_order: true,
      status: 'delivered',
      clothes_count_vendor: 2,
      subscription_units_applied: 9,
      subscription_units_applied_at: '2026-10-06T12:00:00.000Z',
      created_at: '2026-10-05T12:00:00.000Z',
    },
  ]

  assert.equal(
    calculateSubscriptionUnitsApplied(
      orders,
      { id: 'active-subscription', startDate: '2026-10-01', endDate: '2026-11-01' },
      new Date('2026-10-07T12:00:00.000Z'),
    ),
    12,
  )
  assert.equal(
    calculateSubscriptionUnitsApplied(
      orders,
      { id: 'order-time-subscription', startDate: '2026-10-01', endDate: '2026-11-01' },
      new Date('2026-10-07T12:00:00.000Z'),
    ),
    9,
  )
})

test('counts current allowance spent on a retroactively billed one-time order', () => {
  const order = {
    subscription_id: null,
    subscription_allowance_subscription_id: 'active-subscription',
    is_subscription_order: false,
    status: 'paid',
    clothes_count_vendor: 2,
    subscription_units_applied: 4,
    subscription_units_applied_at: '2026-10-06T12:00:00.000Z',
    created_at: '2026-10-05T12:00:00.000Z',
  }
  const reference = new Date('2026-10-07T12:00:00.000Z')

  assert.equal(
    calculateSubscriptionUnitsApplied(
      [order],
      { id: 'active-subscription', startDate: '2026-10-01', endDate: '2026-11-01' },
      reference,
    ),
    4,
  )
  assert.equal(calculateSubscriptionUnitsUsed([order], reference), 4)
})
