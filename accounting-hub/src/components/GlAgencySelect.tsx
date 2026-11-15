'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { AGENCY_ERROR, GL_AGENCIES, agencyOptions, parseAgency } from '@/lib/gl-stage'

// The Guarantee Letter agency list for a page: STAR, ODESFA, LGU plus every
// agency already in use (/api/accounts-receivable/gl-agencies). `add` puts a
// newly typed agency in the list straight away, before anything reloads.
export function useGlAgencies(seen: Array<string | null | undefined> = []) {
  const [fetched, setFetched] = useState<string[]>([...GL_AGENCIES])
  const [added, setAdded] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    fetch('/api/accounts-receivable/gl-agencies')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && Array.isArray(d?.agencies)) setFetched(d.agencies) })
      .catch(() => { /* the defaults still work */ })
    return () => { alive = false }
  }, [])
  const agencies = agencyOptions([...fetched, ...added, ...seen])
  const add = (name: string) => setAdded(a => (a.includes(name) ? a : [...a, name]))
  return { agencies, add }
}

const ADD = '__add_agency__'

/**
 * An agency dropdown with "+ Add agency…" at the end: it asks for the name,
 * checks it, adds it to the list and picks it. Saving it on the letter is what
 * makes it permanent — from then on every agency dropdown offers it.
 */
export function GlAgencySelect({
  value, onChange, agencies, onAdded, blankLabel, extra, className, style, ariaLabel, disabled,
}: {
  value: string
  onChange: (v: string) => void
  agencies: string[]
  onAdded?: (name: string) => void
  blankLabel: string
  extra?: ReactNode
  className?: string
  style?: CSSProperties
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <select value={value} disabled={disabled} aria-label={ariaLabel} className={className} style={style}
      onChange={e => {
        const v = e.target.value
        if (v !== ADD) { onChange(v); return }
        const typed = window.prompt('New agency name (for example PCSO, DSWD, or a city or municipality):')
        if (typed === null) return
        const p = parseAgency(typed)
        if (!p.ok || !p.value) { alert(AGENCY_ERROR); return }
        onAdded?.(p.value)
        onChange(p.value)
      }}>
      <option value="">{blankLabel}</option>
      {agencies.map(a => <option key={a} value={a}>{a}</option>)}
      {value && !agencies.includes(value) && value !== ADD && <option value={value}>{value}</option>}
      {extra}
      <option value={ADD}>+ Add agency…</option>
    </select>
  )
}
