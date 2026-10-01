import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSettlementVendorPreviews } from './rate-card.ts'
import { createBulkSettlementBatches } from './settlement-batches.ts'

const vendors = [
  { vendorId: 'vendor-a', vendorName: 'A Laundry' },
  { vendorId: 'vendor-b', vendorName: 'B Laundry' },
]

const orders = [
  { id: 'paid-a', vendor_id: 'vendor-a', status: 'invoiced', clothes_count_vendor: 2, invoice_status: 'paid' },
  { id: 'unpaid-a', vendor_id: 'vendor-a', status: 'invoiced', clothes_count_vendor: 1, invoice_status: 'pending' },
  { id: 'cancelled-a', vendor_id: 'vendor-a', status: 'cancelled', clothes_count_vendor: 1, invoice_status: 'paid' },
  { id: 'already-settled-a', vendor_id: 'vendor-a', status: 'invoiced', clothes_count_vendor: 1, invoice_status: 'paid' },
  { id: 'unconfirmed-a', vendor_id: 'vendor-a', status: 'invoiced', clothes_count_vendor: null, invoice_status: 'paid' },
  { id: 'paid-b', vendor_id: 'vendor-b', status: 'invoiced', clothes_count_vendor: 1, invoice_status: 'paid' },
]

const items = [
  { id: 'item-paid-a', order_id: 'paid-a', category_id: 'shirts', confirmed_quantity: 2, service: 'wash', unit_price: 99 },
  { id: 'item-unpaid-a', order_id: 'unpaid-a', category_id: 'shirts', confirmed_quantity: 10, service: 'wash', unit_price: 99 },
  { id: 'item-cancelled-a', order_id: 'cancelled-a', category_id: 'shirts', confirmed_quantity: 10, service: 'wash', unit_price: 99 },
  { id: 'item-settled-a', order_id: 'already-settled-a', category_id: 'shirts', confirmed_quantity: 10, service: 'wash', unit_price: 99 },
  { id: 'item-paid-b', order_id: 'paid-b', category_id: 'shirts', confirmed_quantity: 3, service: 'iron', unit_price: 75 },
]

const rates = [{ category_id: 'shirts', vendor_wash_price: 125, vendor_iron_price: 90 }]

test('builds separate vendor previews using only paid, confirmed, unsettled orders', () => {
  const previews = buildSettlementVendorPreviews(vendors, orders, items, rates, ['already-settled-a'])

  assert.deepEqual(
    previews.map(({ vendorId, orderIds, orderCount, amount }) => ({ vendorId, orderIds, orderCount, amount })),
    [
      { vendorId: 'vendor-a', orderIds: ['paid-a'], orderCount: 1, amount: 250 },
      { vendorId: 'vendor-b', orderIds: ['paid-b'], orderCount: 1, amount: 270 },
    ],
  )
  assert.deepEqual(previews[0].items, [{ orderItemId: 'item-paid-a', confirmedQuantity: 2, vendorUnitPrice: 125, amount: 250 }])
  assert.equal(
    previews.every((preview) => preview.eligible),
    true,
  )
})

test('marks vendors with no payable orders ineligible', () => {
  const previews = buildSettlementVendorPreviews(
    [vendors[0]],
    orders.filter((order) => order.id !== 'paid-a'),
    items,
    rates,
    ['already-settled-a'],
  )

  assert.equal(previews[0].eligible, false)
  assert.equal(previews[0].orderCount, 0)
  assert.equal(previews[0].amount, 0)
  assert.match(previews[0].reason, /No paid, payable orders/)
})

test('marks vendors with unverified payout accounts ineligible', () => {
  const previews = buildSettlementVendorPreviews([{ ...vendors[0], payoutAccountReady: false }], [orders[0]], [items[0]], rates, [])

  assert.equal(previews[0].eligible, false)
  assert.match(previews[0].reason, /Verify the vendor payout account/)
})

test('falls back to the stored item price when the vendor rate is unavailable', () => {
  const previews = buildSettlementVendorPreviews(
    [vendors[0]],
    [orders[0]],
    [{ ...items[0], category_id: 'no-rate', unit_price: 42 }],
    [],
    [],
  )

  assert.equal(previews[0].amount, 84)
  assert.equal(previews[0].items[0].vendorUnitPrice, 42)
})

