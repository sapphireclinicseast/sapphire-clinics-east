'use client'

// AR → GL → Consumption → "Link sessions" (Hannah 2026-11-18): attach the GL
// sessions that sit on no letter to the Guarantee Letter they used. Only the
// session's letter link changes — no journal entry, no letter balance.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Loader2, AlertCircle, Link2, Unlink } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { branchLabel } from '@/lib/branch'
import { hrBtn } from '@/components/ui/hr-look'

interface Session {
  paymentId: string
  orderId: string
  orderNumber: number
  date: string
  status: string
  patientName: string
  clinician: string
  branch: string
  items: string
  amount: number
  suggested?: boolean
  linkedHere?: boolean
}

interface Letter {
  id: string; name: string; agency: string; glLetterNo: string; branch: string
  approved: number; obtained: string | null; paid: number; linkedTotal: number
}

const fmtDate = (d: string | null) => d
  ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
  : '—'

export default function GlLinkModal({ walletId, canEdit, onClose, onChanged }: {
  walletId: string
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [letter, setLetter] = useState<Letter | null>(null)
  const [linked, setLinked] = useState<Session[]>([])
  const [candidates, setCandidates] = useState<Session[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/accounts-receivable/gl-link?walletId=${encodeURIComponent(walletId)}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load the letter')
      setLetter(j.letter)
      setLinked(j.linked || [])
      setCandidates(j.candidates || [])
      setPicked(new Set((j.candidates || []).filter((c: Session) => c.suggested).map((c: Session) => c.paymentId)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the letter')
    } finally {
      setLoading(false)
    }
  }, [walletId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const pickedTotal = useMemo(
    () => candidates.filter(c => picked.has(c.paymentId)).reduce((s, c) => s + c.amount, 0),
    [candidates, picked],
  )
  const linkedTotal = useMemo(() => linked.reduce((s, c) => s + c.amount, 0), [linked])
  const afterTotal = linkedTotal + pickedTotal
  const over = letter ? letter.approved > 0 && afterTotal > letter.approved + 0.005 : false

  const toggle = (id: string) => setPicked(p => {
    const next = new Set(p)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const send = async (action: 'link' | 'unlink', paymentIds: string[]) => {
    if (!paymentIds.length) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const r = await fetch('/api/accounts-receivable/gl-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId, paymentIds, action }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not update the sessions')
      setNotice(action === 'link'
        ? `Linked ${j.changed} session${j.changed === 1 ? '' : 's'} (${formatCurrency(j.total)}) to this letter.`
        : `Took ${j.changed} session${j.changed === 1 ? '' : 's'} off this letter.`)
      onChanged()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the sessions')
    } finally {
      setBusy(false)
    }
  }

  const head = 'px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[.4px]'
  const cell = 'px-2 py-1.5 text-xs'

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-4xl mt-8 mb-8 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white, #fafaf7)' }}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Link sessions to this Guarantee Letter</p>
            <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>{letter?.name || '…'}</h2>
            {letter && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                {[letter.agency, letter.glLetterNo, letter.branch ? branchLabel(letter.branch) : '', `obtained ${fmtDate(letter.obtained)}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loading && <p className="text-xs flex items-center gap-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={14} className="animate-spin" /> Loading…</p>}
          {error && <p className="text-xs flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#fef2f2', color: '#b91c1c' }}><AlertCircle size={14} /> {error}</p>}
          {notice && <p className="text-xs rounded-lg px-3 py-2" style={{ background: '#ecfdf5', color: '#047857' }}>{notice}</p>}

          {letter && !loading && <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['Approved', letter.approved > 0 ? formatCurrency(letter.approved) : 'per session'],
                ['Paid', formatCurrency(letter.paid)],
                ['On this letter now', formatCurrency(linkedTotal)],
                ['After linking', formatCurrency(afterTotal)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--light-gray)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>{k}</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: k === 'After linking' && over ? '#b91c1c' : 'var(--charcoal)' }}>{v}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
              Only the session&apos;s letter changes: no journal entry, and the letter&apos;s balance stays as it is.
              {over && <span style={{ color: '#b91c1c' }}> The picked sessions go past the approved amount — check they all belong to this letter.</span>}
            </p>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-bold" style={{ color: 'var(--deep-teal)' }}>
                  Same person, on no letter <span className="font-normal text-xs" style={{ color: 'var(--mid-gray)' }}>· {candidates.length}</span>
                </h3>
                {candidates.length > 0 && canEdit && (
                  <div className="flex gap-2">
                    <button className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)' }} disabled={busy}
                      onClick={() => setPicked(new Set(candidates.map(c => c.paymentId)))}>Pick all</button>
                    <button className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)' }} disabled={busy}
                      onClick={() => setPicked(new Set())}>Clear</button>
                  </div>
                )}
              </div>
              {candidates.length === 0
                ? <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>No GL sessions for this person are waiting for a letter.</p>
                : (
                  <div className="max-h-[42vh] overflow-auto rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                    <table className="w-full">
                      <thead className="sticky top-0 z-10" style={{ background: 'var(--off-white, #fafaf7)', color: 'var(--mid-gray)' }}>
                        <tr>
                          <th className={head} style={{ width: 28 }} />
                          <th className={head}>Date</th>
                          <th className={head}>Order</th>
                          <th className={head}>Session</th>
                          <th className={head}>Branch</th>
                          <th className={`${head} text-right`}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.map(c => (
                          <tr key={c.paymentId} className="border-t cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}
                            onClick={() => canEdit && !busy && toggle(c.paymentId)}>
                            <td className={cell}>
                              <input type="checkbox" checked={picked.has(c.paymentId)} disabled={!canEdit || busy}
                                onChange={() => toggle(c.paymentId)} onClick={e => e.stopPropagation()} />
                            </td>
                            <td className={`${cell} whitespace-nowrap`}>{fmtDate(c.date)}</td>
                            <td className={`${cell} tabular-nums`}>#{c.orderNumber}</td>
                            <td className={cell}>
                              <span className="line-clamp-1" title={c.items}>{c.items || '—'}</span>
                              <span className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>{c.patientName}{c.clinician ? ` · ${c.clinician}` : ''}</span>
                            </td>
                            <td className={cell}>{c.branch ? branchLabel(c.branch) : '—'}</td>
                            <td className={`${cell} text-right tabular-nums font-semibold`}>{formatCurrency(c.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              {candidates.length > 0 && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>
                  Pre-ticked: the run of sessions from about the letter&apos;s date until the approved amount is used or the sessions stop for over two months. Adjust before linking.
                </p>
              )}
            </div>

            {linked.length > 0 && (
              <div>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: 'var(--deep-teal)' }}>
                  On this letter <span className="font-normal text-xs" style={{ color: 'var(--mid-gray)' }}>· {linked.length} · {formatCurrency(linkedTotal)}</span>
                </h3>
                <div className="max-h-[28vh] overflow-auto rounded-lg border" style={{ borderColor: 'var(--light-gray)' }}>
                  <table className="w-full">
                    <tbody>
                      {linked.map(c => (
                        <tr key={c.paymentId} className="border-t first:border-t-0" style={{ borderColor: 'var(--light-gray)' }}>
                          <td className={`${cell} whitespace-nowrap`}>{fmtDate(c.date)}</td>
                          <td className={`${cell} tabular-nums`}>#{c.orderNumber}</td>
                          <td className={cell}><span className="line-clamp-1" title={c.items}>{c.items || '—'}</span></td>
                          <td className={`${cell} text-right tabular-nums font-semibold`}>{formatCurrency(c.amount)}</td>
                          <td className={`${cell} text-right`}>
                            {c.linkedHere && canEdit
                              ? <button className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline disabled:opacity-40" style={{ color: '#b91c1c' }}
                                  disabled={busy} onClick={() => send('unlink', [c.paymentId])}><Unlink size={12} /> Take off</button>
                              : <span className="text-[10px]" style={{ color: 'var(--light-gray)' }}>{c.linkedHere ? 'linked here' : 'from POS'}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t" style={{ borderColor: 'var(--light-gray)' }}>
          <p className="text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>
            {picked.size} picked · {formatCurrency(pickedTotal)}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className={hrBtn.outline} style={{ borderColor: 'var(--light-gray)' }}>Close</button>
            {canEdit && (
              <button disabled={busy || picked.size === 0} className={hrBtn.primary} style={{ background: 'var(--teal)' }}
                onClick={() => send('link', [...picked])}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                Link {picked.size} session{picked.size === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
