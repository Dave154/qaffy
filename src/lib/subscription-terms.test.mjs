import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addCalendarDaysToDate,
  addCalendarMonthsToDate,
  getSavedSubscriptionTerms,
  getSubscriptionEndDate,
  getSubscriptionStartState,
  isSubscriptionPurchaseQuote,
  subscriptionPurchaseQuotesMatch,
} from './subscription-terms.ts'

test('calculates monthly subscription end dates from their start date', () => {
  assert.equal(getSubscriptionEndDate('monthly', '2026-01-31', null), '2026-02-28')
  assert.equal(getSubscriptionEndDate('monthly', '2028-01-31', null), '2028-02-29')
})

test('uses the configured semester end date and rejects missing or past semester terms', () => {
  assert.equal(getSubscriptionEndDate('semester', '2026-11-16', '2026-12-18'), '2026-12-18')
  assert.throws(() => getSubscriptionEndDate('semester', '2026-11-16', null), /Set a valid semester end date/)
  assert.throws(() => getSubscriptionEndDate('semester', '2026-12-19', '2026-12-18'), /before this subscription can start/)
})

test('uses calendar-day arithmetic for a renewal starting after the current end date', () => {
  assert.equal(addCalendarDaysToDate('2026-11-30', 1), '2026-12-01')
  assert.equal(addCalendarMonthsToDate('2026-12-01', 1), '2027-01-01')
})

test('a renewal due today is current rather than reserved as a future queued renewal', () => {
  assert.deepEqual(getSubscriptionStartState('2026-11-16', '2026-11-16'), {
    status: 'active',
    isQueuedRenewal: false,
  })
  assert.deepEqual(getSubscriptionStartState('2026-11-17', '2026-11-16'), {
    status: 'scheduled',
    isQueuedRenewal: true,
  })
})

test('uses the saved payment quote even when service coverage is false', () => {
  assert.deepEqual(
    getSavedSubscriptionTerms({
      startDate: '2026-11-17',
      endDate: '2026-12-17',
      weeklyLimit: 12,
      coversWash: true,
      coversIron: false,
    }),
    {
      startDate: '2026-11-17',
      endDate: '2026-12-17',
      weeklyLimit: 12,
      coversWash: true,
      coversIron: false,
    },
  )
})

test('rejects partially saved subscription payment terms rather than recalculating them', () => {
  assert.throws(
    () =>
      getSavedSubscriptionTerms({
        startDate: '2026-11-17',
        endDate: null,
        weeklyLimit: 12,
        coversWash: true,
        coversIron: false,
      }),
    /saved subscription payment terms are incomplete/,
  )
})

test('requires the complete displayed quote to match before checkout', () => {
  const quote = {
    planId: 'plan-1',
    planName: 'Monthly Wash',
    planType: 'monthly',
    amount: 5000,
    startDate: '2026-11-17',
    endDate: '2026-12-17',
    scheduled: true,
    weeklyLimit: 12,
    coversWash: true,
    coversIron: false,
  }
  assert.equal(isSubscriptionPurchaseQuote(quote), true)
  assert.equal(subscriptionPurchaseQuotesMatch(quote, { ...quote }), true)
  assert.equal(subscriptionPurchaseQuotesMatch(quote, { ...quote, startDate: '2026-11-18' }), false)
  assert.equal(subscriptionPurchaseQuotesMatch(quote, { ...quote, coversIron: true }), false)
  assert.equal(isSubscriptionPurchaseQuote({ ...quote, endDate: '2026-11-16' }), false)
})
