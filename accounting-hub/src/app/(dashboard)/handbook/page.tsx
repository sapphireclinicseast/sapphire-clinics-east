'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { BookOpen, Download, Printer, Search, X } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Accounting Hub — User Handbook                                     */
/*  Data-driven so it can be searched (word search under Help), with   */
/*  a grouped table of contents and a step-by-step guide to every      */
/*  screen. Edit the SECTIONS array to update the handbook.            */
/* ------------------------------------------------------------------ */


import { SECTIONS, GROUP_ORDER, type Section } from './handbookContent'

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

function sectionHaystack(s: Section): string {
  const parts: string[] = [s.title, s.tag || '']
  for (const b of s.blocks) {
    if (b.k === 'p' || b.k === 'sub') parts.push(b.t)
    else if (b.k === 'steps' || b.k === 'ul') parts.push(...b.items)
    else if (b.k === 'note') parts.push(b.label, b.t)
    else if (b.k === 'faq') parts.push(b.q, b.a)
    else if (b.k === 'table') { parts.push(...b.head); b.rows.forEach((r) => parts.push(...r)) }
  }
  return parts.join(' \n ').toLowerCase()
}

export function HandbookBody() {
  const [q, setQ] = useState('')

  const query = q.trim().toLowerCase()
  const haystacks = useMemo(() => SECTIONS.map(sectionHaystack), [])

  const matched = SECTIONS.map((s, i) => (query === '' ? true : haystacks[i].includes(query)))
  const matchCount = matched.filter(Boolean).length

  /* Split a string on **bold** and highlight the query inside each part. */
  function highlight(seg: string, keyBase: string): React.ReactNode {
    if (!query) return seg
    const low = seg.toLowerCase()
    if (!low.includes(query)) return seg
    const out: React.ReactNode[] = []
    let i = 0
    let k = 0
    while (i <= seg.length) {
      const j = low.indexOf(query, i)
      if (j === -1) { out.push(seg.slice(i)); break }
      if (j > i) out.push(seg.slice(i, j))
      out.push(<mark key={`${keyBase}-${k++}`} style={{ background: 'var(--gold-light)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>{seg.slice(j, j + query.length)}</mark>)
      i = j + query.length
    }
    return out
  }
  function rt(text: string): React.ReactNode {
    const segs = text.split('**')
    return segs.map((seg, i) => (i % 2 === 1
      ? <strong key={i} style={{ color: 'var(--deep-teal)' }}>{highlight(seg, `b${i}`)}</strong>
      : <span key={i}>{highlight(seg, `n${i}`)}</span>))
  }

  const groups = GROUP_ORDER.filter((g) => SECTIONS.some((s) => s.group === g))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <style>{`
        @media print {
          body * { visibility: hidden }
          #handbook, #handbook * { visibility: visible }
          #handbook { position: absolute; left: 0; top: 0; width: 100% }
          .no-print { display: none !important }
          .hb-section { display: block !important }
          #handbook h2, #handbook h3 { page-break-after: avoid }
        }
        html { scroll-behavior: smooth }
        .hb-section { scroll-margin-top: 88px }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <BookOpen size={24} className="text-teal-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Accounting Hub — User Handbook</h1>
        <div className="ml-auto flex items-center gap-2 no-print">
          <a href="/Accounting-Hub-User-Handbook.docx" download className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}><Download size={14} /> Download Word</a>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--deep-teal)' }}><Printer size={14} /> Download PDF</button>
        </div>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>A step-by-step guide to every screen. Internal use — handle in confidence.</p>

      {/* Help — word search */}
      <div className="no-print sticky top-2 z-10 mb-5">
        <div className="rounded-xl border shadow-sm p-2" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
          <div className="flex items-center gap-2">
            <Search size={16} style={{ color: 'var(--mid-gray)' }} className="ml-1" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Help — search the handbook (e.g. RFP, void, payroll, opening balance)…"
              className="flex-1 py-1.5 text-sm outline-none bg-transparent"
              style={{ color: 'var(--charcoal)' }}
            />
            {q && (
              <button onClick={() => setQ('')} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs" style={{ color: 'var(--mid-gray)' }}>
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>
        {query && (
          <p className="text-xs mt-1.5 px-1" style={{ color: 'var(--mid-gray)' }}>
            {matchCount === 0 ? 'No sections match — try a different word.' : `${matchCount} section${matchCount === 1 ? '' : 's'} mention “${q.trim()}”.`}
          </p>
        )}
      </div>

      {/* Table of contents */}
      {!query && (
        <nav className="no-print mb-8 rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--mid-gray)' }}>Contents</p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
            {groups.map((g) => (
              <div key={g}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--deep-teal)' }}>{g}</p>
                <ul className="space-y-1">
                  {SECTIONS.filter((s) => s.group === g).map((s) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="text-sm hover:underline" style={{ color: '#2b2f33' }}>
                        <span style={{ color: 'var(--mid-gray)' }}>{s.num}</span> {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      )}

      {/* Body */}
      <div id="handbook">
        {groups.map((g) => {
          const groupSections = SECTIONS.map((s, i) => ({ s, i })).filter(({ s, i }) => s.group === g && matched[i])
          if (groupSections.length === 0) return null
          return (
            <div key={g}>
              <p className="text-[11px] font-bold uppercase tracking-widest mt-10 mb-1" style={{ color: 'var(--gold, #b8863b)' }}>{g}</p>
              {groupSections.map(({ s }) => (
                <section key={s.id} id={s.id} className="hb-section">
                  <h2 className="text-xl font-bold mt-4 mb-2" style={{ color: 'var(--deep-teal)' }}>
                    <span style={{ color: 'var(--mid-gray)', fontWeight: 600 }}>{s.num}</span> {rt(s.title)}
                  </h2>
                  {s.blocks.map((b, bi) => {
                    if (b.k === 'p') return <p key={bi} className="text-sm leading-relaxed mb-3" style={{ color: '#2b2f33' }}>{rt(b.t)}</p>
                    if (b.k === 'sub') return <h3 key={bi} className="text-base font-bold mt-5 mb-1.5" style={{ color: 'var(--gold, #b8863b)' }}>{rt(b.t)}</h3>
                    if (b.k === 'steps') return (
                      <ol key={bi} className="list-decimal pl-5 space-y-1 mb-3 text-sm leading-relaxed" style={{ color: '#2b2f33' }}>
                        {b.items.map((it, k) => <li key={k}>{rt(it)}</li>)}
                      </ol>
                    )
                    if (b.k === 'ul') return (
                      <ul key={bi} className="list-disc pl-5 space-y-1 mb-3 text-sm leading-relaxed" style={{ color: '#2b2f33' }}>
                        {b.items.map((it, k) => <li key={k}>{rt(it)}</li>)}
                      </ul>
                    )
                    if (b.k === 'note') return (
                      <div key={bi} className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'var(--pale-teal)', borderLeft: '4px solid var(--teal)', color: '#2b2f33' }}>
                        <strong style={{ color: 'var(--deep-teal)' }}>{rt(b.label)} </strong>{rt(b.t)}
                      </div>
                    )
                    if (b.k === 'faq') return (
                      <div key={bi} className="mb-3">
                        <p className="text-sm font-semibold" style={{ color: 'var(--deep-teal)' }}>{rt(b.q)}</p>
                        <p className="text-sm leading-relaxed" style={{ color: '#2b2f33' }}>{rt(b.a)}</p>
                      </div>
                    )
                    if (b.k === 'table') return (
                      <div key={bi} className="overflow-auto rounded-xl border mb-4" style={{ borderColor: 'var(--light-gray)' }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: 'var(--deep-teal)', color: 'white' }}>
                              {b.head.map((h, hi) => <th key={hi} className={`px-3 py-2 font-semibold ${hi === 0 ? 'text-left' : 'text-left'}`}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {b.rows.map((r, ri) => (
                              <tr key={ri} style={{ background: ri % 2 ? '#f5f8f8' : 'white' }}>
                                {r.map((c, ci) => <td key={ci} className="px-3 py-1.5 text-left" style={{ color: ci === 0 ? '#2b2f33' : '#2b2f33', fontWeight: ci === 0 ? 600 : 400 }}>{rt(c)}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                    return null
                  })}
                </section>
              ))}
            </div>
          )
        })}

        {query && matchCount === 0 && (
          <p className="text-sm text-center py-10" style={{ color: 'var(--mid-gray)' }}>Nothing matches “{q.trim()}”. Try a shorter or different word, or clear the search.</p>
        )}
      </div>
    </div>
  )
}

export default function HandbookPage() {
  const { status } = useSession()
  if (status === 'unauthenticated') redirect('/login')
  return <HandbookBody />
}
