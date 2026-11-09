'use client'

import { useMemo, useState } from 'react'
import { Download, Printer, Search, X } from 'lucide-react'
import { SECTIONS, type Section } from './handbookContent'
import { HR_PAGE_CLASS, HR_PAGE_STYLE } from '@/components/ui/hr-look'

/* ------------------------------------------------------------------ */
/*  Accounting Hub — User Handbook.                                    */
/*  Format mirrors the HR Portal handbook (hr.…/modules/handbook):     */
/*  masthead → sticky contents rail → numbered parts → module cards,   */
/*  in the HR Hub palette (paper, green-grey lines, Aura green).       */
/*  Edit content in handbookContent.ts, not here.                      */
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

/* The handbook's six parts, HR-handbook style. Sections fall into a part by
   id (the framing chapters) or by group (every module screen lands in P3). */
const MODULE_GROUPS = ['Overview', 'General Ledger', 'Transactions', 'Planning & Analysis', 'Administration']
const PARTS: { key: string; title: string; ids?: string[]; groups?: string[] }[] = [
  { key: 'start', title: 'Getting started', ids: ['welcome', 'signing-in', 'getting-around', 'buttons'] },
  { key: 'roles', title: 'Know your role', ids: ['roles'] },
  { key: 'modules', title: 'The modules, step by step', groups: MODULE_GROUPS },
  { key: 'connect', title: 'Connected systems', ids: ['connections'] },
  { key: 'rules', title: 'Rules & good practice', ids: ['good-practice'] },
  { key: 'help', title: 'Help & FAQ', ids: ['faq'] },
]
function partSections(p: (typeof PARTS)[number]): Section[] {
  if (p.ids) return p.ids.map((id) => SECTIONS.find((s) => s.id === id)).filter((s): s is Section => !!s)
  return SECTIONS.filter((s) => p.groups!.includes(s.group) && !PARTS.some((q) => q.ids?.includes(s.id)))
}

