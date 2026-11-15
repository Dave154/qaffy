import test from 'node:test'
import assert from 'node:assert/strict'
import { getRefundAllocations, getRestoredRewardExpiry, RefundAccountingError } from './order-cancellation.ts'

test('refund allocations preserve one-off, subscription, and promotional sources', () => {
  const allocations = [
    { balanceType: 'one_off', amount: 25, referralRewardId: null },
    { balanceType: 'promotional', amount: 15, referralRewardId: 'reward-1' },
    { balanceType: 'subscription', amount: 10, referralRewardId: null },
  ]

  assert.deepEqual(getRefundAllocations(50, 'wallet', allocations), allocations)
})

test('offline refunds are credited to the ordinary one-off wallet', () => {
  assert.deepEqual(getRefundAllocations(80, 'offline', []), [
    { balanceType: 'one_off', amount: 80, referralRewardId: null },
  ])
})

test('wallet refunds reject allocations that do not exactly match the invoice', () => {
  assert.throws(
    () => getRefundAllocations(50, 'wallet', [{ balanceType: 'one_off', amount: 49, referralRewardId: null }]),
    RefundAccountingError,
  )
})

test('expired promotional refunds renew for the original snapshotted duration', () => {
  const now = new Date('2026-11-14T12:00:00.000Z')
  const expiry = getRestoredRewardExpiry('2026-10-01T00:00:00.000Z', 90, now)

  assert.equal(expiry.toISOString(), '2027-02-12T12:00:00.000Z')
})

test('unexpired promotional refunds retain their original expiry', () => {
  const originalExpiry = new Date('2026-12-01T00:00:00.000Z')
  const expiry = getRestoredRewardExpiry(originalExpiry, 90, new Date('2026-11-14T12:00:00.000Z'))

  assert.equal(expiry, originalExpiry)
})

test('expired promotional refunds fail closed when original expiry terms are missing', () => {
  assert.throws(
    () => getRestoredRewardExpiry('2026-10-01T00:00:00.000Z', null, new Date('2026-11-14T12:00:00.000Z')),
    RefundAccountingError,
  )
})
