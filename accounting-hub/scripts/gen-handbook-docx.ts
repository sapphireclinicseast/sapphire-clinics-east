/*
 * Generates the downloadable Word handbook from the SAME content the in-app
 * page uses (src/app/(dashboard)/handbook/handbookContent.ts), so the two stay
 * in sync. Emits an HTML file; a LibreOffice step turns it into the .docx.
 *
 * Run:  npx tsx scripts/gen-handbook-docx.ts > /tmp/handbook.html
 * Then: soffice --headless --convert-to docx --outdir <dir> /tmp/handbook.html
 *       and move it to public/Accounting-Hub-User-Handbook.docx
 */
import { SECTIONS, GROUP_ORDER, type Block } from '../src/app/(dashboard)/handbook/handbookContent'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const md = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

const out: string[] = []
const push = (s = '') => out.push(s)

function block(b: Block) {
  if (b.k === 'p') push(`<p>${md(b.t)}</p>`)
  else if (b.k === 'sub') push(`<h3>${md(b.t)}</h3>`)
  else if (b.k === 'steps') { push('<ol>'); b.items.forEach((it) => push(`<li>${md(it)}</li>`)); push('</ol>') }
  else if (b.k === 'ul') { push('<ul>'); b.items.forEach((it) => push(`<li>${md(it)}</li>`)); push('</ul>') }
  else if (b.k === 'note') push(`<p class="note"><strong>${md(b.label)}</strong> ${md(b.t)}</p>`)
  else if (b.k === 'faq') { push(`<p class="faq-q"><strong>${md(b.q)}</strong></p>`); push(`<p>${md(b.a)}</p>`) }
  else if (b.k === 'table') {
    push('<table border="1" cellspacing="0" cellpadding="4">')
    push(`<thead><tr>${b.head.map((h) => `<th>${md(h)}</th>`).join('')}</tr></thead>`)
    push('<tbody>')
    b.rows.forEach((r) => push(`<tr>${r.map((c) => `<td>${md(c)}</td>`).join('')}</tr>`))
    push('</tbody></table>')
  }
}

push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Accounting Hub — User Handbook</title>')
push('<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1a1a1a}h1{color:#244952}h2{color:#244952}h3{color:#b8863b}p.note{background:#edf3d9;padding:6px 10px;border-left:3px solid #244952}p.faq-q{margin-bottom:0}table{border-collapse:collapse}th{background:#244952;color:#fff;text-align:left}</style>')
push('</head><body>')
push('<h1>Accounting Hub — User Handbook</h1>')
push('<p><em>A step-by-step guide to every screen of the Accounting Hub. Internal use — handle in confidence.</em></p>')

for (const g of GROUP_ORDER) {
  const secs = SECTIONS.filter((s) => s.group === g)
  if (secs.length === 0) continue
  push(`<h1>${esc(g)}</h1>`)
  for (const s of secs) {
    push(`<h2>${esc(s.num)} ${md(s.title)}</h2>`)
    s.blocks.forEach(block)
  }
}
push('</body></html>')

process.stdout.write(out.join('\n'))
