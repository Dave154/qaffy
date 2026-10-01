import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileSettlementWithStore, releaseSettlementWithStore } from './payout-workflow.ts'

const settlementId = 'settlement-1'
const adminId = 'admin-1'

function createFakeStore({ settlement = {}, orderEligibility = {}, transfer = null } = {}) {
  let state = {
    settlement: {
      id: settlementId,
      amount: 200,
      status: 'pending',
      vendorName: 'Test Vendor',
      vendorStatus: 'approved',
      payoutAccountStatus: 'verified',
      recipientCode: 'RCP_test_001',
      ...settlement,
    },
    orderEligibility: { totalOrders: 1, paidOrders: 1, ...orderEligibility },
    transfer: transfer ? structuredClone(transfer) : null,
    auditEvents: [],
  }
  let nextTransferId = 1
  let failNextOutcomeUpdate = false
  let failNextConfirm = false

  function createTransaction() {
    return {
      async getSettlement(id) {
        return id === state.settlement.id ? structuredClone(state.settlement) : null
      },
      async getOrderEligibility() {
        return { ...state.orderEligibility }
      },
      async getTransfer(id) {
        return id === state.settlement.id && state.transfer ? structuredClone(state.transfer) : null
      },
      async reserveTransfer({ settlement: currentSettlement, existing, adminProfileId: actorId, amount, reference }) {
        state.transfer = {
          ...(existing ?? {}),
          id: existing?.id ?? `transfer-${nextTransferId++}`,
          status: 'queued',
          amount,
          recipientCode: currentSettlement.recipientCode,
          reference,
          transferCode: null,
          adminProfileId: actorId,
          failureReason: null,
        }
        return { ...structuredClone(state.transfer), vendorName: currentSettlement.vendorName }
      },
      async getReconciliationTarget(id) {
        if (id !== state.settlement.id || !state.transfer) return null
        return {
          transfer: structuredClone(state.transfer),
          settlementStatus: state.settlement.status,
        }
      },
      async updateTransfer(id, update) {
        if (failNextOutcomeUpdate && update.status !== 'processing') {
          failNextOutcomeUpdate = false
          throw new Error('simulated database write failure')
        }
        if (!state.transfer || id !== state.transfer.id) throw new Error('transfer not found')
        state.transfer = { ...state.transfer, ...update }
      },
      async confirmTransfer({ transferId, settlementId: targetSettlementId, adminProfileId, amount, result, auditAction }) {
        if (!state.transfer || transferId !== state.transfer.id || targetSettlementId !== state.settlement.id)
          throw new Error('transfer not found')
        state.transfer = {
          ...state.transfer,
          status: 'success',
          transferCode: result.transferCode,
          reference: result.reference,
          response: result.response,
          failureReason: null,
        }
        if (failNextConfirm) {
          failNextConfirm = false
          throw new Error('simulated audit/database transaction failure')
        }
        state.settlement.status = 'paid'
        state.auditEvents.push({
          adminProfileId,
          action: auditAction,
          settlementId: targetSettlementId,
          amount,
          reference: result.reference,
        })
      },
    }
  }

  return {
    store: {
      async transaction(work) {
        const before = structuredClone(state)
        try {
          return await work(createTransaction())
        } catch (error) {
          state = before
          throw error
        }
      },
    },
    get state() {
      return structuredClone(state)
    },
    failNextOutcomeUpdate() {
      failNextOutcomeUpdate = true
    },
    failNextConfirm() {
      failNextConfirm = true
    },
  }
}

function providerWith({ initiateTransfer, checkTransfer }) {
  const calls = { initiate: [], check: [] }
  return {
    calls,
    provider: {
      async initiateTransfer(input) {
        calls.initiate.push(input)
        return initiateTransfer(input)
      },
      async checkTransfer(input) {
        calls.check.push(input)
        return checkTransfer(input)
      },
    },
  }
}

function providerResult(status, overrides = {}) {
  return {
    status,
    transferCode: status === 'processing' ? null : 'TRF_test_001',
    reference: 'qsettle-test-001',
    response: { providerStatus: status },
    failureReason: status === 'failed' || status === 'reversed' ? 'Test provider outcome' : null,
    ...overrides,
  }
}

test('persists successful release, settlement payment, and audit event', async () => {
  const fake = createFakeStore()
  const paystack = providerWith({
    initiateTransfer: async () => providerResult('success'),
    checkTransfer: async () => providerResult('success'),
  })

  const result = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(result.status, 'success')
  assert.equal(fake.state.transfer.status, 'success')
  assert.equal(fake.state.settlement.status, 'paid')
  assert.deepEqual(
    fake.state.auditEvents.map((event) => event.action),
    ['vendor_settlement_paid'],
  )
  assert.equal(paystack.calls.initiate.length, 1)
  assert.equal(paystack.calls.initiate[0].amount, 200)
  assert.equal(paystack.calls.initiate[0].recipientCode, 'RCP_test_001')
})

