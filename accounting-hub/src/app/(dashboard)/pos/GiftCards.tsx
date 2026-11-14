'use client'

/* ══════════════════════════════════════════════════════════════
   GIFT CARDS — POS → Services → Vouchers (Hannah, 2026-11-14)
   A prepaid peso value on a CODE128 code (lib/gift-cards):
   generated Unsold here, sold at the Cashier (New Payment → Sell a
   gift card; held in 4050 Unearned Revenue), spent as a payment
   (Payments → Gift card) with the rest of the balance kept on the
   code. No expiry (RA 10962).
   ══════════════════════════════════════════════════════════════ */

import { useState } from 'react'
import { Gift, Printer, Ban, Loader2, ScanLine } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { branchShort } from '@/lib/branch'

export interface GiftCardUseRow { amount: number; at: string; orderNumber: number | null; patientName: string | null }
export interface GiftCardRow {
  id: string; code: string; status: string; faceValue: number; balance: number
  soldAt: string | null; soldBranch: string | null; buyerName: string | null; soldOrderNumber: number | null
  uses: GiftCardUseRow[]
}
export interface GiftCardBatchRow {
  id: string; reason: string; faceValue: number; createdAt: string; outstanding: number
  counts: { total: number; unsold: number; active: number; usedUp: number; voided: number }
  cards: GiftCardRow[]
}

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  UNSOLD: { bg: '#f1f5f9', color: '#475569', label: 'Unsold' },
  ACTIVE: { bg: '#dcfce7', color: '#166534', label: 'Active' },
  USED_UP: { bg: '#dbeafe', color: '#1e40af', label: 'Used up' },
  VOIDED: { bg: '#fee2e2', color: '#b91c1c', label: 'Voided' },
}

