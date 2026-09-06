import type { CSSProperties } from 'react'

const bubbles = [
  { size: 10, left: 7, bottom: 2, duration: 18, delay: -4 },
  { size: 20, left: 16, bottom: 11, duration: 23, delay: -14 },
  { size: 14, left: 27, bottom: 5, duration: 20, delay: -8 },
  { size: 34, left: 38, bottom: -4, duration: 27, delay: -20 },
  { size: 12, left: 49, bottom: 8, duration: 19, delay: -2 },
  { size: 26, left: 59, bottom: 3, duration: 24, delay: -12 },
  { size: 16, left: 70, bottom: 13, duration: 21, delay: -17 },
  { size: 42, left: 82, bottom: -7, duration: 30, delay: -24 },
  { size: 11, left: 92, bottom: 7, duration: 17, delay: -7 },
]

const centeredPositions = [32, 44, 56, 68]

type BubblyBackgroundProps = {
  count?: number
  color?: string
  opacity?: number
  scale?: number
  className?: string
  contained?: boolean
  centered?: boolean
}

export default function BubblyBackground({
  count = bubbles.length,
  color = '#00b7d4',
  opacity = 0.12,
  scale = 1,
  className = '',
  contained = false,
  centered = false,
}: BubblyBackgroundProps) {
  return (
    <div className={`qaffy-bubbles ${contained ? 'qaffy-bubbles--contained' : ''} ${centered ? 'qaffy-bubbles--centered' : ''} ${className}`} aria-hidden="true">
      {bubbles.slice(0, count).map((bubble, index) => (
        <span
          key={`${bubble.left}-${index}`}
          className="qaffy-bubble"
          style={{
            '--bubble-color': color,
            '--bubble-opacity': opacity,
            '--bubble-size': `${bubble.size}px`,
            '--bubble-scale': scale,
            '--bubble-left': centered ? `${centeredPositions[index % centeredPositions.length]}%` : `${bubble.left}%`,
            '--bubble-bottom': `${bubble.bottom}%`,
            '--bubble-duration': `${bubble.duration}s`,
            '--bubble-delay': `${bubble.delay}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}
