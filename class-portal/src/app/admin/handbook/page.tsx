'use client'

// Force dynamic — matches /admin and /documents. Without it Next.js serves
// a prerendered shell that hides deploys for up to a year.
export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth } from '@/lib/session'

/**
 * Class Portal — User Handbook (v5).
 *
 * Restructured to match the HR portal handbook's format
 * (hr.sapphireclinicseast.org/modules/handbook/index.html):
 *   • Dark teal masthead with kicker + lede + meta + actions
 *   • Two-column shell: sticky Table of Contents + wide content
 *   • Module cards with a location badge and role pills
 *   • Numbered "Step by step" lists with colored circles
 *   • Field-explanation tables
 *   • Colored callouts (Golden rule / Tip)
 *   • Role-playbook cards with colored left border
 *   • FAQ collapsibles
 *   • Word Search that finds matches across the handbook and jumps to them
 *   • Print CSS + Word (.doc) download that expand every FAQ
 *
 * Content adapted for the class portal's five roles (Main admin, Branch
 * admin, Front desk, SPED teacher, Parent/Student) and every module
 * currently shipped, including Meetings, intern accounts, admission
 * tracker, personal vouchers, and the plan-switch calculator.
 */
interface SearchHit {
  id: string
  section: string
  head: string
  snippet: string
}

