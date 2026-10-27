import { RefreshCw } from 'lucide-react'

type RecoverableErrorProps = {
  title: string
  description?: string
  onRetry: () => void
  retrying?: boolean
  retryLabel?: string
  className?: string
}

export default function RecoverableError({
  title,
  description,
  onRetry,
  retrying = false,
  retryLabel = 'Try again',
  className = '',
}: RecoverableErrorProps) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 ${className}`.trim()}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">{title}</p>
          {description && <p className="mt-1 text-rose-800">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-rose-300 bg-white px-3 py-2 font-semibold text-rose-900 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60 sm:self-auto"
        >
          <RefreshCw size={15} className={retrying ? 'animate-spin' : ''} aria-hidden="true" />
          {retrying ? 'Retrying…' : retryLabel}
        </button>
      </div>
    </div>
  )
}
