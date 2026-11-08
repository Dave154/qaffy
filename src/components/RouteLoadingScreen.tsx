import { useEffect, useState } from 'react'
import { useNavigation } from 'react-router'

type RouteLoadingScreenProps = {
  isLoading?: boolean
  watchNavigation?: boolean
  maxDurationMs?: number
}

export default function RouteLoadingScreen({
  isLoading = false,
  watchNavigation = true,
  maxDurationMs,
}: RouteLoadingScreenProps) {
  const navigation = useNavigation()
  const isNavigating = isLoading || (watchNavigation && navigation.state !== 'idle')
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    let showTimer: number | undefined
    let hideTimer: number | undefined
    if (isNavigating) {
      showTimer = window.setTimeout(() => setIsVisible(true), 0)
      if (maxDurationMs !== undefined) {
        hideTimer = window.setTimeout(() => setIsVisible(false), maxDurationMs)
      }
    } else {
      hideTimer = window.setTimeout(() => setIsVisible(false), 250)
    }
    return () => {
      if (showTimer) window.clearTimeout(showTimer)
      if (hideTimer) window.clearTimeout(hideTimer)
    }
  }, [isNavigating, maxDurationMs])

  if (!isVisible) return null

  return (
    <div
      className="route-loading-screen fixed inset-0 z-[100] flex items-center justify-center bg-[#0d1016]/65 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-label="Loading Qaffy"
    >
      <div className="flex flex-col items-center">
        <svg className="route-loading-logo" viewBox="0 0 260 100" role="img" aria-label="Qaffy">
          <text x="130" y="72" textAnchor="middle">
            <tspan className="route-loading-letter" style={{ animationDelay: '0.1s' }}>
              Q
            </tspan>
            <tspan className="route-loading-letter" style={{ animationDelay: '0.42s' }}>
              a
            </tspan>
            <tspan className="route-loading-letter" style={{ animationDelay: '0.74s' }}>
              f
            </tspan>
            <tspan className="route-loading-letter" style={{ animationDelay: '1.06s' }}>
              f
            </tspan>
            <tspan className="route-loading-letter" style={{ animationDelay: '1.38s' }}>
              y
            </tspan>
          </text>
        </svg>
      </div>
    </div>
  )
}
