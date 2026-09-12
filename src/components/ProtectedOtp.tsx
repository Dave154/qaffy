type ProtectedOtpProps = {
  value?: string
  className?: string
  digitClassName?: string
  length?: number
  containerClassName?: string
}

export default function ProtectedOtp({ value = '', className = 'gap-2', digitClassName = '', length = 4, containerClassName = '' }: ProtectedOtpProps) {
  const digits = (value ?? '').replace(/\D/g, '').slice(0, length)

  return (
    <div
      className={`select-none [webkit-user-select:none] [webkit-touch-callout:none] ${containerClassName}`}
      style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      onCopy={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onTouchStart={(event) => event.preventDefault()}
      aria-label="One-time password"
    >
      <div className={`flex items-center ${className}`}>
        {Array.from({ length }).map((_, index) => (
          <span
            key={`${value}-${index}`}
            className={`flex h-11 w-11 items-center justify-center rounded-md border border-brand-primary bg-white text-lg font-bold text-brand-primary shadow-[inset_0_0_0_1px_rgba(0,183,212,0.08)] ${digitClassName}`}
          >
            {digits[index] ?? ''}
          </span>
        ))}
      </div>
    </div>
  )
}
