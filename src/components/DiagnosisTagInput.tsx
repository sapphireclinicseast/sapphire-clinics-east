'use client'

// Tag input for diagnoses, shared by the CRM patient form and the public
// registration page.
//
// The field it replaces was a single free-text box, and the result is 224
// distinct strings across 925 records — "Anxiety and Depression" written as one
// value that no chart can split back into the two conditions it names. Tagging
// each condition separately is what makes the dashboard able to group them
// without guessing.
//
// Typing offers suggestions; pressing Enter keeps whatever was typed whether it
// matched or not. A clinic sees conditions no fixed list anticipates, and a
// picker that refuses the unexpected one would either lose it or push the user
// back to cramming everything into one tag.

import { useState, useRef, useMemo, useEffect } from 'react'
import { suggestDiagnoses } from '@/lib/diagnosis-taxonomy'

export default function DiagnosisTagInput({
  value,
  onChange,
  label = 'Diagnosis / Condition',
  placeholder = 'Type a diagnosis, press Enter to add…',
  uppercase = false,
  hint,
}: {
  value: string[]
  onChange: (next: string[]) => void
  label?: string
  placeholder?: string
  /** CRM form uppercases everything else on the form; the public page does not. */
  uppercase?: boolean
  hint?: string
}) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => suggestDiagnoses(draft, value), [draft, value])

  // Reset the highlight whenever the list changes, so Enter never commits a
  // suggestion that has scrolled out from under the cursor.
  useEffect(() => { setActive(0) }, [draft])

  // Close on outside click — without this the list stays over the fields below
  // it and swallows their clicks.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function addTag(raw: string) {
    const t = (uppercase ? raw.toUpperCase() : raw).trim().replace(/[,;]+$/, '').trim()
    if (!t) return
    // Case-insensitive, so "anxiety" after "Anxiety" does not create a second tag.
    if (!value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t])
    setDraft('')
    setOpen(false)
  }

  function removeTag(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Comma and semicolon commit too — people paste "ASD, ADHD" out of habit and
    // would otherwise end up with it as one tag, which is the problem this
    // field exists to solve.
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault()
      if (open && matches.length && draft.trim() && active < matches.length) addTag(matches[active])
      else addTag(draft)
      return
    }
    if (e.key === 'Backspace' && !draft && value.length) {
      e.preventDefault()
      removeTag(value.length - 1)
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return }
    if (e.key === 'Escape')    { setOpen(false); return }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label
        className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--mid-gray)' }}
      >
        {label}
      </label>

      <div
        onClick={() => inputRef.current?.focus()}
        className="w-full px-2 py-1.5 rounded-lg text-sm"
        style={{
          border: '1.5px solid var(--light-gray)',
          background: '#fff',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          minHeight: 44,
          cursor: 'text',
        }}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#F0F9FA', color: '#12606C',
              border: '1px solid #BFE3E8',
              borderRadius: 999, padding: '3px 8px 3px 10px',
              fontSize: 12, fontWeight: 600, lineHeight: 1.4,
              maxWidth: '100%',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i) }}
              aria-label={`Remove ${tag}`}
              style={{
                border: 0, background: 'transparent', cursor: 'pointer',
                color: '#12606C', fontSize: 14, lineHeight: 1, padding: 0,
              }}
            >
              ×
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          // Committing on blur rather than discarding: a diagnosis left in the
          // box when someone tabs onward is still what they meant, and silently
          // dropping it loses clinical information.
          //
          // But a half-typed word committed verbatim is the exact sloppiness
          // this field exists to remove — "Depr" would become a tag nothing can
          // group. So when the draft is an unfinished prefix of exactly one
          // suggestion, that suggestion is what gets tagged. Ambiguous prefixes
          // ("An" matches four) and anything unrecognised commit as typed.
          onBlur={() => {
            const d = draft.trim()
            if (!d) return
            const prefixed = matches.filter((m) => m.toLowerCase().startsWith(d.toLowerCase()))
            addTag(prefixed.length === 1 ? prefixed[0] : d)
          }}
          placeholder={value.length ? '' : placeholder}
          className="text-sm outline-none"
          style={{
            flex: '1 1 120px', minWidth: 120, border: 0, padding: '4px 2px',
            color: 'var(--charcoal)', background: 'transparent',
            textTransform: uppercase ? 'uppercase' : 'none',
          }}
        />
      </div>

      {hint && (
        <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>{hint}</p>
      )}

      {open && matches.length > 0 && (
        <ul
          style={{
            position: 'absolute', zIndex: 50, left: 0, right: 0, top: '100%',
            marginTop: 4, background: '#fff', borderRadius: 10,
            border: '1px solid var(--light-gray)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
            maxHeight: 240, overflowY: 'auto', padding: 4, listStyle: 'none',
          }}
        >
          {matches.map((m, i) => (
            <li key={m}>
              <button
                type="button"
                // mousedown, not click: the input's onBlur fires first on click
                // and would commit the half-typed draft instead of this choice.
                onMouseDown={(e) => { e.preventDefault(); addTag(m) }}
                onMouseEnter={() => setActive(i)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 10px', borderRadius: 7, border: 0, cursor: 'pointer',
                  fontSize: 13, color: 'var(--charcoal)',
                  background: i === active ? '#F0F9FA' : 'transparent',
                }}
              >
                {m}
              </button>
            </li>
          ))}
          {draft.trim() && !matches.some((m) => m.toLowerCase() === draft.trim().toLowerCase()) && (
            <li style={{ borderTop: '1px solid var(--light-gray)', marginTop: 4, paddingTop: 4 }}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTag(draft) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 10px', borderRadius: 7, border: 0, cursor: 'pointer',
                  fontSize: 13, color: 'var(--mid-gray)', background: 'transparent',
                }}
              >
                Add “{draft.trim()}” — not in the list
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/** Legacy `diagnosis` text → tags, for editing a record saved before tagging. */
export function splitLegacyDiagnosis(text: string | null | undefined): string[] {
  if (!text || !text.trim()) return []
  return text
    .split(/[;]+|(?:,\s*(?=[A-Z]))/)   // "; " always, "," only before a new capitalised term
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Tags → the `diagnosis` string every existing reader still expects. */
export function joinDiagnosisTags(tags: string[]): string {
  return tags.map((t) => t.trim()).filter(Boolean).join('; ')
}