export function HandbookBody() {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const haystacks = useMemo(() => new Map(SECTIONS.map((s) => [s.id, sectionHaystack(s)])), [])
  const matches = (s: Section) => query === '' || (haystacks.get(s.id) || '').includes(query)
  const matchCount = SECTIONS.filter(matches).length

  function highlight(seg: string, keyBase: string): React.ReactNode {
    if (!query) return seg
    const low = seg.toLowerCase()
    if (!low.includes(query)) return seg
    const out: React.ReactNode[] = []
    let i = 0, k = 0
    while (i <= seg.length) {
      const j = low.indexOf(query, i)
      if (j === -1) { out.push(seg.slice(i)); break }
      if (j > i) out.push(seg.slice(i, j))
      out.push(<mark key={`${keyBase}-${k++}`} className="hbk-mark">{seg.slice(j, j + query.length)}</mark>)
      i = j + query.length
    }
    return out
  }
  function rt(text: string): React.ReactNode {
    const segs = text.split('**')
    return segs.map((seg, i) => (i % 2 === 1
      ? <b key={i}>{highlight(seg, `b${i}`)}</b>
      : <span key={i}>{highlight(seg, `n${i}`)}</span>))
  }

  const renderBlocks = (s: Section) => s.blocks.map((b, bi) => {
    if (b.k === 'p') return <p key={bi} className="desc">{rt(b.t)}</p>
    if (b.k === 'sub') return <h4 key={bi}>{rt(b.t)}</h4>
    if (b.k === 'steps') return (
      <ol key={bi} className="steps">{b.items.map((it, k) => <li key={k}>{rt(it)}</li>)}</ol>
    )
    if (b.k === 'ul') return (
      <ul key={bi}>{b.items.map((it, k) => <li key={k}>{rt(it)}</li>)}</ul>
    )
    if (b.k === 'note') return (
      <div key={bi} className="note"><b>{rt(b.label)} </b>{rt(b.t)}</div>
    )
    if (b.k === 'faq') return (
      <div key={bi} className="faq">
        <p className="faq-q">{rt(b.q)}</p>
        <p className="faq-a">{rt(b.a)}</p>
      </div>
    )
    if (b.k === 'diagram') return <ConnectionsDiagram key={bi} />
    if (b.k === 'table') return (
      <div key={bi} className="tbl-wrap">
        <table className="fields">
          <thead><tr>{b.head.map((h, hi) => <th key={hi}>{h}</th>)}</tr></thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci} className={ci === 0 ? 'first' : ''}>{rt(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    return null
  })

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
    <div className="hbk">
      <style>{HBK_CSS}</style>

      {/* Masthead */}
      <header className="mast">
        <span className="kicker">Sapphire Accounting Hub · User Handbook</span>
        <h1>How to Use the Sapphire Accounting Hub</h1>
        <p className="lede">
          One system for the money side of the clinics and store — sales, expenses, payroll, receivables,
          taxes, equity and the financial reports. Every screen has a numbered, step-by-step guide below.
          Internal use — handle in confidence.
        </p>
        <div className="mast-actions no-print">
          <button onClick={() => window.print()} className="primary"><Printer size={14} /> Download PDF</button>
          <a href="/Accounting-Hub-User-Handbook.docx" download><Download size={14} /> Word copy</a>
        </div>
      </header>

      {/* Search */}
      <div className="searchbar no-print">
        <Search size={15} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search the handbook"
          placeholder="Search the handbook (e.g. RFP, void, payroll, opening balance)…"
        />
        {q && <button onClick={() => setQ('')}><X size={13} /> Clear</button>}
      </div>
      {query && (
        <p className="searchcount">
          {matchCount === 0 ? 'No sections match — try a different word.' : `${matchCount} section${matchCount === 1 ? '' : 's'} mention “${q.trim()}”.`}
        </p>
      )}

      <div className="shell">
        {/* Contents rail */}
        {!query && (
          <nav className="toc no-print" aria-label="Contents">
            <p className="toc-h">Contents</p>
            <ol>
              {PARTS.map((p, pi) => {
                const secs = partSections(p)
                if (secs.length === 0) return null
                return (
                  <li key={p.key}>
                    <a href={`#${p.key}`} className="top">{pi + 1} · {p.title}</a>
                    {p.key === 'start' && secs.slice(1).map((s) => (
                      <a key={s.id} href={`#${s.id}`} className="sub">{s.title}</a>
                    ))}
                    {p.key === 'modules' && MODULE_GROUPS.map((g) => (
                      SECTIONS.some((s) => s.group === g)
                        ? <a key={g} href={`#g-${g.replace(/[^a-z]+/gi, '-').toLowerCase()}`} className="sub">{g}</a>
                        : null
                    ))}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}

        {/* Body */}
        <main id="handbook">
          {PARTS.map((p, pi) => {
            const secs = partSections(p).filter(matches)
            if (secs.length === 0) return null
            return (
              <section key={p.key} id={p.key}>
                <p className="eyebrow">Section {pi + 1}</p>
                <h2>{p.title}</h2>
                {p.key === 'modules'
                  ? MODULE_GROUPS.map((g) => {
                      const gs = secs.filter((s) => s.group === g)
                      if (gs.length === 0) return null
                      return (
                        <div key={g}>
                          <p className="grouphead" id={`g-${g.replace(/[^a-z]+/gi, '-').toLowerCase()}`}>{g}</p>
                          <div className="cards">
                            {gs.map((s) => (
                              <article key={s.id} id={s.id} className="mod hb-section">
                                <div className="mod-top">
                                  <h3>{rt(s.title)}</h3>
                                  <span className="loc">§ {s.num}</span>
                                </div>
                                {renderBlocks(s)}
                              </article>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  : (
                    <div className="cards">
                      {secs.map((s) => (
                        <article key={s.id} id={s.id} className="mod hb-section">
                          <div className="mod-top">
                            <h3>{rt(s.title)}</h3>
                            <span className="loc">§ {s.num}</span>
                          </div>
                          {renderBlocks(s)}
                        </article>
                      ))}
                    </div>
                  )}
              </section>
            )
          })}
        </main>
      </div>
    </div>
    </div>
  )
}

/* ── Design tokens & layout, mirroring the HR Portal handbook ───────── */
const HBK_CSS = `
.hbk{
  --ink:#233038; --body:#33434B; --muted:#55616A; --faint:#8A9AA0;
  --hteal:#4A8073; --hteal-deep:#3C6A5F; --hteal-soft:#EDF3D9;
  --hline:#DDE6CC; --hline-soft:#E9EFDC; --hcard:#fff; --hhead:#f8faf6;
  --measure:72ch;
  color:var(--body); font-size:14.5px; line-height:1.62;
  max-width:1160px; margin:0 auto; padding:0 0 48px;
}
.hbk .mast{
  background:linear-gradient(100deg, #EDF3D9 0%, #ffffff 58%);
  border:1px solid var(--hline); border-radius:12px; padding:22px 24px; margin:0 0 16px; color:var(--ink);
}
.hbk .mast .kicker{font-family:var(--font-display);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--hteal-deep);}
.hbk .mast h1{font-family:var(--font-display);font-size:26px;font-weight:800;letter-spacing:-.015em;line-height:1.2;margin:6px 0 8px;color:var(--ink);}
.hbk .mast .lede{max-width:66ch;color:var(--muted);font-size:14px;margin:0;}
.hbk .mast-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
.hbk .mast-actions a,.hbk .mast-actions button{
  display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;font-size:13px;font-weight:600;
  background:#fff;color:var(--ink);border:1px solid var(--hline);border-radius:8px;cursor:pointer;text-decoration:none;
  transition:border-color .15s,color .15s,background .15s;}
.hbk .mast-actions a:hover{border-color:var(--hteal);color:var(--hteal);}
.hbk .mast-actions button.primary{background:var(--hteal);border-color:var(--hteal);color:#fff;}
.hbk .mast-actions button.primary:hover{background:var(--hteal-deep);border-color:var(--hteal-deep);}
.hbk .searchbar{
  display:flex;align-items:center;gap:9px;background:var(--hcard);
  border:1px solid var(--hline);border-radius:8px;padding:8px 14px;
  position:sticky;top:8px;z-index:10;box-shadow:0 1px 6px rgba(35,48,56,.05);color:var(--faint);}
.hbk .searchbar:focus-within{border-color:var(--hteal);box-shadow:0 0 0 3px rgba(74,128,115,.15);}
.hbk .searchbar input{flex:1;min-width:0;border:none;outline:none;font-size:14px;background:transparent;color:var(--ink);}
.hbk .searchbar button{display:inline-flex;align-items:center;gap:4px;border:none;background:none;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;}
.hbk .searchbar button:hover{color:var(--hteal);}
.hbk .searchcount{font-size:12.5px;color:var(--muted);margin:8px 4px 0;}
.hbk .hbk-mark{background:#fef3c7;border-radius:2px;padding:0 1px;color:inherit;}
.hbk .shell{display:grid;grid-template-columns:236px minmax(0,1fr);gap:36px;align-items:start;margin-top:20px;}
@media(max-width:900px){.hbk .shell{grid-template-columns:1fr;gap:0;}}
.hbk nav.toc{position:sticky;top:64px;font-size:13.5px;max-height:calc(100vh - 84px);overflow:auto;background:var(--hcard);border:1px solid var(--hline);border-radius:8px;padding:14px 10px;}
@media(max-width:900px){.hbk nav.toc{position:static;margin-bottom:22px;max-height:none;}}
.hbk nav.toc .toc-h{font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--muted);margin:0 6px 8px;}
.hbk nav.toc ol{list-style:none;margin:0;padding:0;}
.hbk nav.toc a{display:block;color:var(--body);text-decoration:none;padding:4px 8px;border-radius:6px;}
.hbk nav.toc a.top{font-family:var(--font-display);font-weight:700;color:var(--ink);margin-top:6px;}
.hbk nav.toc a.sub{padding-left:20px;font-size:12.5px;color:var(--muted);}
.hbk nav.toc a:hover{background:var(--hteal-soft);color:var(--hteal-deep);}
.hbk section{margin-bottom:44px;scroll-margin-top:64px;}
.hbk .eyebrow{font-family:var(--font-display);font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--hteal);margin:0 0 6px;}
.hbk section > h2{font-family:var(--font-display);font-size:22px;font-weight:800;letter-spacing:-.01em;color:var(--ink);padding-bottom:10px;border-bottom:2px solid var(--hline);margin:0 0 18px;}
.hbk .grouphead{font-family:var(--font-display);font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin:26px 0 10px;display:flex;align-items:center;gap:12px;scroll-margin-top:64px;}
.hbk .grouphead::after{content:"";flex:1;height:1px;background:var(--hline);}
.hbk .cards{display:flex;flex-direction:column;gap:12px;}
.hbk .mod{background:var(--hcard);border:1px solid var(--hline);border-radius:8px;padding:18px 20px;scroll-margin-top:64px;}
.hbk .mod-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-bottom:4px;}
.hbk .mod-top h3{font-family:var(--font-display);font-size:16.5px;font-weight:700;color:var(--ink);margin:0;}
.hbk .mod-top .loc{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:#f1f5f2;color:var(--muted);font-variant-numeric:tabular-nums;}
.hbk .mod .desc{max-width:var(--measure);margin:6px 0 4px;}
.hbk .mod h4{font-family:var(--font-display);font-size:13.5px;font-weight:700;margin:16px 0 6px;color:var(--ink);}
.hbk .mod ul{margin:8px 0 0;padding-left:0;list-style:none;max-width:var(--measure);display:flex;flex-direction:column;gap:7px;}
.hbk .mod ul li{position:relative;padding-left:22px;font-size:14.5px;}
.hbk .mod ul li::before{content:"";position:absolute;left:4px;top:9px;width:6px;height:6px;border-radius:50%;background:var(--hteal);}
.hbk .mod ol.steps{margin:8px 0 0;padding-left:0;counter-reset:s;list-style:none;display:flex;flex-direction:column;gap:8px;max-width:var(--measure);}
.hbk .mod ol.steps li{position:relative;padding-left:32px;counter-increment:s;font-size:14.5px;}
.hbk .mod ol.steps li::before{content:counter(s);position:absolute;left:0;top:1px;width:21px;height:21px;border-radius:50%;background:var(--hteal);color:#fff;font-size:11.5px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums;}
.hbk .mod .note{margin-top:12px;font-size:13.5px;background:var(--hteal-soft);border-left:3px solid var(--hteal);border-radius:6px;padding:10px 13px;color:var(--hteal-deep);max-width:var(--measure);}
.hbk .mod .note b{color:var(--hteal-deep);}
.hbk .mod b{color:var(--ink);}
.hbk .faq{margin:0 0 12px;}
.hbk .faq-q{font-weight:700;color:var(--ink);margin:0 0 2px;}
.hbk .faq-a{margin:0;max-width:var(--measure);}
.hbk .tbl-wrap{overflow:auto;border:1px solid var(--hline);border-radius:8px;margin:12px 0 4px;}
.hbk table.fields{width:100%;border-collapse:collapse;font-size:13px;}
.hbk table.fields th{background:var(--hhead);color:var(--muted);text-align:left;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:9px 12px;border-bottom:1px solid var(--hline);white-space:nowrap;}
.hbk table.fields td{padding:8px 12px;border-bottom:1px solid var(--hline-soft);vertical-align:top;}
.hbk table.fields td.first{font-weight:600;color:var(--ink);white-space:nowrap;}
.hbk table.fields tr:last-child td{border-bottom:none;}
html{scroll-behavior:smooth}
@media print{
  body *{visibility:hidden}
  #handbook,#handbook *{visibility:visible}
  #handbook{position:absolute;left:0;top:0;width:100%}
  .no-print{display:none !important}
  .hbk section>h2,.hbk .mod-top h3{page-break-after:avoid}
  .hbk .mod{break-inside:avoid;border:none;padding:8px 0;}
}
`

/* ── Connected-systems map (Section 4) ─────────────────────────────
   Pure inline SVG so it prints and needs no library. The Accounting Hub
   sits in the middle; arrowheads show which way data flows, and the two
   double-headed links (HR Hub, Staff Portal) sync both ways. */
function ConnectionsDiagram() {
  const box = (x: number, y: number, w: number, title: string, sub: string, dark = false) => (
    <g>
      <rect x={x} y={y} width={w} height={54} rx={12}
        fill={dark ? '#3C6A5F' : 'white'} stroke={dark ? '#3C6A5F' : '#DDE6CC'} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 23} textAnchor="middle" fontSize={13} fontWeight={700}
        fill={dark ? 'white' : '#233038'}>{title}</text>
      <text x={x + w / 2} y={y + 40} textAnchor="middle" fontSize={10}
        fill={dark ? '#E4EED6' : '#55616A'}>{sub}</text>
    </g>
  )
  const arrow = (x1: number, y1: number, x2: number, y2: number, both = false) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9AB29E" strokeWidth={1.6}
      markerEnd="url(#hb-arr)" markerStart={both ? 'url(#hb-arr-r)' : undefined} />
  )
  return (
    <div className="tbl-wrap" style={{ padding: 12, background: 'white' }}>
      <svg viewBox="0 0 880 420" style={{ minWidth: 660, width: '100%', height: 'auto' }} role="img"
        aria-label="Map of the systems connected to the Accounting Hub and the direction data flows">
        <defs>
          <marker id="hb-arr" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <path d="M0,0 L8,4.5 L0,9 z" fill="#9AB29E" />
          </marker>
          <marker id="hb-arr-r" markerWidth="9" markerHeight="9" refX="1" refY="4.5" orient="auto">
            <path d="M8,0 L0,4.5 L8,9 z" fill="#9AB29E" />
          </marker>
        </defs>
        {box(20, 20, 250, 'Operations Hub', 'patients (CRM) · East/GH staff · LOAs')}
        {box(315, 20, 250, 'HR Hub', 'Verdana staff · SI status & TINs · branches')}
        {box(610, 20, 250, 'Staff Portal (Teletherapy)', 'IE/PR documents · mentorship meetings')}
        {box(290, 183, 300, 'ACCOUNTING HUB', 'accounting.sapphireclinicseast.org', true)}
        {box(20, 346, 250, 'Scholarship Portal', 'approved scholars feed')}
        {box(315, 346, 250, 'Class Portal', 'tuition payments → POS orders')}
        {box(610, 346, 250, 'Online & marketplaces', 'PayMongo checkouts · TikTok/Shopee uploads')}
        {arrow(145, 74, 330, 183)}
        {arrow(440, 74, 440, 183, true)}
        {arrow(735, 74, 550, 183, true)}
        {arrow(145, 346, 330, 237)}
        {arrow(440, 346, 440, 237)}
        {arrow(735, 346, 550, 237)}
        <text x={440} y={412} textAnchor="middle" fontSize={11} fill="#55616A">
          ⇄ two-way automatic sync (equity figures out to HR Hub; mentorship marked Paid back to the Staff Portal) · → one-way into Accounting
        </text>
      </svg>
    </div>
  )
}
