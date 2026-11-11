'use client'

// Accounts Receivable → HMO → Payment History → Payments to Doctors.
//
// HMO payment vouchers made out to the doctor rather than to SCEI (Intellicare /
// Avega PVs for MD consults). Documentation only — no cash reaches us, so
// nothing posts to the GL and our AR is untouched; the consults a PV covers are
// linked so they read "paid · PV-…" in Per HMO / Doctor Consults.
//
// "Coursed through the clinic" (Hannah 2026-11-11): the one-off PV the HMO made
// out to SCEI for the doctor's consults. Those consults become our sales/AR and
// an RFP payable to the doctor (8190, what the HMO paid us) is prepared —
// lib/hmo-coursed-fee.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X, Loader2, Stethoscope, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ScanUpload } from '@/components/ScanUpload'
import { useResizableColumns, ResizableColgroup, ColResizeHandle } from '@/components/useResizableColumns'
import PaymentsCard from './PaymentsCard'
import { NameCombobox } from '@/components/NameCombobox'

interface DoctorPayment {
  id: string
  walletId: string
  hmo: string
  clinicianName: string
  pvNumber: string | null
  pvDate: string
  checkNumber: string | null
  grossAmount: number
  vatAmount: number
  wtaxAmount: number
  netAmount: number
  proofUrl: string | null
  notes: string | null
  createdByName: string | null
  items: { id: string; orderNumber: number | null; sessionDate: string | null; patientName: string | null }[]
  coursedThroughClinic?: boolean
  rfp?: { id: string; refNumber: string | null; status: string; branch: string | null } | null
}
interface Candidate { id: string; orderNumber: number; date: string; patientName: string; clinicianName: string; amount: number }

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const toNum = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0)

