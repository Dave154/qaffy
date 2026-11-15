import { AlertCircle, RefreshCw } from 'lucide-react'

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
      className={`rounded-2xl border border-rose-100 bg-rose-50/40 p-3.5 text-sm shadow-sm sm:bg-white sm:p-5 ${className}`.trim()}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100/70 text-rose-600 sm:h-9 sm:w-9">
            <AlertCircle size={16} className="sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{title}</p>
            {description && <p className="mt-1 text-slate-600">{description}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 self-stretch rounded-xl bg-brand-primary px-4 py-3 font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:self-auto sm:py-2.5"
        >
          <RefreshCw size={15} className={retrying ? 'animate-spin' : ''} aria-hidden="true" />
          {retrying ? 'Retrying…' : retryLabel}
        </button>
      </div>
    </div>
  )
}