export default function HandbookPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [downloadingWord, setDownloadingWord] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [showEmpty, setShowEmpty] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const auth = getAuth()
    if (!auth) { router.replace('/sign-in'); return }
    if (auth.role !== 'ADMIN') {
      router.replace(auth.role === 'BRANCH_ADMIN' ? '/admin'
        : auth.role === 'FRONTDESK' ? '/frontdesk'
        : '/profile')
      return
    }
    setReady(true)
  }, [router])

  /** Client-side word search. Walks the searchable blocks inside the
   *  handbook body, finds matches for every query term, highlights them
   *  inline with <mark data-hb>, and produces a snippet list. Never
   *  throws — a search failure just leaves the box inert. */
  useEffect(() => {
    if (!bodyRef.current) return
    // Undo previous highlighting.
    bodyRef.current.querySelectorAll<HTMLElement>('mark[data-hb]').forEach(m => {
      const parent = m.parentNode
      if (!parent) return
      parent.replaceChild(document.createTextNode(m.textContent || ''), m)
      parent.normalize()
    })
    setHits([])
    setShowEmpty(false)
    const q = query.trim()
    if (q.length < 2) return
    const terms = q.split(/\s+/).filter(Boolean)
    if (!terms.length) return

    try {
      const blocks: Array<{ el: HTMLElement; section: string; head: string; text: string }> = []
      const sections = bodyRef.current.querySelectorAll<HTMLElement>('section.hb-section')
      sections.forEach(sec => {
        const secTitle = (sec.querySelector('h2')?.textContent || '').trim()
        const nodes = sec.querySelectorAll<HTMLElement>('.mod, .play, .call, .conn, .legend .rc, .faq details, section.hb-section > p, .hubwrap')
        nodes.forEach(el => {
          if (el.closest('.hb-search')) return
          const h = el.querySelector('h3, summary, h4')
          const head = h ? (h.textContent || '').trim() : secTitle
          if (!el.id) el.id = 'hb-' + Math.random().toString(36).slice(2, 9)
          blocks.push({ el, section: secTitle, head, text: el.textContent || '' })
        })
      })

      const lowered = terms.map(t => t.toLowerCase())
      const matched = blocks.filter(b => {
        const t = b.text.toLowerCase()
        return lowered.every(w => t.includes(w))
      })

      if (!matched.length) {
        setShowEmpty(true)
        return
      }

      const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const termRe = new RegExp('(' + terms.map(escapeRe).join('|') + ')', 'ig')

      const snippet = (text: string, term: string) => {
        const i = text.toLowerCase().indexOf(term.toLowerCase())
        if (i < 0) return text.slice(0, 140).trim() + '…'
        const s = Math.max(0, i - 60)
        const e = Math.min(text.length, i + term.length + 80)
        return (s > 0 ? '…' : '') + text.slice(s, e).replace(/\s+/g, ' ').trim() + (e < text.length ? '…' : '')
      }

      matched.slice(0, 40).forEach(b => {
        // Highlight matches inline.
        const walker = document.createTreeWalker(b.el, NodeFilter.SHOW_TEXT, null)
        const nodes: Text[] = []
        let n: Node | null
        while ((n = walker.nextNode())) {
          const t = n as Text
          if (!t.nodeValue?.trim()) continue
          if (t.parentElement?.closest('.hb-search')) continue
          nodes.push(t)
        }
        nodes.forEach(t => {
          if (!t.nodeValue) return
          termRe.lastIndex = 0
          if (!termRe.test(t.nodeValue)) return
          termRe.lastIndex = 0
          const frag = document.createDocumentFragment()
          let last = 0
          let m: RegExpExecArray | null
          while ((m = termRe.exec(t.nodeValue)) !== null) {
            frag.appendChild(document.createTextNode(t.nodeValue.slice(last, m.index)))
            const mk = document.createElement('mark')
            mk.setAttribute('data-hb', '')
            mk.textContent = m[0]
            frag.appendChild(mk)
            last = m.index + m[0].length
          }
          frag.appendChild(document.createTextNode(t.nodeValue.slice(last)))
          t.parentNode?.replaceChild(frag, t)
        })
      })

      setHits(matched.slice(0, 40).map(b => ({
        id: b.el.id,
        section: b.section,
        head: b.head === b.section ? '' : b.head,
        snippet: snippet(b.text, terms[0]),
      })))
    } catch {
      /* keep the box inert on any failure */
    }
  }, [query])

  function handleDownloadPDF() {
    setQuery('')
    if (typeof window !== 'undefined') setTimeout(() => window.print(), 100)
  }

  async function handleDownloadWord() {
    if (downloadingWord || !bodyRef.current || !rootRef.current) return
    setQuery('')
    setDownloadingWord(true)
    try {
      // Clone the shell so we can strip the on-screen nav and expand every
      // FAQ answer without touching what the user sees.
      const clone = rootRef.current.cloneNode(true) as HTMLElement
      // Drop the sticky TOC, action buttons, and search box.
      clone.querySelectorAll('.hb-toc, .hb-mast-actions, .hb-search').forEach(el => el.remove())
      // Expand every FAQ.
      clone.querySelectorAll('details').forEach(d => d.setAttribute('open', ''))
      // Un-mark any leftover search highlights.
      clone.querySelectorAll('mark[data-hb]').forEach(m => {
        const parent = m.parentNode
        if (!parent) return
        parent.replaceChild(document.createTextNode(m.textContent || ''), m)
      })

      const styleTag = document.getElementById('handbook-css')?.outerHTML ?? ''
      const html =
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
        'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/1999/xhtml">' +
        '<head><meta charset="utf-8"><title>Class Portal — User Handbook</title>' + styleTag +
        '</head><body>' + clone.outerHTML + '</body></html>'
      const blob = new Blob(['﻿', html], { type: 'application/msword' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Class-Portal-Handbook.doc'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) {
      alert(`Could not build the Word file. Please use "Save as PDF" instead.\n\n${(e as Error).message}`)
    } finally {
      setDownloadingWord(false)
    }
  }

  if (!ready) return null

  return (
    <div ref={rootRef} className="hb-root">
      <style id="handbook-css">{`
        .hb-root {
          --ink:#16302E; --body:#31403D; --muted:#6A7B78;
          --teal:#157A72; --teal-deep:#0E4A46; --teal-soft:#E4EFEC;
          --line:#D6E2DE; --line-soft:#E8F0ED;
          --paper:#F3F6F4; --card:#FFFFFF;
          /* Role accents — five roles for the class portal */
          --ra:#7E4CC4; --ra-bg:#F1EAFB;   /* main Admin */
          --rb:#1F6FB2; --rb-bg:#E7F0F9;   /* Branch admin */
          --rf:#B37B14; --rf-bg:#FBF0DC;   /* Front desk */
          --rt:#0E4A46; --rt-bg:#DCEEEA;   /* Teacher */
          --rs:#2E8B57; --rs-bg:#E6F3EC;   /* Student / parent */
          --warn:#B7791F; --warn-bg:#FBF4E4;
          --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
          --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
          --measure:70ch;
          background: var(--paper);
          color: var(--body);
          font-family: var(--sans);
          font-size: 16px;
          line-height: 1.62;
          -webkit-font-smoothing: antialiased;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 1px 0 rgba(0,0,0,0.02);
        }
        .hb-root *, .hb-root *::before, .hb-root *::after { box-sizing: border-box; }
        .hb-root a { color: var(--teal); text-underline-offset: 2px; }
        .hb-root h1, .hb-root h2, .hb-root h3, .hb-root h4 {
          color: var(--ink); line-height: 1.2; margin: 0;
        }
        .hb-root code {
          font-family: var(--mono); font-size: .86em;
          background: var(--teal-soft); color: var(--teal-deep);
          padding: .08em .4em; border-radius: 4px; white-space: nowrap;
        }
        .hb-root kbd {
          font-family: var(--sans); font-size: .88em; font-weight: 600; color: var(--ink);
          background: #fff; border: 1px solid var(--line); border-bottom-width: 2px;
          border-radius: 6px; padding: .05em .45em; white-space: nowrap;
        }
        .hb-root mark { background: #FFF1A8; color: inherit; padding: 0 .1em; border-radius: 3px; }

        /* ── Masthead ──────────────────────────────── */
        .hb-mast {
          background:
            radial-gradient(120% 140% at 100% 0%, rgba(21,122,114,.14), transparent 60%),
            linear-gradient(180deg, #0E4A46, #12645C);
          color: #DCEBE8;
          padding: 44px 40px 38px;
        }
        .hb-mast .kicker {
          font-family: var(--mono); font-size: 12.5px; letter-spacing: .22em;
          text-transform: uppercase; color: #7FC3B9;
          display: block; margin-bottom: 14px;
        }
        .hb-mast h1 {
          color: #ffffff;
          font-size: clamp(26px, 3.6vw, 38px);
          font-weight: 800; letter-spacing: -.02em; max-width: 22ch;
          margin-bottom: 14px;
        }
        .hb-mast p.lede { margin: 0 0 14px; max-width: 62ch; color: #CDE3DE; font-size: 15.5px; }
        .hb-mast .meta {
          display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 4px 0 16px;
          font-size: 13px; color: #A9D0C9;
        }
        .hb-mast .meta b { color: #EAF5F2; font-weight: 600; }
        .hb-mast .meta code { background: rgba(255,255,255,.12); color: #EAF5F2; }
        .hb-mast-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        .hb-mast-actions .hb-btn {
          font-family: var(--sans); font-size: 13px; font-weight: 600; cursor: pointer;
          display: inline-flex; align-items: center; gap: 7px;
          padding: 8px 15px; border-radius: 9px;
          border: 1px solid transparent;
          background: #EAF5F2; color: #0E4A46;
          transition: transform .12s, background .15s;
        }
        .hb-mast-actions .hb-btn:hover { background: #FFFFFF; transform: translateY(-1px); }
        .hb-mast-actions .hb-btn.ghost { background: rgba(255,255,255,.10); color: #EAF5F2; border-color: rgba(255,255,255,.35); }
        .hb-mast-actions .hb-btn.ghost:hover { background: rgba(255,255,255,.18); }
        .hb-mast-actions .hb-btn:disabled { opacity: .6; cursor: default; transform: none; }

        /* ── Shell ────────────────────────────────── */
        .hb-shell {
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr);
          gap: 40px;
          align-items: start;
          padding: 34px 40px 60px;
          background: var(--paper);
        }
        @media (max-width: 900px) {
          .hb-shell { grid-template-columns: 1fr; gap: 0; padding: 24px 20px 40px; }
          .hb-mast { padding: 32px 20px 26px; }
        }

        /* ── Sticky TOC ───────────────────────────── */
        .hb-toc {
          position: sticky; top: 12px; font-size: 13px;
          max-height: calc(100vh - 24px); overflow: auto;
        }
        @media (max-width: 900px) {
          .hb-toc {
            position: static; margin-bottom: 22px; max-height: none;
            border: 1px solid var(--line); border-radius: 12px;
            background: var(--card); padding: 12px 14px;
          }
        }
        .hb-toc .toc-h {
          font-family: var(--mono); font-size: 11px; letter-spacing: .18em;
          text-transform: uppercase; color: var(--muted);
          margin: 0 0 8px;
        }
        .hb-toc ol {
          list-style: none; margin: 0; padding: 0;
          display: flex; flex-direction: column; gap: 1px;
        }
        .hb-toc a {
          display: block; padding: 5px 10px; border-radius: 7px;
          color: var(--body); text-decoration: none;
          border-left: 2px solid transparent;
          transition: background .15s, color .15s;
        }
        .hb-toc a:hover { background: var(--teal-soft); color: var(--teal-deep); }
        .hb-toc a.sub { padding-left: 20px; font-size: 12.5px; color: var(--muted); }

        /* ── Sections ─────────────────────────────── */
        .hb-content > section.hb-section { margin-bottom: 48px; scroll-margin-top: 20px; }
        .hb-content .eyebrow {
          font-family: var(--mono); font-size: 12px; letter-spacing: .16em;
          text-transform: uppercase; color: var(--teal);
          margin: 0 0 6px;
        }
        .hb-content section.hb-section > h2 {
          font-size: 26px; font-weight: 800; letter-spacing: -.015em;
          padding-bottom: 12px;
          border-bottom: 2px solid var(--line);
          margin-bottom: 20px;
        }
        .hb-content section.hb-section > p { max-width: var(--measure); margin: 0 0 12px; }
        .hb-content h3.blockh { font-size: 18px; font-weight: 700; margin: 24px 0 8px; scroll-margin-top: 20px; }
        .hb-content .grouphead {
          font-size: 12.5px; font-family: var(--mono); letter-spacing: .12em;
          text-transform: uppercase; color: var(--muted);
          margin: 26px 0 12px; display: flex; align-items: center; gap: 12px;
          scroll-margin-top: 20px;
        }
        .hb-content .grouphead::after { content: ""; flex: 1; height: 1px; background: var(--line); }

        /* ── Role badges ──────────────────────────── */
        .hb-content .badge {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 600;
          padding: 3px 9px 3px 7px; border-radius: 999px;
          line-height: 1; white-space: nowrap;
        }
        .hb-content .badge .dot {
          width: 14px; height: 14px; border-radius: 50%;
          color: #fff; font-size: 9px; font-weight: 800;
          display: grid; place-items: center;
        }
        .hb-content .b-a { background: var(--ra-bg); color: #5B2E96; }   .hb-content .b-a .dot { background: var(--ra); }
        .hb-content .b-b { background: var(--rb-bg); color: #154C7E; }   .hb-content .b-b .dot { background: var(--rb); }
        .hb-content .b-f { background: var(--rf-bg); color: #7A4E0A; }   .hb-content .b-f .dot { background: var(--rf); }
        .hb-content .b-t { background: var(--rt-bg); color: #0E4A46; }   .hb-content .b-t .dot { background: var(--rt); }
        .hb-content .b-s { background: var(--rs-bg); color: #1F6340; }   .hb-content .b-s .dot { background: var(--rs); }

        /* ── Role legend cards ────────────────────── */
        .hb-content .legend {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px; margin: 22px 0 8px;
        }
        .hb-content .legend .rc {
          background: var(--card); border: 1px solid var(--line); border-radius: 12px;
          padding: 15px 16px; border-top: 3px solid var(--rc);
        }
        .hb-content .legend .rc.a { --rc: var(--ra); }
        .hb-content .legend .rc.b { --rc: var(--rb); }
        .hb-content .legend .rc.f { --rc: var(--rf); }
        .hb-content .legend .rc.t { --rc: var(--rt); }
        .hb-content .legend .rc.s { --rc: var(--rs); }
        .hb-content .legend .rc h4 {
          font-size: 15px; margin-bottom: 4px;
          display: flex; align-items: center; gap: 8px;
        }
        .hb-content .legend .rc .who {
          font-family: var(--mono); font-size: 11.5px; color: var(--muted);
          margin-bottom: 8px;
        }
        .hb-content .legend .rc p { font-size: 13.5px; margin: 0; color: var(--body); }

        /* ── Module cards ─────────────────────────── */
        .hb-content .cards { display: flex; flex-direction: column; gap: 14px; }
        .hb-content .mod {
          background: var(--card); border: 1px solid var(--line); border-radius: 14px;
          padding: 18px 22px; scroll-margin-top: 20px;
        }
        .hb-content .mod-top {
          display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 12px;
          margin-bottom: 4px;
        }
        .hb-content .mod-top h3 { font-size: 17px; font-weight: 700; }
        .hb-content .mod-top .loc { font-family: var(--mono); font-size: 12px; color: var(--muted); }
        .hb-content .mod-roles {
          display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 12px;
        }
        .hb-content .mod .desc { max-width: var(--measure); margin: 0 0 4px; }
        .hb-content .mod ul {
          margin: 8px 0 0; padding-left: 0; list-style: none;
          max-width: var(--measure);
          display: flex; flex-direction: column; gap: 6px;
        }
        .hb-content .mod ul li { position: relative; padding-left: 20px; font-size: 14px; }
        .hb-content .mod ul li::before {
          content: ""; position: absolute; left: 4px; top: 8px;
          width: 6px; height: 6px; border-radius: 50%; background: var(--teal);
        }
        .hb-content .mod .note {
          margin-top: 12px; font-size: 13.5px;
          background: var(--teal-soft); border-radius: 9px;
          padding: 10px 13px; color: var(--teal-deep); max-width: var(--measure);
        }
        .hb-content .mod .note b { color: var(--teal-deep); }
        .hb-content .mod h4 {
          font-size: 13.5px; font-weight: 700; margin: 14px 0 6px;
          color: var(--ink);
          display: flex; align-items: center; gap: 8px;
        }
        .hb-content .mod h4 .tag {
          font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em;
          text-transform: uppercase; color: var(--muted); font-weight: 600;
        }
        .hb-content .mod ol.steps {
          margin: 6px 0 0; padding-left: 0; counter-reset: s; list-style: none;
          display: flex; flex-direction: column; gap: 7px; max-width: var(--measure);
        }
        .hb-content .mod ol.steps li {
          position: relative; padding-left: 32px; counter-increment: s;
          font-size: 14px;
        }
        .hb-content .mod ol.steps li::before {
          content: counter(s);
          position: absolute; left: 0; top: 1px;
          width: 21px; height: 21px; border-radius: 50%;
          background: var(--teal); color: #fff;
          font-size: 11.5px; font-weight: 700;
          display: grid; place-items: center;
          font-variant-numeric: tabular-nums;
        }
        .hb-content .fields {
          width: 100%; border-collapse: collapse; font-size: 13.5px;
          margin: 6px 0 4px; max-width: var(--measure);
        }
        .hb-content .fields td {
          padding: 6px 10px 6px 0; border-bottom: 1px solid var(--line-soft);
          vertical-align: top;
        }
        .hb-content .fields td:first-child {
          font-weight: 600; color: var(--ink); white-space: nowrap; width: 34%;
        }
        .hb-content .fields tr:last-child td { border-bottom: none; }

        /* ── Callouts ─────────────────────────────── */
        .hb-content .call {
          border-radius: 12px; padding: 14px 18px; margin: 14px 0;
          max-width: var(--measure); font-size: 14px;
          border: 1px solid var(--line-soft);
        }
        .hb-content .call b { color: var(--ink); }
        .hb-content .call.rule { background: var(--warn-bg); border-color: #EAD9AE; }
        .hb-content .call.rule .lbl { color: var(--warn); }
        .hb-content .call.tip { background: var(--teal-soft); border-color: #BFDBD5; }
        .hb-content .call.tip .lbl { color: var(--teal-deep); }
        .hb-content .call .lbl {
          font-family: var(--mono); font-size: 11px; letter-spacing: .14em;
          text-transform: uppercase; display: block; margin-bottom: 4px;
          font-weight: 700;
        }

        /* ── Playbook cards ───────────────────────── */
        .hb-content .play {
          background: var(--card); border: 1px solid var(--line); border-radius: 14px;
          padding: 18px 22px; margin-bottom: 14px;
          border-left: 4px solid var(--pc);
        }
        .hb-content .play.a { --pc: var(--ra); }
        .hb-content .play.b { --pc: var(--rb); }
        .hb-content .play.f { --pc: var(--rf); }
        .hb-content .play.t { --pc: var(--rt); }
        .hb-content .play.s { --pc: var(--rs); }
        .hb-content .play h3 {
          font-size: 16.5px;
          display: flex; align-items: center; gap: 9px;
          margin-bottom: 10px;
        }
        .hb-content .play ol {
          margin: 0; padding-left: 0; counter-reset: s; list-style: none;
          display: flex; flex-direction: column; gap: 8px;
          max-width: var(--measure);
        }
        .hb-content .play ol li {
          position: relative; padding-left: 34px; counter-increment: s;
          font-size: 14px;
        }
        .hb-content .play ol li::before {
          content: counter(s);
          position: absolute; left: 0; top: -1px;
          width: 22px; height: 22px; border-radius: 50%;
          background: var(--pc); color: #fff;
          font-size: 12px; font-weight: 700;
          display: grid; place-items: center;
          font-variant-numeric: tabular-nums;
        }

        /* ── Access table ─────────────────────────── */
        .hb-content .tablewrap {
          overflow-x: auto; border: 1px solid var(--line);
          border-radius: 12px; margin-top: 8px;
        }
        .hb-content table.access {
          border-collapse: collapse; width: 100%; font-size: 13px; min-width: 620px;
        }
        .hb-content table.access th, .hb-content table.access td {
          text-align: left; padding: 8px 12px;
          border-bottom: 1px solid var(--line-soft);
        }
        .hb-content table.access thead th {
          background: var(--teal-soft); color: var(--teal-deep);
          font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
          position: sticky; top: 0;
        }
        .hb-content table.access tbody tr:last-child td { border-bottom: none; }
        .hb-content table.access td.mod-name { font-weight: 600; color: var(--ink); }
        .hb-content .yes { color: #1F6340; font-weight: 700; }
        .hb-content .part { color: var(--warn); font-weight: 600; font-size: 12.5px; }
        .hb-content .noc { color: #C0CBC8; }

        /* ── Connected systems ────────────────────── */
        .hb-content .hubwrap {
          background: var(--card); border: 1px solid var(--line); border-radius: 14px;
          padding: 22px; margin: 6px 0 22px; overflow-x: auto;
        }
        .hb-content .hubwrap svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }
        .hb-content .hub-legend { text-align: center; font-size: 12px; color: var(--muted); margin-top: 6px; }
        .hb-content .conn {
          background: var(--card); border: 1px solid var(--line); border-radius: 14px;
          padding: 18px 22px;
        }
        .hb-content .conn + .conn { margin-top: 14px; }
        .hb-content .conn-head {
          display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 12px; margin-bottom: 4px;
        }
        .hb-content .conn-head h3 { font-size: 17px; font-weight: 700; }
        .hb-content .conn-head .loc { font-family: var(--mono); font-size: 12px; color: var(--muted); }
        .hb-content .flowgrid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px;
        }
        @media (max-width: 620px) { .hb-content .flowgrid { grid-template-columns: 1fr; } }
        .hb-content .flowcol {
          border-radius: 10px; padding: 12px 14px 13px;
          border: 1px solid var(--line-soft);
        }
        .hb-content .flowcol.supplies { background: #EAF4EF; border-color: #CBE5D8; }
        .hb-content .flowcol.receives { background: #EAF0F8; border-color: #CFDDF0; }
        .hb-content .flow-lbl {
          font-family: var(--mono); font-size: 11px; letter-spacing: .06em;
          text-transform: uppercase; font-weight: 700; margin-bottom: 8px;
        }
        .hb-content .flowcol.supplies .flow-lbl { color: #1F6340; }
        .hb-content .flowcol.receives .flow-lbl { color: #154C7E; }
        .hb-content .flowcol ul {
          margin: 0; padding-left: 0; list-style: none;
          display: flex; flex-direction: column; gap: 8px;
        }
        .hb-content .flowcol li {
          font-size: 13px; line-height: 1.5;
          position: relative; padding-left: 15px;
        }
        .hb-content .flowcol li::before {
          content: ""; position: absolute; left: 1px; top: 8px;
          width: 5px; height: 5px; border-radius: 50%;
        }
        .hb-content .flowcol.supplies li::before { background: #2E8B57; }
        .hb-content .flowcol.receives li::before { background: #1F6FB2; }

        /* ── Help: FAQ + word search ──────────────── */
        .hb-content .faq {
          display: flex; flex-direction: column; gap: 10px; max-width: var(--measure);
        }
        .hb-content .faq details {
          background: var(--card); border: 1px solid var(--line); border-radius: 12px;
          padding: 0 18px; scroll-margin-top: 20px;
        }
        .hb-content .faq summary {
          cursor: pointer; font-weight: 650; color: var(--ink);
          padding: 13px 0; font-size: 14.5px;
          list-style: none; display: flex; align-items: center; gap: 10px;
        }
        .hb-content .faq summary::-webkit-details-marker { display: none; }
        .hb-content .faq summary::before {
          content: "+"; font-family: var(--mono); color: var(--teal); font-weight: 700;
          width: 18px; flex: 0 0 auto;
        }
        .hb-content .faq details[open] summary::before { content: "–"; }
        .hb-content .faq details .a { padding: 0 0 15px 28px; font-size: 14px; }
        .hb-content .faq details .a p { margin: 0 0 8px; }
        .hb-content .hb-search {
          background: var(--card); border: 1px solid var(--line); border-radius: 14px;
          padding: 18px 20px; max-width: var(--measure);
        }
        .hb-content .hb-search label {
          display: block; font-weight: 650; color: var(--ink);
          margin-bottom: 8px; font-size: 14.5px;
        }
        .hb-content .hb-search input {
          width: 100%; font: inherit; font-size: 15px;
          padding: 10px 14px; border-radius: 10px;
          border: 1.5px solid var(--line); background: #fff; color: var(--ink);
        }
        .hb-content .hb-search input:focus {
          outline: none; border-color: var(--teal);
          box-shadow: 0 0 0 3px rgba(21,122,114,.15);
        }
        .hb-content .hb-search .hint {
          font-size: 12.5px; color: var(--muted); margin: 8px 0 0;
        }
        .hb-content .sr-list {
          list-style: none; margin: 14px 0 0; padding: 0;
          display: flex; flex-direction: column; gap: 6px;
        }
        .hb-content .sr-list li a {
          display: block; padding: 10px 12px; border-radius: 9px;
          border: 1px solid var(--line-soft);
          text-decoration: none; color: var(--body); background: var(--paper);
        }
        .hb-content .sr-list li a:hover { border-color: var(--teal); background: var(--teal-soft); }
        .hb-content .sr-list .where {
          font-family: var(--mono); font-size: 11px; letter-spacing: .06em;
          text-transform: uppercase; color: var(--teal-deep);
          display: block; margin-bottom: 3px;
        }
        .hb-content .sr-list .snip { font-size: 13px; line-height: 1.5; }
        .hb-content .sr-empty { font-size: 13.5px; color: var(--muted); margin-top: 12px; }

        /* ── Print ────────────────────────────────── */
        @media print {
          .hb-root { background: #fff; font-size: 11.5pt; box-shadow: none; border-radius: 0; }
          .hb-mast { background: #0E4A46 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .hb-toc, .hb-mast-actions, .hb-search { display: none !important; }
          .hb-shell { grid-template-columns: 1fr; padding: 20px 0; }
          .hb-content .mod, .hb-content .play, .hb-content .legend .rc,
          .hb-content .conn, .hb-content .hubwrap, .hb-content .call,
          .hb-content .tablewrap, .hb-content .faq details { break-inside: avoid; }
          .hb-content .faq details { padding-bottom: 0; }
          .hb-content .faq details:not([open]) .a { display: block; }
          .hb-content section.hb-section { margin-bottom: 26px; }
          .hb-root a { text-decoration: none; color: inherit; }
        }
      `}</style>

      {/* ═══════════════════ MASTHEAD ═══════════════════ */}
      <header className="hb-mast">
        <span className="kicker">Aura Academy · Class Portal · User Handbook</span>
        <h1>How to use the Aura Academy Class Portal</h1>
        <p className="lede">
          One system for enrolment, tuition payments, classes, meetings, and academic records — built so
          the clinic manager, HR officer, front desk, SPED teacher, and every parent each see exactly
          what they need. This handbook is a step-by-step guide: it assumes you have never opened the
          portal before, and it walks through every screen, every tab, and every button.
        </p>
        <div className="meta">
          <span>Address: <code>class.sapphireclinicseast.org</code></span>
          <span>Sign in with your <b>work email &amp; password</b> (parents use the credentials the admin created)</span>
          <span>Audience: <b>Managers · HR officers · Front desk · Teachers · Parents</b></span>
        </div>
        <div className="hb-mast-actions">
          <button type="button" className="hb-btn" onClick={handleDownloadPDF} title="Uses your browser's print dialog. Pick 'Save as PDF' as the destination.">
            🖨&nbsp; Save as PDF
          </button>
          <button type="button" className="hb-btn ghost" onClick={() => void handleDownloadWord()} disabled={downloadingWord}>
            {downloadingWord ? 'Generating…' : '⬇  Download as Word'}
          </button>
          <a className="hb-btn ghost" href="#help" style={{ textDecoration: 'none' }}>🔎&nbsp; Search this handbook</a>
        </div>
      </header>

      {/* ═══════════════════ SHELL ═══════════════════ */}
      <div className="hb-shell">
        <nav className="hb-toc" aria-label="Contents">
          <p className="toc-h">Contents</p>
          <ol>
            <li><a href="#start">1 · Getting started</a></li>
            <li><a href="#s-signin" className="sub">Signing in</a></li>
            <li><a href="#s-home" className="sub">Your home screen</a></li>
            <li><a href="#s-nav" className="sub">Moving around</a></li>
            <li><a href="#s-impersonate" className="sub">View-as impersonation</a></li>
            <li><a href="#roles">2 · Know your role</a></li>
            <li><a href="#access" className="sub">Who sees what</a></li>
            <li><a href="#modules">3 · The modules, step by step</a></li>
            <li><a href="#g-people" className="sub">People &amp; records</a></li>
            <li><a href="#g-classes" className="sub">Classes &amp; instruction</a></li>
            <li><a href="#g-payments" className="sub">Payments &amp; fees</a></li>
            <li><a href="#g-docs" className="sub">Documents &amp; compliance</a></li>
            <li><a href="#g-comms" className="sub">Communications</a></li>
            <li><a href="#g-setup" className="sub">Setup &amp; lifecycle</a></li>
            <li><a href="#connect">4 · Connected systems</a></li>
            <li><a href="#play">5 · Role playbooks</a></li>
            <li><a href="#rules">6 · Golden rules</a></li>
            <li><a href="#help">7 · Help</a></li>
            <li><a href="#faq" className="sub">FAQ</a></li>
            <li><a href="#search" className="sub">Word search</a></li>
          </ol>
        </nav>

        <div className="hb-content" ref={bodyRef}>

        {/* ════════════════ SECTION 1 ════════════════ */}
        <section id="start" className="hb-section">
          <p className="eyebrow">Section 1</p>
          <h2>Getting started</h2>
          <p>The portal lives at <code>class.sapphireclinicseast.org</code>. Everything in this section is about the first five minutes: signing in, understanding what&rsquo;s on the screen, and learning how to get from one place to another. Nothing here changes any data — it&rsquo;s safe to click around.</p>

          <div className="call tip"><span className="lbl">How to read this handbook</span>
            A word in a box like <kbd>+ Record payment</kbd> is the exact text of a button, tab, or field you&rsquo;ll see on screen. A path like <b>sidebar › Payments › Pending confirmations</b> tells you where to click, in order. Every module in Section 3 has a numbered <b>Step by step</b> list you can follow literally.
          </div>

          <h3 className="blockh" id="s-signin">Signing in</h3>
          <div className="mod">
            <ol className="steps">
              <li>Open a browser and go to <code>class.sapphireclinicseast.org</code>. Chrome, Safari, Edge, and Firefox all work — desktop, tablet, or phone.</li>
              <li>Click <kbd>Sign In</kbd> in the top-right of the marketing home page, or open the <em>Sign In (for existing student)</em> tab under &ldquo;Get started&rdquo;.</li>
              <li>Under <b>Choose your role to continue</b>, tap the tile that matches you: <kbd>Parent / Student</kbd>, <kbd>Teacher</kbd>, <kbd>Front desk</kbd>, <kbd>Branch admin</kbd>, or <kbd>Main admin</kbd>. The email and password fields activate once a role is picked.</li>
              <li>Type your <b>email</b> and <b>password</b>, then click <kbd>Continue as &lt;role&gt;</kbd>. You land on the right home screen for your role.</li>
              <li><b>Forgot your password?</b> Click <kbd>Forgot?</kbd> next to the password field. You&rsquo;ll need a reset token — ask the main admin (or your branch admin) to email you one from <em>Admin › Users › Email reset link</em>. The link expires 24 hours after it&rsquo;s issued.</li>
            </ol>
            <div className="note"><b>Never email a password.</b> Passwords for staff and parents are handed over in person or via a secure channel (a signed sticky note, a password-manager share). The admin can always reset one from <em>Users</em> if it&rsquo;s lost.</div>
          </div>

          <h3 className="blockh" id="s-home">Your home screen</h3>
          <div className="mod">
            <p className="desc">There are three home screens, depending on your role.</p>
            <h4>Main admin &amp; branch admin see the <b>Admin dashboard</b></h4>
            <ul>
              <li>Header eyebrow reads <em>SCEI main admin</em> or <em>Branch admin — East Branch / Greenhills Branch</em>.</li>
              <li>Below the header, a horizontal row of nine tabs: <kbd>Users</kbd>, <kbd>Students</kbd>, <kbd>Grade Levels</kbd>, <kbd>Curriculum</kbd>, <kbd>Templates</kbd>, <kbd>Notifications</kbd>, <kbd>Payments</kbd>, <kbd>Fees</kbd>, <kbd>Assignments</kbd>. Click any tab to switch panels.</li>
              <li>The tab bar is the same for both roles; what&rsquo;s inside each tab is scoped to your branch when you&rsquo;re a branch admin.</li>
            </ul>
            <h4>Front desk sees the <b>Front desk dashboard</b></h4>
            <ul>
              <li>Header reads <em>Aura Academy · Clinic front desk · Front desk dashboard</em> and shows your email.</li>
              <li>Six tabs: <kbd>Students</kbd>, <kbd>Calendar</kbd>, <kbd>Payments</kbd>, <kbd>Enrollment register</kbd>, <kbd>Curriculum</kbd>, <kbd>Templates</kbd>. All are scoped to your branch.</li>
            </ul>
            <h4>SPED teachers see the <b>Teacher hub</b> and parents see <b>My profile</b></h4>
            <ul>
              <li>Both land on <code>/profile</code>. Teachers see their own headshot, name, and a card for every class they&rsquo;ve been assigned.</li>
              <li>Parents / students see a four-tab profile: <kbd>Profile</kbd>, <kbd>Payment</kbd>, <kbd>Grades</kbd>, <kbd>Notifications</kbd>.</li>
            </ul>
          </div>

          <h3 className="blockh" id="s-nav">Moving around — the four things on every screen</h3>
          <div className="mod">
            <ul>
              <li><b>The sidebar (left)</b> is your menu. It lists only what your role may open, so a shorter list means a more focused role — nothing is missing. The <b>Aura Academy · Class Portal</b> logo at the top takes you home.</li>
              <li><b>The active nav item</b> is highlighted. When your role is Student, you also see <kbd>Pay tuition</kbd>. When you&rsquo;re Main admin, you also see <kbd>Class Portal Handbook</kbd> (this page).</li>
              <li><b>The user chip (bottom-left)</b> — always shows <em>Signed in · &lt;display name&gt; · &lt;role label&gt;</em> and a <kbd>Sign out</kbd> link. Signing out clears your session and returns you to the marketing home page.</li>
              <li><b>Payment badges</b> — every student profile shows tuition status as one or more coloured badges: <em>Paid for &lt;period&gt;</em> (sage), <em>Due for &lt;period&gt;</em> (rose), <em>Owes for &lt;period&gt;</em> (amber), <em>Pending</em> (blue).</li>
            </ul>
            <div className="note"><b>Inside a module,</b> most screens follow the same pattern: a title and short description at the top; a row of <b>tabs</b> when the module has several views (the active one is highlighted); a <b>search box</b> and <b>filter dropdowns</b> above any list; a big teal <b>primary button</b> (usually <kbd>+ New …</kbd> or <kbd>+ Record payment</kbd>) to create something; and <kbd>Edit</kbd> / <kbd>Delete</kbd> / <kbd>Confirm</kbd> buttons on each row. Creating or editing always opens a <b>modal</b> — a form in a pop-up — with <kbd>Cancel</kbd> to close without saving and a <kbd>Save …</kbd> button to keep your changes. Fields marked <b>*</b> are required.</div>
          </div>

          <h3 className="blockh" id="s-impersonate">View-as impersonation (main admin only)</h3>
          <div className="mod">
            <p className="desc">When a parent or teacher reports something you can&rsquo;t reproduce, sign in <em>as them</em> for a few minutes to see exactly what they see.</p>
            <ol className="steps">
              <li>Open <b>Admin › Users</b>. Find their row.</li>
              <li>Click <kbd>View as</kbd> on the far right. Confirm the popup (&ldquo;Open &lt;email&gt;&rsquo;s portal as them? A red banner across the top will let you return to your admin session. This is logged for audit.&rdquo;).</li>
              <li>The tab reloads into their view. Every action is logged as coming from them.</li>
              <li>A red banner across the top says <b>VIEWING AS &lt;name&gt; (&lt;email&gt;) · &lt;role&gt;</b> with a <kbd>Return to admin →</kbd> button. Click it to end the session.</li>
              <li>Branch-admin rows do not offer <kbd>View as</kbd> — that&rsquo;s deliberate.</li>
            </ol>
          </div>

          <div className="call tip"><span className="lbl">Branch scoping</span>
            Main admin sees <b>every branch</b>. A branch admin, front desk, or a student is tied to <b>one branch</b> (East or Greenhills) and only ever sees that branch&rsquo;s people and data. Server-side enforcement — you can&rsquo;t work around it by editing the URL.
          </div>

          <div className="call rule"><span className="lbl">Missing bearer token — the sign-in glitch</span>
            If any button ever produces the red banner <b>&ldquo;Missing bearer token.&rdquo;</b>, your saved session was cleared behind the scenes. Click <kbd>Sign out</kbd> at the bottom of the sidebar, then sign in again. The classes and admin pages auto-redirect you to sign-in when they detect this, but if you get stuck, the manual sign-out always works.
          </div>
        </section>

        {/* ════════════════ SECTION 2 ════════════════ */}
        <section id="roles" className="hb-section">
          <p className="eyebrow">Section 2</p>
          <h2>Know your role</h2>
          <p>This handbook is written for the five roles that use the portal. Every module in Section 3 is tagged with the roles that can open it using these badges:</p>

          <div className="legend">
            <div className="rc a">
              <h4><span className="badge b-a"><span className="dot">A</span> Main admin</span></h4>
              <div className="who">in-app: ADMIN &nbsp;·&nbsp; the &lsquo;clinic manager&rsquo;</div>
              <p>The single account (<code>main@sapphireclinicseast.org</code>) with total access. Sees and manages every branch, every student, every payment. Only role that can mint another branch admin, edit shared vouchers, and countersign waivers as SCEI.</p>
            </div>
            <div className="rc b">
              <h4><span className="badge b-b"><span className="dot">B</span> Branch admin</span></h4>
              <div className="who">in-app: BRANCH_ADMIN &nbsp;·&nbsp; the &lsquo;HR officer&rsquo;</div>
              <p>Branch-scoped mirror of main admin. Full CRUD on users, students, and payments <b>in their own branch</b>. Cannot delete rows, edit shared voucher codes, create another branch admin, or generate registration letters.</p>
            </div>
            <div className="rc f">
              <h4><span className="badge b-f"><span className="dot">F</span> Front desk</span></h4>
              <div className="who">in-app: FRONTDESK &nbsp;·&nbsp; clinic reception</div>
              <p>Payment-focused, branch-scoped. Takes cash, confirms bank deposits, records payments, and keeps the enrollment register clean. Cannot open the Classes page.</p>
            </div>
            <div className="rc t">
              <h4><span className="badge b-t"><span className="dot">T</span> SPED teacher</span></h4>
              <div className="who">in-app: TEACHER &nbsp;·&nbsp; interns get the same permissions</div>
              <p>Sees the students in their assigned grade levels and branches. Logs lessons, records grades + attendance, creates meetings, signs waivers as witness. No payment access, no user administration.</p>
            </div>
            <div className="rc s">
              <h4><span className="badge b-s"><span className="dot">S</span> Parent / student</span></h4>
              <div className="who">in-app: STUDENT &nbsp;·&nbsp; parents hold the credentials</div>
              <p>Sees only their own child&rsquo;s profile, their own payment history, their assigned classes and meetings, and school-wide announcements for their grade.</p>
            </div>
          </div>

          <div className="call tip"><span className="lbl">Interns count as teachers</span>
            A SPED teacher intern uses the same TEACHER role and has the same permissions as a permanent SPED teacher. The one difference is the account <b>auto-disables 15 days after the end of their internship month</b> — see the <a href="#m-interns">Intern accounts</a> module.
          </div>

          <h3 className="blockh" id="access">Who sees what — at a glance</h3>
          <div className="tablewrap">
            <table className="access">
              <thead>
                <tr>
                  <th>Module / tab</th>
                  <th>Main admin</th>
                  <th>Branch admin</th>
                  <th>Front desk</th>
                  <th>Teacher</th>
                  <th>Parent</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="mod-name">Users (Admin › Users)</td><td className="yes">✓ all</td><td className="part">own branch</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Students (Admin › Students)</td><td className="yes">✓ all</td><td className="part">own branch</td><td className="part">own branch</td><td className="part">assigned grades</td><td className="part">own only</td></tr>
                <tr><td className="mod-name">Payments — record + confirm</td><td className="yes">✓</td><td className="yes">✓</td><td className="yes">✓</td><td className="noc">—</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Payments — delete row</td><td className="yes">✓</td><td className="noc">read only</td><td className="noc">read only</td><td className="noc">—</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Classes (create / edit)</td><td className="yes">✓ all</td><td className="yes">own branch</td><td className="noc">—</td><td className="part">own classes</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Meetings</td><td className="yes">✓</td><td className="yes">✓</td><td className="noc">—</td><td className="yes">own</td><td className="part">joined</td></tr>
                <tr><td className="mod-name">Calendar (event CRUD)</td><td className="yes">✓ all branches</td><td className="yes">own</td><td className="part">read + PDF</td><td className="yes">own</td><td className="part">read</td></tr>
                <tr><td className="mod-name">Notifications / Announcements</td><td className="yes">✓ all</td><td className="yes">own branch</td><td className="noc">—</td><td className="part">to own class</td><td className="part">receive</td></tr>
                <tr><td className="mod-name">Fees — edit tuition</td><td className="yes">✓ all</td><td className="part">own branch</td><td className="noc">read only</td><td className="noc">—</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Shared voucher codes</td><td className="yes">✓</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Personal early-bird voucher</td><td className="yes">issue</td><td className="yes">issue</td><td className="yes">issue</td><td className="noc">—</td><td className="part">receive</td></tr>
                <tr><td className="mod-name">Registration Letter + Fee Schedule PDFs</td><td className="yes">generate</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Assignments (teacher ↔ grade)</td><td className="yes">edit</td><td className="noc">read only</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Impersonation (View as)</td><td className="yes">✓ except other BAs</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Waiver — countersign as SCEI</td><td className="yes">✓</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Waiver — witness signature</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td><td className="yes">✓</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Enrollment register + Excel export</td><td className="yes">✓</td><td className="yes">own</td><td className="yes">own</td><td className="noc">—</td><td className="noc">—</td></tr>
                <tr><td className="mod-name">Pay own tuition (PayMongo)</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td><td className="noc">—</td><td className="yes">✓</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ════════════════ SECTION 3 ════════════════ */}
        <section id="modules" className="hb-section">
          <p className="eyebrow">Section 3</p>
          <h2>The modules, step by step</h2>
          <p>Each tool is a module. They&rsquo;re grouped below by what they help you do. Every card shows who can open it, what you&rsquo;ll see when it opens, what each tab and button does, and a numbered <b>Step by step</b> for its everyday jobs.</p>

          {/* ─────────── People & records ─────────── */}
          <div className="grouphead" id="g-people">People &amp; records</div>
          <div className="cards">

            <div className="mod" id="m-users">
              <div className="mod-top"><h3>Users</h3><span className="loc">Admin › Users</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span> all</span>
                <span className="badge b-b"><span className="dot">B</span> own branch</span>
              </div>
              <p className="desc">Where every staff and student account is created, edited, disabled, or reset. Three stacked cards: the users table, the &ldquo;Create staff account&rdquo; form, and &ldquo;Add teacher from Staff Module&rdquo;.</p>

              <h4>Users table <span className="tag">top card</span></h4>
              <ul>
                <li>Live counts at the top — e.g. <em>84 total · 62 students · 12 teachers · 6 front desk · 4 branch admins</em>.</li>
                <li><kbd>Show passwords</kbd> checkbox — reveals plaintext ONLY for accounts you set or reset on <em>this</em> device. Passwords are bcrypted; a password set on another device is stored as bullets with a &ldquo;Last set by &lt;email&gt; on &lt;date&gt;&rdquo; note.</li>
                <li>Role filter pill bar: <kbd>All · Students · Teachers · Front desk · Branch admins</kbd>.</li>
                <li>Columns: Role · Name · Email · Branch · Password · Level · Created · (row actions). Amber <span className="badge b-f"><span className="dot">i</span></span>-style Intern badge and rose Disabled badge appear where relevant.</li>
              </ul>

              <h4>Row action buttons</h4>
              <ul>
                <li><kbd>Edit</kbd> — opens the Edit user modal. Fields: <b>First name · Last name · Email * · Branch · Grade level</b> (students only) · <b>New password</b> (blank = keep current, min 6).</li>
                <li><kbd>View as</kbd> — impersonation (main admin only; branch admins can&rsquo;t be impersonated).</li>
                <li><kbd>Email reset link</kbd> — sends a one-shot password-reset link with a 24-hour token.</li>
                <li><kbd>Enable</kbd> / <kbd>Disable</kbd> — main admin only. Disabling hides the row from teacher and front-desk listings and blocks sign-in. Re-enable any time.</li>
                <li><kbd>Delete</kbd> — main admin only. Hard-deletes the account plus every linked payment / document / enrollment. Use <b>Disable</b> instead when a student is leaving mid-year.</li>
              </ul>

              <h4>Reset Password modal</h4>
              <p>Click <kbd>Reset</kbd> in the Password column to open. Body copy warns &ldquo;The current password can&rsquo;t be retrieved. Setting a new one will overwrite it. Copy the value before closing — it&rsquo;s only shown to you.&rdquo; The <kbd>New password</kbd> field is pre-filled by a <kbd>Generate</kbd> button. Save with <kbd>Save new password</kbd>. Hand the new value over out-of-band.</p>

              <h4>Create staff account <span className="tag">middle card</span></h4>
              <ol className="steps">
                <li>Pick a <kbd>Role</kbd>. Main admin sees <em>Teacher / Front desk / Branch admin</em>; branch admin sees <em>Teacher / Front desk</em> only.</li>
                <li>Pick a <kbd>Branch</kbd> (disabled + preset for branch admins).</li>
                <li>Fill <kbd>First name</kbd>, <kbd>Last name</kbd>, <kbd>Email *</kbd>, and either type a <kbd>Password *</kbd> or click <kbd>Generate</kbd>.</li>
                <li>Click <kbd>Create &lt;role&gt;</kbd> (e.g. &ldquo;Create teacher&rdquo;). The success toast shows the plaintext password — copy it before dismissing.</li>
              </ol>

              <h4>Add teacher from Staff Module <span className="tag">bottom card</span></h4>
              <p>Mirrors HR Hub&rsquo;s active SPED teacher + intern list so you don&rsquo;t retype anyone.</p>
              <ol className="steps">
                <li>Filter by branch and search by name / job title / email.</li>
                <li>Find the row. If they already have an account, action shows <em>Account exists</em>. Otherwise click <kbd>Create account</kbd>.</li>
                <li>The row expands into a password input + <kbd>Save</kbd> · <kbd>Cancel</kbd>. Type / generate a password and save.</li>
                <li>Success toast reads <em>&ldquo;Intern teacher account created for &lt;name&gt; (&lt;branch&gt;). Auto-disables &lt;date&gt;. Password: &lt;pw&gt;&rdquo;</em> for interns, or &ldquo;Teacher account …&rdquo; for regular staff.</li>
              </ol>
              <div className="note"><b>Interns auto-disable</b> 15 days after the end of their internship-end month (e.g. Aug 31 contract → Sep 15 auto-disable). See the <a href="#m-interns">Intern accounts</a> module.</div>
            </div>

            <div className="mod" id="m-students">
              <div className="mod-top"><h3>Students</h3><span className="loc">Admin › Students &nbsp;·&nbsp; Front desk › Students</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span> all</span>
                <span className="badge b-b"><span className="dot">B</span> own branch</span>
                <span className="badge b-f"><span className="dot">F</span> own branch</span>
                <span className="badge b-t"><span className="dot">T</span> assigned grades</span>
              </div>
              <p className="desc">The list of every enrolled student, and — clicking any row — a full-screen detail drawer with identity, learner profile, documents, payments, grades, and auto-generated PDFs.</p>

              <h4>List page</h4>
              <ul>
                <li>Header <em>Students · All enrolled students.</em> Search input on the right.</li>
                <li>Columns: Name · Email · Level · Branch · <b>Plan</b> (coloured Annual / Bi-annual / Monthly / — pill) · Enrolled · <b>Payment</b> (Paid / Due / Pending / No payment yet).</li>
                <li>Row click opens the detail drawer.</li>
              </ul>

              <h4>Detail drawer — header</h4>
              <ul>
                <li><kbd>← Back to list</kbd> on the left.</li>
                <li>Right side (main admin only): either <kbd>Sign as SCEI</kbd> or a <span className="badge b-s"><span className="dot">✓</span> SCEI countersigned</span> badge with a hover-tooltip showing the signer + date.</li>
                <li><kbd>×</kbd> close in the top-right.</li>
              </ul>

              <h4>Detail drawer — stacked cards</h4>
              <ol className="steps">
                <li><b>Identity + tuition status</b> — headshot, name, email, inline grade-level editor (<kbd>Change</kbd>), badge stack for past-paid / past-due / current-period. Main-admin-only <kbd>Record PayMongo payment</kbd> button appears here for students with zero prior payments.</li>
                <li><b>Learner profile</b> — school year, LRN status + number, PSA Birth Cert No., DOB, sex, mother tongue, religion, diagnosis, LSEN classification, address, parents, guardian, phone numbers. Header actions: <kbd>Update LRN</kbd>, <kbd>Set / Update LSEN classification</kbd>, <kbd>Edit enrollment</kbd> (opens the full enrollment editor).</li>
                <li><b>Submitted documents</b> — each row: <kbd>View</kbd> · <kbd>Download</kbd> · <kbd>Re-upload</kbd>. Bottom picker lets staff add missing documents.</li>
                <li><b>Other Documents</b> — auto-generated PDFs. Each has <kbd>View</kbd> + <kbd>Download PDF</kbd>: Enrollment Form (Annex 2) · Parent Waiver · School ID · School Registration Letter (main admin) · Schedule of Fees (main admin) · Personal Vouchers · Plan-switch balance calculator (main admin) · Form 137 / SF10.</li>
                <li><b>Grades</b> — only when a grade record exists. Q1 / Q2 / Q3 / Q4 / Year Avg tiles.</li>
              </ol>

              <h4>Sign as SCEI form</h4>
              <p>Main admin clicks <kbd>Sign as SCEI</kbd> in the drawer header. Fields: <kbd>Printed name</kbd> and a <kbd>Signature</kbd> canvas. Buttons: <kbd>Cancel</kbd> · <kbd>Sign &amp; regenerate PDF</kbd>. Signing regenerates the waiver PDF with SCEI&rsquo;s acknowledgment embedded and re-uploads it.</p>
            </div>

          </div>

          {/* ─────────── Classes & instruction ─────────── */}
          <div className="grouphead" id="g-classes">Classes &amp; instruction</div>
          <div className="cards">

            <div className="mod" id="m-classes">
              <div className="mod-top"><h3>Classes</h3><span className="loc">sidebar › Classes</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span> all</span>
                <span className="badge b-b"><span className="dot">B</span> own branch</span>
                <span className="badge b-t"><span className="dot">T</span> assigned only</span>
                <span className="badge b-s"><span className="dot">S</span> own</span>
              </div>
              <p className="desc">A 2-column card grid of every class you can see. Teachers see only their assigned classes; admins see all. Front desk cannot open this page.</p>

              <h4>List page</h4>
              <ul>
                <li>Top-right button: <kbd>+ Add Class</kbd> (main admin, branch admin, teacher).</li>
                <li>Each card: 16:9 cover photo (or &ldquo;No cover photo&rdquo;), class title + optional section, meta line <em>Grade level · Branch · Teacher</em>, schedule line like <em>&ldquo;Mon, Wed · 08:00–09:30 · 12 students&rdquo;</em>.</li>
                <li>Row buttons: <kbd>Open</kbd> · <kbd>Edit</kbd> (if permitted) · <kbd>Delete</kbd>.</li>
              </ul>

              <h4>Create / Edit class modal</h4>
              <ol className="steps">
                <li>Click <kbd>+ Add Class</kbd>. The modal opens over a dark backdrop.</li>
                <li>Type a <kbd>Class name</kbd> (placeholder &ldquo;e.g. Math A&rdquo;) and optional <kbd>Section</kbd> (&ldquo;e.g. Falcons&rdquo;).</li>
                <li>Pick <kbd>Branch</kbd> (disabled when editing) and <kbd>Grade level</kbd> (14 options).</li>
                <li>Tap the day pills for <kbd>Schedule</kbd> and set <kbd>Start time</kbd> / <kbd>End time</kbd>.</li>
                <li>Optional <kbd>Cover photo</kbd> — button label swaps between <kbd>Choose photo</kbd> and <kbd>Replace photo</kbd>. A <kbd>Clear</kbd> text button appears once a file is picked.</li>
                <li>Tick students in the <kbd>Roster</kbd> checklist (auto-filtered to branch × level).</li>
                <li>Click <kbd>Create class</kbd> (or <kbd>Save changes</kbd> when editing). If it fails, the red banner shows the real server message — no more generic &ldquo;Could not save. Retry?&rdquo;</li>
              </ol>
            </div>

            <div className="mod" id="m-class-detail">
              <div className="mod-top"><h3>Class detail dashboard</h3><span className="loc">Classes › any card › Open</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span></span>
                <span className="badge b-t"><span className="dot">T</span></span>
                <span className="badge b-s"><span className="dot">S</span> read</span>
              </div>
              <p className="desc">A single dashboard — no tabs — with four inline sections in a two-column layout.</p>

              <h4>Top row</h4>
              <ul>
                <li><b>Left (2/3):</b> 200 px cover thumbnail · <kbd>← All classes</kbd> back link · class title with inline <kbd>Edit</kbd> · meta lines (level + branch, teacher, schedule) · <b>Students (N)</b> panel with bulleted roster (scrolls at 180 px).</li>
                <li><b>Right (1/3):</b> three KPI tiles — <em>Classes completed · Students · Avg attendance</em>.</li>
                <li>Inline meta editor changes name, section, days, and times. Branch and level are locked.</li>
              </ul>

              <h4>Day&rsquo;s lessons feed</h4>
              <p>Left column (3/5 width). Header <em>Day&rsquo;s lessons · Add a lesson, take attendance, mark grades, collect proofs.</em> Top-right <kbd>+ Add Day&rsquo;s Lesson</kbd>. Each card: date, title, description, and stats <em>&ldquo;N/roster present · Graded out of X · Outputs collected&rdquo;</em>. Row buttons: <kbd>Edit</kbd> (or <kbd>View</kbd>) and <kbd>Delete</kbd>.</p>

              <h4>Lesson editor modal — the sections</h4>
              <ul>
                <li><b>Details</b> — Date (with scheduled-day hint) · Title · Description textarea.</li>
                <li><b>Attachments</b> — visible after first save. <kbd>+ Add files</kbd> for multiple PDFs / Word / Excel. Row buttons: <kbd>View</kbd> · <kbd>Delete</kbd>.</li>
                <li><b>Attendance</b> — hidden for students. Per-student <kbd>Present</kbd> / <kbd>Absent</kbd> pill toggles.</li>
                <li><b>Class output / test</b> — tickbox <em>&ldquo;Has class output / test?&rdquo;</em>. When ticked, a <kbd>Total points</kbd> field appears, plus a per-student row: score <em>[  ] / total</em> + <kbd>Proof</kbd> upload (label swaps to <kbd>Replace</kbd>) + <span className="badge b-f"><span className="dot">•</span></span> Pending badge for queued photos + <kbd>View</kbd> button. Absent students appear below a divider with an extra makeup-date input.</li>
                <li><b>Tests / Exams</b> — after first save. <kbd>+ Add test / exam</kbd> reveals title + total points + <kbd>Add</kbd> / <kbd>Cancel</kbd>. Each test card has a score grid with autosave-on-blur.</li>
              </ul>

              <h4>Projects (right column top)</h4>
              <p>Card header <em>Projects · Standalone graded projects with deadlines and per-student proof uploads.</em> + <kbd>+ Add Project</kbd>. Each project card: title, meta <em>&ldquo;Total: X pts · Due &lt;date&gt;&rdquo;</em>, description, buttons <kbd>View</kbd> / <kbd>Edit</kbd> / <kbd>Delete</kbd>. Project editor: <em>Title · Total score · Deadline · Description · per-student grades + proof</em>.</p>

              <h4>Activities (right column bottom)</h4>
              <p>Card header <em>Activities · School events, field trips, IEP reviews, holidays.</em> + <kbd>+ Add Activity</kbd>. Each card: name + optional type pill, meta <em>date range · N photos</em>, description, 6-photo thumbnail preview with <kbd>+N more</kbd>. Activity editor: <em>Name · Type</em> (dropdown with an &ldquo;Other (specify)…&rdquo; option that reveals a text input) · <em>From date · To date · Description · + Add photos</em> (supports pre-save queuing).</p>
            </div>

            <div className="mod" id="m-meetings">
              <div className="mod-top"><h3>Meetings</h3><span className="loc">sidebar › Meetings</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span></span>
                <span className="badge b-t"><span className="dot">T</span> own</span>
                <span className="badge b-s"><span className="dot">S</span> tagged</span>
              </div>
              <p className="desc">Video meetings hosted on <code>meet.sapphireclinicseast.org</code> (our own LiveKit deployment). Anyone with the link joins straight into the room; the in-meeting toolbar offers <b>Cloud Record</b>, <b>Broadcast</b>, and a <b>Whiteboard</b>. Tag students to keep the meeting visible on their portal.</p>

              <h4>List page</h4>
              <ul>
                <li>Top-right: <kbd>+ New meeting</kbd> (teacher / admin / branch admin).</li>
                <li>Search input <em>&ldquo;Title, teacher, tagged student, or date&rdquo;</em>, and a <kbd>Show cancelled (N)</kbd> checkbox that appears only when at least one is cancelled.</li>
                <li>Columns: Title · Scheduled · Teacher · Tagged · Link · (actions).</li>
              </ul>

              <h4>The Link column</h4>
              <ul>
                <li><kbd>Open meeting</kbd> — opens in a new tab.</li>
                <li>Staff sees BOTH: <kbd>🎥 Copy host link</kbd> (sage; tooltip &ldquo;Host link (KEEP PRIVATE): join as moderator — unlocks Broadcast + Cloud Record + Whiteboard controls&rdquo;) and <kbd>Copy guest link</kbd> (paper; &ldquo;Guest link — safe to share with students/parents. They can Cloud Record from inside the meeting&rdquo;).</li>
                <li>Students see only <kbd>Copy guest link</kbd>.</li>
              </ul>

              <h4>Cancel vs Delete</h4>
              <ul>
                <li><kbd>Cancel</kbd> — soft-cancel. Row stays but shows a red <em>Cancelled</em> badge; join buttons disappear.</li>
                <li><kbd>Delete</kbd> — hard-delete. Row is wiped forever.</li>
              </ul>

              <h4>Create meeting modal</h4>
              <ol className="steps">
                <li>Click <kbd>+ New meeting</kbd>. Header eyebrow <em>New meeting · meet.sapphireclinicseast.org</em>, title <em>Schedule a video meeting</em>.</li>
                <li>Type a <kbd>Title</kbd> (&ldquo;e.g. Grade 1 Math review&rdquo;) and optional <kbd>Notes</kbd>.</li>
                <li>Set <kbd>Starts at</kbd> (default = now + 5 min) and <kbd>Duration</kbd> (30 min / 45 min / 1 h / 1½ h / 2 h / 3 h).</li>
                <li>Optionally tick students under <kbd>Tag students</kbd>. The list is scoped to your assigned branch × level pairs.</li>
                <li>Click <kbd>Create meeting</kbd>. Toast confirms &ldquo;Meeting &lsquo;&lt;title&gt;&rsquo; created. Share the link with your students or copy it from the row.&rdquo;</li>
              </ol>

              <div className="call rule"><span className="lbl">LiveKit tokens can&rsquo;t be recalled</span>
                Once you share a guest link with someone, cancelling or deleting the meeting does NOT revoke it. The meet app keeps accepting it until the scheduled end time. To be safe, cancel <b>before</b> you share, or only share the guest link through the Meetings page itself (which fetches a fresh, revocable link each time).
              </div>
            </div>

            <div className="mod" id="m-calendar">
              <div className="mod-top"><h3>Calendar</h3><span className="loc">sidebar › Calendar</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span></span>
                <span className="badge b-f"><span className="dot">F</span></span>
                <span className="badge b-t"><span className="dot">T</span></span>
                <span className="badge b-s"><span className="dot">S</span></span>
              </div>
              <p className="desc">A 7-column month grid of school events, plus a per-branch academic-calendar PDF upload. All events are branch-scoped.</p>

              <h4>What you&rsquo;ll see</h4>
              <ul>
                <li>Month grid with today highlighted in a white-on-narra pill. Up to 3 event pills per cell; more become <em>&ldquo;+N more&rdquo;</em>.</li>
                <li>A colour legend under the grid for the 5 event types: <em>Event · Field trip · Holiday · Classes cancelled · IEP review</em>.</li>
                <li>Click any date cell to open the <b>Day view</b> panel below with <kbd>+ Add event</kbd> and <kbd>Close</kbd>.</li>
                <li>Main admin + teacher see a branch toggle <kbd>East</kbd> / <kbd>Greenhills</kbd>. Other roles are locked server-side.</li>
              </ul>

              <h4>Add / Edit event modal</h4>
              <ol className="steps">
                <li>Header: <em>New event · &lt;branch&gt;</em> or <em>Edit event · &lt;branch&gt;</em>.</li>
                <li>Fill <kbd>Title *</kbd>, pick <kbd>Type</kbd> (Event / Field trip / Holiday / Classes cancelled / IEP review), set <kbd>Date</kbd> and optional <kbd>End date</kbd>.</li>
                <li>Optionally add a <kbd>Description</kbd> (&ldquo;Notes parents should see…&rdquo;).</li>
                <li>Click <kbd>Add event</kbd> or <kbd>Save changes</kbd>.</li>
              </ol>

              <h4>Per-branch academic-calendar PDF</h4>
              <p>Below the grid: <em>&lt;branch&gt; calendar PDF: &lt;name&gt; · uploaded &lt;date&gt; by &lt;uploader&gt;</em> or <em>&ldquo;Not uploaded yet.&rdquo;</em> Buttons: <kbd>View / download</kbd> · <kbd>Upload PDF</kbd> (or <kbd>Replace PDF</kbd>) · <kbd>Remove</kbd>. This is the official calendar handed out at enrollment.</p>
            </div>

            <div className="mod" id="m-curriculum">
              <div className="mod-top"><h3>Curriculum</h3><span className="loc">Admin › Curriculum</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span></span>
                <span className="badge b-f"><span className="dot">F</span></span>
                <span className="badge b-t"><span className="dot">T</span> read</span>
              </div>
              <p className="desc">Per-grade curriculum templates (Word / PDF / Excel) that teachers and front desk can download.</p>
              <h4>Upload flow</h4>
              <ol className="steps">
                <li>Fill <kbd>Title</kbd>, pick a <kbd>Grade level</kbd>.</li>
                <li>Attach up to three file variants — each with <kbd>Choose</kbd> / <kbd>Change</kbd> / <kbd>Remove</kbd>: <em>PDF · Word · Excel</em>.</li>
                <li>Click <kbd>Save curriculum</kbd>.</li>
              </ol>
              <h4>Browse</h4>
              <p>Search input <em>&ldquo;Search by title, file name, uploader, or grade&rdquo;</em> · <kbd>Reset &amp; resync</kbd>. Curricula are grouped into collapsible per-grade sections. Each row has format chips with <kbd>↗</kbd> to open and <kbd>↓</kbd> to download, plus <kbd>Delete</kbd> for main admin or the uploader.</p>
            </div>

            <div className="mod" id="m-templates">
              <div className="mod-top"><h3>Templates</h3><span className="loc">Admin › Templates</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span></span>
                <span className="badge b-f"><span className="dot">F</span></span>
              </div>
              <p className="desc">Free-form template library (IEP forms, lesson plans, parent letters). Same layout as Curriculum but only two file slots (<em>PDF</em> and <em>Word</em>) and no grade level.</p>
            </div>

          </div>

          {/* ─────────── Payments & fees ─────────── */}
          <div className="grouphead" id="g-payments">Payments &amp; fees</div>
          <div className="cards">

            <div className="mod" id="m-payments">
              <div className="mod-top"><h3>Payments</h3><span className="loc">Admin › Payments &nbsp;·&nbsp; Front desk › Payments</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span></span>
                <span className="badge b-f"><span className="dot">F</span></span>
              </div>
              <p className="desc">The busiest module. Six stacked sub-panels in order: <em>Pending confirmations · Confirmed Payments · Pending payments — by deadline · Paying students (consolidated) · No payment record yet · Automated payment reminders</em>.</p>

              <h4>Pending confirmations</h4>
              <ul>
                <li>Rows are payments the front desk has recorded but not yet confirmed.</li>
                <li>Top-right: <kbd>+ Record payment</kbd> and <kbd>Refresh</kbd>.</li>
                <li>Columns: Student · Plan · Period · Method · Branch · Amount · Submitted · Action.</li>
                <li><b>Method</b> is an inline select — change it any time before confirming. Options: <em>Frontdesk: Cash / Credit Card / Debit Card / GCash / PayMaya · Bank deposit · PayMongo</em>.</li>
                <li>Row actions: <kbd>Confirm payment</kbd> (primary) · <kbd>Edit</kbd> · <kbd>Delete</kbd> (main admin only).</li>
              </ul>

              <h4>Confirmed Payments</h4>
              <ul>
                <li>Search input <em>&ldquo;Search name, email, plan, period, method, branch&rdquo;</em> and counter <em>N/total total</em>.</li>
                <li>Same columns plus <em>Confirmed at</em>. Status is always <span className="badge b-s"><span className="dot">✓</span> Paid</span>.</li>
                <li>Row actions: <kbd>Edit</kbd> · <kbd>Delete</kbd> (main admin).</li>
              </ul>

              <h4>Record payment modal <span className="tag">Front-desk override</span></h4>
              <ol className="steps">
                <li>Pick the <kbd>Student</kbd> from the branch-scoped dropdown (format <em>Last, First · Branch · Level</em>).</li>
                <li>Pick the <kbd>Payment method</kbd>: Frontdesk payment / Bank deposit / PayMongo.</li>
                <li>When method = Frontdesk payment, pick a <kbd>Frontdesk payment type</kbd>: Cash / Credit Card / Debit Card / GCash / PayMaya.</li>
                <li>Pick <kbd>Plan</kbd> (Monthly / Bi-annual / Annual).</li>
                <li>Type <kbd>Amount paid (PHP)</kbd> as a plain number (no commas).</li>
                <li>Use the <kbd>Period covered</kbd> picker — see the Golden rule about period text.</li>
                <li>Optionally type a receipt / deposit-slip / PayMongo reference (the label morphs to the method).</li>
                <li>Click <kbd>Record payment</kbd>. Success alert reminds you to click <kbd>Confirm payment</kbd> once the money is verified.</li>
              </ol>

              <div className="call rule"><span className="lbl">PayMongo records DO NOT auto-confirm from this flow</span>
                When staff records a payment as PayMongo via this modal, it&rsquo;s a bookkeeping entry for a receipt already collected. The row lands as PENDING and you must click <kbd>Confirm payment</kbd> for the student&rsquo;s badge to flip. Forgetting is the #1 cause of &ldquo;parent paid but portal says Due&rdquo; tickets.
              </div>

              <h4>Edit payment modal</h4>
              <p>Header: <em>Edit payment · reconcile with accounting hub · &lt;student&gt;</em>. Sub-line shows email · branch · status · classPortalPaymentId. Fields: <em>Amount paid · Method · Frontdesk payment type · Plan · Period covered · Submitted at · Confirmed at · Remarks / accounting-hub reference</em>. Setting <kbd>Confirmed at</kbd> on a pending row auto-flips its status to CONVERTED.</p>

              <h4>Pending payments — by deadline</h4>
              <ul>
                <li>Every student who owes, closest deadline first. Overdue rows go rose with an &ldquo;overdue&rdquo; tag.</li>
                <li>Search input <em>&ldquo;Search by name, email, plan, or branch&rdquo;</em>.</li>
                <li>Columns include <b>Proof</b> (a <kbd>View</kbd> button when a bank slip is uploaded, else &mdash;) and <b>Remind</b>.</li>
                <li><kbd>🔔 Remind</kbd> — appears for overdue rows only. Sends an ad-hoc reminder email immediately (<em>Sending…</em> → <em>✓ Sent</em> for 4 seconds). Every send logged below.</li>
              </ul>

              <h4>Paying students (consolidated)</h4>
              <p>Filter pills: <kbd>All</kbd> / <kbd>Annual</kbd> / <kbd>Bi-annual</kbd> / <kbd>Monthly</kbd>. Selecting <em>Bi-annual</em> reveals <kbd>1st Biannual</kbd> / <kbd>2nd Biannual</kbd>; selecting <em>Monthly</em> reveals a month dropdown. The status pill recomputes per slice.</p>

              <h4>Automated payment reminders log</h4>
              <p>Filters: <kbd>Window</kbd> (Last 7 / 30 / 90 / 365 days) and search. Below, a <em>&lt;details&gt;</em> block per period (e.g. &ldquo;August 2026&rdquo;) with rows: Student · Branch · Plan · Reminder (<em>5-day heads-up</em> / <em>Due tomorrow</em> / <em>Past due</em> / <em>Manual reminder</em>) · Sent at.</p>

              <div className="call tip"><span className="lbl">The period-text rule (short version)</span>
                MONTHLY needs a specific month like <code>August 2026</code>. BI-ANNUAL needs <code>First half SY 2026–2027</code> or <code>Second half…</code>. ANNUAL doesn&rsquo;t care about the text. Vague periods like <code>2026-2027</code> or <code>AY 2026-2027</code> do NOT mark any specific month as paid. See Section 6 for the golden rule.
              </div>
            </div>

            <div className="mod" id="m-fees">
              <div className="mod-top"><h3>Fees + vouchers</h3><span className="loc">Admin › Fees</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span> own branch</span>
              </div>
              <p className="desc">Two panels: <em>Tuition + fees</em> (both roles can edit their own branch) and <em>Voucher codes</em> (main admin only).</p>

              <h4>Tuition + fees</h4>
              <ul>
                <li>One card per branch you can edit. Each card has an H3 with the branch name and a &ldquo;Last updated &lt;timestamp&gt; by &lt;email&gt;&rdquo; line.</li>
                <li>Six ₱ inputs: <em>Tuition — Annual · Bi-annual · Monthly</em> and <em>Misc — Annual · Bi-annual · Monthly</em>.</li>
                <li>Optional <em>Other line items</em> with <kbd>+ Add item</kbd>. Each extra: Label · Amount · Notes · <kbd>Remove</kbd>.</li>
                <li><kbd>Save fees</kbd>. Every <code>/pay</code> checkout and every plan-switch calculator picks up the new numbers on next load.</li>
              </ul>

              <h4>Shared voucher codes (main admin only)</h4>
              <p>Bulk editor: rows of <em>Code · Discount % · Valid until · Active</em> + <kbd>Remove</kbd>. Footer: <kbd>+ Add voucher</kbd> · <kbd>Save vouchers</kbd>. Untick <b>Active</b> to pause a code without deleting — the audit trail is worth keeping. Codes are case-insensitive.</p>

              <h4>Personal early-bird vouchers</h4>
              <p>Below a divider, a read-only table of every per-student code minted across the school: Student · Branch · Code (click to copy) · Discount · Valid until · Status · Issued by. Codes are issued from the student profile (see <a href="#m-vouchers">Personal Vouchers</a>).</p>
            </div>

            <div className="mod" id="m-vouchers">
              <div className="mod-top"><h3>Personal Vouchers</h3><span className="loc">student profile › Other Documents</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span> issue</span>
                <span className="badge b-b"><span className="dot">B</span> issue</span>
                <span className="badge b-f"><span className="dot">F</span> issue</span>
                <span className="badge b-s"><span className="dot">S</span> view</span>
              </div>
              <p className="desc">The public AURA30 code expired mid-year, but monthly / bi-annual parents who availed of the early bird still need to keep discounting their remaining installments. Personal vouchers solve that.</p>
              <ol className="steps">
                <li>Open the student&rsquo;s profile detail drawer.</li>
                <li>Scroll to <b>Personal Vouchers</b> in Other Documents.</li>
                <li>Click <kbd>+ Issue AURA30 early-bird voucher</kbd>. A unique code (format <code>AURA30-FIRSTNAME-6RAND</code>) is minted, locked to that student, valid through May 31.</li>
                <li>The code auto-applies on the student&rsquo;s <code>/pay</code> page — parents don&rsquo;t have to type it. You can also share it verbally.</li>
              </ol>
            </div>

            <div className="mod" id="m-plan-switch">
              <div className="mod-top"><h3>Plan-switch balance calculator</h3><span className="loc">student profile › Other Documents</span></div>
              <div className="mod-roles"><span className="badge b-a"><span className="dot">A</span> only</span></div>
              <p className="desc">When a parent asks to switch plans mid-year, this card computes the exact balance owed.</p>
              <ol className="steps">
                <li>Open the student profile → <b>Plan change · Switch payment plan</b>.</li>
                <li>Pick the target plan from the dropdown.</li>
                <li>If a live personal voucher exists, tick <kbd>Apply &lt;N&gt;% voucher</kbd>.</li>
                <li>Read the balance breakdown live: target-plan tuition · less voucher discount (green) · plus misc · = <b>Gross on new plan</b> · less already paid (green) · = <b>Balance to collect</b>.</li>
                <li>Take that number to <em>Payments › + Record payment</em>. Pick the target plan, enter the balance, use a clear period like <em>&ldquo;First half SY 2026–2027 (plan change credit)&rdquo;</em>.</li>
                <li>Confirm the row. The student&rsquo;s inferred plan flips to the new one; every future badge and reminder uses the new logic.</li>
              </ol>
            </div>

            <div className="mod" id="m-promissory">
              <div className="mod-top"><h3>Promissory notes</h3><span className="loc">Admin › Payments · Front desk › Payments</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span></span>
                <span className="badge b-f"><span className="dot">F</span></span>
              </div>
              <p className="desc">A finance-office artefact: signed PDF or photo notes a parent files when they can&rsquo;t settle a payment on time but commit to a specific catch-up schedule. The subsection sits at the bottom of the Payments tab and is <b>hidden from teachers and parents entirely</b> (both UI and server-side).</p>

              <h4>What you&rsquo;ll see</h4>
              <ul>
                <li>One card per student in your branch who has at least one promissory note on file (branch admin + front desk see their own branch; main admin sees everyone).</li>
                <li>A <kbd>Search student by name or email</kbd> box and a <kbd>+ Add note for a student</kbd> picker — tick a student from the dropdown and their card appears below with an <kbd>+ Upload note</kbd> button, even when they have no notes yet.</li>
                <li>Per-student counter: <em>N/5 notes</em>. The system <b>hard-caps at 5 notes per student</b> — a sixth upload is rejected with a nudge to delete one first.</li>
              </ul>

              <h4>Step by step — upload a promissory note</h4>
              <ol className="steps">
                <li>Open <em>Admin › Payments</em> (or <em>Front desk › Payments</em>). Scroll to <b>Promissory notes</b> at the bottom of the tab.</li>
                <li>If the student already has notes, their card is visible. Otherwise click <kbd>+ Add note for a student</kbd> and pick them from the dropdown.</li>
                <li>Click <kbd>+ Upload note</kbd>. Pick a PDF or an image. Max <b>100 MB</b> per file.</li>
                <li>The row appears immediately with <kbd>View</kbd>, <kbd>Download</kbd>, and <kbd>Delete</kbd> buttons. The counter ticks up.</li>
              </ol>

              <h4>Field reference</h4>
              <table className="fields">
                <tbody>
                  <tr><td>Allowed file types</td><td>PDF (<code>application/pdf</code>) or any image MIME. The server rejects everything else with 415.</td></tr>
                  <tr><td>Max file size</td><td>100 MB per note. Rejected with 413 above the cap.</td></tr>
                  <tr><td>Max notes per student</td><td>5. Hard cap — the sixth upload is rejected with 409.</td></tr>
                  <tr><td>Branch scoping</td><td>Branch admin + front desk can only touch notes for their own branch. Main admin sees every branch.</td></tr>
                  <tr><td>Who sees it</td><td>Only ADMIN, BRANCH_ADMIN, and FRONTDESK. Teachers and parents are blocked both in the UI (the card isn&rsquo;t rendered) and server-side (the endpoint returns 403).</td></tr>
                </tbody>
              </table>

              <div className="note"><b>Why cap at 5?</b> More than five commitments against the same tuition means we&rsquo;re accepting too many promises for the same balance. The cap is a forcing function to escalate the conversation instead of letting the file grow silently. Delete a settled note before uploading a new one.</div>
            </div>

          </div>

          {/* ─────────── Documents & compliance ─────────── */}
          <div className="grouphead" id="g-docs">Documents &amp; compliance</div>
          <div className="cards">

            <div className="mod" id="m-documents">
              <div className="mod-top"><h3>Documents</h3><span className="loc">student profile › Submitted documents</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span></span>
                <span className="badge b-f"><span className="dot">F</span></span>
                <span className="badge b-t"><span className="dot">T</span> LRN + Form 137</span>
                <span className="badge b-s"><span className="dot">S</span> own uploads</span>
              </div>
              <p className="desc">Everything the parent uploads or the school issues, per student, in one card.</p>
              <h4>Document keys</h4>
              <ul>
                <li>PSA Birth Certificate</li>
                <li>Child&rsquo;s 1×1 Photo (for student ID)</li>
                <li>Parent / Guardian Valid ID</li>
                <li>PWD ID (if applicable)</li>
                <li>Latest Report Card / SF9 (Form 138) — Grade 1+ only</li>
                <li>Certificate of Good Moral Character — Grade 1+ only</li>
                <li>Medical / developmental / therapy reports</li>
                <li>DepEd Affidavit of Undertaking (Annex 3)</li>
                <li>Form 137 / SF10 — staff-uploaded (main admin + teacher)</li>
              </ul>
              <h4>Per-row buttons</h4>
              <p><kbd>View</kbd> · <kbd>Download</kbd> · <kbd>Re-upload</kbd>. Bottom of the card has a picker to add missing documents — dropdown of unfilled keys + <kbd>Upload file</kbd>.</p>
            </div>

            <div className="mod" id="m-waiver">
              <div className="mod-top"><h3>Waiver</h3><span className="loc">/waiver (parent) &nbsp;·&nbsp; student profile (staff)</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span> SCEI signature</span>
                <span className="badge b-t"><span className="dot">T</span> witness</span>
                <span className="badge b-s"><span className="dot">S</span> parent signature</span>
              </div>
              <p className="desc">Three-stage signing flow. The generated PDF ends up on the student&rsquo;s profile.</p>
              <ol className="steps">
                <li><b>Parent signs</b> — via <code>/waiver</code>. Fills 8 sections (student, guardian, fetchers, emergency + medical, initials for 15 acknowledgments, photo-release radio, signatures), clicks <kbd>Sign &amp; generate waiver PDF</kbd>. The PDF downloads automatically.</li>
                <li><b>Teacher countersigns as witness</b> — on the student&rsquo;s detail drawer, the assigned SPED teacher clicks <kbd>Sign as witness</kbd>, draws her signature, saves.</li>
                <li><b>Main admin countersigns for SCEI</b> — same drawer header, click <kbd>Sign as SCEI</kbd>, fill in printed name + signature, click <kbd>Sign &amp; regenerate PDF</kbd>. Badge flips to <span className="badge b-s"><span className="dot">✓</span> SCEI countersigned</span>.</li>
              </ol>
              <div className="note"><b>Signatures sync across devices.</b> Sign on a phone, open the same student on your laptop — the auto-sync pushes the stranded signature to the server. Only re-sign if a device has been fully cleared.</div>
            </div>

            <div className="mod" id="m-reg-letter">
              <div className="mod-top"><h3>School Registration Letter</h3><span className="loc">student profile › Other Documents</span></div>
              <div className="mod-roles"><span className="badge b-a"><span className="dot">A</span> only</span></div>
              <p className="desc">Auto-generated PDF for DepEd / school-transfer requests. Signed by HANNAH JARA (CEO).</p>
              <ol className="steps">
                <li>Open the <b>School Registration Letter</b> sub-card in Other Documents.</li>
                <li>Type a <kbd>Purpose</kbd> — staff-editable, default is <em>reimbursement purposes</em>. Live preview updates the certification line.</li>
                <li>Tick <kbd>Student availed of the 30% Early Bird Discount</kbd> if applicable — the tuition breakdown shows base → less 30% → net.</li>
                <li>Click <kbd>View</kbd> to preview in a new tab, or <kbd>Download PDF</kbd>. Each press mints a fresh <code>AURA-REG-YYYY-NNNN</code> reference and the footer shows <em>&ldquo;Last issued: … on &lt;date&gt;&rdquo;</em>.</li>
              </ol>
              <div className="note"><b>Precondition:</b> the student needs at least one payment record for the current SY. Without it, the buttons are disabled and the card shows &ldquo;No payment records yet…&rdquo;</div>
            </div>

            <div className="mod" id="m-fee-schedule">
              <div className="mod-top"><h3>Schedule of Fees</h3><span className="loc">student profile › Other Documents</span></div>
              <div className="mod-roles"><span className="badge b-a"><span className="dot">A</span> only</span></div>
              <p className="desc">Annual breakdown (tuition + ₱5,000 misc) plus the three payment plan options with each tranche pre-computed. Buttons: <kbd>View</kbd> · <kbd>Download PDF</kbd>. Same payment-record precondition as the registration letter.</p>
            </div>

            <div className="mod" id="m-admission">
              <div className="mod-top"><h3>Admission tracker</h3><span className="loc">class.sapphireclinicseast.org/admission</span></div>
              <div className="mod-roles"><span className="badge b-b"><span className="dot">P</span> partner school (access code)</span></div>
              <p className="desc">Not sign-in gated — uses a partner-school access code kept in <code>localStorage['scei_admission_code_v1']</code>. This is what LBCA (Light Bearer Christian Academy, our DepEd partner) uses to see the enrollment roster.</p>
              <h4>Access-code gate</h4>
              <p>First visit shows a password-type input <em>&ldquo;Enter code&rdquo;</em> and a <kbd>View admission list</kbd> submit button. Once accepted, the code is remembered on that browser.</p>
              <h4>Toolbar</h4>
              <p>Search input · Grade-level dropdown · <kbd>Clear</kbd> · <kbd>Refresh</kbd> · <kbd>Excel</kbd> export · <kbd>Sign out</kbd>.</p>
              <h4>Grid</h4>
              <p>Branch tabs <b>East Branch (N)</b> / <b>Greenhills Branch (N)</b>. Only PAID students appear; disabled accounts hidden. Every row is a full DepEd enrollment record with inline editors:</p>
              <ul>
                <li><b>LRN</b> — for NO_LRN rows, an inline 12-digit input that validates on blur (regex <code>^\d{'{'}12{'}'}$</code>).</li>
                <li><b>LSEN classification</b> — grouped select using the DepEd LIS rubric.</li>
                <li><b>LIS status</b>, <b>Remittance</b>, <b>Comments / Remarks</b> — inline selects / text.</li>
              </ul>
              <p>Documents columns (yellow-tinted): Enrollment Form · Parent Waiver · DepEd Affidavit · Report Card/SF9 · PSA Birth Cert · Form 137/SF10, each with <kbd>View</kbd> + <kbd>↓</kbd>.</p>
            </div>

          </div>

          {/* ─────────── Communications ─────────── */}
          <div className="grouphead" id="g-comms">Communications</div>
          <div className="cards">

            <div className="mod" id="m-announcements">
              <div className="mod-top"><h3>Announcements</h3><span className="loc">Admin › Notifications</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span></span>
                <span className="badge b-t"><span className="dot">T</span> to own class</span>
                <span className="badge b-s"><span className="dot">S</span> receive</span>
              </div>
              <p className="desc">Reach everyone in the target grade levels; optionally teachers too. Posters + PDFs supported; email blast is a single click.</p>

              <h4>Compose</h4>
              <ol className="steps">
                <li>Click <kbd>New announcement</kbd>.</li>
                <li>Type a <kbd>Title</kbd> and body in <kbd>Details</kbd>.</li>
                <li>Optionally attach a poster image or PDF: <kbd>+ Add poster or PDF</kbd> (<kbd>Replace attachment</kbd> to swap, <kbd>Remove</kbd> to drop). Preview appears below.</li>
                <li>Tick the target <kbd>Grade levels</kbd> — leave all blank for school-wide.</li>
                <li>(Main admin) tick <kbd>Also notify teachers</kbd>.</li>
                <li>Click <kbd>Publish</kbd>. It appears in every targeted recipient&rsquo;s Notifications tab.</li>
              </ol>

              <h4>View + email blast</h4>
              <ul>
                <li>List rows show the title with 📎 <em>Poster</em> chip (if attached) and ✉ <em>Emailed · N</em> chip (if a blast was sent). Click <kbd>View</kbd> to open the modal.</li>
                <li><kbd>Send Email</kbd> / <kbd>Send email again</kbd> — main admin + teacher only. Confirm dialog notes if already emailed. Success toast lists the per-role / per-level recipient breakdown.</li>
                <li><kbd>Delete announcement</kbd> — main admin any, teacher only their own authored posts.</li>
              </ul>
            </div>

          </div>

          {/* ─────────── Setup & lifecycle ─────────── */}
          <div className="grouphead" id="g-setup">Setup &amp; lifecycle</div>
          <div className="cards">

            <div className="mod" id="m-grade-levels">
              <div className="mod-top"><h3>Grade Levels</h3><span className="loc">Admin › Grade Levels</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span></span>
                <span className="badge b-b"><span className="dot">B</span></span>
              </div>
              <p className="desc">Open or close individual grades for new enrolment without affecting existing students at that level.</p>
              <p>A grid of 14 tiles (Nursery, Kinder, Grade 1 … Grade 12). Each tile shows the label, live count + status (<em>&ldquo;4 enrolled · Open for enrollment&rdquo;</em> green, or <em>&ldquo;4 enrolled · Closed for new enrollees&rdquo;</em> red), and a <kbd>Disable</kbd> / <kbd>Enable</kbd> toggle button.</p>
            </div>

            <div className="mod" id="m-assignments">
              <div className="mod-top"><h3>Assignments</h3><span className="loc">Admin › Assignments</span></div>
              <div className="mod-roles">
                <span className="badge b-a"><span className="dot">A</span> edit</span>
                <span className="badge b-b"><span className="dot">B</span> read only</span>
              </div>
              <p className="desc">The teacher ↔ grade matrix. Only the main admin can edit; branch admins see it read-only with a tooltip saying so.</p>
              <p>Table: teacher name · branch · 14 short-labelled columns (N · K · G1 … G12). Each cell is a checkbox that auto-saves on click. Every teacher gets one row per branch you can see.</p>
              <div className="note"><b>Why it matters:</b> teachers only see students enrolled in the branches AND grades they&rsquo;re assigned to. An unticked cell means an invisible student to that teacher.</div>
            </div>

            <div className="mod" id="m-interns">
              <div className="mod-top"><h3>Intern accounts — auto-disable lifecycle</h3><span className="loc">Admin › Users &nbsp;·&nbsp; cron: intern-lifecycle</span></div>
              <div className="mod-roles"><span className="badge b-a"><span className="dot">A</span> lifecycle</span></div>
              <p className="desc">SPED teacher interns get identical class-portal permissions to permanent teachers, but their accounts auto-disable 15 days after the end of their internship month.</p>

              <h4>Creating an intern account</h4>
              <ol className="steps">
                <li>Confirm HR has created their staff record in HR Hub with employment type = <em>Intern</em> and a contract-end date filled in.</li>
                <li>In the class portal: <em>Admin › Users › Add teacher from Staff Module</em>.</li>
                <li>Filter by branch, find the row. Role cell shows an <span className="badge b-f"><span className="dot">i</span> Intern</span> badge; Contract-end column shows the date with a tooltip <em>&ldquo;Auto-disables &lt;date&gt;&rdquo;</em>.</li>
                <li>Click <kbd>Create account</kbd>. Type or generate a password. <kbd>Save</kbd>. Success toast confirms the auto-disable date.</li>
              </ol>

              <div className="call tip"><span className="lbl">Auto-disable math</span>
                <b>Auto-disable date</b> = first day of the month AFTER the contract-end month, PLUS 15 days. Example: contract ends <em>August 31, 2026</em> → auto-disable on <em>September 15, 2026</em> at 00:00 Manila time.
              </div>

              <h4>What the cron does</h4>
              <ul>
                <li>A daily cron endpoint (<code>/api/public/class-portal/cron/intern-lifecycle</code>) selects every intern (isIntern=true, role=TEACHER, linkedStaffId present) whose 15-day grace has passed and stamps <code>disabledAt = now</code>, <code>disabledBy = &quot;cron:intern-lifecycle&quot;</code>.</li>
                <li>Skips already-disabled rows (idempotent), rows without a linked staff, and rows without a contract on file (with a counter).</li>
                <li>Also disables interns whose HR record was set to inactive early (early termination).</li>
              </ul>

              <h4>Re-enabling after a contract extension</h4>
              <ol className="steps">
                <li>Ask HR to update the contract-end date in HR Hub.</li>
                <li>Main admin: Users → find the intern → <kbd>Enable</kbd>. They can sign in again.</li>
                <li>The cron respects the new end date and won&rsquo;t touch them until the new end + 15.</li>
              </ol>
            </div>

            <div className="mod" id="m-enroll-funnel">
              <div className="mod-top"><h3>Enrollment funnel — what a new parent sees</h3><span className="loc">/ → /enroll → /documents → /account-setup → /pay</span></div>
              <div className="mod-roles"><span className="badge b-s"><span className="dot">S</span> public</span></div>
              <p className="desc">The 5-step public flow a first-time parent follows from landing page to enrolled + paid.</p>
              <ol className="steps">
                <li><b>Step 1 — Landing</b> (<code>/</code>). Parent picks a branch tile and a grade level. Closed grades are disabled with a tooltip.</li>
                <li><b>Step 2 — Learner profile</b> (<code>/enroll</code>). Long single-page form: School year &amp; LRN · Student info · Address · Parent/Guardian info · Returning/transferee · Certification. All text auto-uppercases.</li>
                <li><b>Step 3 — Documents</b> (<code>/documents</code>). Uploads PSA Birth Cert, 1×1 Photo, Parent ID, PWD ID, Report Card + Good Moral (graded). Opens <code>/waiver</code> popup for parent signing. Each row has a <kbd>QR upload</kbd> button that generates a per-device QR code — parent scans on their phone, files appear on desktop within seconds.</li>
                <li><b>Step 4 — Account setup</b> (<code>/account-setup</code>). Parent sets a password. Then a &ldquo;Pay tuition fee →&rdquo; / &ldquo;Go to my profile&rdquo; choice.</li>
                <li><b>Step 5 — Pay</b> (<code>/pay</code>). Fee schedule + tuition-obligation policy + plan picker + voucher + method (PayMongo / cash / bank).</li>
              </ol>
              <div className="note"><b>QR upload:</b> parent&rsquo;s phone scans the QR, opens the public <code>/upload/&lt;token&gt;</code> page, takes a photo or picks a PDF. Desktop polls and shows live status <em>Waiting → Receiving → ✓ Got it. Closing…</em></div>
            </div>

          </div>
        </section>

        {/* ════════════════ SECTION 4 ════════════════ */}
        <section id="connect" className="hb-section">
          <p className="eyebrow">Section 4</p>
          <h2>Connected systems — where data flows</h2>
          <p>The class portal is one of four connected systems inside Sapphire Clinics East. It shares data automatically through secure system-to-system links, so information entered once doesn&rsquo;t have to be re-typed elsewhere. This map shows what the class portal <b>supplies</b> to each system and what it <b>receives</b> back.</p>

          <div className="hubwrap">
            <svg
              viewBox="0 0 720 560"
              style={{ width: '100%', height: 'auto', maxHeight: 620, display: 'block' }}
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-labelledby="cs-title cs-desc"
            >
              <title id="cs-title">Class Portal connected systems map</title>
              <desc id="cs-desc">The class portal at the center connects two-way with Operations Hub (its backend + database), receives the staff roster from HR Hub one-way, publishes confirmed payments to Accounting Hub one-way, and mints signed meeting URLs into meet.sapphireclinicseast.org one-way.</desc>
              <defs>
                <marker id="cs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
                </marker>
              </defs>
              <line x1="360" y1="130" x2="360" y2="200" stroke="#94a3b8" strokeWidth="1.6" markerStart="url(#cs-arrow)" markerEnd="url(#cs-arrow)" />
              <line x1="220" y1="270" x2="260" y2="270" stroke="#94a3b8" strokeWidth="1.6" markerEnd="url(#cs-arrow)" />
              <line x1="460" y1="270" x2="500" y2="270" stroke="#94a3b8" strokeWidth="1.6" markerEnd="url(#cs-arrow)" />
              <line x1="360" y1="340" x2="360" y2="400" stroke="#94a3b8" strokeWidth="1.6" markerEnd="url(#cs-arrow)" />

              <rect x="260" y="200" width="200" height="140" rx="12" fill="#0E4A46" />
              <text x="360" y="256" textAnchor="middle" fontSize="20" fontWeight="700" fill="#ffffff">CLASS PORTAL</text>
              <text x="360" y="284" textAnchor="middle" fontSize="11.5" fill="#a7f3d0">class.sapphireclinicseast.org</text>
              <text x="360" y="308" textAnchor="middle" fontSize="10.5" fill="#94a3b8">students · classes · meetings</text>

              <rect x="240" y="40" width="240" height="90" rx="10" fill="#ffffff" stroke="#D6E2DE" strokeWidth="1" />
              <text x="360" y="78" textAnchor="middle" fontSize="15" fontWeight="700" fill="#16302E">Operations Hub</text>
              <text x="360" y="98" textAnchor="middle" fontSize="11" fill="#6A7B78">backend · database · APIs</text>
              <text x="360" y="116" textAnchor="middle" fontSize="10" fill="#94a3b8">operations.sapphireclinicseast.org</text>

              <rect x="20" y="215" width="200" height="110" rx="10" fill="#ffffff" stroke="#D6E2DE" strokeWidth="1" />
              <text x="120" y="250" textAnchor="middle" fontSize="15" fontWeight="700" fill="#16302E">HR Hub</text>
              <text x="120" y="270" textAnchor="middle" fontSize="11" fill="#6A7B78">staff · payroll · contracts</text>
              <text x="120" y="290" textAnchor="middle" fontSize="10" fill="#94a3b8">hr.sapphireclinicseast.org</text>
              <text x="120" y="312" textAnchor="middle" fontSize="9.5" fill="#157A72" fontStyle="italic">(Staff Module read)</text>

              <rect x="500" y="215" width="200" height="110" rx="10" fill="#ffffff" stroke="#D6E2DE" strokeWidth="1" />
              <text x="600" y="250" textAnchor="middle" fontSize="15" fontWeight="700" fill="#16302E">Accounting Hub</text>
              <text x="600" y="270" textAnchor="middle" fontSize="11" fill="#6A7B78">POS · books · GL</text>
              <text x="600" y="290" textAnchor="middle" fontSize="10" fill="#94a3b8">accounting.sapphireclinicseast.org</text>
              <text x="600" y="312" textAnchor="middle" fontSize="9.5" fill="#157A72" fontStyle="italic">(payments post out)</text>

              <rect x="240" y="400" width="240" height="90" rx="10" fill="#ffffff" stroke="#D6E2DE" strokeWidth="1" />
              <text x="360" y="438" textAnchor="middle" fontSize="15" fontWeight="700" fill="#16302E">meet.sapphireclinicseast.org</text>
              <text x="360" y="458" textAnchor="middle" fontSize="11" fill="#6A7B78">LiveKit video rooms + Cloud Record</text>
              <text x="360" y="476" textAnchor="middle" fontSize="9.5" fill="#157A72" fontStyle="italic">(signed meeting URLs)</text>

              <text x="372" y="168" fontSize="10" fill="#6A7B78" fontStyle="italic">every request round-trips</text>
              <text x="240" y="262" fontSize="10" fill="#6A7B78" fontStyle="italic" textAnchor="end">staff roster</text>
              <text x="480" y="262" fontSize="10" fill="#6A7B78" fontStyle="italic">confirmed payments → POS Order</text>
              <text x="372" y="376" fontSize="10" fill="#6A7B78" fontStyle="italic">&ldquo;+ New meeting&rdquo; mints a signed link</text>

              <text x="360" y="530" textAnchor="middle" fontSize="11" fill="#6A7B78">⇌ two-way automatic sync&nbsp;&nbsp;·&nbsp;&nbsp;→ one-way (arrow shows direction of data)</text>
            </svg>
            <p className="hub-legend">The class portal at the center of the ecosystem. Operations Hub is its backend — every screen you see is a browser client of this hub&rsquo;s APIs.</p>
          </div>

          <div className="conn">
            <div className="conn-head"><h3>Operations Hub</h3><span className="loc">operations.sapphireclinicseast.org</span></div>
            <p>Same app family, same database. The class portal container (<code>sapphire_class_portal</code>) is a UI shell; the Operations Hub container (<code>sapphire_app</code>) is the source of truth for everything the class portal shows.</p>
            <div className="flowgrid">
              <div className="flowcol supplies">
                <div className="flow-lbl">Class portal supplies</div>
                <ul>
                  <li>Every user, student, payment, and file the class portal creates lands in the shared database.</li>
                  <li>Sign-in tokens are issued by Operations Hub; every class-portal request carries one.</li>
                  <li>Meetings and cover photos are stored in Operations Hub&rsquo;s file store.</li>
                </ul>
              </div>
              <div className="flowcol receives">
                <div className="flow-lbl">Class portal receives</div>
                <ul>
                  <li>Every screen renders from Operations Hub APIs (<code>/api/public/class-portal/*</code>).</li>
                  <li>PayMongo webhooks land here first, then the class portal reads them.</li>
                  <li>The daily reminder cron runs on Operations Hub and writes to <code>ClassPortalPaymentReminderLog</code>.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="conn">
            <div className="conn-head"><h3>Accounting Hub</h3><span className="loc">accounting.sapphireclinicseast.org</span></div>
            <p>Books, POS, GL, inventory, payroll ledger. Runs on its own database and its own container (<code>accounting_app</code>) so a class-portal issue never touches the financials.</p>
            <div className="flowgrid">
              <div className="flowcol supplies">
                <div className="flow-lbl">Class portal supplies</div>
                <ul>
                  <li>Each <b>Confirm payment</b> click creates an <em>Order</em> in Accounting Hub POS with tuition + misc + method — that&rsquo;s how the cash lands on the P&amp;L.</li>
                </ul>
              </div>
              <div className="flowcol receives">
                <div className="flow-lbl">Class portal receives (manual)</div>
                <ul>
                  <li>PayMongo payout reconciliation stays in Accounting Hub&rsquo;s bank register (net of MDR).</li>
                  <li>To reverse a payment: delete it in the class portal AND void the corresponding Order in Accounting Hub. Deleting the class-portal row alone does not void the Order.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="conn">
            <div className="conn-head"><h3>HR Hub</h3><span className="loc">hr.sapphireclinicseast.org</span></div>
            <p>Staff directory, payroll cutoffs, uniforms, seminars, peer evaluations, forms library. Vanilla HTML/JS app, separate from the Next.js hubs.</p>
            <div className="flowgrid">
              <div className="flowcol receives">
                <div className="flow-lbl">Class portal receives</div>
                <ul>
                  <li>The <em>Add teacher from Staff Module</em> card pulls the active SPED teacher + intern roster (including employment type + contract-end date).</li>
                  <li>Contract-end date drives the intern auto-disable schedule.</li>
                </ul>
              </div>
              <div className="flowcol supplies">
                <div className="flow-lbl">Class portal supplies (manual mirror)</div>
                <ul>
                  <li>Nothing auto-syncs back. When a teacher resigns, set them Separated in HR AND Disable their class-portal user.</li>
                  <li>Uniform / seminar / peer-eval admin stays entirely in HR Hub.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="conn">
            <div className="conn-head"><h3>meet.sapphireclinicseast.org</h3><span className="loc">meet.sapphireclinicseast.org</span></div>
            <p>Our LiveKit deployment (own app, own port). Handles the actual video conferencing — Broadcast, Cloud Record, Whiteboard. Every room is joined via a signed URL that expires with the meeting.</p>
            <div className="flowgrid">
              <div className="flowcol supplies">
                <div className="flow-lbl">Class portal supplies</div>
                <ul>
                  <li>When a teacher clicks <b>+ New meeting</b>, the class portal mints a fresh signed host + guest URL for the room and stores them in <code>ClassPortalMeeting</code>.</li>
                  <li>The tagged-students list is stored so the meeting appears on their portals.</li>
                </ul>
              </div>
              <div className="flowcol receives">
                <div className="flow-lbl">Class portal receives</div>
                <ul>
                  <li>Cloud recordings stay in the meet app for now (planned follow-up: expose them inside the meeting row).</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="call tip"><span className="lbl">Two external services support the ecosystem from outside</span>
            <b>PayMongo</b> is the payment gateway — the class portal redirects parents to a hosted checkout, and PayMongo posts back a webhook on success. <b>Resend</b> delivers every transactional email (announcements, payment reminders, receipts). Neither is a &ldquo;hub&rdquo; you sign into, so they aren&rsquo;t in the map above; they&rsquo;re invoked by the Operations Hub on the class portal&rsquo;s behalf.
          </div>
        </section>

        {/* ════════════════ SECTION 5 ════════════════ */}
        <section id="play" className="hb-section">
          <p className="eyebrow">Section 5</p>
          <h2>Role playbooks — a typical day</h2>
          <p>Five short playbooks — one per role — summarising the rhythm of a normal day. Read your own first; skim the others so you know what your colleagues are looking at when they hand you a ticket.</p>

          <div className="play a">
            <h3><span className="badge b-a"><span className="dot">A</span> Main admin</span></h3>
            <ol>
              <li><b>Sweep your inbox for parent tickets</b> — payment questions, waiver questions, document requests.</li>
              <li><b>Open Admin › Payments › Pending confirmations</b>. Confirm anything the front desk queued yesterday; the row moves to Confirmed Payments and the badge flips.</li>
              <li><b>Check Pending payments — by deadline</b>. Anyone in the rose &ldquo;overdue&rdquo; band gets a nudge — click <kbd>🔔 Remind</kbd> to send a manual email if the cron hasn&rsquo;t already.</li>
              <li><b>Answer parent tickets from the Students tab.</b> Click a name, resolve the question from the drawer — Record PayMongo payment, issue a personal voucher, run the plan-switch calculator, generate a registration letter — everything is one card away.</li>
              <li><b>Countersign waivers</b> — anyone showing <em>Sign as SCEI</em> in the drawer header gets one signature and one PDF re-upload.</li>
              <li><b>End of day:</b> peek at Fees + shared vouchers only if something changed; otherwise leave them alone.</li>
            </ol>
          </div>

          <div className="play b">
            <h3><span className="badge b-b"><span className="dot">B</span> Branch admin</span></h3>
            <ol>
              <li><b>Confirm any pending payments</b> your front desk logged yesterday.</li>
              <li><b>Add newly-hired teachers</b> via Users → <em>Add teacher from Staff Module</em>. Interns show the amber badge and the auto-disable date.</li>
              <li><b>Handle payment quirks</b> — a parent asks to switch plans, or misses a month. Everything runs from the student profile: plan-switch calculator, edit period text on a payment row.</li>
              <li><b>Post announcements</b> for your branch through Notifications.</li>
              <li>If a parent needs a voucher, issue a <b>personal early-bird voucher</b> from their profile.</li>
              <li>Anything main-admin-only (registration letters, shared voucher edits) → ping main admin.</li>
            </ol>
          </div>

          <div className="play f">
            <h3><span className="badge b-f"><span className="dot">F</span> Front desk</span></h3>
            <ol>
              <li><b>Take walk-in payments.</b> For each: Payments → <kbd>+ Record payment</kbd> → student, method, plan, amount, period. Watch the period text.</li>
              <li><b>Confirm bank deposits</b> that landed overnight. Match to the parent&rsquo;s uploaded slip in the Proof column, then <kbd>Confirm payment</kbd>.</li>
              <li><b>Keep the Enrollment register clean.</b> Fill LRNs the moment a parent brings the document. Mark NO_LRN via the LRN Status dropdown for those still waiting.</li>
              <li><b>Answer parent walk-ins.</b> Open their student on the Students tab; the drawer has every document, every payment, every badge.</li>
              <li><b>End of day:</b> Excel export the Enrollment register if the branch admin asks; otherwise leave it.</li>
            </ol>
          </div>

          <div className="play t">
            <h3><span className="badge b-t"><span className="dot">T</span> SPED teacher (incl. interns)</span></h3>
            <ol>
              <li><b>Open your assigned classes</b> from the sidebar. Each card is your day&rsquo;s home.</li>
              <li><b>Add today&rsquo;s lesson</b> — click <kbd>+ Add Day&rsquo;s Lesson</kbd>, mark attendance, tick <em>Has class output / test?</em>, enter scores, snap proof photos.</li>
              <li><b>Log activities</b> — field trip, IEP review, holiday. Photos can be queued before the activity is created.</li>
              <li><b>Sign witness waivers</b> — any student showing <em>Sign as witness</em> in their drawer needs one signature from you.</li>
              <li><b>Host a meeting</b> — <kbd>+ New meeting</kbd> in the Meetings tab, tag your students, copy the guest link into your class group chat.</li>
              <li><b>Post class announcements</b> for anything urgent — reminders, homework, changes.</li>
            </ol>
          </div>

          <div className="play s">
            <h3><span className="badge b-s"><span className="dot">S</span> Parent / student</span></h3>
            <ol>
              <li><b>Check your badge.</b> Sign in → your profile card at the top-right shows Paid / Due / Owes. If it says <em>Due</em>, click <kbd>Pay tuition fee →</kbd>.</li>
              <li><b>Pay tuition.</b> Sidebar → <kbd>Pay tuition</kbd> → pick a plan → your personal voucher auto-applies → pick <em>PayMongo</em> (instant), <em>Front desk cash</em>, or <em>Bank deposit</em>.</li>
              <li><b>Sign the waiver</b> if you haven&rsquo;t. Documents → <kbd>Sign waiver →</kbd> opens the popup. Save. The teacher countersigns witness; the main admin countersigns SCEI.</li>
              <li><b>Upload documents</b> the front desk asked for from the Submitted documents card.</li>
              <li><b>Join your child&rsquo;s meetings</b> via the guest link in the Meetings tab.</li>
              <li><b>Read school announcements</b> under the Notifications tab.</li>
            </ol>
          </div>
        </section>

        {/* ════════════════ SECTION 6 ════════════════ */}
        <section id="rules" className="hb-section">
          <p className="eyebrow">Section 6</p>
          <h2>Golden rules</h2>

          <div className="call rule"><span className="lbl">The period text must name a month</span>
            Monthly tuition is only credited to a specific month when the period field explicitly names it (<code>August 2026</code>, <code>Aug 2026</code>, or a range like <code>Back balance · June–August 2026</code>). Vague periods like <code>2026-2027</code> or <code>AY 2026-2027</code> stay in payment history but do NOT flip any month&rsquo;s badge. Bi-annual needs <em>First half</em> / <em>Second half</em>; annual doesn&rsquo;t care about the text.
          </div>

          <div className="call rule"><span className="lbl">PayMongo record ≠ auto-confirm</span>
            When staff record a payment as PayMongo via <kbd>+ Record payment</kbd>, it lands PENDING — that&rsquo;s a bookkeeping entry, not a live checkout. You still have to click <kbd>Confirm payment</kbd> for the badge to flip. Actual PayMongo checkouts from <code>/pay</code> auto-flip because the webhook fires.
          </div>

          <div className="call rule"><span className="lbl">Disable, don&rsquo;t delete</span>
            When a student is leaving or a teacher is resigning, <kbd>Disable</kbd> keeps their history intact. <kbd>Delete</kbd> hard-deletes them plus every linked payment / document / enrollment, and it&rsquo;s irreversible. Only delete test rows.
          </div>

          <div className="call rule"><span className="lbl">Never email a password</span>
            Passwords are handed over in person, on a secure message channel, or via a password manager. If you have to reset one, use <kbd>Email reset link</kbd> — the link is one-shot and expires in 24 hours.
          </div>

          <div className="call rule"><span className="lbl">Branch privacy</span>
            A branch admin, front desk, or teacher sees only their assigned branch. This is server-enforced. If you genuinely need cross-branch data, ask the main admin.
          </div>

          <div className="call rule"><span className="lbl">Delete a payment ≠ void the accounting Order</span>
            Removing a Confirmed Payment row in the class portal does not void the corresponding Order in Accounting Hub. Do both when you&rsquo;re actually reversing.
          </div>

          <div className="call rule"><span className="lbl">LiveKit tokens can&rsquo;t be recalled</span>
            Once a guest meeting link is shared, cancelling or deleting the meeting doesn&rsquo;t revoke it. Cancel BEFORE you share, or only share through the Meetings page (which fetches a fresh link each time).
          </div>

          <div className="call tip"><span className="lbl">If a screen looks empty</span>
            A short sidebar or a blank list usually means your role is correctly scoped — not that something broke. If you truly can&rsquo;t reach something you need, ask the main admin, who can change your role in <b>Access</b>.
          </div>
        </section>

        {/* ════════════════ SECTION 7 ════════════════ */}
        <section id="help" className="hb-section">
          <p className="eyebrow">Section 7</p>
          <h2>Help</h2>
          <p>Answers to the questions people ask most, and a search box that finds any word in this handbook and takes you to it.</p>

          <h3 className="blockh" id="faq">Frequently asked questions</h3>
          <div className="faq">

            <details id="faq-missing"><summary>A tab or button I need isn&rsquo;t on my screen.</summary><div className="a">
              <p>The sidebar and every tab bar show only what your role may open — nothing is hidden by accident. Compare against the <a href="#access">Who sees what</a> table. If you truly need it, ask the main admin, who can change your role in Users.</p>
            </div></details>

            <details id="faq-token"><summary>I get &ldquo;Missing bearer token.&rdquo; when I click a button.</summary><div className="a">
              <p>Your device&rsquo;s saved sign-in token was cleared (second tab signed out, or an earlier request expired). Click <kbd>Sign out</kbd> at the bottom of the sidebar, then sign in again. If it keeps happening, open DevTools → Application → Local Storage → <code>class.sapphireclinicseast.org</code>, delete both <code>scei_class_token_v1</code> AND <code>scei_class_auth_v1</code>, then sign in fresh.</p>
            </div></details>

            <details id="faq-class-create"><summary>A teacher says she can&rsquo;t create a class — a red banner appears.</summary><div className="a">
              <p>The red banner now shows the actual server error (as of 2026-09). Read the wording:</p>
              <ul>
                <li><em>&ldquo;Missing bearer token.&rdquo;</em> — session desync. Sign out + back in.</li>
                <li><em>&ldquo;Only teachers and admins can create classes.&rdquo;</em> — the user&rsquo;s role isn&rsquo;t TEACHER. Have main admin check Users → Edit.</li>
                <li><em>&ldquo;branch, level, and name are required.&rdquo;</em> — a dropdown didn&rsquo;t submit a value. Refresh and retry.</li>
                <li><em>&ldquo;Out of branch scope.&rdquo;</em> — branch admin trying to create in another branch.</li>
              </ul>
            </div></details>

            <details id="faq-paid-due"><summary>A parent paid via PayMongo but the portal still says Due.</summary><div className="a">
              <p>Two possible causes, both fixable in seconds:</p>
              <ol>
                <li><b>Front desk recorded it as PayMongo but forgot to Confirm.</b> Admin → Payments → Pending confirmations → find the row → click <kbd>Confirm payment</kbd>. Badge flips on next refresh.</li>
                <li><b>The PayMongo webhook didn&rsquo;t fire.</b> Confirm the row manually via the same button, then check that PayMongo has the correct webhook URL for the branch.</li>
              </ol>
            </div></details>

            <details id="faq-due-paid"><summary>A payment badge says Due for August 2026 but they paid in August.</summary><div className="a">
              <p>Almost always a period-text problem. Payments → Confirmed Payments → <kbd>Edit</kbd> on that row → check the period. If it says <code>2026-2027</code> or <code>AY 2026-2027</code>, change it to <code>August 2026</code> and save.</p>
            </div></details>

            <details id="faq-owes"><summary>A student&rsquo;s badge shows &ldquo;Owes for June 2026&rdquo; but they only enrolled in July.</summary><div className="a">
              <p>The system assumes every monthly student was on the plan for the whole SY. Two fixes:</p>
              <ul>
                <li>If the parent still owes June — collect the back balance. <code>/pay</code> shows a lump-sum callout.</li>
                <li>If the parent has a waiver for June — record a zero-amount payment for June with the period <code>June 2026</code> and a note. That clears the badge and leaves an audit trail.</li>
              </ul>
            </div></details>

            <details id="faq-plan-switch"><summary>How do I switch a student from Monthly to Bi-annual mid-year?</summary><div className="a">
              <p>Use the Plan-switch balance calculator on the student profile (main admin only) — see <a href="#m-plan-switch">that module</a>. It computes the exact balance to collect; you then Record + Confirm one payment under the new plan.</p>
            </div></details>

            <details id="faq-reverse"><summary>How do I reverse a confirmed payment?</summary><div className="a">
              <p>Deleting the row in the class portal does NOT void the corresponding accounting Order. If you&rsquo;re actually reversing:</p>
              <ol>
                <li>Delete the row in <em>Class portal → Payments → Confirmed Payments</em> (main admin only).</li>
                <li>Open <em>Accounting Hub → POS</em>, find the same Order, and void it there too.</li>
              </ol>
              <p>The <code>classPortalPaymentId</code> in the Edit modal is the cross-reference.</p>
            </div></details>

            <details id="faq-waiver-desync"><summary>A teacher signed the waiver as witness but my view still shows it as unsigned.</summary><div className="a">
              <p>Fixed 2026-08 — waiver signatures now sync across devices. If it&rsquo;s still stuck, ask the teacher to open that student&rsquo;s profile once from any device where she signed. The auto-sync will push the signature. If her device was fully cleared, she&rsquo;ll have to re-sign.</p>
            </div></details>

            <details id="faq-letter"><summary>The registration letter button is greyed out.</summary><div className="a">
              <p>Registration Letter and Schedule of Fees both require the student to have at least one payment record for the current SY. Record one (even a small one), then generate.</p>
            </div></details>

            <details id="faq-meet-cancel"><summary>I cancelled a meeting but people can still join.</summary><div className="a">
              <p>LiveKit signed tokens can&rsquo;t be recalled. Once you shared the guest link, the meet app keeps accepting it until the meeting&rsquo;s scheduled end time. Cancel BEFORE you share, or only share through the Meetings page (which mints a fresh link each time).</p>
            </div></details>

            <details id="faq-meet-tagged"><summary>A student says they don&rsquo;t see the meeting on their portal.</summary><div className="a">
              <p>Check the meeting&rsquo;s <b>Tagged</b> column. If it says <em>&ldquo;— everyone with link&rdquo;</em>, no one&rsquo;s tagged, so it won&rsquo;t appear on any student&rsquo;s portal (only the shared link works). Edit the meeting and tick their name to make it appear.</p>
            </div></details>

            <details id="faq-intern-extend"><summary>An intern got auto-disabled but their contract was extended.</summary><div className="a">
              <ol>
                <li>Ask HR to update the contract-end date in HR Hub.</li>
                <li>Main admin: Users → find the intern → <kbd>Enable</kbd>. They can sign in again.</li>
                <li>The intern-lifecycle cron respects the new date and won&rsquo;t touch them until end + 15.</li>
              </ol>
            </div></details>

            <details id="faq-branch"><summary>Front desk says they can&rsquo;t see a student they know is enrolled.</summary><div className="a">
              <p>Front desk is branch-scoped. If the student is enrolled at the OTHER branch, front desk at their branch can&rsquo;t see them. Confirm the student&rsquo;s Branch in Admin → Users.</p>
            </div></details>

            <details id="faq-cache"><summary>I don&rsquo;t see a change I know was deployed.</summary><div className="a">
              <p>Browser cached the old bundle. Hard-refresh: Cmd + Shift + R on Mac, Ctrl + Shift + R on Windows / Linux. iOS Safari: close the tab and re-open it. If it&rsquo;s still stale after a hard-refresh, the deploy hasn&rsquo;t actually landed — give it another 5 minutes.</p>
            </div></details>

            <details id="faq-copy"><summary>Can I keep a copy of this handbook?</summary><div className="a">
              <p>Yes — use <b>🖨 Save as PDF</b> or <b>⬇ Download as Word</b> at the top of this page. Both include every section (the search box is left out).</p>
            </div></details>
          </div>

          <h3 className="blockh" id="search">Word search</h3>
          <div className="hb-search">
            <label htmlFor="hb-query">Type a word or phrase — a button name, a module, a field, anything.</label>
            <input
              id="hb-query"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Confirm payment, PayMongo, Missing bearer, intern, waiver…"
              autoComplete="off"
              aria-label="Search the handbook"
            />
            <p className="hint">Results list every place the words appear, with the section they&rsquo;re in. Click one to jump there; matches are highlighted on the page.</p>
            {hits.length > 0 && (
              <ul className="sr-list" aria-live="polite">
                {hits.map((h, i) => (
                  <li key={`${h.id}-${i}`}>
                    <a href={`#${h.id}`}>
                      <span className="where">{h.section}{h.head ? ` › ${h.head}` : ''}</span>
                      <span className="snip">{h.snippet}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {showEmpty && <p className="sr-empty">No matches. Try a shorter word, or the name as it appears on screen.</p>}
          </div>
        </section>

        </div>
      </div>
    </div>
  )
}
