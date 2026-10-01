import { X } from 'lucide-react'
import type { ReactNode } from 'react'

type AdminSideDrawerProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}

export default function AdminSideDrawer({ isOpen, onClose, title, description, children }: AdminSideDrawerProps) {
  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/35" role="presentation" onMouseDown={onClose}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          aria-label="Close drawer"
          className="absolute top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900"
          style={{ right: 'min(572px, calc(100vw - 36px))' }}
        >
          <X size={17} />
        </button>
      </div>

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-side-drawer-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-48px)] max-w-[560px] flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
      >
        <header className="border-b border-slate-100 px-6 py-5 sm:px-7">
          <h2 id="admin-side-drawer-title" className="text-xl font-bold text-slate-900">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </header>
        <div className="flex min-h-[calc(100vh-81px)] flex-1 flex-col px-6 py-6 sm:px-8">{children}</div>
      </aside>
    </>
  )
}
