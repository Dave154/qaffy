const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const PUSH_TIMEOUT_MS = 12000

function withTimeout<T>(promise: Promise<T>, message: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), PUSH_TIMEOUT_MS)),
  ])
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

function assertPushSupport() {
  if (/Electron|\bCode\//i.test(navigator.userAgent)) {
    throw new Error('Web Push is not available in the VS Code embedded browser. Open Qaffy in Chrome or Edge.')
  }
  if (!vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('Notifications are not available in this browser.')
  }
}

export async function getPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const registration = await navigator.serviceWorker.getRegistration('/push-sw.js')
  return registration?.pushManager.getSubscription() ?? null
}

export async function ensurePushSubscription() {
  assertPushSupport()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'Notifications are blocked in this browser.' : 'Notification permission was not granted.')
  }

  const registration = await withTimeout(navigator.serviceWorker.register('/push-sw.js'), 'The notification service worker could not start.')
  await withTimeout(registration.update(), 'The notification service worker could not update.')
  await withTimeout(navigator.serviceWorker.ready, 'The browser notification service did not become ready.')
  const existingSubscription = await withTimeout(registration.pushManager.getSubscription(), 'The browser notification service did not respond.')
  if (existingSubscription) return existingSubscription

  try {
    return await withTimeout(registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
    }), 'The browser push service did not respond. Check browser notification settings or try Chrome/Edge.')
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const normalizedMessage = message.toLowerCase()
    if (normalizedMessage.includes('push service not available') || normalizedMessage.includes('push service error')) {
      throw new Error('This browser cannot reach its push service. In Brave, disable Shields for Qaffy; otherwise try Chrome or Edge over HTTPS.')
    }
    throw error
  }
}

export async function savePushSubscription(subscription: PushSubscription) {
  const response = await withTimeout(fetch('/api/push-subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  }), 'Saving the notification subscription timed out.')
  if (!response.ok) throw new Error('The notification subscription could not be saved.')
}

export async function removePushSubscription(subscription: PushSubscription) {
  const response = await withTimeout(fetch('/api/push-subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }), 'Removing the notification subscription timed out.')
  if (!response.ok) throw new Error('The notification subscription could not be removed.')
  await subscription.unsubscribe()
}
