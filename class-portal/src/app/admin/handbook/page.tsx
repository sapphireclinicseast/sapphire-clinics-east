'use client'

// Force dynamic — matches /admin and /documents. Without it Next.js
// serves a prerendered shell that hides deploys for up to a year.
export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth } from '@/lib/session'

/** Compact caption below every illustration — keeps the mockup honest
 *  ("this is a stylised recreation, not a live capture") and gives the
 *  reader something to search for in the real portal. */
function Illustration({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="handbook-fig">
      <div className="handbook-fig-frame">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

/** FAQ collapsible. Renders as a native <details> so it works in the
 *  Word / PDF export unchanged and is fully searchable by the handbook
 *  search bar (browsers include the summary + inner text in
 *  textContent regardless of open/closed state). */
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="handbook-faq">
      <summary>{q}</summary>
      <div className="handbook-faq-body">{children}</div>
    </details>
  )
}

/**
 * Main-admin-only user handbook (v4 — comprehensive step-by-step guide).
 *
 * Non-admins are redirected on mount. The content mirrors the standalone
 * HTML handbook the operators can bookmark externally, but living inside
 * the portal shell means it follows the sidebar auth state + brand chrome.
 *
 * Kept in one file (no separate content component) so the handbook is
 * easy to edit — the whole thing is scannable in a single view.
 *
 * v4 changes vs v3:
 *   • Every section rewritten as click-by-click steps (assumes no prior
 *     experience with the portal).
 *   • New chapters for Meetings, Classes deep-dive, Calendar, Admission
 *     tracker, Enrollment funnel, Impersonation, and Intern accounts.
 *   • Added a Help chapter with a keyword search bar (client-side —
 *     hides sections whose text doesn't match) and an FAQ.
 */
