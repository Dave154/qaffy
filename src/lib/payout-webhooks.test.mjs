import assert from 'node:assert/strict'
import test from 'node:test'
import { processPaystackTransferEvent, TransferWebhookValidationError } from './payout-webhooks.ts'

function createFakePayoutWebhookStore({ transferStatus = 'processing', settlementStatus = 'pending' } = {}) {
  let state = {
    transfer: {
      id: 'transfer-1',
      settlementId: 'settlement-1',
      initiatedByAdminId: 'admin-1',
      status: transferStatus,
      settlementStatus,
      amount: 200,
      reference: 'qsettle-test-123',
      transferCode: 'TRF_test_123',
      recipientCode: 'RCP_test_123',
    },
    auditEvents: [],
  }

  return {
    store: {
      async transaction(work) {
        const previous = structuredClone(state)
        try {
          return await work({
            async findTransferByReference(reference) {
              return reference === state.transfer.reference ? structuredClone(state.transfer) : null
            },
            async updateTransfer(id, update) {
              if (id !== state.transfer.id) throw new Error('transfer not found')
              state.transfer = { ...state.transfer, ...update }
            },
            async markSettlementPaid(settlementId) {
              if (settlementId !== state.transfer.settlementId) throw new Error('settlement not found')
              state.transfer.settlementStatus = 'paid'
            },
            async writeAudit(event) {
              state.auditEvents.push(event)
            },
          })
        } catch (error) {
          state = previous
          throw error
        }
      },
    },
    get state() {
      return structuredClone(state)
    },
  }
}

function event(name, overrides = {}) {
  return {
    event: name,
    data: {
      reference: 'qsettle-test-123',
      amount: 20000,
      currency: 'NGN',
      status: name.split('.')[1],
      transfer_code: 'TRF_test_123',
      recipient: { recipient_code: 'RCP_test_123' },
      ...overrides,
    },
  }
}

test('transfer.success marks the transfer and settlement paid and writes audit', async () => {
  const fake = createFakePayoutWebhookStore()
  const result = await processPaystackTransferEvent(event('transfer.success'), fake.store)

  assert.deepEqual(result, { handled: true, duplicate: false, status: 'success' })
  assert.equal(fake.state.transfer.status, 'success')
  assert.equal(fake.state.transfer.settlementStatus, 'paid')
  assert.equal(fake.state.auditEvents[0].action, 'vendor_settlement_webhook_paid')
})

test('duplicate transfer.success is idempotent', async () => {
  const fake = createFakePayoutWebhookStore({ transferStatus: 'success', settlementStatus: 'paid' })
  const result = await processPaystackTransferEvent(event('transfer.success'), fake.store)

  assert.deepEqual(result, { handled: true, duplicate: true, status: 'success' })
  assert.equal(fake.state.auditEvents.length, 0)
})

test('transfer.failed keeps settlement pending and stores provider reason', async () => {
  const fake = createFakePayoutWebhookStore()
  const result = await processPaystackTransferEvent(event('transfer.failed', { reason: 'Insufficient balance' }), fake.store)

  assert.deepEqual(result, { handled: true, duplicate: false, status: 'failed' })
  assert.equal(fake.state.transfer.status, 'failed')
  assert.equal(fake.state.transfer.settlementStatus, 'pending')
  assert.equal(fake.state.transfer.failureReason, 'Insufficient balance')
  assert.equal(fake.state.auditEvents[0].action, 'vendor_settlement_webhook_failed')
})

test('transfer.reversed is recorded for investigation without reopening a paid settlement', async () => {
  const fake = createFakePayoutWebhookStore({ transferStatus: 'success', settlementStatus: 'paid' })
  const result = await processPaystackTransferEvent(event('transfer.reversed', { reason: 'Reversed by bank' }), fake.store)

  assert.deepEqual(result, { handled: true, duplicate: false, status: 'reversed' })
  assert.equal(fake.state.transfer.status, 'reversed')
  assert.equal(fake.state.transfer.settlementStatus, 'paid')
  assert.equal(fake.state.auditEvents[0].action, 'vendor_settlement_webhook_reversed')
})

test('unknown references and stale events are safely ignored', async () => {
  const fake = createFakePayoutWebhookStore({ transferStatus: 'reversed', settlementStatus: 'paid' })
  const unknown = await processPaystackTransferEvent(event('transfer.success', { reference: 'unknown' }), fake.store)
  const stale = await processPaystackTransferEvent(event('transfer.success'), fake.store)

  assert.deepEqual(unknown, { handled: false, reason: 'unknown-reference' })
  assert.deepEqual(stale, { handled: false, reason: 'stale-event' })
})

test('rejects amount, currency, recipient, code, and event-status mismatches', async () => {
  const mismatchCases = [
    { amount: 19999 },
    { currency: 'USD' },
    { recipient: { recipient_code: 'RCP_other' } },
    { transfer_code: 'TRF_other' },
    { status: 'failed' },
  ]

  for (const mismatch of mismatchCases) {
    const fake = createFakePayoutWebhookStore()
    await assert.rejects(
      processPaystackTransferEvent(event('transfer.success', mismatch), fake.store),
      TransferWebhookValidationError,
    )
    assert.equal(fake.state.transfer.status, 'processing')
    assert.equal(fake.state.auditEvents.length, 0)
  }
})

test('ignores unsupported event names', async () => {
  const fake = createFakePayoutWebhookStore()
  const result = await processPaystackTransferEvent(event('charge.success'), fake.store)

  assert.deepEqual(result, { handled: false, reason: 'unsupported-event' })
  assert.equal(fake.state.transfer.status, 'processing')
})