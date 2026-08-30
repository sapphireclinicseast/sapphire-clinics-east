'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { schemaFor, DOC_TYPE_LABEL, type DocType, type DocVariant, type Section } from '@/lib/forms/schemas'
import ViewDocButton from '@/components/ViewDocButton'

interface Doc { id: string; type: string; status: string; source: string; data: Record<string, unknown>; createdAt: string }
const TYPES: DocType[] = ['INITIAL_EVAL', 'RE_EVAL', 'TREATMENT', 'PROGRESS_REPORT', 'HEP']

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
}

export default function DocWorkspace({ bookingId, patientName, patientAge, variant, date, docs }: { bookingId: string; patientName: string; patientAge: number | null; variant: DocVariant; date: string; docs: Doc[] }) {
  const router = useRouter()
  const [type, setType] = useState<DocType | null>(null)
  const [docId, setDocId] = useState<string | null>(null)
  const [data, setData] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const schema = type ? schemaFor(type, variant) : null
  const set = (k: string, v: unknown) => setData((s) => ({ ...s, [k]: v }))
  const setCell = (key: string, r: number, c: number, v: string) => setData((s) => {
    const grid = Array.isArray(s[key]) ? (s[key] as string[][]).map((row) => [...row]) : []
    while (grid.length <= r) grid.push([])
    grid[r][c] = v
    return { ...s, [key]: grid }
  })

  function startNew(t: DocType) { setType(t); setDocId(null); setData({ date }); setMsg(null) }
  function editExisting(d: Doc) { if (d.source !== 'FORM') return; setType(d.type as DocType); setDocId(d.id); setData(d.data || {}); setMsg(null) }

  async function save(finalize: boolean) {
    if (!type) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/provider/document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: docId, bookingId, type, data, finalize }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setDocId(d.id); setMsg(finalize ? 'PDF generated & shared with the patient.' : 'Draft saved.')
      if (finalize) { setType(null); setDocId(null); setData({}) }
      router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  async function uploadFile(t: DocType, source: 'UPLOAD' | 'PHOTO', file: File) {
    if (file.size > 12_000_000) { setMsg('File too large (max ~9 MB).'); return }
    setBusy(true); setMsg(null)
    try {
      const dataUri = await readFile(file)
      const r = await fetch('/api/provider/document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId, type: t, file: dataUri, source }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setMsg(source === 'PHOTO' ? 'Photo saved & shared.' : 'File uploaded & shared.'); router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <a href="/provider" className="text-[12px] text-[color:var(--steel)] hover:underline">← Back to schedule</a>
      <div className="card">
        <h1 className="text-[18px] font-semibold text-[color:var(--ink)]">Documentation</h1>
        <p className="mt-0.5 text-[13px] text-[color:var(--slate)]">{patientName}{patientAge != null ? ` · ${patientAge} yrs` : ''} · visit {date} · <b className="text-[color:var(--ink)]">{variant === 'PEDIA' ? 'Pediatric' : 'Adult'}</b> forms</p>
        {msg && <div className="mt-2 rounded-lg bg-[color:var(--mist)] px-3 py-2 text-[13px] text-[color:var(--slate)]">{msg}</div>}
      </div>

      {!schema && (
        <div className="card">
          <div className="mb-2 text-[13px] font-semibold text-[color:var(--ink)]">Start a document</div>
          <p className="mb-3 text-[12px] text-[color:var(--slate)]">The right form (adult or pediatric) is chosen automatically from the patient’s age.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <div key={t} className="rounded-xl border border-[color:var(--line)] p-3">
                <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">{DOC_TYPE_LABEL[t]}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
                  <button onClick={() => startNew(t)} className="btn-primary !px-3 !py-1.5 !text-[12.5px]">Fill form</button>
                  <label className="cursor-pointer rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 font-medium hover:bg-[color:var(--mist)]">Upload PDF<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(t, 'UPLOAD', f) }} /></label>
                  <label className="cursor-pointer rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 font-medium hover:bg-[color:var(--mist)]">Take photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(t, 'PHOTO', f) }} /></label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {schema && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[color:var(--ink)]">{schema.title}</h2>
            <button onClick={() => { setType(null); setDocId(null) }} className="text-[12.5px] font-medium text-[color:var(--slate)] hover:underline">Cancel</button>
          </div>
          <div className="space-y-4">
            {schema.sections.map((s: Section, i) => (
              <div key={i}>
                {s.title && <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[color:var(--sky)]">{s.title}</div>}
                {s.note && <p className="mb-2 text-[11.5px] italic text-[color:var(--muted)]">{s.note}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  {(s.fields ?? []).map((f) => (
                    <div key={f.key} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                      <div className="label">{f.label}</div>
                      {f.type === 'textarea'
                        ? <textarea className="input min-h-[64px]" value={String(data[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
                        : f.type === 'select'
                          ? <select className="select" value={String(data[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)}><option value="">—</option>{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                          : <input className="input" type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} value={String(data[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />}
                    </div>
                  ))}
                </div>
                {s.table && (
                  <div className="mt-1 overflow-x-auto rounded-lg border border-[color:var(--line)]">
                    <table className="w-full text-[12.5px]">
                      <thead><tr className="bg-[color:var(--mist)] text-left text-[11px] uppercase tracking-wide text-[color:var(--muted)]">{s.table.columns.map((c) => <th key={c} className="px-2 py-1.5 font-semibold">{c}</th>)}</tr></thead>
                      <tbody>
                        {Array.from({ length: s.table.rows ?? 3 }).map((_, r) => (
                          <tr key={r} className="border-t border-[color:var(--line)]">
                            {s.table!.columns.map((_, c) => {
                              const grid = (data[s.table!.key] as string[][]) || []
                              return <td key={c} className="px-1 py-1"><input className="w-full rounded border-0 bg-transparent px-1 py-1 text-[12.5px] focus:bg-[color:var(--mist)] focus:outline-none" value={grid[r]?.[c] ?? ''} onChange={(e) => setCell(s.table!.key, r, c, e.target.value)} /></td>
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-outline" disabled={busy} onClick={() => save(false)}>Save draft</button>
            <button className="btn-primary" disabled={busy} onClick={() => save(true)}>{busy ? 'Working…' : 'Generate PDF & share'}</button>
          </div>
        </div>
      )}

      {docs.length > 0 && (
        <div className="card p-0">
          <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Documents for this visit</b></div>
          <div className="divide-y divide-[color:var(--line)]">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <div>
                  <b className="text-[color:var(--ink)]">{DOC_TYPE_LABEL[d.type as DocType]}</b>
                  <div className="text-[12px] text-[color:var(--slate)]">{d.status === 'COMPLETED' ? (d.source === 'FORM' ? 'Generated PDF' : d.source === 'PHOTO' ? 'Photo' : 'Uploaded PDF') : 'Draft'} · {d.createdAt.slice(0, 10)}</div>
                </div>
                <div className="flex gap-2">
                  {d.status === 'COMPLETED' && <ViewDocButton docId={d.id} className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[color:var(--mist)]">View</ViewDocButton>}
                  {d.status === 'DRAFT' && d.source === 'FORM' && <button onClick={() => editExisting(d)} className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[color:var(--mist)]">Continue</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
