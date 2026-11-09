'use client'

// Expenses → One-time expense → Bulk upload. Three steps: download the
// template (real Excel dropdowns, incl. the chart of accounts), upload it for
// a checked preview, then import. Proof can't come in a spreadsheet, so the
// dialog says so at every step and offers the "No proof" view afterwards.

import { useState } from 'react'
import { Loader2, X, Download, Upload, AlertTriangle, CheckCircle2, Paperclip } from 'lucide-react'
import { PART_VAT, type RawRow, type RowResult } from '@/lib/expenses/onetime-bulk'
import { parseOneTimeWorkbook } from '@/lib/expenses/onetime-parse'
import { netOfVat, vatOf } from '@/lib/vat'

interface Props {
  branch: string
  branchLabel: string
  accounts: { accountNumber: string; accountTitle: string }[]
  onClose: () => void
  onImported: () => void
  onShowNoProof: () => void
}
type Parsed = { row: number; cells: RawRow }[]
type Created = { id: string; pcvNumber: string; grossAmount: number }[]

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// The reminder shown before and after an upload: no proof comes with it.
const ProofNote = ({ strong }: { strong?: boolean }) => (
  <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
    <Paperclip size={14} className="flex-shrink-0 mt-0.5" />
    <span>{strong ? <strong>Next: attach the proof to each of these entries.</strong> : <strong>Proof is not part of the upload.</strong>}{' '}
      Every uploaded entry starts without proof and is flagged <strong>No proof</strong> in the One-time grid until a receipt or invoice is attached.</span>
  </div>
)