test('blocks a duplicate release after success without a second provider call', async () => {
  const fake = createFakeStore()
  const paystack = providerWith({
    initiateTransfer: async () => providerResult('success'),
    checkTransfer: async () => providerResult('success'),
  })

  const first = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)
  const duplicate = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(first.status, 'success')
  assert.equal(duplicate.status, 'rejected')
  assert.equal(paystack.calls.initiate.length, 1)
  assert.equal(fake.state.auditEvents.length, 1)
})

test('rejects locally when linked invoices are not all paid without calling provider', async () => {
  const fake = createFakeStore({ orderEligibility: { paidOrders: 0 } })
  const paystack = providerWith({
    initiateTransfer: async () => providerResult('success'),
    checkTransfer: async () => providerResult('success'),
  })

  const result = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(result.status, 'rejected')
  assert.equal(fake.state.transfer, null)
  assert.equal(fake.state.settlement.status, 'pending')
  assert.equal(paystack.calls.initiate.length, 0)
})

test('persists provider rejection and retries with the same reference', async () => {
  const fake = createFakeStore()
  const paystack = providerWith({
    initiateTransfer: async () =>
      paystack.calls.initiate.length === 1
        ? providerResult('failed', { transferCode: null, failureReason: 'Insufficient test balance' })
        : providerResult('success'),
    checkTransfer: async () => providerResult('success'),
  })

  const failed = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)
  const firstReference = fake.state.transfer.reference
  const retried = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(failed.status, 'failed')
  assert.equal(fake.state.settlement.status, 'paid')
  assert.equal(retried.status, 'success')
  assert.equal(paystack.calls.initiate.length, 2)
  assert.equal(paystack.calls.initiate[1].reference, firstReference)
  assert.deepEqual(
    fake.state.auditEvents.map((event) => event.action),
    ['vendor_settlement_paid'],
  )
})

test('keeps timeout processing, blocks duplicate release, then reconciles by reference', async () => {
  const fake = createFakeStore()
  const paystack = providerWith({
    initiateTransfer: async () => {
      throw new Error('socket timed out')
    },
    checkTransfer: async () => providerResult('success', { transferCode: 'TRF_reconciled_001' }),
  })

  const initiated = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)
  const reference = fake.state.transfer.reference
  const duplicate = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(initiated.status, 'processing')
  assert.equal(fake.state.transfer.status, 'processing')
  assert.equal(duplicate.status, 'processing')
  assert.equal(paystack.calls.initiate.length, 1)

  const reconciled = await reconcileSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(paystack.calls.check.length, 1)
  assert.deepEqual(paystack.calls.check[0], { transferCode: null, reference })
  assert.equal(reconciled.status, 'success')
  assert.equal(fake.state.settlement.status, 'paid')
  assert.equal(fake.state.auditEvents[0].action, 'vendor_settlement_reconciled')
})

test('reconciliation supports an existing transfer code', async () => {
  const fake = createFakeStore({
    transfer: {
      id: 'transfer-existing',
      status: 'processing',
      amount: 200,
      recipientCode: 'RCP_test_001',
      reference: 'qsettle-existing',
      transferCode: 'TRF_existing_001',
    },
  })
  const paystack = providerWith({
    initiateTransfer: async () => providerResult('success'),
    checkTransfer: async () => providerResult('success'),
  })

  const result = await reconcileSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(result.status, 'success')
  assert.deepEqual(paystack.calls.check[0], { transferCode: 'TRF_existing_001', reference: 'qsettle-existing' })
  assert.equal(fake.state.settlement.status, 'paid')
})

test('reversed transfers remain pending and are not released again', async () => {
  const fake = createFakeStore()
  const paystack = providerWith({
    initiateTransfer: async () => providerResult('reversed'),
    checkTransfer: async () => providerResult('reversed'),
  })

  const first = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)
  const second = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(first.status, 'reversed')
  assert.equal(second.status, 'rejected')
  assert.equal(fake.state.transfer.status, 'reversed')
  assert.equal(fake.state.settlement.status, 'pending')
  assert.equal(paystack.calls.initiate.length, 1)
})

test('rolls back paid state on a database/audit failure and reconciles safely', async () => {
  const fake = createFakeStore()
  fake.failNextConfirm()
  const paystack = providerWith({
    initiateTransfer: async () => providerResult('success'),
    checkTransfer: async () => providerResult('success', { transferCode: 'TRF_recovered_001' }),
  })

  const release = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(release.status, 'processing')
  assert.equal(fake.state.transfer.status, 'processing')
  assert.equal(fake.state.settlement.status, 'pending')
  assert.equal(fake.state.auditEvents.length, 0)

  const reconcile = await reconcileSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(reconcile.status, 'success')
  assert.equal(fake.state.settlement.status, 'paid')
  assert.equal(fake.state.auditEvents.length, 1)
})

test('keeps a processing transfer reconcilable when persisting a provider rejection fails', async () => {
  const fake = createFakeStore()
  fake.failNextOutcomeUpdate()
  const paystack = providerWith({
    initiateTransfer: async () => providerResult('failed'),
    checkTransfer: async () => providerResult('failed'),
  })

  const release = await releaseSettlementWithStore(fake.store, settlementId, adminId, paystack.provider)

  assert.equal(release.status, 'processing')
  assert.equal(fake.state.transfer.status, 'processing')
  assert.equal(fake.state.settlement.status, 'pending')
})
