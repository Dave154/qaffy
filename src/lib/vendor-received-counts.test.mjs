import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidVendorReceivedItems } from './vendor-received-counts.ts'

test('accepts a received count of one', () => {
  assert.equal(isValidVendorReceivedItems([{ itemId: 'item-1', quantity: 1 }]), true)
})

test('rejects zero and negative received counts', () => {
  assert.equal(isValidVendorReceivedItems([{ itemId: 'item-1', quantity: 0 }]), false)
  assert.equal(isValidVendorReceivedItems([{ itemId: 'item-1', quantity: -1 }]), false)
})

test('rejects missing item IDs and non-integer quantities', () => {
  assert.equal(isValidVendorReceivedItems([{ itemId: '', quantity: 1 }]), false)
  assert.equal(isValidVendorReceivedItems([{ itemId: 'item-1', quantity: 1.5 }]), false)
})