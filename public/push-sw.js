self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  const payload = event.data.json()
  const title = payload.title || 'Qaffy update'
  const options = {
    body: payload.body || 'You have a new Qaffy update.',
    icon: '/qaffy-notification.svg',
    badge: '/qaffy-notification.svg',
    tag: payload.tag || 'qaffy-update',
    renotify: true,
    timestamp: Date.now(),
    data: { url: payload.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => 'focus' in client)
      if (existingClient) {
        existingClient.navigate(url)
        return existingClient.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
