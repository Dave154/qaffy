import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidVendorReceivedItems } from './vendor-received-counts.ts'

test('accepts zero and positive received counts', () => {
  assert.equal(isValidVendorReceivedItems([{ itemId: 'item-1', quantity: 0 }]), true)
  assert.equal(isValidVendorReceivedItems([{ itemId: 'item-1', quantity: 1 }]), true)
  assert.equal(
    isValidVendorReceivedItems([
      { itemId: 'item-zero', quantity: 0 },
      { itemId: 'item-positive', quantity: 3 },
    ]),
    true,
  )
})

test('rejects negative received counts', () => {
  assert.equal(isValidVendorReceivedItems([{ itemId: 'item-1', quantity: -1 }]), false)
})

test('rejects missing item IDs and non-integer quantities', () => {
  assert.equal(isValidVendorReceivedItems([{ itemId: '', quantity: 1 }]), false)
  assert.equal(isValidVendorReceivedItems([{ itemId: 'item-1', quantity: 1.5 }]), false)
})