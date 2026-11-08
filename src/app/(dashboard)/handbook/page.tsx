'use client'

import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, Search, X } from 'lucide-react'

// The handbook document lives in its own file — it is long, and mixing a
// thousand lines of HTML into the component made both hard to read.
import { HANDBOOK_HTML } from './handbook-content'
import { CARD_STYLE, Skeleton } from '../patients/dashboard/ui'
import { HANDBOOK_SKIN_CSS } from './handbook-skin'

// Who may read the handbook. Kept as a set so adding a role is one edit.
const HANDBOOK_ROLES = new Set(['ADMIN', 'MEDREP'])

// Save as PDF, Download as Word and the word search still live in the
// document's own masthead, the same way the HR portal handbook carries them,
// so they are not repeated out here.
//
// What the page adds is display only, all derived from the rendered document
// after it loads: a contents rail built from its headings (with scrollspy), a
// filter that narrows the document to matching cards and highlights the words,
// a reading-progress bar and "back to top". The document text is never edited;
// the screen-only skin (./handbook-skin) is injected into the <head> of the
// framed copy, so print and the Word export keep their own styling.

type TocItem = {
  id: string
  label: string
  /** Full heading text, for the tooltip when the label is shortened. */
  full: string
  level: 1 | 2 | 3
  /** "Section N" number, for top-level entries. */
  num?: string
  section: string
  /** The group heading a module card sits under. */
  group?: string
}

type FilterResult = {
  hits: number
  sections: Record<string, number>
  active: boolean
  /** Ids still shown while filtering, so the rail can list only those. */
  visible?: Set<string>
}
const NO_FILTER: FilterResult = { hits: 0, sections: {}, active: false }

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** The document's headings, in reading order: sections, sub-headings, module cards. */
function buildToc(doc: Document): TocItem[] {
  const items: TocItem[] = []
  doc.querySelectorAll<HTMLElement>('main section[id]').forEach(sec => {
    const full = clean(sec.querySelector(':scope > h2')?.textContent) || sec.id
    const num = clean(sec.querySelector(':scope > .eyebrow')?.textContent).match(/\d+/)?.[0]
    // "Connected systems — where the data flows" reads as "Connected systems" in a rail.
    items.push({ id: sec.id, label: full.split(' — ')[0], full, level: 1, num, section: sec.id })
    let group: string | undefined
    sec.querySelectorAll<HTMLElement>('h3.blockh[id], .grouphead[id], .mod[id]').forEach(el => {
      if (el.classList.contains('mod')) {
        const t = clean(el.querySelector('h3')?.textContent) || el.id
        items.push({ id: el.id, label: t, full: t, level: 3, section: sec.id, group })
      } else {
        group = el.id
        const t = clean(el.textContent)
        items.push({ id: el.id, label: t, full: t, level: 2, section: sec.id })
      }
    })
  })
  return items
}

/** The app's self-hosted faces, copied into the framed document so it reads in the house type. */
function hostFonts(): { faces: string; body: string; display: string } {
  let faces = ''
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try { rules = sheet.cssRules } catch { continue }
      const base = sheet.href || window.location.href
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue
        // A blob: document has no path to resolve "/_next/…" against, so every
        // url() is made absolute before it is copied across.
        faces += rule.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, q: string, u: string) => {
          try { return `url(${q}${new URL(u, base).href}${q})` } catch { return _m }
        }) + '\n'
      }
    }
  } catch { /* fonts are a nicety — the skin falls back to the system stack */ }
  const cs = getComputedStyle(document.body)
  return {
    faces,
    body: cs.getPropertyValue('--font-manrope').trim(),
    display: cs.getPropertyValue('--font-montserrat').trim(),
  }
}

// ── Filter (runs inside the framed document) ───────────────────────────────
const UNIT_CONTAINERS = '.cards, .faq, .legend'
const STRUCTURAL = '.grouphead, h3.blockh'

function clearFilter(doc: Document) {
  doc.querySelectorAll('mark.ohb-hit').forEach(m => {
    const p = m.parentNode
    if (!p) return
    p.replaceChild(doc.createTextNode(m.textContent ?? ''), m)
    p.normalize()
  })
  doc.querySelectorAll('.ohb-out').forEach(el => {
    el.classList.remove('ohb-out')
    if (!el.classList.length) el.removeAttribute('class')
  })
  doc.querySelectorAll<HTMLDetailsElement>('details[data-ohb-opened]').forEach(d => {
    d.open = false
    d.removeAttribute('data-ohb-opened')
  })
}

