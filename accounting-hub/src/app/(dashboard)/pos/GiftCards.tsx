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
 * Print gift cards as the same slip as the discount vouchers (VouchersPanel →
 * printVouchers): 270px dashed slip, same padding, same barcode size, flowed
 * across the page the same way — so both print and cut alike (Hannah, 11/14).
 */
export function printGiftCards(cards: { code: string; faceValue: number }[]) {
  if (!cards.length) { alert('No gift cards to print.'); return }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const JsBarcodeLib = require('jsbarcode')
  const slips = cards.map(c => {
    const canvas = document.createElement('canvas')
    try {
      JsBarcodeLib(canvas, c.code, { format: 'CODE128', width: 2, height: 48, displayValue: true, fontSize: 13, margin: 6, font: 'Roboto, Arial, sans-serif' })
    } catch { /* invalid code */ }
    return `<div style="border:1px dashed #999;border-radius:10px;padding:10px 14px;width:270px;text-align:center;page-break-inside:avoid">
        <div style="font-weight:700;font-size:13px;letter-spacing:.4px">AURA HEALTH — GIFT CARD</div>
        <div style="font-size:15px;font-weight:700;margin:4px 0">${esc(formatCurrency(c.faceValue))}</div>
        <img src="${canvas.toDataURL('image/png')}" style="max-width:100%" />
        <div style="font-size:11px;color:#444">No expiry · balance stays on the card</div>
      </div>`
  }).join('')
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<html><head><title>Gift cards</title></head>
      <body style="font-family:Arial,sans-serif;display:flex;flex-wrap:wrap;gap:10px;padding:16px">${slips}
      <script>window.onload=function(){window.print()}<\/script></body></html>`)
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
