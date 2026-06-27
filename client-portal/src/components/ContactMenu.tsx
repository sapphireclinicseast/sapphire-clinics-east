'use client'

// Header "Contact Us" dropdown — Aura Health Rehab East + Greenhills details.
import { useEffect, useRef, useState } from 'react'
import { AURA_BRANCHES, AuraHeading, BranchBlock } from './Directory'

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
        className="px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors"
      >
        Contact Us
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[330px] max-w-[88vw] rounded-2xl border border-[color:var(--paper-3)] bg-white shadow-xl p-5 z-50 animate-fade-in"
          style={{ fontFamily: 'var(--font-body)' }}
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