export default function HandbookPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [downloadingWord, setDownloadingWord] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // ── Handbook search state ─────────────────────────────────────────
  // Client-side keyword filter. Each h2 chapter is wrapped in a
  // `.handbook-section[data-searchable]` block; when the query is
  // non-empty, any block whose textContent doesn't include the query
  // (case-insensitive) is hidden. The Table of Contents rows carry
  // the same data attribute keyed by the section slug so they
  // collapse in step with their target.
  const [search, setSearch] = useState('')

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const q = search.trim().toLowerCase()
    const sections = body.querySelectorAll<HTMLElement>('.handbook-section')
    const tocRows = body.querySelectorAll<HTMLElement>('.handbook-toc-row')
    let matches = 0
    if (!q) {
      sections.forEach(s => { s.hidden = false })
      tocRows.forEach(r => { r.hidden = false })
    } else {
      const visibleSlugs = new Set<string>()
      sections.forEach(s => {
        const text = (s.textContent || '').toLowerCase()
        const hit = text.includes(q)
        s.hidden = !hit
        if (hit) {
          matches++
          const slug = s.dataset.slug
          if (slug) visibleSlugs.add(slug)
        }
      })
      tocRows.forEach(r => {
        const slug = r.dataset.slug
        r.hidden = !slug || !visibleSlugs.has(slug)
      })
    }
    const counter = body.querySelector<HTMLElement>('#handbook-search-count')
    if (counter) {
      counter.textContent = q
        ? `${matches} matching section${matches === 1 ? '' : 's'}`
        : ''
    }
  }, [search])

  useEffect(() => {
    const auth = getAuth()
    // Only the main admin can view the handbook. 'ADMIN' is the single
    // main-admin auth role (branch admins are BRANCH_ADMIN; ADMIN can't be
    // assigned to created users), so a role check identifies them and stays
    // correct across the staff-email transition. No session → sign-in.
    if (!auth) { router.replace('/sign-in'); return }
    if (auth.role !== 'ADMIN') {
      router.replace(auth.role === 'BRANCH_ADMIN' ? '/admin'
        : auth.role === 'FRONTDESK' ? '/frontdesk'
        : '/profile')
      return
    }
    setReady(true)
  }, [router])

  /** PDF export path — uses the browser's own print → "Save as PDF"
   *  destination, which is the cleanest way to render a long-form
   *  document. Our print CSS below hides the sidebar / download bar
   *  and breaks each h2 onto a fresh page. */
  function handleDownloadPDF() {
    // Clear the search first so the exported PDF contains every section
    // and not a filtered subset.
    setSearch('')
    if (typeof window !== 'undefined') {
      setTimeout(() => window.print(), 100)
    }
  }

  /** Word (.docx) export — pulls html-docx-js from a CDN on demand so
   *  we don't bloat the bundle for the 99% of visits that never click.
   *  Reads the current handbook body's outerHTML, wraps it with a
   *  minimal <html><head><style>…</style></head><body> shell so Word
   *  keeps our typography, converts to a Blob, triggers a download. */
  async function handleDownloadWord() {
    if (downloadingWord || !bodyRef.current) return
    // Same rationale as PDF: export the FULL handbook, not the search
    // filter's view.
    setSearch('')
    setDownloadingWord(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      if (!w.htmlDocx) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.min.js'
          s.onload = () => resolve()
          s.onerror = () => reject(new Error('Could not load Word exporter.'))
          document.head.appendChild(s)
        })
      }
      const wordCss = `
        body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; color: #1a1a1a; }
        h1 { font-size: 26pt; color: #244952; margin: 0 0 6pt; }
        h2 { font-size: 18pt; color: #244952; margin: 24pt 0 6pt; page-break-before: always; }
        h2:first-of-type { page-break-before: auto; }
        h3 { font-size: 14pt; color: #244952; margin: 12pt 0 4pt; }
        h4 { font-size: 11pt; color: #4a8073; margin: 10pt 0 4pt; text-transform: uppercase; letter-spacing: 1pt; }
        p, li { font-size: 11pt; line-height: 1.5; }
        code { font-family: Consolas, monospace; font-size: 10pt; background: #f1f5f9; padding: 0 3pt; }
        table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
        table td, table th { border: 0.5pt solid #d1d5db; padding: 4pt 6pt; font-size: 10pt; vertical-align: top; }
        table th { background: #f1f5f9; font-weight: 600; font-size: 9pt; text-transform: uppercase; }
        .tag { display: inline; padding: 1pt 5pt; border-radius: 999pt; font-size: 8pt; font-weight: 600; }
        .tag-sage  { background: #dcfce7; color: #166534; }
        .tag-amber { background: #fef3c7; color: #b45309; }
        .tag-rose  { background: #fee2e2; color: #9f1239; }
        .tag-info  { background: #dbeafe; color: #1e40af; }
        .tag-due   { background: #fed7aa; color: #9a3412; }
        .callout { border-left: 2pt solid #4a8073; background: #f8fafc; padding: 6pt 10pt; margin: 8pt 0; }
        .callout-warn { border-left-color: #b8896a; background: #fffbeb; }
        .role-card { border: 0.5pt solid #d1d5db; border-left: 2pt solid #4a8073; padding: 6pt 10pt; margin: 10pt 0; }
        .handbook-fig { margin: 10pt 0; }
        .handbook-fig-frame { border: 0.5pt solid #d1d5db; padding: 6pt; }
        .handbook-fig figcaption { font-size: 9pt; color: #64748b; margin-top: 4pt; }
        .task-step { margin: 5pt 0; }
        .handbook-faq { border: 0.5pt solid #d1d5db; padding: 4pt 8pt; margin: 4pt 0; }
        .handbook-faq summary { font-weight: 600; color: #244952; }
      `
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${wordCss}</style></head><body>${bodyRef.current.outerHTML}</body></html>`
      const blob = w.htmlDocx.asBlob(html) as Blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'aura-academy-class-portal-handbook.docx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5_000)
    } catch (e) {
      alert(`Could not generate Word file. ${(e as Error).message}`)
    } finally {
      setDownloadingWord(false)
    }
  }

  if (!ready) return null

  return (
    <div className="animate-fade-up max-w-4xl mx-auto handbook-root">
      <style>{`
        .handbook-root h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 4px; font-weight: 600; color: var(--deep-teal); }
        .handbook-root h2 { font-size: 22px; margin: 2.5rem 0 0.75rem; font-weight: 600; color: var(--deep-teal); letter-spacing: -0.01em; }
        .handbook-root h3 { font-size: 17px; margin: 1.5rem 0 0.5rem; font-weight: 600; color: var(--deep-teal); }
        .handbook-root h4 { font-size: 13px; margin: 1.25rem 0 0.5rem; font-weight: 600; color: var(--sage); text-transform: uppercase; letter-spacing: 0.06em; }
        .handbook-root p, .handbook-root li { font-size: 14.5px; line-height: 1.65; }
        .handbook-root ul, .handbook-root ol { padding-left: 1.4rem; margin: 0.5rem 0 1rem; }
        .handbook-root li { margin: 0.35rem 0; }
        .handbook-root code, .handbook-root kbd {
          font-family: 'JetBrains Mono', Menlo, Consolas, monospace;
          font-size: 12.5px;
          background: var(--paper-2);
          padding: 1px 5px;
          border-radius: 4px;
          color: var(--deep-teal);
        }
        .handbook-root kbd {
          background: #fff;
          border: 1px solid var(--paper-3);
          padding: 2px 6px;
          box-shadow: 0 1px 0 rgba(0,0,0,0.08);
        }
        .handbook-root a { color: var(--sage); text-decoration: none; border-bottom: 1px solid rgba(74,128,115,0.35); }
        .handbook-root a:hover { border-bottom-color: var(--sage); }
        .handbook-root .lead {
          font-size: 15px;
          color: var(--mid-gray);
          margin: 0 0 1.75rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--paper-3);
        }
        .handbook-root .tag {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600; padding: 2px 9px;
          border-radius: 999px; text-transform: uppercase; letter-spacing: 0.08em;
        }
        .tag-sage  { background: #dcfce7; color: #166534; }
        .tag-amber { background: #fef3c7; color: #b45309; }
        .tag-rose  { background: #fee2e2; color: #9f1239; }
        .tag-info  { background: #dbeafe; color: #1e40af; }
        .tag-due   { background: #fed7aa; color: #9a3412; }
        .handbook-root .role-card {
          background: #fff;
          border: 1px solid var(--paper-3);
          border-left: 3px solid var(--sage);
          border-radius: 12px;
          padding: 1.1rem 1.4rem;
          margin: 1.25rem 0;
        }
        .handbook-root .role-card > h3:first-child { margin-top: 0; }
        .handbook-root .callout {
          background: var(--paper-2);
          border: 1px solid var(--paper-3);
          border-radius: 10px;
          padding: 0.8rem 1rem;
          margin: 1rem 0;
          font-size: 13.5px;
        }
        .handbook-root .callout-warn { border-left: 3px solid var(--clay); background: #fffbeb; }
        .handbook-root .callout-note { border-left: 3px solid var(--mid-gray); }
        .handbook-root .callout .label {
          display: block; font-size: 10.5px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--sage); margin-bottom: 4px;
        }
        .handbook-root .callout-warn .label { color: var(--clay); }
        .handbook-root .callout-note .label { color: var(--mid-gray); }
        .handbook-root table.matrix { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 12.5px; }
        .handbook-root table.matrix th, .handbook-root table.matrix td {
          border: 1px solid var(--paper-3); padding: 7px 9px; text-align: left; vertical-align: top;
        }
        .handbook-root table.matrix th {
          background: var(--paper-2); font-weight: 600; font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.05em; color: var(--mid-gray);
        }
        .handbook-root table.matrix td.yes { color: #166534; font-weight: 500; }
        .handbook-root table.matrix td.no  { color: var(--mid-gray); }
        .handbook-root table.matrix td.partial { color: #9a3412; font-weight: 500; }
        .handbook-root .task-step { counter-increment: step; position: relative; padding-left: 2rem; margin: 0.7rem 0; }
        .handbook-root .task-step::before {
          content: counter(step);
          position: absolute; left: 0; top: 1px;
          width: 22px; height: 22px; border-radius: 50%;
          background: var(--sage); color: white;
          font-size: 11.5px; font-weight: 600;
          display: flex; align-items: center; justify-content: center;
        }
        .handbook-root .task-steps { counter-reset: step; padding-left: 0; list-style: none; }
        .handbook-root .task-steps li { list-style: none; }
        .handbook-root .quick-nav {
          background: #fff; border: 1px solid var(--paper-3);
          border-radius: 12px; padding: 0.9rem 1.2rem; margin: 0 0 2rem;
        }
        .handbook-root .quick-nav h4 { margin-top: 0; }
        .handbook-root .quick-nav ol { margin: 0; padding-left: 1.4rem; }
        .handbook-root .quick-nav li { margin: 3px 0; font-size: 14px; }
        .handbook-root .toc-role {
          display: inline-block; font-size: 11px; font-weight: 500;
          color: var(--mid-gray); margin-left: 6px;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        /* ── Search bar ────────────────────────────────────────────── */
        .handbook-root .handbook-search {
          display: flex; align-items: center; gap: 8px;
          background: #fff; border: 1px solid var(--paper-3);
          border-radius: 999px; padding: 6px 14px;
          margin: 0 0 1.5rem;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .handbook-root .handbook-search:focus-within {
          border-color: var(--sage);
          box-shadow: 0 0 0 3px rgba(74, 128, 115, 0.14);
        }
        .handbook-root .handbook-search input {
          flex: 1; border: none; outline: none; background: transparent;
          font-size: 14.5px; padding: 4px 0;
          color: var(--deep-teal);
        }
        .handbook-root .handbook-search input::placeholder { color: var(--mid-gray); }
        .handbook-root .handbook-search-icon {
          width: 16px; height: 16px; flex-shrink: 0; color: var(--mid-gray);
        }
        .handbook-root .handbook-search-clear {
          border: none; background: transparent; cursor: pointer;
          color: var(--mid-gray); font-size: 18px; line-height: 1;
          padding: 0 2px;
        }
        .handbook-root .handbook-search-clear:hover { color: var(--clay); }
        .handbook-root #handbook-search-count {
          font-size: 12px; color: var(--sage); font-weight: 500;
          white-space: nowrap;
        }
        /* ── FAQ collapsibles ──────────────────────────────────────── */
        .handbook-root .handbook-faq {
          background: #fff;
          border: 1px solid var(--paper-3);
          border-radius: 10px;
          padding: 0.6rem 1rem;
          margin: 0.6rem 0;
        }
        .handbook-root .handbook-faq[open] {
          border-color: var(--sage);
          background: #fafffe;
        }
        .handbook-root .handbook-faq summary {
          cursor: pointer; font-weight: 600; color: var(--deep-teal);
          font-size: 14.5px; padding: 0.3rem 0;
          list-style: none; position: relative; padding-left: 1.4rem;
        }
        .handbook-root .handbook-faq summary::-webkit-details-marker { display: none; }
        .handbook-root .handbook-faq summary::before {
          content: '▸'; position: absolute; left: 0; top: 0.35rem;
          font-size: 12px; color: var(--sage);
          transition: transform 0.15s ease;
        }
        .handbook-root .handbook-faq[open] summary::before {
          transform: rotate(90deg);
        }
        .handbook-root .handbook-faq-body {
          padding: 0.4rem 0 0.6rem;
          font-size: 14px; line-height: 1.6;
          border-top: 1px solid var(--paper-3);
          margin-top: 0.4rem;
        }
        .handbook-root .handbook-faq-body > *:first-child { margin-top: 0.5rem; }
        .handbook-root .handbook-faq-body > *:last-child { margin-bottom: 0; }
        /* Print CSS -------------------------------------------------- */
        @media print {
          .handbook-root .role-card, .handbook-root .callout, .handbook-root .handbook-fig, .handbook-root .handbook-faq { break-inside: avoid; }
          .handbook-root h2 { break-before: page; }
          .handbook-root h2:first-of-type { break-before: auto; }
          .handbook-download-bar, .handbook-root .handbook-search { display: none !important; }
          .handbook-root .handbook-faq[open] { background: #fff; }
          .handbook-root .handbook-faq summary::before { display: none; }
        }
        /* ── Illustration frames ───────────────────────────────────── */
        .handbook-root .handbook-fig { margin: 1.25rem 0; }
        .handbook-root .handbook-fig-frame {
          background: #fff;
          border: 1px solid var(--paper-3);
          border-radius: 12px;
          padding: 14px;
          overflow: hidden;
        }
        .handbook-root .handbook-fig figcaption {
          font-size: 12px;
          color: var(--mid-gray);
          text-align: center;
          margin-top: 6px;
          font-style: italic;
        }

        /* Reusable primitives for the mockups themselves. */
        .mk-card {
          background: #fff;
          border: 1px solid var(--paper-3);
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 13px;
        }
        .mk-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.14em; color: var(--sage); margin-bottom: 4px;
          font-family: var(--font-display);
        }
        .mk-title { font-size: 15px; font-weight: 600; color: var(--deep-teal); margin-bottom: 6px; }
        .mk-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 6px 0; border-bottom: 1px solid var(--paper-3); }
        .mk-row:last-child { border-bottom: none; }
        .mk-th, .mk-td { padding: 6px 8px; font-size: 12px; }
        .mk-th { background: var(--paper-2); font-weight: 600; color: var(--mid-gray); text-transform: uppercase; letter-spacing: 0.06em; font-size: 10.5px; }
        .mk-btn {
          display: inline-block; padding: 5px 12px; border-radius: 6px;
          background: var(--narra); color: #fff; font-size: 11.5px; font-weight: 600;
        }
        .mk-btn-secondary { background: #fff; color: var(--narra); border: 1px solid var(--paper-3); }
        .mk-pill {
          display: inline-block; padding: 2px 8px; border-radius: 999px;
          background: var(--paper-2); font-size: 11px; color: var(--mid-gray); font-weight: 500;
        }
        .mk-sidebar {
          display: grid; grid-template-columns: 200px 1fr; gap: 12px;
          border: 1px solid var(--paper-3); border-radius: 10px; overflow: hidden;
        }
        .mk-sidebar > aside { background: #fff; padding: 12px; border-right: 1px solid var(--paper-3); }
        .mk-sidebar > main { padding: 12px; background: var(--paper-2); }
        .mk-nav-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; font-size: 12.5px; color: var(--narra); }
        .mk-nav-item.active { background: var(--sage-tint); color: var(--deep-teal); font-weight: 600; }
        .mk-nav-icon {
          width: 14px; height: 14px; border-radius: 3px;
          background: var(--paper-3); opacity: 0.6; flex-shrink: 0;
        }
        .mk-nav-item.active .mk-nav-icon { background: var(--sage); opacity: 1; }
      `}</style>

      {/* Header + download actions */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6 handbook-download-bar">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            Aura Academy · Handbook
          </div>
          <h1>Class Portal — User Handbook</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs whitespace-nowrap"
            onClick={handleDownloadPDF}
            title="Uses your browser's print dialog. Pick 'Save as PDF' as the destination."
          >
            Download PDF
          </button>
          <button
            type="button"
            className="btn-secondary text-xs whitespace-nowrap"
            onClick={() => void handleDownloadWord()}
            disabled={downloadingWord}
          >
            {downloadingWord ? 'Generating…' : 'Download Word'}
          </button>
        </div>
      </div>

      <div ref={bodyRef}>
      <p className="lead">
        A step-by-step guide to <code>class.sapphireclinicseast.org</code> for the clinic manager, HR officer, front desk, SPED teacher, and parent/student roles. Written for someone who has never touched the portal before — every button, every menu, every field is described in the order you'll click them. If you're looking for something specific, use the search box or jump to <a href="#help">Help &amp; FAQ</a>.
      </p>

      {/* ── Search bar ─────────────────────────────────────────────── */}
      <div className="handbook-search" role="search">
        <svg className="handbook-search-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
          <path d="m17 17-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search the handbook — try 'record payment', 'PayMongo', 'waiver', 'intern'…"
          aria-label="Search the handbook"
        />
        <span id="handbook-search-count" aria-live="polite" />
        {search && (
          <button
            type="button"
            className="handbook-search-clear"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className="quick-nav">
        <h4>Table of contents</h4>
        <ol>
          <li className="handbook-toc-row" data-slug="getting-started"><a href="#getting-started">Getting started</a> — signing in, portal layout, roles at a glance, impersonation</li>
          <li className="handbook-toc-row" data-slug="sidebar"><a href="#sidebar">The sidebar</a> — every nav item and who sees it</li>
          <li className="handbook-toc-row" data-slug="main-admin"><a href="#main-admin">Clinic manager — every admin tab</a><span className="toc-role">Main admin</span></li>
          <li className="handbook-toc-row" data-slug="branch-admin"><a href="#branch-admin">HR officer — what's different</a><span className="toc-role">Branch admin</span></li>
          <li className="handbook-toc-row" data-slug="frontdesk"><a href="#frontdesk">Front desk — every tab</a><span className="toc-role">Frontdesk</span></li>
          <li className="handbook-toc-row" data-slug="teacher"><a href="#teacher">SPED teacher hub</a><span className="toc-role">Teacher</span></li>
          <li className="handbook-toc-row" data-slug="student"><a href="#student">Student / parent portal</a><span className="toc-role">Student</span></li>
          <li className="handbook-toc-row" data-slug="classes"><a href="#classes">Classes — full walkthrough</a> — list, create, lessons, projects, activities</li>
          <li className="handbook-toc-row" data-slug="meetings"><a href="#meetings">Meetings</a> — LiveKit video rooms with Cloud Record</li>
          <li className="handbook-toc-row" data-slug="calendar"><a href="#calendar">Calendar</a> — events, per-branch scoping, PDFs</li>
          <li className="handbook-toc-row" data-slug="payments"><a href="#payments">Payments — deep dive</a> — the period picker, plan switches, back balance</li>
          <li className="handbook-toc-row" data-slug="documents"><a href="#documents">Documents, waiver, registration letter, fee schedule</a></li>
          <li className="handbook-toc-row" data-slug="announcements"><a href="#announcements">Announcements</a> — posters, PDFs, email blasts</li>
          <li className="handbook-toc-row" data-slug="vouchers"><a href="#vouchers">Vouchers</a> — shared codes and personal early-bird</li>
          <li className="handbook-toc-row" data-slug="enrollment"><a href="#enrollment">Enrollment funnel</a> — what a new parent sees</li>
          <li className="handbook-toc-row" data-slug="admission"><a href="#admission">Admission tracker</a> — partner-school view</li>
          <li className="handbook-toc-row" data-slug="interns"><a href="#interns">Intern accounts</a> — auto-disable lifecycle</li>
          <li className="handbook-toc-row" data-slug="hubs"><a href="#hubs">Connections to the other hubs</a> — Operations, Accounting, HR</li>
          <li className="handbook-toc-row" data-slug="help"><a href="#help">Help &amp; FAQ</a></li>
        </ol>
      </div>

      {/* ─────────────────────────────────────────────────────────────
       * 1. GETTING STARTED
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="getting-started">
      <h2 id="getting-started">1. Getting started</h2>

      <h3>Signing in</h3>
      <p>The class portal lives at <a href="https://class.sapphireclinicseast.org">class.sapphireclinicseast.org</a>. Any modern browser works — Chrome, Safari, Edge, or Firefox on desktop, tablet, or phone.</p>

      <ol className="task-steps">
        <li className="task-step">Open the site. If you land on the marketing homepage (with "Enroll your child" in the hero), click <strong>Sign In</strong> in the top-right or the <em>Sign In (for existing student)</em> tab in the "Get started" card.</li>
        <li className="task-step">You'll see the sign-in screen with the heading <em>Sign in to your account</em>. Under <strong>Choose your role to continue</strong>, tap the tile that matches you:
          <ul>
            <li><strong>Parent / Student</strong> — for enrolled families</li>
            <li><strong>Teacher</strong> — for classroom staff and SPED teacher interns</li>
            <li><strong>Front desk</strong> — for the clinic reception at either branch</li>
            <li><strong>Branch admin</strong> — for per-branch HR / operations leads</li>
            <li><strong>Main admin</strong> — for SCEI HQ (only <code>main@sapphireclinicseast.org</code>)</li>
          </ul>
        </li>
        <li className="task-step">The email and password fields activate once a role is picked. Type your email and the password the main admin gave you.</li>
        <li className="task-step">Click <strong>Continue as &lt;your role&gt;</strong>. If the credentials match, you're redirected to the right home screen (<code>/admin</code>, <code>/frontdesk</code>, or <code>/profile</code>).</li>
      </ol>

      <div className="callout">
        <span className="label">Forgot your password?</span>
        Click <strong>Forgot?</strong> next to the password field to open <code>/reset</code>. You'll need a reset token — ask the main admin (or your branch admin) to email you one from <em>Admin → Users → Email reset link</em>. The link expires 24 hours after it's issued.
      </div>

      <div className="callout callout-warn">
        <span className="label">"Missing bearer token." red banner?</span>
        This means your device had a signed-in session (name still showing in the sidebar) but the login token got cleared behind the scenes — usually because a second tab signed out, or an earlier request expired the session. Fix: sign out (bottom-left of the sidebar) and sign back in. As of 2026-09, the classes and admin pages automatically detect this and bounce you to sign-in before you can hit the error.
      </div>

      <h3>What you see once signed in</h3>
      <ul>
        <li><strong>Left sidebar</strong> — fixed on desktop, hamburger menu (☰ icon top-left) on mobile. Contains your role-scoped navigation plus a user chip at the bottom with your name, role, and a <strong>Sign out</strong> link.</li>
        <li><strong>Top of the sidebar</strong> — the Aura Academy logo and "Class Portal" caption. Click it to return to the marketing homepage (or to your dashboard if you're already there).</li>
        <li><strong>Main content area</strong> — everything else. Cards are compact; long tables scroll internally rather than pushing the whole page down.</li>
        <li><strong>Payment badges</strong> — every student profile shows tuition status as one or more colored pill badges:
          <ul>
            <li><span className="tag tag-sage">Paid for July 2026</span> — this period is settled.</li>
            <li><span className="tag tag-amber">Owes for June 2026</span> — a past period was skipped.</li>
            <li><span className="tag tag-rose">Due for July 2026</span> — the current period is unpaid.</li>
            <li><span className="tag tag-info">Pending</span> — a payment was recorded but the front desk hasn't clicked <em>Confirm payment</em> yet.</li>
          </ul>
        </li>
      </ul>

      <Illustration caption="Portal layout: fixed left sidebar with role-scoped nav + user chip; main area holds the active page.">
        <div className="mk-sidebar">
          <aside>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 12px' }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--sage-tint)' }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--deep-teal)' }}>Aura Academy<div style={{ fontSize: 9, color: 'var(--mid-gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 400 }}>Class Portal</div></div>
            </div>
            <div className="mk-nav-item active"><span className="mk-nav-icon" />Admin dashboard</div>
            <div className="mk-nav-item"><span className="mk-nav-icon" />Classes</div>
            <div className="mk-nav-item"><span className="mk-nav-icon" />Calendar</div>
            <div className="mk-nav-item"><span className="mk-nav-icon" />Meetings</div>
            <div className="mk-nav-item"><span className="mk-nav-icon" />Handbook</div>
            <div style={{ marginTop: 24, padding: 8, borderRadius: 8, background: 'var(--paper-2)', fontSize: 11 }}>
              <div style={{ color: 'var(--mid-gray)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Signed in</div>
              <div style={{ fontWeight: 600, color: 'var(--deep-teal)' }}>main</div>
              <div style={{ color: 'var(--mid-gray)', fontSize: 10 }}>Main admin</div>
              <div style={{ marginTop: 6, color: 'var(--clay)', fontSize: 10.5, fontWeight: 600 }}>Sign out</div>
            </div>
          </aside>
          <main>
            <div className="mk-card" style={{ marginBottom: 8 }}>
              <div className="mk-label">Aura Academy · Admin</div>
              <div className="mk-title">Admin dashboard</div>
              <div style={{ fontSize: 11, color: 'var(--mid-gray)' }}>main@sapphireclinicseast.org</div>
            </div>
            <div style={{ display: 'flex', gap: 4, background: 'var(--paper-2)', padding: 4, borderRadius: 8, fontSize: 11, fontWeight: 600, flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 10px', background: '#fff', borderRadius: 5, color: 'var(--deep-teal)' }}>Users</span>
              <span style={{ padding: '4px 10px', color: 'var(--mid-gray)' }}>Students</span>
              <span style={{ padding: '4px 10px', color: 'var(--mid-gray)' }}>Grade Levels</span>
              <span style={{ padding: '4px 10px', color: 'var(--mid-gray)' }}>Curriculum</span>
              <span style={{ padding: '4px 10px', color: 'var(--mid-gray)' }}>Templates</span>
              <span style={{ padding: '4px 10px', color: 'var(--mid-gray)' }}>Notifications</span>
              <span style={{ padding: '4px 10px', color: 'var(--mid-gray)' }}>Payments</span>
              <span style={{ padding: '4px 10px', color: 'var(--mid-gray)' }}>Fees</span>
              <span style={{ padding: '4px 10px', color: 'var(--mid-gray)' }}>Assignments</span>
            </div>
          </main>
        </div>
      </Illustration>

      <h3>Who can do what</h3>
      <div className="overflow-x-auto">
      <table className="matrix">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Main admin<br/>(clinic mgr)</th>
            <th>Branch admin<br/>(HR officer)</th>
            <th>Front desk</th>
            <th>SPED teacher</th>
            <th>Student / parent</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>See students across both branches</td><td className="yes">Yes</td><td className="no">Own branch only</td><td className="no">Own branch only</td><td className="no">Their assigned grades only</td><td className="no">Themselves only</td></tr>
          <tr><td>Create / disable staff accounts</td><td className="yes">Yes</td><td className="partial">Own branch (Teachers + Front desk only)</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Impersonate other users ("View as")</td><td className="yes">Yes (except other branch admins)</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Record cash / bank / PayMongo payments</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Confirm pending payments</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Delete confirmed payment rows</td><td className="yes">Yes</td><td className="no">Read only</td><td className="no">Read only</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Edit shared voucher codes (AURA30, etc.)</td><td className="yes">Yes</td><td className="no">Read only</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Issue personal early-bird voucher</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Edit fee schedule</td><td className="yes">Yes</td><td className="partial">Own branch only</td><td className="no">Read only</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Create / edit classes</td><td className="yes">Yes</td><td className="yes">Own branch</td><td className="no">—</td><td className="yes">Own classes</td><td className="no">—</td></tr>
          <tr><td>Create meetings + Cloud Record</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="yes">Own students</td><td className="partial">Join guest link only</td></tr>
          <tr><td>Post announcements</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="partial">To their classes</td><td className="no">—</td></tr>
          <tr><td>Countersign waiver as SCEI</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="no">Witness sig only</td><td className="no">—</td></tr>
          <tr><td>Generate registration letter + fee schedule PDFs</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Pay own tuition (PayMongo)</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="yes">Yes</td></tr>
        </tbody>
      </table>
      </div>

      <h3>Impersonation — "View as"</h3>
      <p>When a parent or teacher reports something you can't reproduce, sign in <em>as them</em> for a few minutes to see exactly what they see. Only the main admin can do this.</p>
      <ol className="task-steps">
        <li className="task-step">Open <strong>Admin → Users</strong>. Find the row for the person you want to view as.</li>
        <li className="task-step">Click <strong>View as</strong> on the far right of their row. Confirm the popup ("Open &lt;email&gt;'s portal as them? A red banner across the top will let you return to your admin session. This is logged for audit.").</li>
        <li className="task-step">The whole browser tab reloads into <em>their</em> view — you land on <code>/profile</code> for a student/teacher or <code>/frontdesk</code> for a front-desk user. Every action you take is logged as coming from them.</li>
        <li className="task-step">A red banner across the top of the screen says <strong>VIEWING AS &lt;name&gt; (&lt;email&gt;) · &lt;role&gt;</strong> with a <strong>Return to admin →</strong> button.</li>
        <li className="task-step">Click <strong>Return to admin →</strong> to end the impersonation. You land back on <code>/admin</code>. The session is bounded — closing the tab also ends it.</li>
      </ol>
      <div className="callout callout-note">
        <span className="label">Branch admins can't be impersonated</span>
        The <strong>View as</strong> button is hidden on branch-admin rows. Every impersonation is logged with a start-time and end-time in the impersonation audit table — even if you close the tab, the row records "session closed at &lt;time&gt;" from the next login.
      </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 2. THE SIDEBAR
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="sidebar">
      <h2 id="sidebar">2. The sidebar</h2>
      <p>Every signed-in page has the same left sidebar. What appears in it depends on your role. On mobile the sidebar collapses into a hamburger (☰) menu you tap open.</p>

      <div className="overflow-x-auto">
      <table className="matrix">
        <thead>
          <tr>
            <th>Nav item</th>
            <th>What it opens</th>
            <th>Main admin</th>
            <th>Branch admin</th>
            <th>Front desk</th>
            <th>Teacher</th>
            <th>Student</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>Admin dashboard</strong> (main + branch admin) / <strong>Front desk</strong> / <strong>Teacher hub</strong> / <strong>My profile</strong></td><td>Your role's home screen. The label and destination change with your role.</td><td className="yes">/admin</td><td className="yes">/admin</td><td className="yes">/frontdesk</td><td className="yes">/profile</td><td className="yes">/profile</td></tr>
          <tr><td><strong>Classes</strong></td><td>Card grid of classes you can see (teacher = your own; admin/branch admin = all). Create new + open detail.</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">Not shown (goes to /frontdesk)</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td><strong>Calendar</strong></td><td>Month grid of events + branch-scoped PDF upload.</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes (via Front desk tab)</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td><strong>Meetings</strong></td><td>LiveKit video-room list. Create meetings, copy links, cancel/delete.</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="yes">Yes</td><td className="yes">Own tagged meetings</td></tr>
          <tr><td><strong>Pay tuition</strong></td><td>PayMongo checkout / cash notify / bank-deposit upload.</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="yes">Yes</td></tr>
          <tr><td><strong>Class Portal Handbook</strong></td><td>This page.</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
        </tbody>
      </table>
      </div>

      <h3>The user chip (bottom of the sidebar)</h3>
      <p>Always shows:</p>
      <ul>
        <li>The word <code>Signed in</code></li>
        <li>Your display name (usually the part of your email before <code>@</code>)</li>
        <li>Your role label — <em>Main admin</em>, <em>Branch admin · East</em>, <em>Branch admin · Greenhills</em>, <em>Front desk · East</em>, <em>Front desk · Greenhills</em>, <em>Teacher</em>, or <em>Student</em></li>
        <li><strong>Sign out</strong> — clears your session and returns to the marketing homepage. Use this any time you're on a shared device, or when a "Missing bearer token." error is stuck.</li>
      </ul>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 3. MAIN ADMIN — nine tabs, exhaustive
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="main-admin">
      <h2 id="main-admin">3. Clinic manager — every admin tab <span className="tag tag-sage">Main admin</span></h2>
      <p>The clinic manager account (<code>main@sapphireclinicseast.org</code>) is the only role that sees every branch, every student, every payment, every reminder. Signing in as main admin lands you on <code>/admin</code>. Below the page header ("Admin dashboard" with your email) sits a horizontal row of nine tabs — click one to switch panels. The active tab is highlighted; the other eight stay one click away.</p>

      <p><strong>The nine tabs, in order:</strong> Users · Students · Grade Levels · Curriculum · Templates · Notifications · Payments · Fees · Assignments.</p>

      {/* ---- Users tab -------------------------------------------- */}
      <div className="role-card">
        <h3>Tab 1 — Users</h3>
        <p>The users tab has three stacked cards: the users table, the "Create staff account" form, and "Add teacher from Staff Module".</p>

        <h4>Users table (top card)</h4>
        <p>Above the table you'll see live counts like <code>84 total · 62 students · 12 teachers · 6 front desk · 4 branch admins</code>, a <strong>Show passwords</strong> checkbox on the right (only reveals passwords that were set or reset on <em>this</em> device — bcrypt one-way encryption means a password set on another device is stored as bullets and a "Last set by … on …" note), and a role-filter pill bar: <strong>All · Students · Teachers · Front desk · Branch admins</strong>.</p>
        <p>Table columns: <em>Role · Name · Email · Branch · Password · Level · Created</em>, plus a row-action cell on the right. Extras you'll see in specific rows:</p>
        <ul>
          <li><span className="tag tag-amber">Intern</span> badge next to the role for interns (tooltip explains the auto-disable date).</li>
          <li><span className="tag tag-rose">Disabled</span> badge for accounts that can't sign in (either main admin disabled them or the intern-lifecycle cron did).</li>
        </ul>
        <p>Row action buttons (right-most column):</p>
        <ol className="task-steps">
          <li className="task-step"><strong>Edit</strong> — opens the Edit user modal. Fields: <em>First name · Last name · Email (required) · Branch · Grade level (students only) · New password (blank = keep current, min 6)</em>. Bottom buttons: <strong>Cancel</strong> and <strong>Save changes</strong>.</li>
          <li className="task-step"><strong>View as</strong> — impersonation (see the <a href="#getting-started">Impersonation</a> section above). Hidden on branch-admin rows.</li>
          <li className="task-step"><strong>Email reset link</strong> — sends the user a one-shot password-reset link with a 24-hour token. Use this when a parent has lost their password.</li>
          <li className="task-step"><strong>Enable</strong> / <strong>Disable</strong> — main-admin only. Disabling hides the row from teacher and front-desk listings and blocks sign-in. Confirm dialog explains the effect. Re-enable any time.</li>
          <li className="task-step"><strong>Delete</strong> — main-admin only. Hard-deletes the row and every payment/document/enrollment tied to it. Use <strong>Disable</strong> instead when a student is just leaving the school and you want to keep their history.</li>
        </ol>

        <h4>Reset Password modal</h4>
        <p>Reached by clicking the <strong>Reset</strong> link in the Password column. Body copy warns "The current password can't be retrieved. Setting a new one will overwrite it. Copy the value before closing — it's only shown to you." The <em>New password</em> field is pre-filled with a random value from the <strong>Generate</strong> button — click Generate again to spin a new one. Save with <strong>Save new password</strong>. Hand the value to the user out-of-band (in person or via a secure messaging channel). <strong>Never email a password.</strong></p>

        <h4>Create staff account (middle card)</h4>
        <p>For quickly minting a new class-portal account that isn't already in HR Hub. Main admin sees <em>Role</em> options: <strong>Teacher · Front desk · Branch admin</strong>. Branch admin sees only Teacher + Front desk.</p>
        <p>Fields: <em>Role · Branch · First name · Last name · Email · Password</em> (with a <strong>Generate</strong> button next to it). Click <strong>Create &lt;role&gt;</strong> (e.g. "Create teacher"). The success toast shows the plaintext password one time — copy it before dismissing.</p>

        <h4>Add teacher from Staff Module (bottom card)</h4>
        <p>This card mirrors HR Hub's active SPED teacher + intern roster so you don't have to retype anyone. It shows a search box (matches name / job title / email), a <em>Branch</em> select (<strong>All branches · East Branch · Greenhills Branch</strong>), and a table with columns <em>Name · Role · Job title · Branch · Email · Contract end · (action)</em>. The <em>Role</em> cell tags interns with an amber <span className="tag tag-amber">Intern</span> pill.</p>
        <p>To create a class-portal account for someone in the list:</p>
        <ol className="task-steps">
          <li className="task-step">Find the row. If they already have an account, the action cell shows <em>Account exists</em> in muted text.</li>
          <li className="task-step">Otherwise click <strong>Create account</strong>. The action cell expands into a password input (placeholder "password (min 6)") plus <strong>Save</strong> and <strong>Cancel</strong> buttons.</li>
          <li className="task-step">Type or generate a password, click <strong>Save</strong>. The success toast reads <em>"Intern teacher account created for &lt;name&gt; (&lt;branch&gt;). Auto-disables &lt;date&gt;. Password: &lt;pw&gt;"</em> for interns, or "Teacher account …" for regular staff.</li>
        </ol>
        <p>Interns auto-disable 15 days after the end of their internship-end month (see <a href="#interns">chapter 15 — Intern accounts</a>).</p>
      </div>

      {/* ---- Students tab ---------------------------------------- */}
      <div className="role-card">
        <h3>Tab 2 — Students</h3>
        <p>Header: <em>Students · All enrolled students.</em> On the right, a search input placeholder <em>"Search by name or email"</em>.</p>

        <h4>Students table</h4>
        <p>Columns: <em>Name · Email · Level · Branch · Plan · Enrolled · Payment · (View)</em>. The whole row is clickable — anywhere on it opens the student detail drawer. The <strong>Plan</strong> column shows a coloured pill (<em>Annual</em> / <em>Bi-annual</em> / <em>Monthly</em> / <em>—</em> if there's no payment on file yet). The <strong>Payment</strong> column shows one of <em>Paid · Due · Pending · No payment yet</em>.</p>

        <h4>Student detail drawer</h4>
        <p>Opens as a full-screen modal. The header has <strong>← Back to list</strong> on the left, the student's name in the middle, and (main admin only) either a <strong>Sign as SCEI</strong> button (when the waiver is not yet countersigned) or a <span className="tag tag-sage">SCEI countersigned</span> badge, plus an <strong>×</strong> close button in the top-right.</p>
        <p>The body is a stack of five cards:</p>
        <ol className="task-steps">
          <li className="task-step"><strong>Identity + tuition status.</strong> Headshot on the left (main admin sees it read-only; the student themselves can edit it via <em>Change photo</em>). Name, email, and an inline grade-level editor <em>Enrolled in &lt;level&gt; · Change</em>. Right side shows the tuition badge stack (past-paid, past-due, current period).</li>
          <li className="task-step"><strong>Record PayMongo payment</strong> button (main-admin only, and only when this student has zero prior payments). Opens the PayMongo recorder modal — fields: <em>Amount paid (PHP) · Plan · Period covered · PayMongo reference / receipt no. (optional)</em>. Bottom buttons: <strong>Cancel</strong> · <strong>Record payment</strong>.</li>
          <li className="task-step"><strong>Learner profile</strong> card. Definition list of school year, LRN status, LRN, PSA Birth Cert No., DOB, sex, mother tongue, religion, diagnosis, LSEN, full address, both parents, guardian, phone numbers. Header actions:
            <ul>
              <li><strong>Update LRN</strong> — inline form with LRN Status radio (<em>No LRN · With LRN · Returning (Balik-Aral)</em>) and a 12-digit LRN input.</li>
              <li><strong>Set / Update LSEN classification</strong> — grouped select using the DepEd LIS rubric. Only trained staff should fill this.</li>
              <li><strong>Edit enrollment</strong> — opens the full enrollment-form editor (same form the parent filled at signup).</li>
            </ul>
          </li>
          <li className="task-step"><strong>Submitted documents</strong> card. Each existing document has <strong>View · Download · Re-upload</strong>. At the bottom is a picker (<em>Choose a document to upload…</em>) with <em>Upload file</em> / <em>Replace file</em> buttons. Doc keys: PSA Birth Certificate · Child's 1×1 Photo · Parent/Guardian Valid ID · PWD ID · Latest Report Card (SF9) · Certificate of Good Moral Character · Medical / therapy reports · DepEd Affidavit of Undertaking · Form 137 / SF10 (staff only).</li>
          <li className="task-step"><strong>Other Documents</strong> card — auto-generated PDFs. Each sub-card has <strong>View</strong> and <strong>Download PDF</strong>:
            <ul>
              <li><em>Enrollment Form (Annex 2)</em></li>
              <li><em>Parent / Guardian Waiver</em> — three states (signed with witness / signed without witness / not yet signed). Students see a <strong>Sign waiver →</strong> link that opens <code>/waiver</code>.</li>
              <li><em>School ID</em> — main admin can <strong>Upload School ID</strong> or <strong>Replace</strong>; everyone else can View / Download.</li>
              <li><em>School Registration Letter</em> (main-admin only) — see <a href="#documents">chapter 12</a>.</li>
              <li><em>Schedule of Fees</em> (main-admin only) — see <a href="#documents">chapter 12</a>.</li>
              <li><em>Personal Vouchers</em> — see <a href="#vouchers">chapter 14</a>.</li>
              <li><em>Plan-switch balance calculator</em> (main-admin only) — see <a href="#payments">chapter 11</a>.</li>
              <li><em>Form 137 / SF10</em> — main admin + teacher can upload/replace.</li>
            </ul>
          </li>
          <li className="task-step"><strong>Grades</strong> card — only appears when a grade record exists. Quarter tiles Q1 / Q2 / Q3 / Q4 / Year Avg.</li>
        </ol>

        <h4>Sign as SCEI form</h4>
        <p>Clicking the header's <strong>Sign as SCEI</strong> button opens the SceiAckForm. Fields: <em>Printed name</em> and a <em>Signature</em> canvas (mouse, finger, or stylus). Buttons: <strong>Cancel</strong> · <strong>Sign &amp; regenerate PDF</strong>. Signing regenerates the waiver PDF with SCEI's acknowledgment embedded and re-uploads it to the server — the badge in the drawer header flips to <span className="tag tag-sage">SCEI countersigned</span> with a hover-tooltip showing the signer + date.</p>
      </div>

      {/* ---- Grade Levels tab ------------------------------------ */}
      <div className="role-card">
        <h3>Tab 3 — Grade Levels</h3>
        <p>Header: <em>Classes · Disabling hides the tile on the enrollment landing page. Existing students at the level stay enrolled and are unaffected.</em></p>
        <p>Below the header, a grid of 14 tiles — one per grade (<em>Nursery, Kinder, Grade 1 … Grade 12</em>). Each tile shows:</p>
        <ul>
          <li>The grade label</li>
          <li>Live count + status: <em>4 enrolled · Open for enrollment</em> (green) or <em>4 enrolled · Closed for new enrollees</em> (red)</li>
          <li>A toggle button — <strong>Disable</strong> when the level is open, <strong>Enable</strong> when closed, <strong>Saving…</strong> while pending.</li>
        </ul>
        <p>Use this to close Grade 11 to new enrollees mid-year without deleting anything.</p>
      </div>

      {/* ---- Curriculum tab -------------------------------------- */}
      <div className="role-card">
        <h3>Tab 4 — Curriculum</h3>
        <p>Two stacked cards.</p>

        <h4>Upload curriculum template (top card)</h4>
        <ol className="task-steps">
          <li className="task-step">Type a <em>Title</em>.</li>
          <li className="task-step">Pick a <em>Grade level</em> from the 14-level dropdown.</li>
          <li className="task-step">Attach up to three file variants — each has <strong>Choose</strong> / <strong>Change</strong> / <strong>Remove</strong> buttons:
            <ul>
              <li><em>PDF version</em> (.pdf)</li>
              <li><em>Word version</em> (.doc / .docx)</li>
              <li><em>Excel version</em> (.xls / .xlsx / .csv)</li>
            </ul>
          </li>
          <li className="task-step">Click <strong>Save curriculum</strong>.</li>
        </ol>

        <h4>All curriculum templates (bottom card)</h4>
        <p>Search input <em>"Search by title, file name, uploader, or grade"</em> and a <strong>Reset &amp; resync</strong> button (wipes the local cache and re-fetches). Below, curricula are grouped by grade into collapsible sections. Each row has format chips: <em>PDF</em> / <em>Word</em> / <em>Excel</em> / <em>File</em> with a small <strong>↗</strong> to open in a new tab and <strong>↓</strong> to download, plus a <strong>Delete</strong> button (main admin or the uploader).</p>
      </div>

      {/* ---- Templates tab --------------------------------------- */}
      <div className="role-card">
        <h3>Tab 5 — Templates</h3>
        <p>Same layout as Curriculum but for free-form templates (IEP forms, lesson plans, parent letters). Only two file slots: <em>PDF version</em> and <em>Word version</em>. No grade level.</p>
      </div>

      {/* ---- Notifications tab ----------------------------------- */}
      <div className="role-card">
        <h3>Tab 6 — Notifications</h3>
        <p>The announcement composer + list, plus (when active) an admin aggregate view of the payment-reminder log.</p>

        <h4>Compose an announcement</h4>
        <ol className="task-steps">
          <li className="task-step">Click <strong>New announcement</strong>.</li>
          <li className="task-step">Type a <em>Title</em> and a body in <em>Details</em>.</li>
          <li className="task-step">Optionally attach a poster (image or PDF) via <strong>+ Add poster or PDF</strong>. To swap it out, click <strong>Replace attachment</strong>; to drop it, click <strong>Remove</strong>. The preview appears below.</li>
          <li className="task-step">Pick the <em>Grade levels</em> to target using the 14 pill toggles. Leave all blank = school-wide.</li>
          <li className="task-step">Tick <strong>Also notify teachers</strong> if you want the announcement to reach teachers too (main admin only).</li>
          <li className="task-step">Click <strong>Publish</strong>. The announcement appears in the recipient portals and in the Announcements list below.</li>
        </ol>

        <h4>Announcements list</h4>
        <p>Each row shows the title with 📎 <em>Poster</em> chip (if attached) and ✉ <em>Emailed · N</em> chip (if an email blast has been sent). Click <strong>View</strong> to open the announcement modal.</p>

        <h4>Announcement modal actions</h4>
        <ul>
          <li><strong>Send Email</strong> / <strong>Send email again</strong> — main admin and teacher can click; front desk cannot. Confirm dialog notes if already emailed. On success a toast lists the per-role / per-level breakdown of recipients.</li>
          <li><strong>Delete announcement</strong> — main admin can delete anything; teachers can only delete what they authored.</li>
          <li><strong>Close</strong> — top-right.</li>
        </ul>
      </div>

      {/* ---- Payments tab ---------------------------------------- */}
      <div className="role-card">
        <h3>Tab 7 — Payments</h3>
        <p>The busiest tab. Six stacked sub-panels in order: <em>Pending confirmations · Confirmed Payments · Pending payments — by deadline · Paying students (consolidated table) · No payment record yet · Automated payment reminders (log)</em>.</p>

        <h4>Pending confirmations</h4>
        <p>Rows are payments the front desk has recorded but not yet confirmed. Top-right buttons: <strong>+ Record payment</strong> and <strong>Refresh</strong>. Columns: <em>Student · Plan · Period · Method · Branch · Amount · Submitted · Action</em>.</p>
        <p>The <strong>Method</strong> column is an inline <em>select</em> — change it any time before confirming. Options: <em>Frontdesk: Cash / Credit Card / Debit Card / GCash / PayMaya · Bank deposit · PayMongo</em>. Legacy null shows "— Unspecified —".</p>
        <p>Row actions:</p>
        <ul>
          <li><strong>Confirm payment</strong> — flips status to Paid, moves the row to Confirmed Payments below, and lights up the student's badge.</li>
          <li><strong>Edit</strong> — opens the Edit payment modal (see below).</li>
          <li><strong>Delete</strong> — main-admin only. Different confirm dialogs for PENDING vs CONVERTED rows; for CONVERTED, a warning that deleting here does NOT void the corresponding Order in the accounting hub.</li>
        </ul>

        <h4>Confirmed Payments</h4>
        <p>Search input <em>"Search name, email, plan, period, method, branch"</em> and a live counter <em>N/total total</em>. Same columns as Pending plus a <em>Confirmed at</em> timestamp; status badge is always <span className="tag tag-sage">Paid</span>. Row actions: <strong>Edit</strong> and <strong>Delete</strong> (main-admin only).</p>

        <h4>Record payment modal</h4>
        <p>Opened by <strong>+ Record payment</strong>. Header: <em>Record payment on behalf of student · Front-desk override</em>. Body copy explains this creates a PENDING row that still needs <em>Confirm payment</em> before the student's badge flips.</p>
        <ol className="task-steps">
          <li className="task-step">Pick the <strong>Student</strong> from the searchable dropdown. If your branch is scoped, only in-branch active students appear. Options are formatted <em>Last, First · Branch · Level</em>.</li>
          <li className="task-step">Pick the <strong>Payment method</strong>: <em>Frontdesk payment</em> / <em>Bank deposit</em> / <em>PayMongo</em>.</li>
          <li className="task-step">When method = <em>Frontdesk payment</em>, a second dropdown appears — <strong>Frontdesk payment type</strong>: <em>Cash · Credit Card · Debit Card · GCash · PayMaya</em>.</li>
          <li className="task-step">Pick the <strong>Plan</strong>: <em>Monthly · Bi-annual · Annual</em>.</li>
          <li className="task-step">Type the <strong>Amount paid (PHP)</strong> as a plain number (no commas).</li>
          <li className="task-step">Use the <strong>Period covered</strong> picker — see <a href="#payments">chapter 11</a> for why the period text matters so much.</li>
          <li className="task-step">Optionally type a <em>Receipt no.</em> / <em>Deposit slip reference</em> / <em>PayMongo reference</em> in the reference field (its label morphs to match the method).</li>
          <li className="task-step">Click <strong>Record payment</strong>. The success alert reminds you to click <em>Confirm payment</em> once the money is actually verified.</li>
        </ol>

        <div className="callout callout-warn">
          <span className="label">PayMongo payments do NOT auto-confirm from this flow</span>
          When the parent completes a real PayMongo checkout via <code>/pay</code>, the webhook flips the row automatically. But when <em>staff</em> record a PayMongo payment via <strong>+ Record payment</strong>, that's a bookkeeping entry for a receipt already collected elsewhere — it lands as PENDING and you must still click <strong>Confirm payment</strong>. Forgetting this step is the #1 cause of "the parent paid via PayMongo but the portal still says Due" tickets.
        </div>

        <h4>Edit payment modal</h4>
        <p>Reached by <strong>Edit</strong> on any pending or confirmed row. Header: <em>Edit payment · reconcile with accounting hub · &lt;student name&gt;</em> with a sub-line showing email, branch, current status, and the internal payment ID (useful when cross-referencing with the accounting hub).</p>
        <p>Fields: <em>Amount paid (PHP) · Method · Frontdesk payment type · Plan · Period covered · Submitted at · Confirmed at · Remarks / accounting-hub reference</em>. Setting <strong>Confirmed at</strong> on a pending row auto-flips its status to CONVERTED. Bottom buttons: <strong>Cancel</strong> · <strong>Save changes</strong>.</p>

        <h4>Pending payments — by deadline</h4>
        <p>Shows every student who owes something, closest deadline first. Search input <em>"Search by name, email, plan, or branch"</em>. Columns: <em>Student · Branch · Plan · Period · Deadline · Amount · Method · Proof · Remind</em> + a <em>Action</em> column (main-admin only). Overdue rows go rose with an "overdue" tag.</p>
        <ul>
          <li><strong>Proof</strong> column has a <strong>View</strong> button if the parent uploaded a bank slip; otherwise "—".</li>
          <li><strong>Remind</strong> cell shows <strong>🔔 Remind</strong> for overdue rows only — clicking sends a manual overdue-reminder email immediately, then shows <strong>Sending…</strong> → <strong>✓ Sent</strong> for 4 seconds. Every send is logged below.</li>
          <li><strong>Delete</strong> column (main admin) hard-deletes the student's account — the confirm dialog offers <em>Disable instead</em> as the safer path.</li>
        </ul>

        <h4>Paying students (consolidated table)</h4>
        <p>Header <em>Payments · Paying students · Showing: &lt;slice&gt; · N paid · M pending</em>. Filter pills: <strong>All · Annual · Bi-annual · Monthly</strong>. Selecting <em>Bi-annual</em> reveals sub-pills <strong>1st Biannual</strong> / <strong>2nd Biannual</strong>; selecting <em>Monthly</em> reveals a month dropdown (June … May) preselected to the current month. Status pill recomputes per slice.</p>

        <h4>No payment record yet</h4>
        <p>Students who haven't started any checkout. Each row: name + email + level, plus a <strong>Delete</strong> (main admin).</p>

        <h4>Automated payment reminders (log)</h4>
        <p>Filters: <em>Window</em> dropdown (<em>Last 7 days · Last 30 days · Last 90 days · Last 12 months</em>) and a <em>Search name / email / period</em> input. Below, a collapsible <em>&lt;details&gt;</em> block per period (e.g. "August 2026") with a table of every reminder sent: <em>Student · Branch · Plan · Reminder</em> (5-day heads-up / Due tomorrow / Past due / Manual reminder) · <em>Sent at</em>.</p>
      </div>

      {/* ---- Fees tab -------------------------------------------- */}
      <div className="role-card">
        <h3>Tab 8 — Fees</h3>
        <p>Two panels: <em>Tuition + fees</em> (both roles can see) and <em>Voucher codes</em> (main-admin only).</p>

        <h4>Tuition + fees</h4>
        <p>One card per branch you can edit. Each card has an H3 with the branch name, a "Last updated &lt;timestamp&gt; by &lt;email&gt;" line, and a grid of six ₱ inputs:</p>
        <ul>
          <li><em>Tuition — Annual · Bi-annual · Monthly</em></li>
          <li><em>Misc — Annual · Bi-annual · Monthly</em></li>
        </ul>
        <p>Below the six, an <em>Other line items</em> section with <strong>+ Add item</strong> — each extra item has <em>Label · Amount (₱) · Notes (optional)</em> and a <strong>Remove</strong> button. Save with <strong>Save fees</strong> at the bottom. Every <code>/pay</code> checkout and every plan-switch calculator on that branch picks up the new numbers on the next page load.</p>

        <h4>Voucher codes (main-admin only)</h4>
        <p>Bulk editor with a grid of rows: <em>Code · Discount % · Valid until · Active</em> checkbox · <strong>Remove</strong>. Footer buttons: <strong>+ Add voucher</strong> · <strong>Save vouchers</strong>. Codes are case-insensitive; expired ones display an "expired" label.</p>
        <p>Below a divider, the <em>Personal early-bird vouchers</em> table lists every per-student code minted across the school — columns <em>Student · Branch · Code (click to copy) · Discount · Valid until · Status · Issued by</em>. See <a href="#vouchers">chapter 14</a>.</p>
      </div>

      {/* ---- Assignments tab ------------------------------------- */}
      <div className="role-card">
        <h3>Tab 9 — Assignments</h3>
        <p>The teacher ↔ grade matrix. Only the main admin can edit; branch admins see it read-only.</p>
        <p>Header: <em>Teacher assignments · Tick the grade levels each teacher handles, per branch. Teachers only see students enrolled in the branches and grades they're assigned to.</em></p>
        <p>Table: teacher name in the first column, branch in the second, then 14 short-labelled columns <em>N · K · G1 … G12</em>. Each cell is a checkbox — clicking auto-saves. Every teacher gets one row per branch you can see (both branches for main admin; one for branch admin).</p>
      </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 4. BRANCH ADMIN
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="branch-admin">
      <h2 id="branch-admin">4. HR officer — what's different <span className="tag tag-info">Branch admin</span></h2>
      <p>The HR officer / branch admin lands on the same <code>/admin</code> dashboard with the same nine tabs. Everything is filtered to your branch (East or Greenhills) at the server level, so cross-branch data never reaches your screen.</p>

      <h3>Practical differences vs main admin</h3>
      <ul>
        <li><strong>Students, Payments (all sub-tabs)</strong> — only your branch.</li>
        <li><strong>Fees</strong> — you see the fee schedule for every branch but can only edit your own.</li>
        <li><strong>Users → Create staff account</strong> — the <em>Role</em> dropdown only offers <em>Teacher</em> and <em>Front desk</em>; the <em>Branch</em> field is disabled and preset to yours.</li>
        <li><strong>Users table</strong> — <em>Enable / Disable</em> and <em>Delete</em> row buttons are hidden. If you need to disable someone, ask the main admin.</li>
        <li><strong>Voucher codes panel</strong> — hidden entirely. Shared codes (AURA30 etc.) are main-admin only. You can still issue <em>personal</em> early-bird vouchers from student profiles.</li>
        <li><strong>Payments → row actions</strong> — <em>Delete</em> buttons are hidden across all four payment sub-panels.</li>
        <li><strong>Assignments tab</strong> — you can see it, but the checkboxes are disabled with a tooltip <em>"Only the main admin can edit teacher assignments."</em></li>
        <li><strong>Student detail drawer</strong> — the following are hidden or read-only: <em>Record PayMongo payment</em> button, <em>+ Issue AURA30 early-bird voucher</em> button, <em>School Registration Letter</em> card, <em>Schedule of Fees</em> card, <em>Plan-switch balance calculator</em>, <em>Upload School ID</em>.</li>
      </ul>

      <p>Everything else — reset passwords, edit users in your branch, add teachers from the Staff Module, use the Curriculum / Templates / Notifications tabs — you have full access to.</p>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 5. FRONT DESK
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="frontdesk">
      <h2 id="frontdesk">5. Front desk — every tab <span className="tag tag-amber">Frontdesk</span></h2>
      <p>Signing in as front desk lands you on <code>/frontdesk</code>. Header shows <em>Aura Academy · Clinic front desk · Front desk dashboard · &lt;your email&gt;</em>. Below the header, six tabs: <strong>Students · Calendar · Payments · Enrollment register · Curriculum · Templates</strong>.</p>

      <div className="role-card">
        <h3>Tab 1 — Students</h3>
        <p>Uses the same StudentListPanel as main admin, scoped to your branch. Search by name or email. Click any row to open the detail drawer (see <a href="#main-admin">chapter 3 → Tab 2</a> — you have main-admin-equivalent access to every card <em>except</em> the ADMIN-only auto-generated PDFs).</p>
      </div>

      <div className="role-card">
        <h3>Tab 2 — Calendar</h3>
        <p>Embeds the shared calendar page, scoped to your branch. See <a href="#calendar">chapter 9</a>.</p>
      </div>

      <div className="role-card">
        <h3>Tab 3 — Payments</h3>
        <p>Two stacked components. First, <strong>FrontDeskPaymentConfirmations</strong> — the Pending queue + Confirmed list + Record modal + Edit modal (identical to the main admin's Payments tab). Second, <strong>PaymentsGrouped</strong> — the "Pending payments — by deadline" table, the consolidated "Paying students" filter table, and the automated reminder log.</p>
        <p>Row actions:</p>
        <ul>
          <li><strong>+ Record payment</strong> and <strong>Refresh</strong> (top-right of Pending confirmations).</li>
          <li><strong>Confirm payment</strong> · <strong>Edit</strong> · <strong>Delete</strong> per pending row (Delete is main-admin only server-side; you'll see it disabled or hidden).</li>
          <li><strong>🔔 Remind</strong> on overdue rows in the by-deadline table.</li>
        </ul>
      </div>

      <div className="role-card">
        <h3>Tab 4 — Enrollment register (aka "Spreadsheet")</h3>
        <p>The DepEd-compliant enrollment register. Every cell is click-to-edit and saves automatically. Columns include full name, LRN status, LRN, PSA Birth Cert No., DOB, sex, address, both parents, LSEN classification, LIS status, remittance, comments, plus six document-status columns.</p>
        <p>Toolbar: search input, grade-level filter dropdown, <strong>Clear</strong> link, <strong>Refresh</strong>, <strong>Excel</strong> export button, and <strong>Sign out</strong>.</p>
        <p>For <em>NO_LRN</em> rows, the LRN cell is an inline 12-digit input. Type the LRN and click away — on blur it validates against <code>^\d{'{'}12{'}'}$</code>. Valid LRNs auto-flip the status to <em>WITH_LRN</em>.</p>
      </div>

      <div className="role-card">
        <h3>Tab 5 — Curriculum</h3>
        <p>Same as main admin's Curriculum tab — upload + view + delete curriculum templates.</p>
      </div>

      <div className="role-card">
        <h3>Tab 6 — Templates</h3>
        <p>Same as main admin's Templates tab — upload + view + delete free-form templates.</p>
      </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 6. SPED TEACHER HUB
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="teacher">
      <h2 id="teacher">6. SPED teacher hub <span className="tag tag-info">Teacher</span></h2>
      <p>Signing in as a teacher lands you on <code>/profile</code>, which the sidebar labels <strong>Teacher hub</strong>. You have four sidebar nav items: <em>Teacher hub · Classes · Calendar · Meetings</em>.</p>

      <h3>Where you land — Teacher hub</h3>
      <p>Renders your own profile summary (headshot, name, email) plus a card for every class you've been assigned (a click on any card opens the class dashboard — see <a href="#classes">chapter 7</a>). No payment data, no user administration.</p>

      <h3>Key workflows</h3>
      <div className="role-card">
        <h4>Sign a student's waiver as witness</h4>
        <ol className="task-steps">
          <li className="task-step">Open <strong>Classes → Open</strong> any class you handle → click a student to open their detail drawer.</li>
          <li className="task-step">Header shows <strong>Sign as witness</strong> button (or <span className="tag tag-sage">Waiver witness signed</span> badge if you already did).</li>
          <li className="task-step">Click <strong>Sign as witness</strong>, draw your signature, save. Your signature gets embedded into the waiver PDF alongside the parent's.</li>
        </ol>
        <div className="callout">
          <span className="label">Waiver signatures sync across devices</span>
          As of 2026-08, when you sign a waiver on your phone and then open the same student on your laptop, the laptop's copy auto-syncs. You don't have to re-sign per device.
        </div>

        <h4>Edit a student's LRN or upload their Form 137 / SF10</h4>
        <p>Teachers, front desk, and admins share this permission. On the student profile, use the <strong>Update LRN</strong> button in Learner profile, or the <strong>Form 137 / SF10</strong> upload slot in Other documents.</p>

        <h4>Post an announcement to your classes</h4>
        <ol className="task-steps">
          <li className="task-step">Open the Notifications section of your assigned class dashboard.</li>
          <li className="task-step">Click <strong>New announcement</strong>. Title, body, optional PDF attachment. Recipients auto-scope to the class roster's parents.</li>
          <li className="task-step">Click <strong>Publish</strong>. Optionally hit <strong>Send Email</strong> from the announcement modal to blast the email version.</li>
        </ol>
      </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 7. STUDENT / PARENT
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="student">
      <h2 id="student">7. Student / parent portal <span className="tag tag-sage">Student</span></h2>
      <p>The student account is what parents sign in to. The child is technically the "student user"; the parent normally holds the credentials and pays on the child's behalf. Signing in lands you on <code>/profile</code>. Sidebar: <em>My profile · Classes · Calendar · Meetings · Pay tuition</em>.</p>

      <h3>Profile tabs</h3>
      <p>At the top of <code>/profile</code>, a tab bar with four buttons:</p>
      <ol className="task-steps">
        <li className="task-step"><strong>Profile</strong> — your identity card (headshot + name + level with a <em>Change</em> link), a <em>Pay tuition fee →</em> shortcut button, the Learner profile card (which parents can edit via <strong>Edit profile</strong>), Submitted documents, Other Documents (auto-generated PDFs, Personal Vouchers, Form 137 / SF10), and Grades preview when populated.</li>
          <li className="task-step"><strong>Payment</strong> — either the "Tuition not yet paid" prompt with a big <em>Pay tuition fee →</em> button, or the payment history table. Columns: <em>Date · Plan · Period · Total · Method · Status · Proof</em>.</li>
        <li className="task-step"><strong>Grades</strong> — Q1 / Q2 / Q3 / Q4 / Year Avg tiles once the teacher has recorded them, or an empty state.</li>
        <li className="task-step"><strong>Notifications</strong> — announcements the school has posted, filtered to your grade level.</li>
      </ol>

      <h3>Check what tuition you owe</h3>
      <p>Open your profile. The badge in the top-right of the identity card is authoritative:</p>
      <ul>
        <li><span className="tag tag-sage">Paid for July 2026</span> — you're current.</li>
        <li><span className="tag tag-rose">Due for July 2026</span> — click <strong>Pay tuition fee →</strong> to open <code>/pay</code>.</li>
        <li><span className="tag tag-amber">Owes for June 2026</span> alongside <span className="tag tag-sage">Paid for July 2026</span> — you paid this month but skipped an earlier one. Contact the front desk to settle the missing month, or open <code>/pay</code> where a callout lists the past-due months.</li>
      </ul>

      <Illustration caption="Student profile card — badges stack from oldest paid month down to the current period.">
        <div className="mk-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--paper-2)', flexShrink: 0 }} />
              <div>
                <div className="mk-label">Student profile</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--deep-teal)' }}>BRUCE INIGO PELAGIO</div>
                <div style={{ fontSize: 11, color: 'var(--mid-gray)' }}>gladys.selosa@gmail.com</div>
                <div style={{ fontSize: 11, color: 'var(--mid-gray)', marginTop: 2 }}>Enrolled in <strong>Grade 1</strong></div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span className="tag tag-sage">Paid for June 2026</span>
              <span className="tag tag-sage">Paid for July 2026</span>
            </div>
          </div>
        </div>
      </Illustration>

      <h3>Common parent tasks</h3>
      <div className="role-card">
        <h4>Pay tuition (deep dive in <a href="#payments">chapter 11</a>)</h4>
        <ol className="task-steps">
          <li className="task-step">Sidebar → <strong>Pay tuition</strong> (or the button on your profile).</li>
          <li className="task-step">Read the tuition fee schedule + the red tuition obligation policy panel.</li>
          <li className="task-step">Pick a plan (Annual / Bi-annual / Monthly).</li>
          <li className="task-step">If you have a personal early-bird voucher, it's applied automatically — you can <strong>Remove</strong> it if you don't want the discount (it'll re-apply next visit).</li>
          <li className="task-step">Pick a method: <strong>PayMongo checkout</strong> (card / GCash / Maya / GrabPay), <strong>Pay at front desk</strong> (cash), or <strong>Direct bank deposit</strong> (BDO, upload the slip).</li>
          <li className="task-step">For PayMongo, click <strong>Proceed to PayMongo checkout — ₱X,XXX</strong>. You're redirected to the PayMongo hosted checkout, complete payment, and return. Your badge flips to Paid within seconds.</li>
        </ol>

        <h4>Sign the waiver</h4>
        <ol className="task-steps">
          <li className="task-step">From <em>/profile → Other Documents</em>, click <strong>Sign waiver →</strong>. A popup window opens <code>/waiver</code>.</li>
          <li className="task-step">Fill in every section: Student info · Parent/Guardian info · Authorized fetchers · Emergency contact + medical · Acknowledgments (initial each of the 15 clauses) · Photo-release radio · Signatures.</li>
          <li className="task-step">Click <strong>Sign &amp; generate waiver PDF</strong>. The PDF downloads automatically and lands on your profile. The assigned SPED teacher will countersign as witness when she next signs in.</li>
        </ol>

        <h4>Upload a required document</h4>
        <ol className="task-steps">
          <li className="task-step">On <em>/profile</em>, scroll to <strong>Submitted documents</strong>.</li>
          <li className="task-step">At the bottom of the card, pick a document from the dropdown (PSA Birth Certificate, 1×1 Photo, Parent ID, PWD ID, Report Card / SF9, etc.).</li>
          <li className="task-step">Click <strong>Upload file</strong>. Files under 30 MB, PDF / JPG / PNG. To swap, click <strong>Re-upload</strong> on an existing row.</li>
        </ol>

        <h4>See class announcements</h4>
        <p>Sidebar → <strong>Classes</strong>, click your class. Announcements appear in a feed with any attached PDFs opening inline. Or use the Notifications tab on your profile for the full list.</p>
      </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 8. CLASSES — full walkthrough
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="classes">
      <h2 id="classes">8. Classes — full walkthrough</h2>
      <p>Sidebar → <strong>Classes</strong>. The page shows every class you can see as a 2-column card grid (not a table). Teachers see only their assigned classes; admins see everything. Front desk cannot access this page (they're bounced to <code>/frontdesk</code>).</p>

      <h3>The class list</h3>
      <p>Top-right: <strong>+ Add Class</strong> button (main admin, branch admin, teacher only). Each class card has a 16:9 cover photo (or "No cover photo" placeholder), the class title, section (if set), meta line <em>Grade level · Branch · Teacher name</em>, and a schedule line like <em>"Mon, Wed · 08:00–09:30 · 12 students"</em> or <em>"No schedule set"</em>. Row buttons: <strong>Open</strong> (primary), <strong>Edit</strong> (if you can edit this class), <strong>Delete</strong> (with a confirm dialog).</p>

      <h3>Create / Edit class modal</h3>
      <p>Opens as a full-viewport modal on dark backdrop when you click <strong>+ Add Class</strong> or <strong>Edit</strong> on a card. Top-left: eyebrow (<em>Edit class</em> or <em>Add class</em>) + the current class name (or <em>New class</em>). Top-right: <strong>Cancel</strong> button.</p>

      <p>Fields, top-to-bottom:</p>
      <ol className="task-steps">
        <li className="task-step"><strong>Class name</strong> — placeholder <em>"e.g. Math A"</em>.</li>
        <li className="task-step"><strong>Section (optional)</strong> — placeholder <em>"e.g. Falcons"</em>.</li>
        <li className="task-step"><strong>Branch</strong> — dropdown (East / Greenhills). Disabled when editing an existing class.</li>
        <li className="task-step"><strong>Grade level</strong> — 14 options (Nursery, Kinder, Grade 1 … Grade 12).</li>
        <li className="task-step"><strong>Schedule</strong> — day pills (Mon / Tue / Wed / Thu / Fri / Sat / Sun). Tap to select each day the class meets.</li>
        <li className="task-step"><strong>Start time</strong> / <strong>End time</strong> — time inputs.</li>
        <li className="task-step"><strong>Cover photo (optional)</strong> — button label swaps between <strong>Choose photo</strong> and <strong>Replace photo</strong>. Once picked, a <strong>Clear</strong> text button appears.</li>
        <li className="task-step"><strong>Roster — N selected</strong> — helper text <em>"Showing students enrolled at &lt;branch&gt; · &lt;level&gt;. Change branch or level above to see other learners."</em> Below, a scrollable checkbox list. Empty state: <em>"No students match this branch + level yet."</em></li>
      </ol>
      <p>Footer: <strong>Cancel</strong> · <strong>Create class</strong> (or <strong>Save changes</strong> when editing; <strong>Saving…</strong> while busy). If the save fails, the red banner at the top of the modal now shows the actual server error message (as of 2026-09) — no more silent "Could not save. Retry?" mysteries.</p>

      <h3>The class detail page</h3>
      <p>Clicking <strong>Open</strong> on a class card takes you to <code>/classes/&lt;id&gt;</code>. It's a single dashboard with four inline sections in a two-column layout — no tabs.</p>

      <h4>Top row</h4>
      <p>Left (2/3 width): the class overview card — 200 px cover thumbnail, <strong>← All classes</strong> back button, class name with section, meta lines (level + branch, teacher, schedule), and a small <strong>Edit</strong> button next to the name that opens the inline meta editor. In inline-edit mode you can change name, section, days, and times — but not branch or level.</p>
      <p>Below overview: the <strong>Students (N)</strong> panel — bulleted list of student names, scrolls at 180 px.</p>
      <p>Right (1/3 width): three KPI tiles — <em>Classes completed · Students · Avg attendance</em>.</p>

      <h4>Left column (3/5 width) — Day's lessons</h4>
      <p>Feed of lessons. Header <em>"Day's lessons · Add a lesson, take attendance, mark grades, collect proofs."</em> + <strong>+ Add Day's Lesson</strong> button (teacher/admin only). Each lesson card shows date, title, description, and (staff view) a stats line <em>"N/roster present · Graded out of X · Outputs collected"</em>. Row buttons: <strong>Edit</strong> (or <strong>View</strong> for read-only viewers) and <strong>Delete</strong>.</p>

      <div className="role-card">
        <h4>Lesson editor modal</h4>
        <p>Opens as a full-page portal modal with several collapsible sections:</p>
        <ol className="task-steps">
          <li className="task-step"><strong>Details</strong> — <em>Date</em> (with scheduled-day hint), <em>Title</em>, <em>Description</em> textarea.</li>
          <li className="task-step"><strong>Attachments</strong> — visible only after the lesson has been saved once. <strong>+ Add files</strong> supports multiple PDFs / Word / Excel. Each row: <strong>View</strong> · <strong>Delete</strong>.</li>
          <li className="task-step"><strong>Attendance</strong> — hidden for students. Per-student row with <strong>Present</strong> / <strong>Absent</strong> pill toggles.</li>
          <li className="task-step"><strong>Class output / test</strong> — checkbox <em>"Has class output / test?"</em>. When ticked, a <em>Total points</em> field appears, plus a per-student row: score <code>[  ] / total</code> + a <strong>Proof</strong> upload button (<strong>Replace</strong> once uploaded) + a <span className="tag tag-amber">Pending</span> badge for queued-but-not-yet-uploaded photos + a <strong>View</strong> button. Absent students appear below a divider with an extra <em>makeup date</em> input.</li>
          <li className="task-step"><strong>Tests / Exams</strong> — only after saving. <strong>+ Add test / exam</strong> reveals a mini form: title + total points + <strong>Add</strong> / <strong>Cancel</strong>. Each test card has a per-student score grid with autosave-on-blur, proof upload, and makeup date for absentees.</li>
        </ol>
        <p>Bottom buttons: <strong>Cancel</strong> · <strong>Create lesson</strong> (or <strong>Save changes</strong>).</p>
      </div>

      <h4>Right column top — Projects</h4>
      <p>Card header <em>"Projects · Standalone graded projects with deadlines and per-student proof uploads."</em> + <strong>+ Add Project</strong>. Each project card: title, meta <em>"Total: X pts · Due &lt;date&gt;"</em>, description, buttons <strong>View</strong> / <strong>Edit</strong> / <strong>Delete</strong>.</p>
      <p>Project editor: <em>Title · Total score · Deadline · Description</em>, then a per-student row (name + makeup date + score input + <strong>Proof</strong> upload + <strong>View</strong>). Draft-mode helper reminds you that scores save after you create the project — proof uploads become available immediately after.</p>

      <h4>Right column bottom — Activities</h4>
      <p>Card header <em>"Activities · School events, field trips, IEP reviews, holidays — anything that's not a graded lesson."</em> + <strong>+ Add Activity</strong>. Each card: name + optional type pill, meta <em>date range · N photos</em>, description, 6-photo thumbnail preview with <strong>+N more</strong> if there are more.</p>
      <p>Activity editor: <em>Name · Type</em> (dropdown with the option <em>Other (specify)…</em> that reveals a free-text input), <em>From date · To date · Description</em>. <strong>+ Add photos</strong> supports multiple images and pre-save queuing — queued tiles show a black "Pending" badge until the activity is created and the uploads flush.</p>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 9. MEETINGS
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="meetings">
      <h2 id="meetings">9. Meetings</h2>
      <p>Sidebar → <strong>Meetings</strong>. Video meetings are hosted on <a href="https://meet.sapphireclinicseast.org">meet.sapphireclinicseast.org</a> (our own LiveKit deployment). Anyone with the link joins straight into the room; the in-meeting toolbar offers <em>Cloud Record</em> (server-side, saved to the meet app), <em>Broadcast</em> (host only), and a <em>Whiteboard</em>. Tag students so the meeting shows up on their own class portal.</p>

      <h3>The meetings list</h3>
      <p>Top-right: <strong>+ New meeting</strong> (teacher / admin / branch admin only). Under that, a search input (<em>"Title, teacher, tagged student, or date"</em>) and a <strong>Show cancelled (N)</strong> checkbox (only appears when at least one meeting is cancelled).</p>
      <p>Columns: <em>Title · Scheduled · Teacher · Tagged · Link · (actions)</em>.</p>
      <ul>
        <li><strong>Title</strong> — bold title, notes below, red <em>Cancelled</em> badge when applicable.</li>
        <li><strong>Scheduled</strong> — date on top, time on the second line.</li>
        <li><strong>Teacher</strong> — creator's name.</li>
        <li><strong>Tagged</strong> — either <em>"— everyone with link"</em> or <em>"N student(s)"</em> with a hover-tooltip listing names.</li>
        <li><strong>Link</strong> column has <strong>Open meeting</strong> (target="_blank") plus copy buttons:
          <ul>
            <li><strong>🎥 Copy host link</strong> (sage highlight, staff only) — tooltip <em>"Host link (KEEP PRIVATE): join as moderator — unlocks Broadcast + Cloud Record + Whiteboard controls."</em></li>
            <li><strong>Copy guest link</strong> — tooltip <em>"Guest link — safe to share with students/parents. They can Cloud Record from inside the meeting."</em></li>
          </ul>
        </li>
        <li><strong>(actions)</strong> column — for the meeting's owner + admins:
          <ul>
            <li><strong>Cancel</strong> (soft cancel) — keeps the row, drops the join links, shows the Cancelled badge.</li>
            <li><strong>Delete</strong> (hard delete) — removes the row entirely from history.</li>
          </ul>
          Both actions show detailed confirm dialogs.
        </li>
      </ul>

      <div className="callout callout-note">
        <span className="label">LiveKit tokens can't be recalled</span>
        Once you've shared a join link with someone, cancelling or deleting the meeting doesn't invalidate the signed token — the meet app will keep accepting it until it expires (usually the meeting's end time). To be sure someone can't join, cancel BEFORE sharing, or share the guest link only through the class-portal Meetings page (which re-fetches a fresh, revocable link each time).
      </div>

      <h3>Create meeting modal</h3>
      <p>Header eyebrow: <em>"New meeting · meet.sapphireclinicseast.org"</em>. Title: <em>Schedule a video meeting</em>.</p>
      <ol className="task-steps">
        <li className="task-step"><strong>Title</strong> — placeholder <em>"e.g. Grade 1 Math review"</em>.</li>
        <li className="task-step"><strong>Notes (optional)</strong> — placeholder <em>"Anything students should know before joining"</em>.</li>
        <li className="task-step"><strong>Starts at</strong> — datetime picker, defaults to 5 minutes from now.</li>
        <li className="task-step"><strong>Duration</strong> — 30 min / 45 min / 1 hour / 1½ hours / 2 hours / 3 hours.</li>
        <li className="task-step"><strong>Tag students (optional)</strong> — scrollable checkbox list scoped to your assigned branch × level pairs. Each row shows the student name + right-aligned branch · level. Leave empty and just share the guest link manually.</li>
        <li className="task-step">Click <strong>Create meeting</strong>. Success toast: <em>"Meeting '&lt;title&gt;' created. Share the link with your students or copy it from the row."</em></li>
      </ol>

      <h3>Inside the meeting (cloud recording)</h3>
      <p>Once inside the LiveKit room, the in-meeting toolbar offers:</p>
      <ul>
        <li><strong>Cloud Record</strong> — server-side recording saved to the meet app. Available to everyone, hosts and guests alike. Starts / stops with one click.</li>
        <li><strong>Broadcast</strong> — host-only. Puts a specific participant's video on the main stage for everyone else.</li>
        <li><strong>Whiteboard</strong> — a shared drawing surface (host-controlled).</li>
      </ul>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 10. CALENDAR
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="calendar">
      <h2 id="calendar">10. Calendar</h2>
      <p>Sidebar → <strong>Calendar</strong>. Displays a 7-column month grid. Every event is branch-scoped — branch admins, front desk, and students see only their own branch; main admin and teachers can toggle between East and Greenhills.</p>

      <h3>Month grid</h3>
      <ul>
        <li>7-column week grid, cells 88 px tall.</li>
        <li>Today's date is highlighted with a white-on-narra pill.</li>
        <li>Up to 3 event pills per cell, each colored by type; more show as <em>"+N more"</em>.</li>
        <li>Click any cell to open the <strong>Day view</strong> panel below the grid.</li>
      </ul>

      <h3>Legend</h3>
      <p>Coloured dots under the grid for the five event types: <em>Event · Field trip · Holiday · Classes cancelled · IEP review</em>.</p>

      <h3>Day view panel</h3>
      <p>Header: <em>Day view · &lt;date&gt;</em>. Buttons: <strong>+ Add event</strong> (admin/teacher) and <strong>Close</strong>. Each event card shows title, type label, optional date range (for multi-day), "by &lt;creator&gt;", and (admin/teacher) <strong>Edit</strong> · <strong>Delete</strong>.</p>

      <h3>Add / Edit event modal</h3>
      <p>Header: <em>New event · &lt;branch&gt;</em> or <em>Edit event · &lt;branch&gt;</em>.</p>
      <ol className="task-steps">
        <li className="task-step"><strong>Title</strong> (required).</li>
        <li className="task-step"><strong>Type</strong> — Event · Field trip · Holiday · Classes cancelled · IEP review.</li>
        <li className="task-step"><strong>Date</strong> (date input).</li>
        <li className="task-step"><strong>End date (optional)</strong> — for multi-day events. Must be ≥ start date.</li>
        <li className="task-step"><strong>Description (optional)</strong> — textarea, placeholder <em>"Notes parents should see…"</em>.</li>
        <li className="task-step">Click <strong>Add event</strong> or <strong>Save changes</strong>.</li>
      </ol>

      <h3>Branch toggle</h3>
      <p>Main admin and teachers see a pill segmented control near the top: <strong>East</strong> / <strong>Greenhills</strong>. Other roles have this locked to their branch (server-side).</p>

      <h3>Per-branch calendar PDF</h3>
      <p>Below the calendar, a meta line shows the branch's uploaded PDF (name, upload date, uploader) or "Not uploaded yet." Buttons: <strong>View / download</strong> · <strong>Upload PDF</strong> (or <strong>Replace PDF</strong>) · <strong>Remove</strong> (with confirm). This is the official branch academic calendar handed out at enrollment.</p>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 11. PAYMENTS DEEP DIVE
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="payments">
      <h2 id="payments">11. Payments — deep dive</h2>
      <p>This chapter is the reference for anything payment-related that isn't a plain "click Record payment" workflow.</p>

      <h3>The period-text rule</h3>
      <p>When you record a payment, the system infers what tuition period it covers by parsing the free-text <em>Period covered</em> field. The rules are:</p>
      <ul>
        <li><strong>MONTHLY plan</strong> — the period text must name a specific month (e.g. <code>June 2026</code>, <code>Aug 2026</code>, <code>August 2026</code>). Anything vague (like <code>2026-2027</code> or <code>AY 2026-2027</code>) means the system falls back to the payment's created-at month.</li>
        <li><strong>BI-ANNUAL plan</strong> — the period should read <code>First half SY 2026–2027</code> or <code>Second half SY 2026–2027</code>. If it doesn't, the system uses a timestamp-window fallback: any PAID biannual row whose paidAt / createdAt is inside the current tranche window is credited.</li>
        <li><strong>ANNUAL plan</strong> — the period text doesn't matter. Any PAID annual row on the account counts as the whole SY covered.</li>
      </ul>

      <div className="callout callout-warn">
        <span className="label">The most common bug we see</span>
        A parent hands over cash for June, the front desk types <code>2026-2027</code> or leaves the default <code>AY 2026-2027</code>, and later the student's badge still says <em>Owes for June 2026</em>. Fix: <em>Payments → Confirmed Payments → Edit</em> on that row → change the period to <code>June 2026</code> → Save.
      </div>

      <h3>The period picker</h3>
      <p>The Record and Edit modals both use a plan-aware <em>PeriodPicker</em>:</p>
      <ul>
        <li>MONTHLY → dropdown of the 12 months of the current SY (June … May), auto-formatted "August 2026".</li>
        <li>BIANNUAL → two options: "First half SY 2026–2027" or "Second half SY 2026–2027".</li>
        <li>ANNUAL → "Annual SY 2026–2027".</li>
        <li>All plans also expose an <em>Other</em> option that lets you type a free-text period for one-offs like <code>Back balance · June–September 2026</code>.</li>
      </ul>

      <h3>Late-enrollee back balance</h3>
      <p>The system assumes every monthly / bi-annual student was on the plan for the whole SY. So a student who enrolls in September on the Monthly plan will show a back balance for June, July, and August. Two ways to settle:</p>
      <ol className="task-steps">
        <li className="task-step"><strong>Parent pays the lump sum</strong> — the <code>/pay</code> page auto-detects this and shows a callout like <em>"3-month back balance (June–August) ₱21,450"</em>. They pay it via PayMongo/cash/bank in one shot. When you record it, use a period like <code>Back balance · June–August 2026</code> — the system flags all three months as paid.</li>
        <li className="task-step"><strong>Parent has a waiver</strong> — record a zero-amount payment for the month with the period naming that month and notes explaining the waiver. This clears the badge and leaves an audit trail.</li>
      </ol>

      <h3>Plan switches (monthly → bi-annual, etc.)</h3>
      <p>When a parent asks to switch plans mid-year, use the <strong>Plan-switch balance calculator</strong> card on the student's profile (main-admin only).</p>
      <ol className="task-steps">
        <li className="task-step">Open the student's profile → scroll to <strong>Plan change · Switch payment plan</strong>.</li>
        <li className="task-step">Pick the target plan. The card recalculates live: target-plan tuition, less any personal voucher, plus misc, gross on new plan, less already paid, = <strong>Balance to collect</strong>.</li>
        <li className="task-step">Take that number to <em>Payments → + Record payment</em>. Pick the target plan, enter the balance, use a clear period (e.g. <em>First half SY 2026–2027 (plan change credit)</em>).</li>
        <li className="task-step">Confirm the row. The student's inferred plan flips to the new one and every future badge, reminder, and Pending-by-deadline entry uses the new logic.</li>
      </ol>

      <Illustration caption="Plan change card — appears on every student profile for admin viewers.">
        <div className="mk-card">
          <div className="mk-label">Plan change</div>
          <div className="mk-title" style={{ marginBottom: 2 }}>Switch payment plan</div>
          <div style={{ fontSize: 11, color: 'var(--mid-gray)', marginBottom: 10 }}>Current plan: <span style={{ fontWeight: 600, color: 'var(--deep-teal)' }}>Monthly</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11.5, color: 'var(--mid-gray)' }}>
            <span>Switch to</span>
            <span className="mk-pill" style={{ background: 'var(--sage-tint)', color: 'var(--deep-teal)', fontWeight: 600 }}>Bi-annual</span>
            <span>·</span>
            <span>☑ Apply 30% voucher (AURA30-BRUCE-A4K7Q9)</span>
          </div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '4px 0', color: 'var(--mid-gray)' }}>Bi-annual tuition</td><td style={{ padding: '4px 0', textAlign: 'right' }}>₱45,000.00</td></tr>
              <tr><td style={{ padding: '4px 0', color: 'var(--mid-gray)' }}>Less 30% voucher</td><td style={{ padding: '4px 0', textAlign: 'right', color: '#059669' }}>−₱13,500.00</td></tr>
              <tr><td style={{ padding: '4px 0', color: 'var(--mid-gray)' }}>+ Misc fee</td><td style={{ padding: '4px 0', textAlign: 'right' }}>+₱2,500.00</td></tr>
              <tr style={{ background: 'var(--paper-2)' }}><td style={{ padding: '4px 6px', fontWeight: 600 }}>Gross on new plan</td><td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>₱34,000.00</td></tr>
              <tr><td style={{ padding: '4px 0', color: 'var(--mid-gray)' }}>Less already paid</td><td style={{ padding: '4px 0', textAlign: 'right', color: '#059669' }}>−₱7,150.00</td></tr>
              <tr style={{ background: '#f0fdf4' }}><td style={{ padding: '6px', fontWeight: 700, color: 'var(--deep-teal)' }}>Balance to collect</td><td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, color: 'var(--deep-teal)', fontSize: 14 }}>₱26,850.00</td></tr>
            </tbody>
          </table>
        </div>
      </Illustration>

      <h3>Automated reminder cadence</h3>
      <p>A daily cron at ~9 AM Manila time walks every active monthly / bi-annual student. Up to three reminder emails go out per period:</p>
      <ul>
        <li><strong>5-day heads-up</strong> — when the payment window opens (30th of prior month for monthly, May 5 / Nov 5 for bi-annual).</li>
        <li><strong>Due tomorrow</strong> — the day before the 5th of the due month.</li>
        <li><strong>Past due</strong> — the day after the 5th if still unpaid.</li>
      </ul>
      <p>Every send is logged in <em>Payments → Automated payment reminders</em>. Disabled students are skipped by the cron and hidden from active listings.</p>

      <h3>Manual reminder — the 🔔 button</h3>
      <p>For overdue rows in the <em>Pending payments — by deadline</em> table, click <strong>🔔 Remind</strong> to fire an ad-hoc reminder email right now. The button shows <em>Sending…</em> → <em>✓ Sent</em> and the send is logged as <em>Manual reminder</em> in the notifications panel below.</p>

      <h3>Payment methods</h3>
      <p>Three top-level methods appear across every payment surface:</p>
      <ul>
        <li><strong>Frontdesk payment</strong> — has five sub-options: Cash · Credit Card · Debit Card · GCash · PayMaya. Creates a PENDING row that must be confirmed.</li>
        <li><strong>Bank deposit</strong> — parent uploads a slip, front desk verifies against the BDO account and confirms.</li>
        <li><strong>PayMongo</strong> — when the parent finishes a real PayMongo checkout via <code>/pay</code>, the webhook auto-flips PENDING → CONVERTED. When staff records a PayMongo payment via <strong>+ Record payment</strong>, it's a bookkeeping entry that must still be confirmed manually.</li>
      </ul>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 12. DOCUMENTS, WAIVER, LETTER, FEE SCHEDULE
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="documents">
      <h2 id="documents">12. Documents, waiver, registration letter, fee schedule</h2>
      <p>Every student's <em>Submitted documents</em> and <em>Other Documents</em> cards live inside the student detail drawer (see <a href="#main-admin">chapter 3 → Tab 2</a>). This chapter focuses on the specialised documents.</p>

      <h3>Waiver flow</h3>
      <ol className="task-steps">
        <li className="task-step"><strong>Parent signs</strong> — via <code>/waiver</code>. Fills in 8 sections (student, guardian, fetchers, emergency + medical, initials for 15 acknowledgments, photo-release radio, signatures), clicks <strong>Sign &amp; generate waiver PDF</strong>. The PDF downloads automatically.</li>
        <li className="task-step"><strong>Teacher countersigns as witness</strong> — on the student's detail drawer, the assigned SPED teacher clicks <strong>Sign as witness</strong>, draws her signature, saves.</li>
        <li className="task-step"><strong>Main admin countersigns for SCEI</strong> — on the same drawer, main admin clicks <strong>Sign as SCEI</strong>, fills in printed name + signature, clicks <strong>Sign &amp; regenerate PDF</strong>. The header badge flips to <span className="tag tag-sage">SCEI countersigned</span>.</li>
      </ol>

      <h3>Registration Letter (main-admin only)</h3>
      <p>Auto-generated PDF for DepEd / school-transfer requests. Signed by HANNAH JARA (CEO). On the student's profile:</p>
      <ol className="task-steps">
        <li className="task-step">Open the <strong>School Registration Letter</strong> sub-card in Other Documents.</li>
        <li className="task-step">Type a <em>Purpose</em> — the field is staff-editable, default is <code>reimbursement purposes</code>. The live preview updates the certification line: <em>"…issued upon the request of the parent / guardian for &lt;purpose&gt; only and not for any other intent."</em></li>
        <li className="task-step">Tick <strong>Student availed of the 30% Early Bird Discount</strong> if applicable — the tuition breakdown will show base → less 30% → net.</li>
        <li className="task-step">Click <strong>View</strong> to preview in a new tab, or <strong>Download PDF</strong> to save. Each press mints a fresh <code>AURA-REG-YYYY-NNNN</code> reference number and the sub-card's footer shows <em>"Last issued: AURA-REG-… on &lt;date&gt;"</em>.</li>
      </ol>
      <div className="callout callout-note">
        <span className="label">Precondition</span>
        Both PDFs require the student to have at least one payment record for the current SY. Without it, the card shows "No payment records yet…" and the buttons are disabled.
      </div>

      <h3>Schedule of Fees (main-admin only)</h3>
      <p>Annual breakdown (tuition + ₱5,000 misc) plus the three payment plan options with each tranche pre-computed. Same buttons: <strong>View</strong> · <strong>Download PDF</strong>. No purpose field, no reference number.</p>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 13. ANNOUNCEMENTS
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="announcements">
      <h2 id="announcements">13. Announcements</h2>
      <p>The Notifications tab (main admin, branch admin) or its per-class equivalent (teachers). Reach: everyone in the target grade levels; optionally teachers too.</p>

      <h3>Compose</h3>
      <ol className="task-steps">
        <li className="task-step">Click <strong>New announcement</strong>.</li>
        <li className="task-step">Type a <strong>Title</strong>.</li>
        <li className="task-step">Type the body in <strong>Details</strong>.</li>
        <li className="task-step">Optionally attach a poster image or PDF: <strong>+ Add poster or PDF</strong>. The preview appears below.</li>
        <li className="task-step">Pick target <strong>Grade levels</strong> (leave empty = school-wide).</li>
        <li className="task-step">(Main admin) Tick <strong>Also notify teachers</strong>.</li>
        <li className="task-step">Click <strong>Publish</strong>.</li>
      </ol>

      <h3>View + email</h3>
      <p>Click any announcement in the list to open the modal. Buttons in the modal:</p>
      <ul>
        <li><strong>Send Email</strong> — main admin + teacher only. Confirm dialog notes if already emailed (and when). Success toast shows the per-role / per-level breakdown of who got emailed.</li>
        <li><strong>Send email again</strong> — same button label after the first send. Idempotent to a point but every send is logged.</li>
        <li><strong>Delete announcement</strong> — main admin can delete anything; teachers can delete only what they authored.</li>
      </ul>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 14. VOUCHERS
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="vouchers">
      <h2 id="vouchers">14. Vouchers — shared codes vs personal early-bird</h2>

      <h3>Shared codes (main-admin only)</h3>
      <p><em>Admin → Fees → Voucher codes</em>. Add a code like <code>AURA30</code>, set a discount %, an expiry date, and an <strong>Active</strong> checkbox. Untick Active to pause a code without deleting it — the audit trail is worth keeping.</p>

      <h3>Personal early-bird vouchers</h3>
      <p>The public AURA30 code expired mid-year, but monthly / bi-annual parents who availed of the early bird still need to keep discounting their remaining installments. Personal vouchers solve that. Main admin, branch admin, and front desk can all issue them.</p>
      <ol className="task-steps">
        <li className="task-step">Open the student's profile.</li>
        <li className="task-step">Scroll to <strong>Personal Vouchers</strong> in the Other Documents grid.</li>
        <li className="task-step">Click <strong>+ Issue AURA30 early-bird voucher</strong>. A unique code (format <code>AURA30-FIRSTNAME-6RAND</code>) is minted, locked to that one student, valid through May 31.</li>
        <li className="task-step">The code auto-applies on the student's <code>/pay</code> page. Parents don't need to type it. You can also share it verbally.</li>
      </ol>

      <h3>Reviewing all issued vouchers</h3>
      <p>Main admin: <em>Admin → Fees → scroll to Personal early-bird vouchers</em>. Every code across the school is listed: <em>Student · Branch · Code · Discount · Valid until · Status · Issued by</em>.</p>

      <Illustration caption="Personal vouchers card on the student profile — admin sees an Issue button; students see only their own live codes.">
        <div className="mk-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div>
              <div className="mk-label">Personal vouchers</div>
              <div className="mk-title" style={{ marginBottom: 2 }}>Early-bird continuity codes</div>
              <div style={{ fontSize: 11, color: 'var(--mid-gray)' }}>Locked to this student only. Auto-applied on /pay.</div>
            </div>
            <span className="mk-btn-secondary mk-btn" style={{ background: '#fff', border: '1px solid var(--paper-3)', color: 'var(--narra)' }}>+ Issue AURA30 early-bird voucher</span>
          </div>
          <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'var(--sage-tint)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: 'var(--deep-teal)' }}>AURA30-BRUCE-A4K7Q9</div>
              <div style={{ fontSize: 11, color: 'var(--mid-gray)', marginTop: 2 }}>30% off tuition · valid through May 31, 2027 · issued by main@</div>
            </div>
            <span className="tag tag-sage">Active</span>
          </div>
        </div>
      </Illustration>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 15. ENROLLMENT FUNNEL
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="enrollment">
      <h2 id="enrollment">15. Enrollment funnel — what a new parent sees</h2>
      <p>Whenever you're helping a new parent onboard, or troubleshooting a stuck registration, walk them through these steps:</p>
      <ol className="task-steps">
        <li className="task-step"><strong>Step 1 — Landing (<code>/</code>)</strong>. The parent picks a branch tile (East / Greenhills) and a grade level. Tiles for closed grades are disabled with a tooltip <em>"&lt;level&gt; is closed for new enrollment"</em>. Click <strong>Create profile &amp; continue</strong>.</li>
        <li className="task-step"><strong>Step 2 — Learner profile (<code>/enroll</code>)</strong>. Long single-page form with 6 sections: School year &amp; LRN · Student info · Address · Parent/Guardian info · Returning/transferee · Certification. All text auto-uppercases as they type. Click <strong>Continue to documents →</strong>.</li>
        <li className="task-step"><strong>Step 3 — Documents (<code>/documents</code>)</strong>. Upload PSA Birth Cert, 1×1 Photo, Parent ID, PWD ID (if applicable), and (for graded levels) Report Card + Good Moral. Also opens the waiver popup for the parent to sign. Each row has <strong>Upload</strong> (or <strong>Change</strong>) plus a <strong>QR upload</strong> button that generates a per-device QR code — the parent scans it on their phone, uploads there, and the file appears on the desktop within seconds.</li>
        <li className="task-step"><strong>Step 4 — Account setup (<code>/account-setup</code>)</strong>. Parent sets a password. Then a "Pay tuition fee →" / "Go to my profile" choice.</li>
        <li className="task-step"><strong>Step 5 — Pay (<code>/pay</code>)</strong>. Fee schedule + tuition-obligation policy + plan picker + voucher + method (PayMongo / cash / bank).</li>
      </ol>

      <div className="callout">
        <span className="label">QR upload details</span>
        The parent's phone scans the QR, opens the public <code>/upload/&lt;token&gt;</code> page, takes a photo or picks a PDF, and uploads. The desktop polls and shows a live status — <em>Waiting for upload… (link expires in 30 minutes)</em> → <em>Receiving file from your phone…</em> → <em>✓ Got it. Closing…</em>
      </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 16. ADMISSION TRACKER
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="admission">
      <h2 id="admission">16. Admission tracker</h2>
      <p><code>class.sapphireclinicseast.org/admission</code>. Not sign-in gated — uses a partner-school access code stored in the browser's localStorage. This is the view LBCA (Light Bearer Christian Academy — our DepEd partner school) uses to see the enrollment roster.</p>

      <h3>Access-code gate</h3>
      <p>First visit shows a password-type input <em>"Enter code"</em>. The partner types the shared access code and clicks <strong>View admission list</strong>. Once accepted, the code is remembered on that browser.</p>

      <h3>Toolbar</h3>
      <p>Search input (name / email / LRN), grade-level filter dropdown, <strong>Clear</strong>, <strong>Refresh</strong>, <strong>Excel</strong> export, <strong>Sign out</strong>.</p>

      <h3>Branch tabs</h3>
      <p><strong>East Branch (N)</strong> / <strong>Greenhills Branch (N)</strong>. Only PAID students appear; disabled accounts are hidden. Every row is a full DepEd enrollment record with inline editors:</p>
      <ul>
        <li><strong>LRN</strong> — for NO_LRN rows, an inline 12-digit input that validates on blur.</li>
        <li><strong>LSEN classification</strong> — grouped select using the DepEd rubric.</li>
        <li><strong>LIS status</strong> — inline select.</li>
        <li><strong>Remittance</strong> — inline select.</li>
        <li><strong>Comments / Remarks</strong> — inline text.</li>
      </ul>

      <p>Documents columns (yellow-tinted): <em>Enrollment Form · Parent Waiver · DepEd Affidavit · Report Card / SF9 · PSA Birth Cert · Form 137 / SF10</em> — each with <strong>View</strong> + <strong>↓</strong> download when the server has the blob.</p>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 17. INTERN ACCOUNTS
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="interns">
      <h2 id="interns">17. Intern accounts — auto-disable lifecycle</h2>
      <p>SPED teacher interns get the same class-portal permissions as regular teachers — they can create classes, log lessons, run meetings, sign waivers as witness. What's different is they auto-disable 15 days after the end of their internship-end month.</p>

      <h3>Creating an intern account</h3>
      <ol className="task-steps">
        <li className="task-step">First: make sure HR has created their staff record in HR Hub with employment type = <em>Intern</em> and a contract-end date filled in.</li>
        <li className="task-step">In the class portal: <em>Admin → Users → Add teacher from Staff Module</em>.</li>
        <li className="task-step">Filter by branch, find their row. The Role cell shows a <span className="tag tag-amber">Intern</span> badge. The Contract end column shows their contract-end date with a hover-tooltip: <em>"Auto-disables &lt;date&gt;"</em>.</li>
        <li className="task-step">Click <strong>Create account</strong>. Type or generate a password. Click <strong>Save</strong>. Success toast: <em>"Intern teacher account created for &lt;name&gt; (&lt;branch&gt;). Auto-disables &lt;date&gt;. Password: &lt;pw&gt;"</em>.</li>
      </ol>

      <div className="callout">
        <span className="label">Auto-disable math</span>
        <strong>Auto-disable date</strong> = first day of the month AFTER the contract-end month, PLUS 15 days.
        For example: contract ends <em>August 31, 2026</em> → auto-disable on <em>September 15, 2026</em> at 00:00 Manila time.
      </div>

      <h3>What the cron does</h3>
      <p>A daily cron endpoint (<code>/api/public/class-portal/cron/intern-lifecycle</code>) runs and:</p>
      <ul>
        <li>Selects every intern (isIntern=true, role=TEACHER, linkedStaffId present).</li>
        <li>Skips already-disabled accounts (idempotent — safe to run multiple times a day).</li>
        <li>Skips interns without a contract end on file (with a warning counter).</li>
        <li>Disables interns whose contract-end month + 15-day grace has passed. Stamps <code>disabledAt = now</code> and <code>disabledBy = "cron:intern-lifecycle"</code>.</li>
        <li>Also disables interns whose HR record was set to inactive early (early termination).</li>
      </ul>
      <p>The admin UI signal after the cron flips someone: the amber <span className="tag tag-amber">Intern</span> badge stays, plus a rose <span className="tag tag-rose">Disabled</span> badge with hover-tooltip <em>"Cannot sign in. Hidden from teacher and front-desk lists."</em> The row's overall hover tooltip says <em>"Disabled by cron:intern-lifecycle on &lt;date&gt;"</em>.</p>

      <h3>Re-enabling</h3>
      <p>If HR extends the intern's contract:</p>
      <ol className="task-steps">
        <li className="task-step">HR updates the contract-end date in HR Hub.</li>
        <li className="task-step">Main admin: <em>Admin → Users → find the row → Enable</em>. The intern can sign in again. The new contract-end date is respected — next cron pass won't touch them until the new end + 15.</li>
      </ol>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 18. CROSS-HUB CONNECTIONS
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="hubs">
      <h2 id="hubs">18. Connections to the other hubs</h2>

      <p>The class portal doesn&rsquo;t stand alone — three sister apps handle the moving parts around it. Sign in to each with the credentials the main admin issues (same person, three tabs).</p>

      <table className="matrix">
        <thead>
          <tr>
            <th>Hub</th>
            <th>URL</th>
            <th>What it owns</th>
            <th>Where the class portal touches it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Operations Hub</strong></td>
            <td><code>operations.sapphireclinicseast.org</code></td>
            <td>The class portal&rsquo;s actual database + server. Every user, student, payment, voucher, reminder, and uploaded file is stored here — the class portal is a browser client of this hub&rsquo;s <code>/api/public/class-portal/*</code> endpoints.</td>
            <td>Every screen you see. Sign-in, payment confirmation, PayMongo webhooks, the reminder cron — they all round-trip through Operations Hub.</td>
          </tr>
          <tr>
            <td><strong>Accounting Hub</strong></td>
            <td><code>accounting.sapphireclinicseast.org</code></td>
            <td>Books of account, POS, GL, inventory, payroll ledger. Runs on its own database and its own container (<code>accounting_app</code>) so a class-portal issue never touches the financials.</td>
            <td>Confirmed tuition payments become POS Orders here — that&rsquo;s how the cash lands on the P&amp;L. PayMongo fees, MDR, and payouts also reconcile through the Accounting Hub&rsquo;s bank register.</td>
          </tr>
          <tr>
            <td><strong>HR Hub</strong></td>
            <td><code>hr.sapphireclinicseast.org</code></td>
            <td>Staff directory, payroll cutoffs, uniforms, seminars, peer evaluations, forms library, shareholder registry. Vanilla HTML/JS app, separate from the Next.js hubs above.</td>
            <td>Teachers and front-desk staff exist in HR Hub as employees; in the class portal they exist as users. The Staff Module card on Users tab pulls the active list, but hiring/leaving still needs a mirror update in HR.</td>
          </tr>
        </tbody>
      </table>

      <Illustration caption="Architecture at a glance — class portal is a client of Operations Hub, which hands off finalised payments to Accounting Hub. HR Hub is parallel.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'var(--sage-tint)', border: '1px solid var(--sage)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--sage)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Frontend</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--deep-teal)' }}>Class Portal</div>
              <div style={{ fontSize: 10, color: 'var(--mid-gray)' }}>class.sapphireclinicseast.org</div>
            </div>
            <div style={{ background: '#f3e8ff', border: '1px solid #9333ea', borderRadius: 10, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#6b21a8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Parallel app</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6b21a8' }}>HR Hub</div>
              <div style={{ fontSize: 10, color: 'var(--mid-gray)' }}>hr.sapphireclinicseast.org</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', color: 'var(--mid-gray)', fontSize: 18, lineHeight: 1 }}>
            ↓ <span style={{ fontSize: 11, verticalAlign: 'middle' }}>API calls &nbsp;/api/public/class-portal/*</span>
          </div>
          <div style={{ background: '#dbeafe', border: '1px solid #1e40af', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#1e3a8a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Backend + database</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e3a8a' }}>Operations Hub</div>
            <div style={{ fontSize: 10, color: 'var(--mid-gray)' }}>operations.sapphireclinicseast.org &nbsp;·&nbsp; owns ClassPortalUser, ClassPortalFrontDeskPayment, ClassPortalVoucher, ClassPortalPaymentReminderLog, ClassPortalMeeting</div>
          </div>
          <div style={{ textAlign: 'center', color: 'var(--mid-gray)', fontSize: 18, lineHeight: 1 }}>
            ↓ <span style={{ fontSize: 11, verticalAlign: 'middle' }}>Confirmed payment → POS Order</span>
          </div>
          <div style={{ background: '#dcfce7', border: '1px solid #166534', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Books + POS</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>Accounting Hub</div>
            <div style={{ fontSize: 10, color: 'var(--mid-gray)' }}>accounting.sapphireclinicseast.org &nbsp;·&nbsp; own DB &amp; container (accounting_app)</div>
          </div>
        </div>
      </Illustration>

      <h3>Data that flows between the class portal and each hub</h3>

      <div className="role-card">
        <h4>↔ Operations Hub</h4>
        <p>Same app family, same database. Everything the class portal reads or writes goes through Operations Hub&rsquo;s API. The class portal container (<code>sapphire_class_portal</code>) is a UI shell; the Operations Hub container (<code>sapphire_app</code>) is the source of truth.</p>
        <ul>
          <li><strong>Sign-in tokens</strong> — issued by Operations Hub; carried by every request from the class portal.</li>
          <li><strong>Payment records</strong> — created by the class portal (record, PayMongo, or self-serve) and stored in Operations Hub&rsquo;s <code>ClassPortalFrontDeskPayment</code> table. Confirmed payments trigger the accounting hand-off.</li>
          <li><strong>Reminder cron</strong> — runs on the Operations Hub container. Reads the same payment table, writes to <code>ClassPortalPaymentReminderLog</code>, and sends emails via Resend.</li>
          <li><strong>File uploads</strong> — headshots, waiver PDFs, Form 137 / SF10, birth certificates, meeting cover photos — all stored in Operations Hub&rsquo;s file storage.</li>
          <li><strong>LiveKit meeting rooms</strong> — <code>ClassPortalMeeting</code> rows carry the room id + host/guest signed URLs.</li>
        </ul>
      </div>

      <div className="role-card">
        <h4>→ Accounting Hub (one-way, on payment confirm)</h4>
        <p>When the front desk clicks <strong>Confirm payment</strong> in the class portal, Operations Hub does two things:</p>
        <ol className="task-steps">
          <li className="task-step">Flips the class-portal payment status from PENDING → CONVERTED.</li>
          <li className="task-step">Creates a corresponding <em>Order</em> in the Accounting Hub POS with the tuition amount, misc amount, and the payment method. That order lands on the accounting P&amp;L for the day.</li>
        </ol>
        <p>You never need to open the Accounting Hub for a routine class-portal payment — the hand-off is automatic. Two situations where you <em>do</em> touch Accounting Hub:</p>
        <ul>
          <li><strong>To reverse a payment</strong> — deleting a Confirmed Payment in the class portal does <em>not</em> void the accounting Order. If you&rsquo;re actually reversing (not just cleaning a test row), open Accounting Hub → POS → find the order → void it there too.</li>
          <li><strong>To reconcile PayMongo payouts</strong> — PayMongo pays out net of fees to the school&rsquo;s BDO account. Accounting Hub&rsquo;s bank reconciliation matches each payout against the class-portal order + a Merchant Discount Rate expense.</li>
        </ul>
      </div>

      <div className="role-card">
        <h4>↔ HR Hub (manual + Staff Module mirror)</h4>
        <p>HR Hub tracks the staff person &mdash; contract, payroll, uniform, seminars, peer evals. The class portal tracks the same person as a <em>user account</em> with a role and a branch. The class portal's <em>Add teacher from Staff Module</em> card reads active teachers + interns from HR Hub, but nothing auto-syncs the other way.</p>
        <ul>
          <li><strong>Hiring a new SPED teacher / intern</strong> — create the HR record first (contract, tax, SSS), then create the class-portal user via <em>Users → Add teacher from Staff Module</em>.</li>
          <li><strong>Teacher resigns</strong> — set their HR status to <em>Separated</em> in HR Hub, then <em>Disable</em> their class-portal user (Users tab → edit).</li>
          <li><strong>Intern contract extended</strong> — update the HR contract end date, then <em>Enable</em> the class-portal user if the cron already disabled them.</li>
          <li><strong>Uniform / seminar admin</strong> — stays entirely in HR Hub. The class portal doesn&rsquo;t know about those.</li>
        </ul>
      </div>

      <div className="callout callout-note">
        <span className="label">Why three separate hubs?</span>
        Each hub has its own database and its own deploy pipeline, so an outage in one doesn&rsquo;t take down the others. Class-portal downtime doesn&rsquo;t stop payroll; an Accounting Hub deploy doesn&rsquo;t block parents from paying tuition. The trade-off is that a person&rsquo;s data lives in multiple places — hence the manual sync notes above.
      </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
       * 19. HELP & FAQ
       * ────────────────────────────────────────────────────────── */}
      <section className="handbook-section" data-slug="help">
      <h2 id="help">19. Help &amp; FAQ</h2>
      <p>Use the search bar at the top of this page to jump to any keyword. Below, the most common questions we get about the class portal — payment quirks, sign-in gotchas, and cross-hub gotchas.</p>

      <h3>Sign-in and access</h3>

      <Faq q="I get 'Missing bearer token.' or 'Session expired' when I click a button.">
        <p>Your device's saved sign-in token was cleared behind the scenes (usually a second tab signed out, or an earlier request expired the session). The pages will auto-redirect you to sign-in as of the 2026-09 fix, but if you're stuck:</p>
        <ol>
          <li>Click <strong>Sign out</strong> at the bottom of the sidebar.</li>
          <li>Sign back in with your usual credentials.</li>
          <li>The action you tried before will now work.</li>
        </ol>
        <p>If it keeps happening, open DevTools → Application → Local Storage → <code>class.sapphireclinicseast.org</code>, delete both <code>scei_class_token_v1</code> and <code>scei_class_auth_v1</code>, then sign in fresh.</p>
      </Faq>

      <Faq q="A teacher says she can't create a class — 'Could not save. Retry?' or a red banner appears.">
        <p>As of 2026-09, the red banner now shows the actual server error instead of a generic message. Read the wording — it tells you exactly what to fix:</p>
        <ul>
          <li><em>"Missing bearer token."</em> — session desync. Sign out + back in (see above).</li>
          <li><em>"Only teachers and admins can create classes."</em> — the user's role isn't TEACHER. Have main admin check their role in Users → Edit.</li>
          <li><em>"branch, level, and name are required."</em> — one of the dropdowns didn't submit a value. Refresh the page and retry.</li>
          <li><em>"Out of branch scope."</em> — branch admin trying to create a class in a branch that isn't theirs.</li>
          <li><em>"Server error."</em> with details — capture a screenshot of the browser console (Cmd/Ctrl + Option/Shift + J) and send it to the code maintainer.</li>
        </ul>
      </Faq>

      <Faq q="A branch admin says they can't create a main admin account.">
        <p>By design. Only the current main admin (<code>main@sapphireclinicseast.org</code>) can mint another main admin. Ask them to do it from Users → Create staff account.</p>
      </Faq>

      <h3>Payments</h3>

      <Faq q="A parent paid via PayMongo but the portal still says Due / their badge is red.">
        <p>Two possible causes:</p>
        <ol>
          <li><strong>Front desk recorded the payment as PayMongo but forgot to click Confirm payment.</strong> When staff use <em>+ Record payment → PayMongo</em>, that's a bookkeeping entry for money already collected elsewhere — it creates a PENDING row, and you still have to click <strong>Confirm payment</strong> before the student's badge flips.
            <br /><em>Fix:</em> Admin → Payments → Pending confirmations → find the row → click <strong>Confirm payment</strong>. The badge lights up on next refresh.</li>
          <li><strong>The real PayMongo webhook didn't fire.</strong> If the parent completed a real checkout via <code>/pay</code>, the webhook should auto-confirm. If it didn't, check that PayMongo has the correct webhook URL for the branch, then manually confirm the row as above.</li>
        </ol>
      </Faq>

      <Faq q="A payment badge says the student is Due for August 2026 but they paid in August.">
        <p>Almost always a period-text problem. Open <em>Payments → Confirmed Payments</em>, find the row, click <strong>Edit</strong>, and check the period text. If it says <code>2026-2027</code>, <code>AY 2026-2027</code>, or anything else that doesn't name a specific month, the badge logic can't attribute it. Change the period to <code>August 2026</code> (or whichever month the payment actually covered) and save.</p>
      </Faq>

      <Faq q="A student's badge shows 'Owes for June 2026' but they only enrolled in July.">
        <p>The system assumes every monthly student was on the plan for the whole SY. For a July enrollee, June looks unpaid. Two fixes:</p>
        <ul>
          <li>If the parent still owes June (late enrollment) — collect the back balance. On <code>/pay</code> they'll see a callout with the lump-sum amount.</li>
          <li>If the parent has a signed agreement waiving June — record a zero-amount payment for June with the period <code>June 2026</code> and a note explaining the waiver. That clears the badge and leaves an audit trail.</li>
        </ul>
      </Faq>

      <Faq q="How do I reverse a confirmed payment?">
        <p>Deleting the row in the class portal does NOT void the corresponding accounting Order. If you're actually reversing (not just cleaning a test row):</p>
        <ol>
          <li>Delete the row in <em>Class portal → Payments → Confirmed Payments</em> (main admin only).</li>
          <li>Open <em>Accounting Hub → POS</em>, find the same Order, and void it there too.</li>
        </ol>
        <p>The classPortalPaymentId in the Edit Payment modal is the cross-reference you use to find the matching accounting Order.</p>
      </Faq>

      <Faq q="How do I switch a student from Monthly to Bi-annual (or any other combo) mid-year?">
        <p>Use the <strong>Plan-switch balance calculator</strong> on the student's profile (main admin only). See <a href="#payments">chapter 11 → Plan switches</a> for the full walkthrough.</p>
      </Faq>

      <h3>Waivers &amp; documents</h3>

      <Faq q="A teacher signed the waiver as witness but the admin view still shows it as unsigned.">
        <p>Fixed as of 2026-08 — waiver signatures now sync across devices. If it's still stuck for one specific student, ask the teacher to open that student's profile once from any device they're signed in on. The auto-sync will push the stranded signature to the server. If a device has been fully cleared (browser data wiped), the teacher will need to re-sign.</p>
      </Faq>

      <Faq q="Where does the registration letter's Purpose text come from?">
        <p>Staff-editable. Open the student's profile → School Registration Letter sub-card → type your purpose in the field, then click View or Download PDF. The default is <code>reimbursement purposes</code>. See <a href="#documents">chapter 12</a>.</p>
      </Faq>

      <Faq q="The registration letter or fee schedule PDF won't generate — button is disabled.">
        <p>Both PDFs require at least one payment record for the student in the current SY. If the student has no payments yet, record one first (even a small one), then generate.</p>
      </Faq>

      <h3>Meetings</h3>

      <Faq q="I cancelled a meeting but people can still join.">
        <p>LiveKit signed tokens can't be recalled. Once the guest link is shared, the meet app will keep accepting it until the meeting's scheduled end time. To be safe, cancel BEFORE you share, or only share the guest link through the Meetings page itself (which fetches a fresh, revocable link each time).</p>
      </Faq>

      <Faq q="Where's my recording?">
        <p>Cloud recordings are stored on the meet app (meet.sapphireclinicseast.org). They don't currently appear inside the class portal's meeting row — check the meet app for playback and download. This is a planned follow-up.</p>
      </Faq>

      <Faq q="A student says they don't see the meeting on their portal.">
        <p>Check the meeting's <em>Tagged</em> column. If it shows <em>"— everyone with link"</em>, the meeting isn't tagged to any specific student, so it won't appear on any student's portal (only via the shared link). If you want it to appear, edit the meeting and tick their name in the Tag students list.</p>
      </Faq>

      <h3>Interns</h3>

      <Faq q="An intern got auto-disabled but their contract was extended.">
        <ol>
          <li>Ask HR to update the contract-end date in HR Hub.</li>
          <li>Main admin: Users → find the intern's row → click <strong>Enable</strong>. They can sign in again.</li>
          <li>The intern-lifecycle cron respects the new contract-end date — it won't touch them until the new end + 15 days.</li>
        </ol>
      </Faq>

      <Faq q="Why don't I see the Intern badge on my Users list?">
        <p>The badge only appears for accounts that were created via the "Add teacher from Staff Module" card AND had employment type = Intern in HR at the time of creation. If an intern was created via the plain "Create staff account" form, they won't be flagged. Ask HR to fix the employment type in HR Hub, then delete + re-create the class-portal account from Add teacher from Staff Module.</p>
      </Faq>

      <h3>Front desk</h3>

      <Faq q="Front desk says they can't see a student they know is enrolled.">
        <p>Front desk is branch-scoped. If the student is enrolled at the OTHER branch, front desk at their branch won't see them. Confirm the student's Branch in the admin's Users tab.</p>
      </Faq>

      <Faq q="Why can't front desk see the Handbook link in their sidebar?">
        <p>The handbook is main-admin only — it's not shown to any other role. If front desk needs to reference something, they can ask the main admin to share the PDF export (top-right of this page → <strong>Download PDF</strong>).</p>
      </Faq>

      <h3>Deploy &amp; caching</h3>

      <Faq q="I don't see a change I know was deployed.">
        <p>Your browser cached the old JS bundle. Hard-refresh: <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> on Mac, <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> on Windows / Linux. On iOS Safari, close the tab and re-open it. If it still doesn't work after a hard-refresh, the deploy actually hasn't landed yet — give it another 5 minutes.</p>
      </Faq>

      <Faq q="Where do I find the class portal's server logs?">
        <p>You don't — logs live on the VPS. If something looks like a bug (a button that never saves, a payment that vanished), take a screenshot with the browser's dev-tools console open (Cmd/Ctrl + Option/Shift + J) and hand it to the person maintaining the code. Screenshots with the console errors visible are worth ten written descriptions.</p>
      </Faq>

      <hr style={{ border: 'none', borderTop: '1px solid var(--paper-3)', margin: '3rem 0 1rem' }} />
      <p style={{ fontSize: 12, color: 'var(--mid-gray)', textAlign: 'center' }}>
        Aura Academy for Learning · Sapphire Clinics East, Inc.<br />
        Handbook version 4 — step-by-step guide + FAQ + search. Reflects portal features as of the current deploy. Illustrations are stylised recreations of the real screens, not live captures.
      </p>
      </section>
      </div>
    </div>
  )
}
