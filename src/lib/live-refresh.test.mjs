import assert from 'node:assert/strict'
import test from 'node:test'
import { changedRowStatus, createRefreshScheduler } from './live-refresh.client.ts'

function installFakeDom(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] })
  const listeners = new Set()
  const document = {
    visibilityState: 'visible',
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  }
  globalThis.document = document
  globalThis.window = globalThis
  const setVisibility = (state) => {
    document.visibilityState = state
    for (const listener of listeners) listener()
  }
  t.after(() => {
    delete globalThis.document
    delete globalThis.window
  })
  return { setVisibility, listeners }
}

test('bursts of events coalesce into one revalidation', (t) => {
  installFakeDom(t)
  let calls = 0
  const refresher = createRefreshScheduler(() => calls++, { debounceMs: 1000, disconnectedPollMs: 0 })
  refresher.schedule()
  refresher.schedule()
  refresher.schedule()
  t.mock.timers.tick(999)
  assert.equal(calls, 0)
  t.mock.timers.tick(1)
  assert.equal(calls, 1)
  refresher.dispose()
})

test('events while hidden refresh once when visible again', (t) => {
  const { setVisibility } = installFakeDom(t)
  let calls = 0
  const refresher = createRefreshScheduler(() => calls++, { debounceMs: 100, disconnectedPollMs: 0 })
  setVisibility('hidden')
  refresher.schedule()
  refresher.schedule()
  t.mock.timers.tick(10_000)
  assert.equal(calls, 0)
  setVisibility('visible')
  t.mock.timers.tick(100)
  assert.equal(calls, 1)
  refresher.dispose()
})

test('focus refreshes only stale data', (t) => {
  const { setVisibility } = installFakeDom(t)
  let calls = 0
  const refresher = createRefreshScheduler(() => calls++, { debounceMs: 100, staleAfterMs: 60_000, disconnectedPollMs: 0 })
  setVisibility('hidden')
  setVisibility('visible')
  t.mock.timers.tick(1_000)
  assert.equal(calls, 0)
  setVisibility('hidden')
  t.mock.timers.tick(60_000)
  setVisibility('visible')
  t.mock.timers.tick(100)
  assert.equal(calls, 1)
  refresher.dispose()
})

test('polls only while disconnected and catches up on reconnect', (t) => {
  installFakeDom(t)
  let calls = 0
  const refresher = createRefreshScheduler(() => calls++, { debounceMs: 100, disconnectedPollMs: 30_000 })
  refresher.setChannelStatus('SUBSCRIBED')
  t.mock.timers.tick(120_000)
  assert.equal(calls, 0, 'no polling and no refresh on first connect')
  refresher.setChannelStatus('CHANNEL_ERROR')
  t.mock.timers.tick(30_000)
  t.mock.timers.tick(100)
  assert.equal(calls, 1)
  refresher.setChannelStatus('SUBSCRIBED')
  t.mock.timers.tick(100)
  assert.equal(calls, 2, 'reconnect catch-up')
  t.mock.timers.tick(120_000)
  assert.equal(calls, 2)
  refresher.dispose()
})

test('dispose stops timers and listeners', (t) => {
  const { listeners } = installFakeDom(t)
  let calls = 0
  const refresher = createRefreshScheduler(() => calls++, { debounceMs: 100 })
  refresher.schedule()
  refresher.dispose()
  t.mock.timers.tick(60_000)
  assert.equal(calls, 0)
  assert.equal(listeners.size, 0)
})

test('changedRowStatus reads the new row status', () => {
  assert.equal(changedRowStatus({ new: { status: 'pending_pickup' } }), 'pending_pickup')
  assert.equal(changedRowStatus({ new: {} }), null)
  assert.equal(changedRowStatus({}), null)
})