function highlight(doc: Document, root: Element, term: string) {
  const needle = term.toLowerCase()
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let n: Node | null
  while ((n = walker.nextNode())) {
    const parent = n.parentElement
    if (!parent || parent.closest('script, style, mark, .hb-search')) continue
    if ((n.nodeValue ?? '').toLowerCase().includes(needle)) nodes.push(n as Text)
  }
  nodes.forEach(node => {
    let cur: Text = node
    let i: number
    while ((i = (cur.nodeValue ?? '').toLowerCase().indexOf(needle)) !== -1) {
      const hit = cur.splitText(i)
      cur = hit.splitText(term.length)
      const mark = doc.createElement('mark')
      mark.className = 'ohb-hit'
      hit.parentNode?.replaceChild(mark, hit)
      mark.appendChild(hit)
    }
  })
}

/**
 * Hides every card, callout, FAQ and paragraph that does not contain the term,
 * along with headings and sections left with nothing under them. Purely a
 * class toggle — clearing it restores the document exactly.
 */
function applyFilter(doc: Document, raw: string): FilterResult {
  clearFilter(doc)
  const term = raw.trim()
  if (term.length < 2) return NO_FILTER
  const needle = term.toLowerCase()
  const has = (el: Element) => (el.textContent ?? '').toLowerCase().includes(needle)
  const out = (el: Element) => el.classList.add('ohb-out')
  const matched: Element[] = []
  const sections: Record<string, number> = {}
  let hits = 0

  doc.querySelectorAll<HTMLElement>('main section[id]').forEach(sec => {
    let secHits = 0
    let head: Element | null = null
    let headHits = 0
    const closeHead = () => { if (head && headHits === 0) out(head) }
    const hit = (el: Element) => {
      matched.push(el); headHits++; secHits++
      // tagName, not instanceof: the node belongs to the frame's realm, so the
      // page's own HTMLDetailsElement would never match it.
      if (el.tagName === 'DETAILS' && !(el as HTMLDetailsElement).open) {
        (el as HTMLDetailsElement).open = true
        el.setAttribute('data-ohb-opened', '')
      }
    }

    Array.from(sec.children).forEach(k => {
      if (k.matches('h2, .eyebrow')) return
      if (k.matches(STRUCTURAL)) {
        closeHead()
        head = k; headHits = 0
        if (has(k)) { matched.push(k); headHits++; secHits++ }
        return
      }
      if (k.matches(UNIT_CONTAINERS)) {
        let any = 0
        Array.from(k.children).forEach(c => { if (has(c)) { hit(c); any++ } else out(c) })
        if (!any) out(k)
        return
      }
      if (has(k)) hit(k); else out(k)
    })
    closeHead()
    if (!secHits) out(sec)
    else { sections[sec.id] = secHits; hits += secHits }
  })

  matched.forEach(el => highlight(doc, el, term))
  const visible = new Set(
    Array.from(doc.querySelectorAll<HTMLElement>('main [id]'))
      .filter(el => !el.closest('.ohb-out'))
      .map(el => el.id),
  )
  return { hits, sections, active: true, visible }
}

