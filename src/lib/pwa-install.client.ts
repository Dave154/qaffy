export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>()
const installedListeners = new Set<() => void>()
let initialized = false

export function initializePwaInstall() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    listeners.forEach((listener) => listener(deferredPrompt))
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    listeners.forEach((listener) => listener(null))
    installedListeners.forEach((listener) => listener())
  })

  if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/push-sw.js')
}

export function getPwaInstallPrompt() {
  return deferredPrompt
}

export function subscribeToPwaInstallPrompt(listener: (prompt: BeforeInstallPromptEvent | null) => void) {
  listeners.add(listener)
  listener(deferredPrompt)
  return () => {
    listeners.delete(listener)
  }
}

export function subscribeToPwaInstalled(listener: () => void) {
  installedListeners.add(listener)
  return () => {
    installedListeners.delete(listener)
  }
}

if (typeof window !== 'undefined') initializePwaInstall()
