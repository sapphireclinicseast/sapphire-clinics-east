'use client'

// Header "Contact Us" dropdown — Aura Health Rehab East + Greenhills details.
import { useEffect, useRef, useState } from 'react'
import { AURA_BRANCHES, AuraHeading, BranchBlock } from './Directory'
import { FOCUS } from '@/components/hub/ui'

/** Public-header nav-link box (PublicHeader uses it for every link, so this
 *  trigger lines up with them). No display class: callers add inline-flex
 *  (or `hidden sm:inline-flex`) themselves. */
export const NAV_LINK = `items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg whitespace-nowrap transition-colors ${FOCUS}`

export default function ContactMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex ${NAV_LINK} ${open ? '' : 'hover:bg-[color:var(--paper-2)] hover:text-[color:var(--moss)]'}`}
        style={open ? { background: 'var(--paper-2)', color: 'var(--deep-teal)', fontWeight: 600 } : { color: 'var(--narra)' }}
      >
        Contact Us
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className={`hidden sm:block transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        // Phones: pinned under the header across the screen (the trigger sits
        // mid-row, so a right-anchored 330px panel would run off the left).
        <div
          role="dialog"
          aria-label="Contact Aura Health Rehab"
          className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:w-[330px] mt-2 rounded-xl bg-white shadow-xl p-4 sm:p-5 z-50 animate-fade-in"
          style={{ fontFamily: 'var(--font-body)', border: '1px solid var(--light-gray)' }}
        >
          <AuraHeading />
          <div className="mt-4 space-y-4">
            {AURA_BRANCHES.map((b) => (
              <BranchBlock key={b.name} b={b} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
