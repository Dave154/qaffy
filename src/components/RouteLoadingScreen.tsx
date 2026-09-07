import { useNavigation } from 'react-router'

export default function RouteLoadingScreen() {
  const navigation = useNavigation()
  const isNavigating = navigation.state !== 'idle'

  if (!isNavigating) return null

  return (
    <div className="route-loading-screen fixed inset-0 z-[100] flex items-center justify-center bg-white/45 backdrop-blur-[2px]" role="status" aria-live="polite" aria-label="Loading Qaffy">
      <div className="flex flex-col items-center">
        <svg className="route-loading-logo" viewBox="0 0 260 100" role="img" aria-label="Qaffy">
          <text x="130" y="72" textAnchor="middle">
            <tspan className="route-loading-letter" style={{ animationDelay: '0.1s' }}>Q</tspan>
            <tspan className="route-loading-letter" style={{ animationDelay: '0.42s' }}>a</tspan>
            <tspan className="route-loading-letter" style={{ animationDelay: '0.74s' }}>f</tspan>
            <tspan className="route-loading-letter" style={{ animationDelay: '1.06s' }}>f</tspan>
            <tspan className="route-loading-letter" style={{ animationDelay: '1.38s' }}>y</tspan>
          </text>
        </svg>
      </div>
    </div>
  )
}