export function OneTimeBulkUpload({ branch, branchLabel, accounts, onClose, onImported, onShowNoProof }: Props) {
  const [busy, setBusy] = useState<'' | 'template' | 'check' | 'import'>('')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [results, setResults] = useState<RowResult[] | null>(null)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ list: Created; total: number } | null>(null)

  const downloadTemplate = async () => {
    setBusy('template')
    try {
      const { buildOneTimeTemplate } = await import('@/lib/expenses/onetime-template')
      const blob = await buildOneTimeTemplate({ accounts, branchLabel }).generateAsync({
        type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `One-time expenses template (${branchLabel}).xlsx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } finally { setBusy('') }
  }

  const check = async (file: File) => {
    setError(''); setResults(null); setParsed(null); setFileName(file.name); setBusy('check')
    try {
      const rows = await parseOneTimeWorkbook(await file.arrayBuffer())
      if (!rows.length) { setError('No expense rows found in the sheet.'); return }
      const r = await fetch('/api/expenses/onetime-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, rows, dryRun: true }) })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Could not check the file'); return }
      setParsed(rows); setResults(d.results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file')
    } finally { setBusy('') }
  }

  const doImport = async () => {
    if (!parsed) return
    setBusy('import'); setError('')
    try {
      const r = await fetch('/api/expenses/onetime-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, rows: parsed }) })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Import failed'); if (d.results) setResults(d.results); return }
      setCreated({ list: d.created, total: d.total })
      onImported()
    } finally { setBusy('') }
  }

  const errorRows = results?.filter(r => r.errors.length).length ?? 0
  const warnRows = results?.filter(r => !r.errors.length && r.warnings.length).length ?? 0
  const okRows = results?.filter(r => r.data) ?? []
  const total = okRows.reduce((s, r) => s + (r.data?.grossAmount || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Bulk upload one-time expenses</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'var(--mid-gray)' }} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--mid-gray)' }}>Branch <strong style={{ color: 'var(--charcoal)' }}>{branchLabel}</strong> — the entries get this branch&apos;s next PCV numbers.</p>

        {created ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl px-3 py-3 text-sm" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
              <span><strong>{created.list.length} entr{created.list.length === 1 ? 'y' : 'ies'} added</strong> · ₱{peso(created.total)}
                {created.list.length > 0 && <> · {created.list[0].pcvNumber}{created.list.length > 1 ? ` to ${created.list[created.list.length - 1].pcvNumber}` : ''}</>}</span>
            </div>
            <ProofNote strong />
            <div className="flex gap-2">
              <button onClick={() => { onShowNoProof(); onClose() }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2" style={{ background: '#b45309' }}>
                <Paperclip size={15} /> Show entries without proof
              </button>
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Close</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>1 · Download the template</p>
              <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
                One row per expense. Dropdowns for Department, Valid/Invalid, Vatable, Has EWT?, EWT % and Account Title (the chart of accounts).
                For a receipt that is part VAT and part non-VAT, choose <strong>{PART_VAT}</strong> and type the VAT-inclusive part in <strong>VAT part (₱)</strong> — Net of VAT and the VAT Amount are computed from that part.
              </p>
              <button onClick={downloadTemplate} disabled={!!busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border disabled:opacity-50" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                {busy === 'template' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download template (.xlsx)
              </button>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--light-gray)' }}>
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--charcoal)' }}>2 · Upload the filled template</p>
              <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>Every row is checked first — nothing is saved until you click Import.</p>
              <label className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`} style={{ background: 'var(--teal)' }}>
                {busy === 'check' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Choose file…
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) check(f) }} />
              </label>
              {fileName && <span className="ml-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{fileName}</span>}
            </div>

            <ProofNote />

            {error && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}

            {results && (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ background: 'var(--off-white)', color: 'var(--charcoal)' }}>
                  <span><strong>3 · Check</strong> — {results.length} row{results.length === 1 ? '' : 's'}</span>
                  <span>₱{peso(total)} gross</span>
                  {errorRows > 0 && <span style={{ color: '#b91c1c' }}><strong>{errorRows}</strong> with errors — fix them in the sheet and upload again</span>}
                  {warnRows > 0 && <span style={{ color: '#b45309' }}>{warnRows} with notes</span>}
                </div>
                <div className="max-h-[42vh] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr>{['Row', 'Payee / Description', 'Date', 'Vatable', 'Gross', 'Net of VAT', 'VAT', 'Account Title', 'Check'].map((h, i) => (
                        <th key={h} className={`px-2.5 py-2 font-semibold whitespace-nowrap ${i >= 4 && i <= 6 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--charcoal)', borderBottom: '1px solid var(--light-gray)' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {results.map(r => {
                        const d = r.data
                        const src = parsed?.find(p => p.row === r.row)?.cells
                        const v = d ? { vatable: d.vatable, grossAmount: d.grossAmount, vatPortion: d.vatPortion } : null
                        return (
                          <tr key={r.row} className="border-t align-top" style={{ borderColor: 'var(--light-gray)', background: r.errors.length ? '#fef2f2' : undefined }}>
                            <td className="px-2.5 py-1.5 font-mono" style={{ color: 'var(--mid-gray)' }}>{r.row}</td>
                            <td className="px-2.5 py-1.5" style={{ color: 'var(--charcoal)' }}>{d ? (d.requestor || '—') : String(src?.requestor ?? '')}<div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{d ? d.description : String(src?.description ?? '')}</div></td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap">{d?.date || ''}</td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap">{d ? (d.vatPortion != null ? `${PART_VAT} (₱${peso(d.vatPortion)})` : d.vatable || '—') : ''}</td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums">{d ? peso(d.grossAmount) : ''}</td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums">{v ? peso(netOfVat(v)) : ''}</td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums">{v ? peso(vatOf(v)) : ''}</td>
                            <td className="px-2.5 py-1.5" style={{ color: 'var(--mid-gray)' }}>{d?.accountTitle || ''}</td>
                            <td className="px-2.5 py-1.5">
                              {r.errors.map((m, i) => <div key={`e${i}`} style={{ color: '#b91c1c' }}>✕ {m}</div>)}
                              {r.warnings.map((m, i) => <div key={`w${i}`} style={{ color: '#b45309' }}>! {m}</div>)}
                              {!r.errors.length && !r.warnings.length && <span style={{ color: '#16a34a' }}>OK</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {results && (
              <button onClick={doImport} disabled={!!busy || errorRows > 0 || !okRows.length}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>
                {busy === 'import' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {errorRows > 0 ? `Fix the ${errorRows} row${errorRows === 1 ? '' : 's'} with errors first` : `Import ${okRows.length} entr${okRows.length === 1 ? 'y' : 'ies'} · ₱${peso(total)}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
