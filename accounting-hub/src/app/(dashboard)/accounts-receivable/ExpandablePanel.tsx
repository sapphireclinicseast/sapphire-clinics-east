'use client'

import { useEffect, useState } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'

/**
 * Wraps one of the receivables tables so it can be opened full-screen.
 *
 * The tables are scroll-boxed to a few hundred pixels so four of them fit on
 * one dashboard, which makes anything with more than a handful of agencies
 * painful to read. Expanding lifts the same table into an overlay with the
 * height cap removed — the children render once and are simply re-parented, so
 * there is no second copy of the markup to keep in sync.
 */
export default function ExpandablePanel({
  title,
  subtitle,
  children,
  maxHeight = 260,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  /** Collapsed scroll height in px. Ignored when expanded. */
  maxHeight?: number
}) {
  const [expanded, setExpanded] = useState(false)

  // Escape closes, and the page behind must not scroll while the overlay is up.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [expanded])

  const toggle = (
    <button
      onClick={() => setExpanded(v => !v)}
      title={expanded ? 'Collapse' : 'Expand to full screen'}
      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border hover:bg-gray-50 shrink-0"
      style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
      {expanded ? <><Minimize2 size={12} /> Collapse</> : <><Maximize2 size={12} /> Expand</>}
    </button>
  )

  const header = (
    <div className="flex items-start justify-between gap-3 mb-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>{title}</p>
        {subtitle && <p className="text-[10px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{subtitle}</p>}
      </div>
      {toggle}
    </div>
  )

  if (!expanded) {
    return (
      <div>
        {header}
        <div className="rounded-xl border overflow-auto"
          style={{ borderColor: 'var(--light-gray)', background: 'white', maxHeight }}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col p-4 sm:p-6" style={{ background: 'rgba(15,23,42,0.55)' }}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full h-full overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{title}</p>
            {subtitle && <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {toggle}
            <button onClick={() => setExpanded(false)} className="p-1.5 rounded-lg hover:bg-gray-200" title="Close">
              <X size={16} style={{ color: 'var(--mid-gray)' }} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  )
}
