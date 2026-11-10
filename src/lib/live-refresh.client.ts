type RefreshSchedulerOptions = {
  /** Coalesce bursts of Realtime events (one order change can fan out into several rows) into one refetch. */
  debounceMs?: number
  /** When the tab becomes visible again, refetch only if this much time passed since the last refetch. */
  staleAfterMs?: number
  /** Poll interval used only while the Realtime channel is not connected and the tab is visible. */
  disconnectedPollMs?: number
  /** Optional safety-net poll while connected and visible. Omit to rely on Realtime alone. */
  connectedPollMs?: number
}

/**
 * Turns a React Router `revalidate` into a request-frugal refresher for Realtime-driven pages.
 *
 * Every revalidation re-runs all matched route loaders, and each loader issues many Supabase
 * requests (every one of which is logged and counted towards egress). Calling `revalidate()`
 * directly from each Realtime event, on every tab focus and on a short interval multiplies that
 * cost by every open tab. This scheduler:
 * - debounces events so a burst triggers a single revalidation,
 * - never refetches while the tab is hidden; it remembers that data is stale and refreshes once
 *   when the tab is visible again,
 * - skips the focus refresh when data was refreshed recently,
 * - polls only as a fallback while the Realtime channel is disconnected.
 */
export function createRefreshScheduler(revalidate: () => unknown, options: RefreshSchedulerOptions = {}) {
  const { debounceMs = 1_500, staleAfterMs = 60_000, disconnectedPollMs = 30_000, connectedPollMs } = options
  let debounceTimer: number | null = null
  let pollTimer: number | null = null
  let pendingWhileHidden = false
  let connected = false
  let hasConnected = false
  let disposed = false
  let lastRefreshAt = Date.now()

  const isVisible = () => document.visibilityState === 'visible'

  const run = () => {
    debounceTimer = null
    if (disposed) return
    if (!isVisible()) {
      pendingWhileHidden = true
      return
    }
    pendingWhileHidden = false
    lastRefreshAt = Date.now()
    void revalidate()
  }

  const schedule = () => {
    if (disposed) return
    if (!isVisible()) {
      pendingWhileHidden = true
      return
    }
    if (debounceTimer !== null) return
    debounceTimer = window.setTimeout(run, debounceMs)
  }

  const stopPolling = () => {
    if (pollTimer === null) return
    window.clearInterval(pollTimer)
    pollTimer = null
  }

  const syncPolling = () => {
    stopPolling()
    if (disposed || !isVisible()) return
    const interval = connected ? connectedPollMs : disconnectedPollMs
    if (!interval) return
    pollTimer = window.setInterval(() => {
      if (Date.now() - lastRefreshAt >= interval - 1_000) schedule()
    }, interval)
  }

  const handleVisibilityChange = () => {
    if (isVisible()) {
      if (pendingWhileHidden || Date.now() - lastRefreshAt >= staleAfterMs) schedule()
    }
    syncPolling()
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  syncPolling()

  return {
    /** Request a (debounced) refresh, e.g. from a Realtime event handler. */
    schedule,
    /** Feed the Realtime channel status so polling only runs while disconnected. */
    setChannelStatus(status: string) {
      const wasConnected = connected
      connected = status === 'SUBSCRIBED'
      // Catch up on anything missed while the socket was down (not on the first connect: the
      // loader data was just fetched).
      if (connected && !wasConnected && hasConnected) schedule()
      if (connected) hasConnected = true
      if (connected !== wasConnected) syncPolling()
    },
    dispose() {
      disposed = true
      if (debounceTimer !== null) window.clearTimeout(debounceTimer)
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    },
  }
}

/** Status of the row after a Realtime change, or null when it is unknown (e.g. DELETE). */
export function changedRowStatus(payload: { new?: unknown }) {
  const row = payload.new
  if (!row || typeof row !== 'object' || !('status' in row)) return null
  const status = (row as { status?: unknown }).status
  return typeof status === 'string' ? status : null
}
