import assert from 'node:assert/strict'
import test from 'node:test'
import { isReadyForDispatch, isReadyForFinalDelivery } from './orderLifecycle.ts'

test('dispatch is available only for vendor-confirmed orders with a matching invoice state', () => {
  assert.equal(isReadyForDispatch('paid', 'paid'), true)
  assert.equal(isReadyForDispatch('invoiced', 'unpaid'), true)
  assert.equal(isReadyForDispatch('paid', 'unpaid'), false)
  assert.equal(isReadyForDispatch('invoiced', 'paid'), false)
  assert.equal(isReadyForDispatch('invoiced', null), false)
  assert.equal(isReadyForDispatch('at_vendor', 'unpaid'), false)
})

test('final delivery is available only for dispatched orders with a paid invoice', () => {
  assert.equal(isReadyForFinalDelivery('out_for_delivery', 'paid'), true)
  assert.equal(isReadyForFinalDelivery('out_for_delivery', 'unpaid'), false)
  assert.equal(isReadyForFinalDelivery('paid', 'paid'), false)
})
