import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPaystackTransferReference,
  getTransferVerificationPath,
  initiateTransferWithRecovery,
  TransferProviderError,
} from './payout-outcomes.ts'
import { releaseCreatedSettlements, summarizeSettlementPayouts } from './settlement-payouts.ts'

const request = {
  amount: 1200,
  recipientCode: 'RCP_test1234567890',
  reference: 'qaffy-settlement-12345678901234567890123456789012',
  reason: 'Qaffy settlement',
}

function providerThatThrows(error) {
  return {
    async initiateTransfer() {
      throw error
    },
    async checkTransfer() {
      throw new Error('not used')
    },
  }
}

test('treats a timeout after transfer initiation as unknown and keeps its reference', async () => {
  const result = await initiateTransferWithRecovery(providerThatThrows(new Error('socket timed out')), request)

  assert.equal(result.status, 'processing')
  assert.equal(result.transferCode, null)
  assert.equal(result.reference, request.reference)
  assert.equal(result.failureReason, 'socket timed out')
})

test('treats an explicit provider rejection as failed', async () => {
  const result = await initiateTransferWithRecovery(
    providerThatThrows(new TransferProviderError('Insufficient balance', 'rejected', { statusCode: 422 })),
    request,
  )

  assert.equal(result.status, 'failed')
  assert.equal(result.transferCode, null)
  assert.equal(result.reference, request.reference)
  assert.deepEqual(result.response, { statusCode: 422 })
})

test('preserves a provider-confirmed failure result', async () => {
  const provider = {
    async initiateTransfer() {
      return {
        status: 'failed',
        transferCode: 'TRF_test123456',
        reference: request.reference,
        response: { status: false },
        failureReason: 'Rejected',
      }
    },
    async checkTransfer() {
      throw new Error('not used')
    },
  }
  const result = await initiateTransferWithRecovery(provider, request)

  assert.equal(result.status, 'failed')
  assert.equal(result.failureReason, 'Rejected')
})

test('creates a Paystack-compliant unique reference', () => {
  const reference = createPaystackTransferReference('12345678-1234-4234-8234-123456789012')

  assert.equal(reference, 'qsettle-12345678-1234-4234-8234-123456789012')
  assert.ok(reference.length >= 16 && reference.length <= 50)
  assert.match(reference, /^[a-z0-9_-]+$/)
})

test('reconciles by transfer reference when Paystack returned no transfer code', () => {
  assert.equal(
    getTransferVerificationPath({ transferCode: null, reference: 'qsettle-12345678-1234-4234-8234-123456789012' }),
    '/transfer/verify/qsettle-12345678-1234-4234-8234-123456789012',
  )
  assert.equal(getTransferVerificationPath({ transferCode: 'TRF_123', reference: 'qsettle-123' }), '/transfer/TRF_123')
})

test('attempts every new settlement once and preserves each payout outcome', async () => {
  const settlements = [
    { settlementId: 'settlement-a', vendorId: 'vendor-a', vendorName: 'A Laundry', orderCount: 1, amount: 200 },
    { settlementId: 'settlement-b', vendorId: 'vendor-b', vendorName: 'B Laundry', orderCount: 2, amount: 450 },
  ]
  const attempted = []
  const outcomes = await releaseCreatedSettlements(settlements, 'admin-profile', async (settlementId, adminProfileId) => {
    attempted.push({ settlementId, adminProfileId })
    return settlementId === 'settlement-a'
      ? { ok: true, status: 'success', message: 'Payout released.' }
      : { ok: false, status: 'processing', message: 'Reconcile this payout.', reference: 'qsettle-b' }
  })

  assert.deepEqual(attempted, [
    { settlementId: 'settlement-a', adminProfileId: 'admin-profile' },
    { settlementId: 'settlement-b', adminProfileId: 'admin-profile' },
  ])
  assert.deepEqual(outcomes.map(({ status }) => status), ['success', 'processing'])
  assert.equal(outcomes[1].reference, 'qsettle-b')
  assert.equal(summarizeSettlementPayouts(outcomes), 'Created 2 settlements; 1 payout confirmed, 1 pending confirmation.')
})

test('treats unexpected payout errors as unknown and continues the batch', async () => {
  const settlements = [
    { settlementId: 'settlement-a', vendorId: 'vendor-a', vendorName: 'A Laundry', orderCount: 1, amount: 200 },
    { settlementId: 'settlement-b', vendorId: 'vendor-b', vendorName: 'B Laundry', orderCount: 1, amount: 300 },
  ]
  const attempted = []
  const outcomes = await releaseCreatedSettlements(settlements, 'admin-profile', async (settlementId) => {
    attempted.push(settlementId)
    if (settlementId === 'settlement-a') throw new Error('connection lost')
    return { ok: true, status: 'success', message: 'Payout released.' }
  })

  assert.deepEqual(attempted, ['settlement-a', 'settlement-b'])
  assert.deepEqual(outcomes.map(({ status }) => status), ['processing', 'success'])
  assert.match(outcomes[0].message, /Reconcile it before retrying/)
})
