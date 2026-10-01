import { Download, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getPwaInstallPrompt,
  initializePwaInstall,
  subscribeToPwaInstallPrompt,
  subscribeToPwaInstalled,
  type BeforeInstallPromptEvent,
} from '../lib/pwa-install.client'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

export default function PwaInstallLink() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)

  useEffect(() => {
    initializePwaInstall()
    if (isStandalone()) {
      setInstalled(true)
      return
    }

    setInstallPrompt(getPwaInstallPrompt())
    const unsubscribeFromPrompt = subscribeToPwaInstallPrompt((prompt) => {
      setInstallPrompt(prompt)
    })
    const unsubscribeFromInstalled = subscribeToPwaInstalled(() => setInstalled(true))
    return () => {
      unsubscribeFromPrompt()
      unsubscribeFromInstalled()
    }
  }, [])

  if (installed) return null

  const handleInstall = async () => {
    setIsPressed(true)
    window.setTimeout(() => setIsPressed(false), 500)
    if (!installPrompt) {
      setIsPreparing(true)
      window.setTimeout(() => setIsPreparing(false), 1200)
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setInstallPrompt(null)
  }

  return (
    <div className="my-3 rounded-xl border border-brand-border bg-brand-soft p-1">
      <button
        type="button"
        onClick={() => void handleInstall()}
        aria-label="Install Qaffy app"
        className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${isPressed ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-primary hover:bg-brand-soft-hover'}`}
      >
        {isPreparing ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{isPreparing ? 'Opening install...' : 'Install Qaffy'}</span>
      </button>
    </div>
  )
}
