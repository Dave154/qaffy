import { Copy } from 'lucide-react'
import { toast } from '../lib/toast'

type CopyableOrderIdProps = {
  id: string
  className?: string
  label?: string
}

function getDisplayId(id: string) {
  return id.length > 8 ? `${id.slice(0, 8)}...` : id
}

export default function CopyableOrderId({ id, className = '', label = 'Order ID' }: CopyableOrderIdProps) {
  async function copyOrderId() {
    await navigator.clipboard.writeText(id)
    toast.success(`${label} copied`)
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span title={id}>{getDisplayId(id)}</span>
      <button
        type="button"
        onClick={copyOrderId}
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-brand-primary"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}