export function GiftCardStatusChip({ status }: { status: string }) {
  const cfg = STATUS[status] || STATUS.UNSOLD
  return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/**
 * Print gift cards three to an A4 sheet: each card is a full-width third of
 * the page (210 × 99 mm, the standard gift-voucher size), separated by dashed
 * cut lines (Hannah, 11/14). Brand fonts only — Intro Pro (headings), Intro
 * Script (accent), Poppins Light (text) — read from the computer's installed
 * fonts (not hosted), falling back to Poppins. Intro has no ₱ glyph, so the
 * peso sign alone falls through to Roboto. Colours from the logo: #296354
 * dark green, #8EAF74 leaf green, #6E8E8E slate teal.
 */
export function printGiftCards(cards: { code: string; faceValue: number }[]) {
  if (!cards.length) { alert('No gift cards to print.'); return }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const JsBarcodeLib = require('jsbarcode')
  const origin = window.location.origin
  const logo = `${origin}/login-aura.png`
  // Watermark: the logo's own arch — three equal bands (≈ ¼ of the radius
  // each) with thin gaps — drawn to scale in a fixed 2:1 box so it can never
  // stretch.
  const arch = `<svg class="wm" viewBox="0 0 276 138" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <path d="M17 138 A121 121 0 0 1 259 138" fill="none" stroke="#296354" stroke-width="34"/>
      <path d="M57 138 A81 81 0 0 1 219 138" fill="none" stroke="#8EAF74" stroke-width="34"/>
      <path d="M97.5 138 A40.5 40.5 0 0 1 178.5 138" fill="none" stroke="#6E8E8E" stroke-width="35"/>
    </svg>`
  const card = (c: { code: string; faceValue: number }) => {
    const canvas = document.createElement('canvas')
    try {
      JsBarcodeLib(canvas, c.code, { format: 'CODE128', width: 2, height: 70, displayValue: false, margin: 0, background: '#ffffff', lineColor: '#1d2a2f' })
    } catch { /* invalid code */ }
    return `<div class="slot"><div class="card">
        <div class="left">
          <img class="logo" src="${logo}" alt="Aura Health Rehab" />
          <div class="branches">EAST &nbsp;·&nbsp; GREENHILLS</div>
        </div>
        <div class="stripe"><i></i><i></i><i></i></div>
        <div class="right">
          ${arch}
          <div class="top"><span class="kicker">AURA HEALTH REHAB</span><span class="no">No. ${esc(c.code)}</span></div>
          <div class="head">
            <div class="title">Gift Card</div>
            <div class="value"><small>VALUE</small>${esc(formatCurrency(c.faceValue))}</div>
          </div>
          <div class="script">for every step forward</div>
          <p class="note">A little gift of care for someone special — to help them move, speak, learn and feel their very best.</p>
          <div class="bottom">
            <div class="bcbox"><img src="${canvas.toDataURL('image/png')}" alt="${esc(c.code)}" /><div class="code">${esc(c.code)}</div></div>
            <div class="fine">
              No expiry · unused balance stays on the card<br/>
              For any service or product · East &amp; Greenhills<br/>
              <span>www.sapphireclinicseast.org</span>
            </div>
          </div>
        </div>
      </div></div>`
  }
  const sheets: string[] = []
  for (let i = 0; i < cards.length; i += 3) {
    const group = cards.slice(i, i + 3).map(card)
    while (group.length < 3) group.push('<div class="slot empty"></div>')
    sheets.push(`<div class="sheet">${group.join('')}</div>`)
  }
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Gift cards</title>
    <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;500&display=swap" rel="stylesheet">
    <style>
      @font-face { font-family: 'Intro Pro'; font-weight: 400; src: local('Intro Regular Alt'), local('IntroRegularAlt'), local('Intro Regular'), local('Intro-Regular'); }
      @font-face { font-family: 'Intro Pro'; font-weight: 700; src: local('Intro Bold Alt'), local('IntroBoldAlt'), local('Intro Bold'), local('Intro-Bold'); }
      @font-face { font-family: 'Intro Script'; src: local('Intro Script'), local('IntroScript-Regular'), local('Intro Script Demo Medium'), local('IntroScriptDemo-Medium'); }
      @font-face { font-family: 'Poppins Light'; font-weight: 300; src: local('Poppins Light'), local('Poppins-Light'); }
      @font-face { font-family: 'Peso'; src: url('${origin}/fonts/roboto-latin-700.woff2') format('woff2'); unicode-range: U+20B1; }
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { background: #fff; }
      body { font-family: 'Poppins Light', Poppins, Arial, sans-serif; font-weight: 300; color: #233038; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { width: 210mm; height: 296.8mm; display: flex; flex-direction: column; overflow: hidden; break-after: page; page-break-after: always; }
      .sheet:last-child { break-after: auto; page-break-after: auto; }
      .slot { flex: 1 1 0; min-height: 0; padding: 7mm 9mm; position: relative; }
      .slot + .slot { border-top: 0.25mm dashed #b9c3ae; }
      .slot + .slot::before { content: '✂'; position: absolute; top: -2.3mm; left: 3mm; font-size: 8pt; line-height: 1; color: #9aa59f; background: #fff; padding: 0 1mm; }
      .card { height: 100%; display: flex; border: 0.3mm solid #cfd9c2; border-radius: 3.5mm; overflow: hidden; background: #fff; }
      .left { width: 58mm; flex: none; background: #F2F6EA; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4.5mm; }
      .left .logo { width: 38mm; height: auto; }
      .left .branches { font-family: 'Intro Pro', Poppins, Arial, sans-serif; font-weight: 400; font-size: 6.8pt; letter-spacing: 1.8px; color: #4A8073; }
      .stripe { width: 2.4mm; flex: none; display: flex; flex-direction: column; }
      .stripe i { flex: 1; } .stripe i:nth-child(1) { background: #296354; } .stripe i:nth-child(2) { background: #8EAF74; } .stripe i:nth-child(3) { background: #6E8E8E; }
      .right { flex: 1; min-width: 0; padding: 6mm 8mm 5.5mm 8.5mm; display: flex; flex-direction: column; position: relative; overflow: hidden; }
      .right > *:not(.wm) { position: relative; }
      .wm { position: absolute; right: 3mm; bottom: -0.5mm; width: 66mm; height: 33mm; opacity: .07; }
      .top { display: flex; justify-content: space-between; align-items: baseline; }
      .kicker { font-family: 'Intro Pro', Poppins, Arial, sans-serif; font-weight: 700; font-size: 6.8pt; letter-spacing: 2.4px; color: #6E8E8E; }
      .no { font-size: 7.4pt; color: #8A9AA0; letter-spacing: .4px; }
      .head { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 3mm; }
      .title { font-family: 'Intro Pro', Poppins, Arial, sans-serif; font-weight: 700; font-size: 29pt; line-height: 1; color: #296354; }
      .value { text-align: right; font-family: 'Intro Pro', 'Peso', Poppins, Arial, sans-serif; font-weight: 700; font-size: 27pt; line-height: 1; color: #233038; }
      .value small { display: block; font-family: 'Intro Pro', Poppins, Arial, sans-serif; font-size: 6pt; font-weight: 700; letter-spacing: 2.2px; color: #8A9AA0; margin-bottom: 1.6mm; }
      .script { font-family: 'Intro Script', Poppins, cursive; font-size: 23pt; line-height: 1.1; color: #8EAF74; margin-top: 2.6mm; }
      .note { font-size: 8.6pt; line-height: 1.55; color: #55616A; margin-top: 2mm; max-width: 100mm; }
      .bottom { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm; }
      .bcbox { background: #fff; padding: 1mm 1.2mm 0; border-radius: 1mm; }
      .bcbox img { display: block; height: 10.5mm; width: auto; max-width: 48mm; }
      .code { font-family: 'Poppins', Arial, sans-serif; font-weight: 500; font-size: 8pt; letter-spacing: 1.6px; text-align: center; margin-top: .8mm; color: #233038; }
      .fine { text-align: right; font-size: 6.5pt; line-height: 1.65; color: #55616A; white-space: nowrap; min-width: 0; }
      .fine span { color: #4A8073; font-weight: 500; font-family: Poppins, Arial, sans-serif; }
    </style></head>
    <body>${sheets.join('')}
    <script>window.onload=function(){var go=function(){setTimeout(function(){window.print()},150)};(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(go,go)}<\/script></body></html>`)
  win.document.close()
}

/**
 * Scan or type a gift card code and look it up. for='sell' wants an Unsold
 * card (adds it as the order line); for='pay' wants a sold card with a balance.
 */
export function GiftCardCodeInput({ mode, onFound, compact }: {
  mode: 'sell' | 'pay'
  onFound: (card: { id: string; code: string; faceValue: number; balance: number }) => void
  compact?: boolean
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const look = async () => {
    const c = code.trim().toUpperCase()
    if (!c) return
    setBusy(true); setErr('')
    try {
      const r = await fetch(`/api/pos/gift-cards/check?code=${encodeURIComponent(c)}&for=${mode}`)
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Gift card not valid'); return }
      onFound(d); setCode('')
    } catch { setErr('Unable to check the gift card') }
    finally { setBusy(false) }
  }
  return (
    <div className={`rounded-xl border ${compact ? 'p-2' : 'p-3'} space-y-1.5`} style={{ borderColor: '#bbf7d0', background: '#f0fdf4' }}>
      <div className="flex gap-2">
        <input value={code} autoFocus onChange={e => { setCode(e.target.value); setErr('') }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); look() } }}
          placeholder={mode === 'sell' ? 'Scan the gift card being sold (GC-…)' : 'Scan or type the gift card code (GC-…)'}
          className="flex-1 min-w-0 px-3 py-2 rounded-xl border text-sm font-mono outline-none bg-white" style={{ borderColor: '#bbf7d0' }} />
        <button type="button" onClick={look} disabled={busy || !code.trim()}
          className="px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 flex items-center gap-1" style={{ background: 'var(--teal)' }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ScanLine size={13} />} {mode === 'sell' ? 'Add card' : 'Use card'}
        </button>
      </div>
      {err && <p className="text-xs" style={{ color: '#dc2626' }}>{err}</p>}
      {!err && <p className="text-[11px]" style={{ color: '#166534' }}>
        {mode === 'sell'
          ? 'Sold on its own order at the card’s full value; held as Unearned Revenue (4050) until it is used.'
          : 'Pays like cash at full price; whatever is not spent stays on the card.'}
      </p>}
    </div>
  )
}

/** The gift card batches list (Vouchers tab → Gift cards). */
export function GiftCardBatchList({ batches, canWrite, onEdit, onChanged }: {
  batches: GiftCardBatchRow[]
  canWrite: boolean
  onEdit: (b: GiftCardBatchRow) => void
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const voidCard = async (c: GiftCardRow) => {
    if (!confirm(`Void gift card ${c.code}? It can no longer be sold.`)) return
    const r = await fetch('/api/pos/gift-cards', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardId: c.id }) })
    if (!r.ok) alert((await r.json()).error || 'Failed')
    onChanged()
  }
  const voidBatch = async (b: GiftCardBatchRow) => {
    if (!confirm(`Void all ${b.counts.unsold} unsold gift card(s) in this batch? Sold cards keep their balance.`)) return
    const r = await fetch('/api/pos/gift-cards', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: b.id }) })
    if (!r.ok) alert((await r.json()).error || 'Failed')
    onChanged()
  }

  return (
    <>
      {batches.map(b => (
        <div key={b.id} className="rounded-2xl border bg-white" style={{ borderColor: 'var(--light-gray)', borderLeft: '4px solid #4A8073' }}>
          <div className="px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
                <Gift size={14} className="inline mr-1" style={{ color: 'var(--teal)' }} /> {formatCurrency(b.faceValue)} gift card
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#EDF3D9', color: '#3C6A5F' }}>Prepaid value · no expiry</span>
              </p>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{b.reason} · created {String(b.createdAt).slice(0, 10)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                {b.counts.total} card{b.counts.total === 1 ? '' : 's'} — <span style={{ color: '#475569' }}>{b.counts.unsold} unsold</span> · <span style={{ color: '#166534' }}>{b.counts.active} active</span> · <span style={{ color: '#1e40af' }}>{b.counts.usedUp} used up</span> · <span style={{ color: '#b91c1c' }}>{b.counts.voided} voided</span>
                {b.outstanding > 0 && <> · <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{formatCurrency(b.outstanding)}</span> unspent</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canWrite && <button onClick={() => onEdit(b)} className="px-3 py-1.5 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>Edit</button>}
              <button onClick={() => printGiftCards(b.cards.filter(c => c.status === 'UNSOLD'))} disabled={b.counts.unsold === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border disabled:opacity-40" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}><Printer size={13} /> Print unsold</button>
              {canWrite && b.counts.unsold > 0 && (
                <button onClick={() => voidBatch(b)} className="px-3 py-1.5 rounded-xl text-xs font-semibold border" style={{ borderColor: '#fecaca', color: '#b91c1c' }}>Void unsold</button>
              )}
              <button onClick={() => setExpanded(expanded === b.id ? null : b.id)} className="px-3 py-1.5 rounded-xl text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                {expanded === b.id ? 'Hide cards' : 'Show cards'}
              </button>
            </div>
          </div>
          {expanded === b.id && (
            <div className="border-t overflow-x-auto" style={{ borderColor: 'var(--light-gray)' }}>
              <table className="w-full text-xs">
                <thead><tr className="text-left" style={{ color: 'var(--mid-gray)', background: '#f8faf6' }}>
                  {['Code', 'Status', 'Balance', 'Sold', 'Used on', ''].map(h => <th key={h} className="px-4 py-2 font-bold uppercase text-[11px] tracking-[.3px]">{h}</th>)}
                </tr></thead>
                <tbody>
                  {b.cards.map(c => (
                    <tr key={c.id} className="border-t align-top" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-1.5 font-mono font-semibold whitespace-nowrap" style={{ color: c.status === 'VOIDED' ? '#b91c1c' : 'var(--charcoal)' }}>{c.code}</td>
                      <td className="px-4 py-1.5"><GiftCardStatusChip status={c.status} /></td>
                      <td className="px-4 py-1.5 font-mono whitespace-nowrap" style={{ color: c.status === 'ACTIVE' ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
                        {c.status === 'UNSOLD' || c.status === 'VOIDED' ? '—' : `${formatCurrency(c.balance)} of ${formatCurrency(c.faceValue)}`}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: 'var(--mid-gray)' }}>
                        {c.soldAt ? <>{String(c.soldAt).slice(0, 10)}{c.soldBranch ? ` · ${branchShort(c.soldBranch)}` : ''}{c.soldOrderNumber ? ` · #${c.soldOrderNumber}` : ''}{c.buyerName ? ` · ${c.buyerName}` : ''}</> : '—'}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: 'var(--mid-gray)' }}>
                        {c.uses.length === 0 ? '—' : c.uses.map((u, i) => (
                          <div key={i} className="whitespace-nowrap">
                            {String(u.at).slice(0, 10)} · {u.orderNumber ? `#${u.orderNumber}` : 'order'} · <span className="font-mono" style={{ color: u.amount < 0 ? '#166534' : 'var(--charcoal)' }}>{u.amount < 0 ? `+${formatCurrency(-u.amount)} put back` : `−${formatCurrency(u.amount)}`}</span>
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">
                        {(c.status === 'UNSOLD' || c.status === 'ACTIVE') && <button onClick={() => printGiftCards([c])} className="p-1 rounded hover:bg-gray-100" title="Print this card"><Printer size={13} style={{ color: 'var(--teal)' }} /></button>}
                        {canWrite && c.status === 'UNSOLD' && <button onClick={() => voidCard(c)} className="p-1 rounded hover:bg-red-50" title="Void this card"><Ban size={13} className="text-red-400" /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </>
  )
}