function createFakeSettlementDatabase({ includeSecondVendorOrder = true, unreadyVendorIds = [] } = {}) {
  const vendorA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const vendorB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const data = {
    settlements: [],
    orderLinks: [],
    itemSnapshots: [],
    audits: [],
  }
  const vendorRecords = new Map([
    [vendorA, { id: vendorA, businessName: 'A Laundry', payoutAccountReady: !unreadyVendorIds.includes(vendorA) }],
    [vendorB, { id: vendorB, businessName: 'B Laundry', payoutAccountReady: !unreadyVendorIds.includes(vendorB) }],
  ])
  const orderRecords = new Map([
    ['order-a', { id: 'order-a', vendor_id: vendorA, status: 'invoiced', clothes_count_vendor: 1, invoice_status: 'paid' }],
    ...(includeSecondVendorOrder
      ? [['order-b', { id: 'order-b', vendor_id: vendorB, status: 'invoiced', clothes_count_vendor: 2, invoice_status: 'paid' }]]
      : []),
  ])
  const itemRecords = new Map([
    ['order-a', [{ id: 'item-a', order_id: 'order-a', category_id: 'shirts', confirmed_quantity: 1, service: 'wash', unit_price: 20 }]],
    ['order-b', [{ id: 'item-b', order_id: 'order-b', category_id: 'shirts', confirmed_quantity: 2, service: 'wash', unit_price: 20 }]],
  ])
  let nextSettlement = 1
  const repository = {
    async getApprovedVendor(vendorId) {
      return vendorRecords.get(vendorId) ?? null
    },
    async getPaidUnsettledOrders(vendorId) {
      return [...orderRecords.values()].filter((order) => order.vendor_id === vendorId)
    },
    async getOrderItems(orderIds) {
      return orderIds.flatMap((orderId) => itemRecords.get(orderId) ?? [])
    },
    async getRates() {
      return [{ category_id: 'shirts', vendor_wash_price: 100 }]
    },
    async createSettlement(input) {
      const id = `settlement-${nextSettlement++}`
      data.settlements.push({ id, ...input })
      return id
    },
    async linkOrder(settlementId, orderId) {
      data.orderLinks.push({ settlementId, orderId })
    },
    async saveItemSnapshot(settlementId, item) {
      data.itemSnapshots.push({ settlementId, ...item })
    },
    async writeAudit(audit) {
      data.audits.push(audit)
    },
  }

  return {
    data,
    vendorA,
    vendorB,
    async runInTransaction(work) {
      const before = structuredClone(data)
      try {
        return await work(repository)
      } catch (error) {
        data.settlements = before.settlements
        data.orderLinks = before.orderLinks
        data.itemSnapshots = before.itemSnapshots
        data.audits = before.audits
        throw error
      }
    },
  }
}

test('creates one audited, snapshotted settlement per selected vendor', async () => {
  const fake = createFakeSettlementDatabase()
  const result = await createBulkSettlementBatches(
    {
      vendorIds: [fake.vendorA, fake.vendorB],
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      adminProfileId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    },
    fake.runInTransaction,
  )

  assert.equal(result.settlements.length, 2)
  assert.equal(result.totalAmount, 300)
  assert.deepEqual(
    fake.data.settlements.map((settlement) => settlement.vendorId),
    [fake.vendorA, fake.vendorB],
  )
  assert.equal(fake.data.orderLinks.length, 2)
  assert.equal(fake.data.itemSnapshots.length, 2)
  assert.equal(fake.data.audits.length, 2)
})

test('rolls back all vendors if any selected vendor is no longer eligible', async () => {
  const fake = createFakeSettlementDatabase({ includeSecondVendorOrder: false })

  await assert.rejects(
    createBulkSettlementBatches(
      {
        vendorIds: [fake.vendorA, fake.vendorB],
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        adminProfileId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      fake.runInTransaction,
    ),
    /B Laundry: No paid, payable orders/,
  )

  assert.deepEqual(fake.data.settlements, [])
  assert.deepEqual(fake.data.orderLinks, [])
  assert.deepEqual(fake.data.itemSnapshots, [])
  assert.deepEqual(fake.data.audits, [])
})

test('rolls back all vendors if a selected payout account is not ready', async () => {
  const vendorB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const fake = createFakeSettlementDatabase({ unreadyVendorIds: [vendorB] })

  await assert.rejects(
    createBulkSettlementBatches(
      {
        vendorIds: [fake.vendorA, fake.vendorB],
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        adminProfileId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      fake.runInTransaction,
    ),
    /B Laundry: Payout account is not ready/,
  )

  assert.deepEqual(fake.data.settlements, [])
  assert.deepEqual(fake.data.orderLinks, [])
  assert.deepEqual(fake.data.itemSnapshots, [])
  assert.deepEqual(fake.data.audits, [])
})