export default function ClinicianPaymentsPanel({ wallets, canWrite, branch, directToClinician, onSaved }: {
  wallets: { id: string; name: string }[]
  canWrite: boolean
  branch: string
  /** HMO orders the HMO settles with the doctor, and how much of them a recorded PV covers (AR summary). */
  directToClinician?: { orderCount: number; total: number; paidOrderCount?: number; paidTotal?: number }
  onSaved?: () => void
}) {
  const [rows, setRows] = useState<DoctorPayment[] | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // form
  const [walletId, setWalletId] = useState('')
  const [doctor, setDoctor] = useState('')
  const [pvNumber, setPvNumber] = useState('')
  const [pvDate, setPvDate] = useState('')
  const [checkNumber, setCheckNumber] = useState('')
  const [gross, setGross] = useState('')
  const [vat, setVat] = useState('')
  const [wtax, setWtax] = useState('')
  const [net, setNet] = useState('')
  const [notes, setNotes] = useState('')
  const [proofUrls, setProofUrls] = useState<string[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  // Who the HMO paid: the doctor (documentation only) or the clinic (coursed through us).
  const [coursed, setCoursed] = useState(false)
  const [rfpBranch, setRfpBranch] = useState('')
  const [notice, setNotice] = useState('')
  const [rfpBusy, setRfpBusy] = useState<string | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const rz = useResizableColumns('ar-payments-to-doctors', tableRef)

  const load = useCallback(() => {
    fetch('/api/accounts-receivable/clinician-payments')
      .then(r => (r.ok ? r.json() : { payments: [] }))
      .then(d => setRows(d.payments || []))
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!open || !walletId) { setCandidates([]); return }
    fetch(`/api/accounts-receivable/clinician-payments?candidates=1&walletId=${walletId}`)
      .then(r => (r.ok ? r.json() : { candidates: [] }))
      .then(d => setCandidates(d.candidates || []))
      .catch(() => setCandidates([]))
  }, [open, walletId])

  const doctors = useMemo(() => [...new Set(candidates.map(c => c.clinicianName).filter(Boolean))].sort(), [candidates])
  const shownCandidates = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return candidates.filter(c =>
      (!doctor.trim() || c.clinicianName.toLowerCase().includes(doctor.trim().toLowerCase()) || picked.has(c.id))
      && (!needle || `${c.patientName} ${c.orderNumber} ${fmtDate(c.date)}`.toLowerCase().includes(needle)))
  }, [candidates, doctor, q, picked])
  const autoNet = toNum(gross) + toNum(vat) - toNum(wtax)

  const openForm = () => {
    setWalletId(''); setDoctor(''); setPvNumber(''); setPvDate(''); setCheckNumber('')
    setGross(''); setVat(''); setWtax(''); setNet(''); setNotes(''); setProofUrls([])
    setPicked(new Set()); setQ(''); setError(''); setCoursed(false); setRfpBranch(''); setOpen(true)
  }

  const save = async () => {
    if (!walletId || !doctor.trim() || !pvDate) { setError('HMO, doctor and PV date are required.'); return }
    if (coursed && picked.size === 0) { setError('Tick the consults the HMO paid the clinic for.'); return }
    if (coursed && !((net.trim() ? toNum(net) : autoNet) > 0)) { setError('Enter the amount the HMO paid the clinic.'); return }
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/accounts-receivable/clinician-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId, clinicianName: doctor, pvNumber, pvDate, checkNumber,
          grossAmount: toNum(gross), vatAmount: toNum(vat), wtaxAmount: toNum(wtax),
          netAmount: net.trim() ? toNum(net) : autoNet,
          proofUrl: proofUrls.length ? JSON.stringify(proofUrls) : null, notes, branch: branch || null,
          orderIds: [...picked],
          coursedThroughClinic: coursed, rfpBranch: coursed ? rfpBranch : undefined,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Could not save'); return }
      if (coursed) {
        setNotice(d.rfpRef
          ? `Saved. The consults are now our sales, and RFP ${d.rfpRef} payable to ${doctor.trim()} is in Expenses → RFP.`
          : d.rfpError || 'Saved, but the RFP could not be prepared — use Prepare RFP on the row.')
      }
      setOpen(false); load(); onSaved?.()
    } finally { setBusy(false) }
  }

  const remove = async (p: DoctorPayment) => {
    const msg = p.coursedThroughClinic
      ? `Delete the record of ${p.pvNumber || 'this PV'} coursed through the clinic for ${p.clinicianName}? Its consults go back to "HMO pays the doctor" (their sale is reversed) and the unpaid RFP to the doctor is deleted.`
      : `Delete the record of ${p.pvNumber || 'this PV'} paid to ${p.clinicianName}? Its consults go back to unlinked.`
    if (!confirm(msg)) return
    const r = await fetch(`/api/accounts-receivable/clinician-payments?id=${p.id}`, { method: 'DELETE' })
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error || 'Could not delete'); return }
    load(); onSaved?.()
  }
  const prepareRfp = async (p: DoctorPayment) => {
    setRfpBusy(p.id)
    try {
      const r = await fetch('/api/accounts-receivable/clinician-payments', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, action: 'prepare-rfp' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { alert(d.error || 'Could not prepare the RFP'); return }
      setNotice(`RFP ${d.rfpRef} payable to ${p.clinicianName} is in Expenses → RFP.`)
      load()
    } finally { setRfpBusy(null) }
  }

  const proofs = (u: string | null) => {
    if (!u) return []
    try { const a = JSON.parse(u); return Array.isArray(a) ? a.map(String) : [u] } catch { return [u] }
  }
  const list = rows || []
  const inp = 'w-full px-3 py-2 rounded-xl border text-sm outline-none'
  const inpStyle = { borderColor: 'var(--light-gray)' }

  return (
    <>
      <PaymentsCard
        title="Payments to Doctors"
        icon={<Stethoscope size={15} />}
        count={list.length}
        subtitle="HMO PVs made out to the doctor for consults — documentation only, not our cash or AR. A PV coursed through the clinic is our sale, with an RFP to the doctor."
        paid={directToClinician?.paidTotal ?? 0}
        billed={directToClinician?.total ?? 0}
        paidCaption={`${formatCurrency(directToClinician?.paidTotal ?? 0)} of ${formatCurrency(directToClinician?.total ?? 0)} direct-to-doctor HMO orders have a PV · ${directToClinician?.paidOrderCount ?? 0} of ${directToClinician?.orderCount ?? 0} consults`}
        recent={[...list]
          .sort((a, b) => new Date(b.pvDate).getTime() - new Date(a.pvDate).getTime())
          .map(p => ({ id: p.id, date: fmtDate(p.pvDate), ref: p.pvNumber || '', who: `${p.clinicianName} · ${p.hmo}${p.coursedThroughClinic ? ' · via clinic' : ''}`, amount: p.netAmount }))}
        action={canWrite ? (
          <button onClick={openForm} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-white shrink-0" style={{ background: '#9a3412' }}>
            <Plus size={14} /> Record doctor payment
          </button>
        ) : undefined}>
        {notice && (
          <div className="mx-3 my-2 px-3 py-2 rounded-lg text-xs flex items-start gap-2" style={{ background: '#e0f2fe', color: '#075985' }}>
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice('')} aria-label="Dismiss"><X size={12} /></button>
          </div>
        )}
        <table ref={tableRef} className="w-full text-xs" style={rz.tableStyle}>
          <ResizableColgroup rz={rz} />
          <thead>
            <tr className="sticky top-0 z-10" style={{ background: 'var(--off-white)' }}>
              {['PV Date', 'PV No.', 'HMO', 'Doctor', 'Cheque No.', 'Consults', 'Gross', 'VAT', 'WTax', 'Cheque Amount', 'Proof', 'Notes', 'Recorded By', ''].map((h, hi) => (
                <th key={h} className={`relative px-3 py-2 font-semibold whitespace-nowrap ${['Gross', 'VAT', 'WTax', 'Cheque Amount'].includes(h) ? 'text-right' : 'text-left'}`} style={{ color: 'var(--mid-gray)' }}>
                  {h}{h && <ColResizeHandle rz={rz} index={hi} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={14} className="px-3 py-6 text-center" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="inline animate-spin mr-1" />Loading…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={14} className="px-3 py-6 text-center" style={{ color: 'var(--mid-gray)' }}>No payments to doctors recorded yet.</td></tr>
            ) : list.map(p => (
              <tr key={p.id} className="border-t align-top" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(p.pvDate)}</td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{p.pvNumber || '—'}</td>
                <td className="px-3 py-2">{p.hmo}</td>
                <td className="px-3 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>
                  {p.clinicianName}
                  {p.coursedThroughClinic && (
                    <span className="block mt-1">
                      <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap"
                        title="The HMO paid the clinic for these consults (one-off). They are our sales and receivable; the doctor is paid by RFP under 8190 for what the HMO paid us."
                        style={{ background: '#e0f2fe', color: '#075985' }}>coursed through clinic</span>
                      {p.rfp && p.rfp.status !== 'DELETED' ? (
                        <span className="block text-[10px] font-normal mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                          RFP <span className="font-mono">{p.rfp.refNumber}</span> · {p.rfp.status === 'PAID' ? 'paid' : 'unpaid'}
                        </span>
                      ) : canWrite ? (
                        <button onClick={() => prepareRfp(p)} disabled={rfpBusy === p.id}
                          className="block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border disabled:opacity-50"
                          style={{ borderColor: '#075985', color: '#075985' }}>
                          {rfpBusy === p.id ? 'Preparing…' : 'Prepare RFP'}
                        </button>
                      ) : (
                        <span className="block text-[10px] font-normal mt-0.5" style={{ color: '#b45309' }}>no RFP yet</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{p.checkNumber || '—'}</td>
                <td className="px-3 py-2" title={p.items.map(i => `${i.patientName || ''}${i.sessionDate ? ` · ${fmtDate(i.sessionDate)}` : ''}${i.orderNumber ? ` · #${i.orderNumber}` : ''}`).join('\n')}>
                  {p.items.length} consult{p.items.length === 1 ? '' : 's'}
                  <span className="block text-[10px] max-w-[220px] truncate" style={{ color: 'var(--mid-gray)' }}>{p.items.map(i => i.patientName).join(', ')}</span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(p.grossAmount)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{p.vatAmount ? formatCurrency(p.vatAmount) : '—'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{p.wtaxAmount ? `(${formatCurrency(p.wtaxAmount)})` : '—'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{formatCurrency(p.netAmount)}</td>
                <td className="px-3 py-2">
                  {proofs(p.proofUrl).length === 0 ? <span style={{ color: 'var(--light-gray)' }}>—</span>
                    : proofs(p.proofUrl).map(u => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block underline" style={{ color: 'var(--teal)' }}>{u.split('/').pop()}</a>)}
                </td>
                <td className="px-3 py-2 max-w-[220px]" style={{ color: 'var(--mid-gray)' }}>{p.notes || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.createdByName || '—'}</td>
                <td className="px-3 py-2">
                  {canWrite && <button onClick={() => remove(p)} title="Delete this record" className="p-1 rounded hover:bg-red-50"><Trash2 size={12} style={{ color: '#dc2626' }} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
          {list.length > 0 && (
            <tfoot>
              <tr className="border-t" style={{ borderColor: 'var(--light-gray)', background: 'var(--pale-teal)' }}>
                <td colSpan={6} className="px-3 py-1.5 font-bold" style={{ color: 'var(--deep-teal)' }}>Total ({list.length})</td>
                {(['grossAmount', 'vatAmount', 'wtaxAmount', 'netAmount'] as const).map(k => (
                  <td key={k} className="px-3 py-1.5 text-right font-bold whitespace-nowrap" style={{ color: 'var(--deep-teal)' }}>{formatCurrency(list.reduce((s, p) => s + p[k], 0))}</td>
                ))}
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </PaymentsCard>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--charcoal)' }}><Stethoscope size={16} /> Record a payment to a doctor</h3>
              <button onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Who did the HMO pay?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  [false, 'The doctor', 'PV made out to the doctor'],
                  [true, 'The clinic', 'Coursed through us this time'],
                ] as const).map(([val, title, sub]) => (
                  <button key={title} type="button" onClick={() => setCoursed(val)}
                    className="text-left px-3 py-2 rounded-xl border text-xs"
                    style={{ borderColor: coursed === val ? '#9a3412' : 'var(--light-gray)', background: coursed === val ? '#fff7ed' : 'white' }}>
                    <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</span>
                    <span className="block" style={{ color: 'var(--mid-gray)' }}>{sub}</span>
                  </button>
                ))}
              </div>
            </div>
            {coursed ? (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: '#e0f2fe', color: '#075985' }}>
                The HMO paid SCEI for these consults. Saving records them as <strong>our sales and receivable</strong> (tag them when you record the
                HMO&apos;s payment) and prepares an <strong>RFP payable to the doctor</strong> under 8190 Professional Fees (Consultants) for
                the amount the HMO paid us.
              </p>
            ) : (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: '#fff7ed', color: '#9a3412' }}>
                For HMO PVs made out to the doctor. Documentation only — no cash, journal entry or AR change is recorded.
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>HMO
                <select value={walletId} onChange={e => { setWalletId(e.target.value); setPicked(new Set()) }} className={inp} style={inpStyle}>
                  <option value="">Choose…</option>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Doctor
                <NameCombobox value={doctor} onChange={setDoctor} options={doctors} placeholder="e.g. JOHN DE CASTRO" className={inp} style={inpStyle} />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>PV No.
                <input value={pvNumber} onChange={e => setPvNumber(e.target.value.toUpperCase())} placeholder="PV-00-…" className={`${inp} font-mono`} style={inpStyle} />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>PV Date
                <input type="date" value={pvDate} onChange={e => setPvDate(e.target.value)} className={inp} style={inpStyle} />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Cheque No.
                <input value={checkNumber} onChange={e => setCheckNumber(e.target.value.toUpperCase())} className={`${inp} font-mono`} style={inpStyle} />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Gross (professional fees)
                <input type="number" step="0.01" value={gross} onChange={e => setGross(e.target.value)} className={inp} style={inpStyle} />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>VAT
                <input type="number" step="0.01" value={vat} onChange={e => setVat(e.target.value)} className={inp} style={inpStyle} />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>WTax
                <input type="number" step="0.01" value={wtax} onChange={e => setWtax(e.target.value)} className={inp} style={inpStyle} />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>{coursed ? 'Amount the HMO paid us (RFP amount)' : 'Cheque amount'}
                <input type="number" step="0.01" value={net} onChange={e => setNet(e.target.value)} placeholder={autoNet ? autoNet.toFixed(2) : ''} className={inp} style={inpStyle} />
              </label>
              {coursed && (
                <label className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Branch paying the doctor
                  <select value={rfpBranch} onChange={e => setRfpBranch(e.target.value)} className={inp} style={inpStyle}>
                    <option value="">Same as the consults</option>
                    <option value="SANDBOX_EAST">East</option>
                    <option value="SANDBOX_GREENHILLS">Greenhills</option>
                  </select>
                </label>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
                  Consults this PV covers {picked.size > 0 && <span style={{ color: 'var(--teal)' }}>· {picked.size} ticked</span>}
                </p>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search patient / date…" className="px-2 py-1 rounded-lg border text-xs" style={inpStyle} />
              </div>
              <div className="rounded-xl border max-h-56 overflow-y-auto" style={inpStyle}>
                {!walletId ? <p className="p-3 text-xs" style={{ color: 'var(--mid-gray)' }}>Choose the HMO first.</p>
                  : shownCandidates.length === 0 ? <p className="p-3 text-xs" style={{ color: 'var(--mid-gray)' }}>No unlinked consults{doctor.trim() ? ' for this doctor' : ''}.</p>
                  : shownCandidates.map(c => (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b last:border-b-0 cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--light-gray)' }}>
                      <input type="checkbox" checked={picked.has(c.id)} onChange={() => setPicked(s => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })} />
                      <span className="w-24 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{fmtDate(c.date)}</span>
                      <span className="flex-1 font-medium" style={{ color: 'var(--charcoal)' }}>{c.patientName}</span>
                      <span style={{ color: 'var(--mid-gray)' }}>{c.clinicianName}</span>
                      <span className="w-16 text-right" style={{ color: 'var(--mid-gray)' }}>#{c.orderNumber}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Proof (PV / cheque / 2307)</p>
              {proofUrls.map(u => (
                <div key={u} className="flex items-center gap-2 text-xs mb-1">
                  <a href={u} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--teal)' }}>{u.split('/').pop()}</a>
                  <button onClick={() => setProofUrls(s => s.filter(x => x !== u))}><X size={12} style={{ color: '#dc2626' }} /></button>
                </div>
              ))}
              <ScanUpload section="ar" prefix={`MDPV-${pvNumber || pvDate || 'doctor'}`} existingCount={proofUrls.length}
                label={proofUrls.length ? 'Add another file' : 'Upload file'} onUploaded={u => setProofUrls(s => [...s, u])} />
            </div>

            <label className="block text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>Notes
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inp} resize-none`} style={inpStyle} />
            </label>

            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
              <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: '#9a3412' }}>
                {busy && <Loader2 size={14} className="animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
