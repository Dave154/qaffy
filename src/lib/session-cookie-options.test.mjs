import assert from 'node:assert/strict'
import test from 'node:test'
import { getSessionCookieOptions } from './session-cookie-options.ts'

test('keeps the configured cookie lifetime when stay signed in is enabled', () => {
  const options = { path: '/', maxAge: 400 * 24 * 60 * 60 }
  assert.deepEqual(getSessionCookieOptions(options, true), options)
})

test('removes the lifetime from session cookies when stay signed in is disabled', () => {
  assert.deepEqual(getSessionCookieOptions({ path: '/', maxAge: 34560000 }, false), { path: '/' })
})

test('preserves cookie deletion expiry when stay signed in is disabled', () => {
  assert.deepEqual(getSessionCookieOptions({ path: '/', maxAge: 0 }, false), { path: '/', maxAge: 0 })
})

test('leaves cookie options without a lifetime unchanged', () => {
  const options = { path: '/' }
  assert.deepEqual(getSessionCookieOptions(options, false), options)
})