export default function HandbookPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [blobUrl, setBlobUrl] = useState<string>('')

  const frameRef = useRef<HTMLIFrameElement>(null)
  const railRef = useRef<HTMLElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const railInputRef = useRef<HTMLInputElement>(null)
  const barInputRef = useRef<HTMLInputElement>(null)

  const [docVersion, setDocVersion] = useState(0)
  const [toc, setToc] = useState<TocItem[]>([])
  const [counts, setCounts] = useState({ sections: 0, modules: 0, faqs: 0 })
  const [activeId, setActiveId] = useState('')
  const [showTop, setShowTop] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterResult>(NO_FILTER)

  const role = (session?.user as { role?: string })?.role

  useEffect(() => {
    if (status === 'loading') return
    // Medical Representatives are given the handbook deliberately: their four
    // modules are the ones a new MedRep has to learn, and sending them to read
    // it elsewhere defeats the point of having it in the Hub.
    const role = (session?.user as { role?: string })?.role
    if (!session || !HANDBOOK_ROLES.has(role ?? '')) {
      router.replace('/dashboard')
      return
    }
    // blob: URLs are served from memory — they carry no server headers, so
    // X-Frame-Options: DENY on the app's own responses doesn't block the iframe.
    // The skin goes in at the end of <head> so it layers over the document's
    // own stylesheet; a function replacement keeps any "$" in the CSS literal.
    const f = hostFonts()
    const skin = `<style id="ohb-skin">\n${f.faces}${HANDBOOK_SKIN_CSS(f.body, f.display)}\n</style>\n</head>`
    const html = HANDBOOK_HTML.replace('</head>', () => skin)
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [session, status, router])

  const onFrameLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc || !doc.querySelector('main')) return
    setToc(buildToc(doc))
    setCounts({
      sections: doc.querySelectorAll('main section[id]').length,
      modules: doc.querySelectorAll('.mod').length,
      faqs: doc.querySelectorAll('.faq details').length,
    })
    setFilter(NO_FILTER)
    setDocVersion(v => v + 1)
  }, [])

  // Scrollspy, progress and back-to-top, driven by the framed document's scroll.
  useEffect(() => {
    if (!docVersion) return
    const win = frameRef.current?.contentWindow
    const doc = frameRef.current?.contentDocument
    if (!win || !doc) return
    const targets = toc
      .map(t => ({ id: t.id, el: doc.getElementById(t.id) }))
      .filter((t): t is { id: string; el: HTMLElement } => !!t.el)
    let raf = 0
    const measure = () => {
      raf = 0
      const root = doc.documentElement
      const max = Math.max(1, root.scrollHeight - win.innerHeight)
      const y = win.scrollY
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${Math.min(1, y / max)})`
      setShowTop(y > 480)
      let current = ''
      for (const t of targets) {
        if (t.el.closest('.ohb-out')) continue
        if (t.el.getBoundingClientRect().top <= 96) current = t.id
        else break
      }
      if (y >= max - 4) {
        const last = [...targets].reverse().find(t => !t.el.closest('.ohb-out'))
        if (last && last.el.getBoundingClientRect().top < win.innerHeight) current = last.id
      }
      setActiveId(current || targets[0]?.id || '')
    }
    const onScroll = () => { if (!raf) raf = win.requestAnimationFrame(measure) }
    measure()
    win.addEventListener('scroll', onScroll, { passive: true })
    win.addEventListener('resize', onScroll)
    return () => {
      win.removeEventListener('scroll', onScroll)
      win.removeEventListener('resize', onScroll)
      if (raf) win.cancelAnimationFrame(raf)
    }
  }, [docVersion, toc, filter])

  // "/" focuses the filter from the page or from inside the document.
  useEffect(() => {
    const doc = frameRef.current?.contentDocument
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select') || t.isContentEditable)) return
      const input = [railInputRef.current, barInputRef.current].find(i => i && i.offsetParent !== null)
      if (!input) return
      e.preventDefault()
      input.focus()
      input.select()
    }
    window.addEventListener('keydown', onKey)
    doc?.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      doc?.removeEventListener('keydown', onKey)
    }
  }, [docVersion])

  // Filter, lightly debounced so typing stays smooth on the long document.
  // The document jumps to the top when a filter starts, changes or ends, so
  // the reader is never left mid-page in content that just moved.
  const wasFiltering = useRef(false)
  useEffect(() => {
    if (!docVersion) return
    const id = window.setTimeout(() => {
      const doc = frameRef.current?.contentDocument
      if (!doc) return
      const result = applyFilter(doc, query)
      setFilter(result)
      if (result.active || wasFiltering.current) frameRef.current?.contentWindow?.scrollTo({ top: 0 })
      wasFiltering.current = result.active
    }, 160)
    return () => window.clearTimeout(id)
  }, [query, docVersion])

  // Keep the active rail entry in view without scrolling the page itself.
  useEffect(() => {
    const rail = railRef.current
    const btn = rail?.querySelector<HTMLElement>(`[data-toc-id="${activeId}"]`)
    if (!rail || !btn) return
    // The rail is position:relative, so offsetTop is already measured from it.
    const top = btn.offsetTop
    if (top < rail.scrollTop + 8) rail.scrollTop = Math.max(0, top - 48)
    else if (top + btn.offsetHeight > rail.scrollTop + rail.clientHeight - 8) {
      rail.scrollTop = top + btn.offsetHeight - rail.clientHeight + 48
    }
  }, [activeId])

  const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const jumpTo = (id: string) => {
    const doc = frameRef.current?.contentDocument
    const win = frameRef.current?.contentWindow
    const el = doc?.getElementById(id)
    if (!doc || !win || !el) return
    const details = el.closest('details')
    if (details) details.open = true
    const top = el.getBoundingClientRect().top + win.scrollY - 12
    win.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' })
    el.classList.remove('ohb-flash')
    void el.offsetWidth
    el.classList.add('ohb-flash')
    window.setTimeout(() => el.classList.remove('ohb-flash'), 1500)
    setActiveId(id)
  }

  const toTop = () => frameRef.current?.contentWindow?.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })

  const active = useMemo(() => toc.find(t => t.id === activeId), [toc, activeId])
  const activeSection = active?.section
  const activeGroup = active?.level === 3 ? active.group : active?.level === 2 ? active.id : undefined

  // While filtering, the rail lists only what is still on the page.
  const visibleToc = useMemo(() => {
    if (!filter.active) return toc
    return toc.filter(t => !!filter.sections[t.section] && !!filter.visible?.has(t.id))
  }, [toc, filter])

  if (!blobUrl) return null

  const eyebrow = role === 'ADMIN' ? 'Settings' : 'Resources'
  const loaded = docVersion > 0
  const sectionCount = Object.keys(filter.sections).length

  const filterInput = (ref: React.RefObject<HTMLInputElement | null>, id: string) => (
    <div className="relative min-w-0 flex-1">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
      <input
        ref={ref}
        id={id}
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
        placeholder="Filter the handbook…"
        aria-label="Filter the handbook"
        autoComplete="off"
        className="w-full rounded-lg pl-8 pr-14 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#4a8073]/30"
        style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}
      />
      {query ? (
        <button type="button" onClick={() => { setQuery(''); ref.current?.focus() }} aria-label="Clear filter"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-black/5" style={{ color: 'var(--mid-gray)' }}>
          <X size={13} />
        </button>
      ) : (
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] font-semibold px-1.5 rounded pointer-events-none"
          style={{ border: '1px solid var(--light-gray)', color: 'var(--mid-gray)', background: '#F7F9F4' }}>/</kbd>
      )}
    </div>
  )

  const filterSummary = filter.active && (
    <p className="text-[11.5px] leading-snug" style={{ color: filter.hits ? 'var(--teal)' : '#9A3412' }} aria-live="polite">
      {filter.hits
        ? <>{filter.hits} {filter.hits === 1 ? 'match' : 'matches'} in {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}</>
        : 'No matches — try a shorter word.'}
    </p>
  )

  return (
    <div className="h-full min-h-0 flex flex-col gap-4 max-w-[1440px] mx-auto w-full min-w-0">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>{eyebrow}</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            User Handbook
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Every module, role and connected system in the Operations Hub, step by step.
          </p>
        </div>
        {loaded && (
          <div className="hidden sm:flex flex-wrap items-center gap-1.5">
            {[
              { n: counts.sections, l: 'sections' },
              { n: counts.modules, l: 'modules' },
              { n: counts.faqs, l: 'FAQs' },
            ].map(c => (
              <span key={c.l} className="inline-flex items-baseline gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-semibold"
                style={{ ...CARD_STYLE, color: 'var(--mid-gray)' }}>
                <span style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>{c.n}</span>{c.l}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex gap-4 min-w-0">
        {/* ── Contents rail (wide screens) ── */}
        <aside className="hidden xl:flex w-[248px] flex-shrink-0 flex-col rounded-xl overflow-hidden" style={CARD_STYLE} aria-label="Handbook contents">
          <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            {filterInput(railInputRef, 'hb-filter-rail')}
            {filterSummary}
          </div>
          <p className="px-4 pt-3 pb-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>On this page</p>
          <nav ref={railRef} className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 relative">
            {!loaded && (
              <div className="space-y-2 px-2 pt-2" aria-hidden>
                {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-4" style={{ width: `${88 - (i % 3) * 18}%` }} />)}
              </div>
            )}
            <ol className="m-0 p-0 list-none">
              {visibleToc.map(t => {
                if (t.level === 3 && !filter.active && t.group !== activeGroup) return null
                const isActive = t.id === activeId
                const inSection = t.level === 1 && t.id === activeSection
                const color = isActive || inSection ? 'var(--teal)' : t.level === 1 ? 'var(--charcoal)' : '#4B5F5A'
                return (
                  <li key={t.id} className={t.level === 1 ? 'mt-1.5 first:mt-0' : ''}>
                    <button
                      type="button"
                      data-toc-id={t.id}
                      onClick={() => jumpTo(t.id)}
                      title={t.full}
                      aria-current={isActive ? 'location' : undefined}
                      className="w-full text-left flex items-center gap-2 rounded-md transition-colors hover:bg-black/[.035]"
                      style={{
                        padding: t.level === 1 ? '6px 8px' : t.level === 2 ? '4px 8px 4px 34px' : '3px 8px 3px 46px',
                        fontSize: t.level === 1 ? 13 : t.level === 2 ? 12.5 : 12,
                        fontWeight: t.level === 1 ? 650 : isActive ? 650 : 500,
                        color,
                        background: isActive ? '#EDF4EF' : undefined,
                        boxShadow: isActive && t.level > 1 ? 'inset 2px 0 0 var(--bright-teal)' : undefined,
                      }}
                    >
                      {t.level === 1 && (
                        <span className="flex-shrink-0 grid place-items-center rounded-full text-[10.5px] font-bold"
                          style={{
                            width: 20, height: 20, fontVariantNumeric: 'tabular-nums',
                            background: inSection ? 'var(--teal)' : '#EEF3EF',
                            color: inSection ? '#fff' : 'var(--teal)',
                          }}>
                          {t.num ?? '•'}
                        </span>
                      )}
                      <span className="min-w-0 truncate flex-1">{t.label}</span>
                      {t.level === 1 && filter.active && filter.sections[t.id] ? (
                        <span className="flex-shrink-0 text-[10.5px] font-bold px-1.5 rounded-full"
                          style={{ background: '#FEF3C7', color: '#92400E' }}>{filter.sections[t.id]}</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
          <div className="px-3 py-2.5 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--light-gray)' }}>
            <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Esc clears the filter</span>
            <button type="button" onClick={toTop}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-md hover:bg-black/5"
              style={{ color: 'var(--teal)' }}>
              <ArrowUp size={12} /> Back to top
            </button>
          </div>
        </aside>

        {/* ── Reader ── */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-xl overflow-hidden relative" style={CARD_STYLE}>
          {/* Narrow screens: filter + jump list in a bar above the document. */}
          <div className="xl:hidden flex flex-wrap items-center gap-2 p-2.5" style={{ borderBottom: '1px solid var(--light-gray)' }}>
            {filterInput(barInputRef, 'hb-filter-bar')}
            <select
              value={activeId}
              onChange={e => jumpTo(e.target.value)}
              aria-label="Jump to a section"
              className="min-w-0 flex-1 sm:flex-none sm:w-[220px] rounded-lg px-2.5 py-2 text-[13px]"
              style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}
            >
              {visibleToc.map(t => (
                <option key={t.id} value={t.id}>
                  {t.level === 1 ? `${t.num ? `${t.num} · ` : ''}${t.label}` : `${t.level === 2 ? '   ' : '      '}${t.label}`}
                </option>
              ))}
            </select>
            {filter.active && <div className="w-full">{filterSummary}</div>}
          </div>

          {/* Reading progress */}
          <div className="h-[3px] flex-shrink-0" style={{ background: '#EEF3EF' }} aria-hidden>
            <div ref={progressRef} className="h-full origin-left"
              style={{ background: 'linear-gradient(90deg, var(--bright-teal), var(--teal))', transform: 'scaleX(0)', transition: 'transform 80ms linear' }} />
          </div>

          <div className="flex-1 min-h-0 relative">
            <iframe
              ref={frameRef}
              src={blobUrl}
              onLoad={onFrameLoad}
              className="absolute inset-0 w-full h-full block"
              style={{ border: 'none' }}
              title="Operations Hub User Handbook"
            />
            {!loaded && (
              <div className="absolute inset-0 p-8 space-y-4 bg-white" aria-hidden>
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-10/12" />
                <Skeleton className="h-4 w-9/12" />
              </div>
            )}
          </div>

          {/* Bottom-centre so it never sits under the enquiry dock. */}
          <button
            type="button"
            onClick={toTop}
            aria-label="Back to top"
            tabIndex={showTop ? 0 : -1}
            className="absolute left-1/2 bottom-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-semibold shadow-lg transition-all duration-200"
            style={{
              background: 'var(--teal)', color: '#fff',
              opacity: showTop ? 1 : 0,
              transform: `translateX(-50%) translateY(${showTop ? 0 : 8}px)`,
              pointerEvents: showTop ? 'auto' : 'none',
            }}
          >
            <ArrowUp size={13} /> Back to top
          </button>
        </div>
      </div>
    </div>
  )
}
