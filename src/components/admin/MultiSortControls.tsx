import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, List, X } from 'lucide-react'

export type MultiSortRule<T extends string = string> = { column: T; direction: 'asc' | 'desc' }
export type MultiSortOption<T extends string = string> = { value: T; label: string }

export function MultiSortManager<T extends string>({
  columns,
  rules,
  onApply,
}: {
  columns: MultiSortOption<T>[]
  rules: MultiSortRule<T>[]
  onApply: (rules: MultiSortRule<T>[]) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [draftRules, setDraftRules] = useState<MultiSortRule<T>[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const open = () => {
    setDraftRules(rules.map((rule) => ({ ...rule })))
    setIsOpen(true)
  }
  const updateDraftRule = (index: number, updates: Partial<MultiSortRule<T>>) => {
    setDraftRules((current) => current.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...updates } : rule)))
  }
  const reorderDraftRule = (index: number, nextIndex: number) => {
    setDraftRules((current) => {
      if (nextIndex < 0 || nextIndex >= current.length || nextIndex === index) return current
      const next = [...current]
      const [rule] = next.splice(index, 1)
      next.splice(nextIndex, 0, rule)
      return next
    })
  }
  const addDraftRule = (column: T) => {
    if (draftRules.some((rule) => rule.column === column)) return
    setDraftRules((current) => [...current, { column, direction: 'asc' }])
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={open}
        className="inline-flex h-6 items-center justify-center gap-2 rounded-xs px-2 text-slate-900 transition-colors hover:bg-brand-primary/5"
      >
        <List size={13} strokeWidth={2} className="text-brand-primary" />
        <span className="text-sm">
          {rules.length === 0 ? 'No sorting' : `Sorted by ${rules.length} ${rules.length === 1 ? 'rule' : 'rules'}`}
        </span>
      </button>
      {isOpen && (
        <div
          role="dialog"
          aria-label="Manage sorting"
          className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[min(92vw,520px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl"
        >
          <div className="space-y-2">
            {draftRules.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No sorts applied to this view. Add a column below to sort the view.
              </p>
            ) : (
              draftRules.map((rule, index) => {
                const sortLabel = index === 0 ? 'Sort by' : 'Then by'
                const columnLabel = columns.find((column) => column.value === rule.column)?.label ?? rule.column
                return (
                  <div
                    key={`${rule.column}-${index}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault()
                      const from = Number(event.dataTransfer.getData('text/plain'))
                      if (Number.isInteger(from)) reorderDraftRule(from, index)
                    }}
                    className="flex min-w-0 items-center gap-2 border-b border-slate-100 py-2 last:border-b-0"
                  >
                    <button
                      type="button"
                      draggable
                      aria-label={`Reorder ${sortLabel.toLowerCase()} ${columnLabel}`}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', String(index))
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp' && index > 0) {
                          event.preventDefault()
                          reorderDraftRule(index, index - 1)
                        } else if (event.key === 'ArrowDown' && index < draftRules.length - 1) {
                          event.preventDefault()
                          reorderDraftRule(index, index + 1)
                        }
                      }}
                      className="shrink-0 cursor-grab touch-none text-slate-400 active:cursor-grabbing"
                    >
                      <GripVertical size={16} />
                    </button>
                    <span className="shrink-0 text-[11px] text-slate-500">{sortLabel}</span>
                    <select
                      aria-label={`${sortLabel} column`}
                      value={rule.column}
                      onChange={(event) => updateDraftRule(index, { column: event.target.value as T })}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
                    >
                      {columns.map((column) => (
                        <option
                          key={column.value}
                          value={column.value}
                          disabled={draftRules.some((existing, ruleIndex) => ruleIndex !== index && existing.column === column.value)}
                        >
                          {column.label}
                        </option>
                      ))}
                    </select>
                    <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] text-slate-500">
                      <span>Ascending</span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={rule.direction === 'asc'}
                        onChange={(event) => updateDraftRule(index, { direction: event.target.checked ? 'asc' : 'desc' })}
                        aria-label={`${sortLabel} ${columnLabel} ascending`}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="relative h-5 w-9 rounded-full bg-slate-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-brand-primary peer-checked:after:translate-x-4"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={`Remove ${sortLabel.toLowerCase()} ${columnLabel}`}
                      onClick={() => setDraftRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index))}
                      className="shrink-0 text-slate-400 hover:text-rose-600"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <select
              aria-label="Add another sort column"
              value=""
              onChange={(event) => {
                if (event.target.value) addDraftRule(event.target.value as T)
              }}
              disabled={draftRules.length >= columns.length}
              className="h-9 max-w-full rounded-lg border border-slate-200 bg-white px-2 text-xs disabled:opacity-50"
            >
              <option value="">Pick another column to sort by</option>
              {columns
                .filter((column) => !draftRules.some((rule) => rule.column === column.value))
                .map((column) => (
                  <option key={column.value} value={column.value}>
                    {column.label}
                  </option>
                ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onApply(draftRules)
                  setIsOpen(false)
                }}
                className="h-9 rounded-lg bg-brand-primary px-3 text-xs font-semibold text-white hover:bg-brand-primary-hover"
              >
                Apply sorting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function SortColumnHeader({
  label,
  direction,
  onSort,
}: {
  label: string
  direction: 'asc' | 'desc' | null
  onSort: (direction: 'asc' | 'desc') => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])
  const selectDirection = (nextDirection: 'asc' | 'desc') => {
    onSort(nextDirection)
    setIsOpen(false)
  }
  return (
    <div className="relative inline-flex" ref={menuRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-slate-100"
      >
        {label}
        {direction ? direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : null}
        <ChevronDown size={12} />
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label={`${label} sort options`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setIsOpen(false)
          }}
          className="absolute left-0 top-full z-20 mt-1 min-w-56 rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium normal-case tracking-normal text-slate-700 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => selectDirection('asc')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-100 ${direction === 'asc' ? 'bg-slate-100' : ''}`}
          >
            <ArrowUp size={14} />
            Sort Ascending
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => selectDirection('desc')}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-100 ${direction === 'desc' ? 'bg-slate-100' : ''}`}
          >
            <ArrowDown size={14} />
            Sort Descending
          </button>
        </div>
      )}
    </div>
  )
}
