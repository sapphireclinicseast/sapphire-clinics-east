'use client'

// A free-text input with a styled suggestion list (e.g. staff names for an
// asset's custodian). Replaces <datalist>, whose browser-drawn popup on macOS
// showed huge bold rows offset from the field (Hannah, 2026-11-01). Typing
// anything is still allowed; the list only suggests.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}

export function NameCombobox({ value, onChange, options, placeholder, className, style, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<{ left: number; top: number; width: number; below: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const q = value.trim().toLowerCase()
  const shown = useMemo(
    () => options.filter(o => !q || o.toLowerCase().includes(q)).slice(0, 60),
    [options, q],
  )

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom >= 240 || r.top < 240
      setRect({ left: r.left, top: below ? r.bottom + 4 : r.top - 4, width: r.width, below })
    }
    place()
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (inputRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  const pick = (v: string) => { onChange(v); setOpen(false) }
  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); pick(shown[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  // Nothing to suggest once the field already holds the only match.
  const showMenu = open && rect && shown.length > 0 && !(shown.length === 1 && shown[0] === value)

  return (
    <>
      <input ref={inputRef} type="text" value={value} disabled={disabled} placeholder={placeholder}
        className={className} style={style} autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0) }}
        onKeyDown={onKey} />
      {showMenu && createPortal(
        <div ref={menuRef} className="rounded-lg border bg-white shadow-lg overflow-auto py-1"
          style={{
            position: 'fixed', left: rect.left, width: rect.width, maxHeight: 220, zIndex: 9999,
            top: rect.below ? rect.top : undefined, bottom: rect.below ? undefined : window.innerHeight - rect.top,
            borderColor: 'var(--light-gray, #e5e7eb)',
          }}>
          {shown.map((o, i) => (
            <button key={o} type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
              className="block w-full text-left px-3 py-1.5 text-sm truncate"
              style={{ background: i === active ? 'var(--pale-teal, #f0fdfa)' : undefined, color: 'var(--charcoal, #1f2937)' }}>
              {o}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
