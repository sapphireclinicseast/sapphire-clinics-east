'use client'

// A chart-of-account field you can type into.
//
// A native <select> only jumps to whatever starts with the character you press,
// which for these accounts means the leading digit — so tagging meant scrolling
// to find the right one. Here you type any part of the number OR the title and
// the list narrows: "rent" finds 8210 Rent Expense, and so does "8210".
//
// The value stays whatever the calling screen already stored (some keep the
// account title, others the id), so this drops into existing forms without
// touching what they save.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, ChevronDown } from 'lucide-react'

export interface PickableAccount {
  id: string
  accountNumber: string
  accountTitle: string
  accountType?: string
}

/** Matches when every word typed appears somewhere in "number title". */
export function accountMatches(a: PickableAccount, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = `${a.accountNumber} ${a.accountTitle}`.toLowerCase()
  return q.split(/\s+/).every(word => hay.includes(word))
}

/** Number first, then title — the order accountants read them in. */
export function accountLabel(a: PickableAccount): string {
  return `${a.accountNumber} · ${a.accountTitle}`
}

/** The "8210 Rent Expense" form some grids store in a single text column. */
export const numberTitle = (a: PickableAccount) => `${a.accountNumber} ${a.accountTitle}`

export function AccountPicker({
  accounts, value, onChange, valueKey = 'accountTitle',
  placeholder = 'Search account number or name…', disabled, className, id, emptyLabel = 'No account matches that.', clearLabel,
}: {
  accounts: PickableAccount[]
  /** Current value, matched against whichever `valueKey` the screen stores. */
  value: string
  onChange: (next: string, account: PickableAccount | null) => void
  valueKey?: 'accountTitle' | 'id' | 'accountNumber' | 'numberTitle'
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  emptyLabel?: string
  /** Shown as the first row and sets the value back to blank. */
  clearLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // The menu renders in a portal at fixed coordinates: inside the expenses grid
  // it would otherwise be clipped by the table's own scroll container.
  const [rect, setRect] = useState<{ top: number; left: number; width: number; below: boolean } | null>(null)
  const place = () => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom > 280 || r.top < 280
    setRect({ top: below ? r.bottom + 4 : r.top - 4, left: r.left, width: r.width, below })
  }
  useEffect(() => {
    if (!open) { setRect(null); return }
    place()
    const on = () => place()
    window.addEventListener('scroll', on, true)
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on, true); window.removeEventListener('resize', on) }
  }, [open])

  const keyOf = useMemo(
    () => (a: PickableAccount) => (valueKey === 'numberTitle' ? numberTitle(a) : String(a[valueKey] ?? '')),
    [valueKey],
  )
  const selected = useMemo(() => accounts.find(a => keyOf(a) === value) || null, [accounts, value, keyOf])
  const shown = useMemo(() => accounts.filter(a => accountMatches(a, query)), [accounts, query])

  // Clicking away closes without changing anything — the field keeps its value.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      // The menu lives in a portal, so it is outside boxRef — check it too, or
      // clicking an option would close the list before the click landed.
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false); setQuery('')
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => { setActive(0) }, [query])

  const pick = (a: PickableAccount) => {
    onChange(keyOf(a), a)
    setOpen(false); setQuery('')
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery('') }
  }

  const base = className || 'w-full px-2 py-1.5 rounded-lg border text-xs'

  return (
    <div ref={boxRef} className="relative">
      {!open ? (
        <button type="button" id={id} disabled={disabled} onClick={() => !disabled && setOpen(true)}
          className={`${base} text-left flex items-center justify-between gap-2 disabled:opacity-60`}
          style={{ borderColor: 'var(--light-gray)', background: disabled ? 'var(--off-white)' : 'white' }}>
          <span className="truncate" style={{ color: selected ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
            {selected ? accountLabel(selected) : (value || placeholder)}
          </span>
          <ChevronDown size={13} style={{ color: 'var(--mid-gray)', flexShrink: 0 }} />
        </button>
      ) : (
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--mid-gray)' }} />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey}
            placeholder={placeholder} className={`${base} pl-7 pr-6`} style={{ borderColor: 'var(--teal)' }} />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: 'var(--mid-gray)' }} />
            </button>
          )}
        </div>
      )}

      {open && rect && createPortal(
        <div ref={menuRef} className="rounded-lg border bg-white shadow-lg overflow-auto"
          style={{
            position: 'fixed', top: rect.below ? rect.top : undefined,
            bottom: rect.below ? undefined : window.innerHeight - rect.top,
            left: rect.left, width: rect.width, maxHeight: 260, zIndex: 9999,
            borderColor: 'var(--light-gray)',
          }}>
          {clearLabel && (
            <button type="button" onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange('', null); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-1.5 text-xs border-b"
              style={{ color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
              {clearLabel}
            </button>
          )}
          {shown.length === 0 ? (
            <p className="px-3 py-2.5 text-xs" style={{ color: 'var(--mid-gray)' }}>{emptyLabel}</p>
          ) : shown.map((a, i) => (
            <button key={a.id} type="button" onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(a)}
              className="w-full text-left px-3 py-1.5 text-xs flex items-baseline gap-2"
              style={{
                background: i === active ? 'var(--pale-teal)' : undefined,
                color: 'var(--charcoal)',
                fontWeight: selected?.id === a.id ? 600 : 400,
              }}>
              <span className="font-mono" style={{ color: 'var(--deep-teal)', flexShrink: 0 }}>{a.accountNumber}</span>
              <span className="truncate">{a.accountTitle}</span>
            </button>
          ))}
        </div>, document.body)}

    </div>
  )
}
