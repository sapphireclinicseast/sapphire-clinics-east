'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { doctorSchemaFor, DOCTOR_DOC_LABEL, type DoctorDocType } from '@/lib/forms/doctor-schemas'
import type { Section } from '@/lib/forms/schemas'
import ViewDocButton from '@/components/ViewDocButton'
import CameraCapture from '@/components/CameraCapture'

interface Doc { id: string; type: string; status: string; source: string; data: Record<string, unknown>; createdAt: string }
const TYPES: DoctorDocType[] = ['MD_INITIAL', 'MD_FOLLOWUP', 'MED_CERT', 'PRESCRIPTION']

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
}

export default function DoctorDocWorkspace({ consultId, patientName, patientAge, patientSex = null, hasSignature, date, docs }: { consultId: string; patientName: string; patientAge: number | null; patientSex?: string | null; hasSignature: boolean; date: string; docs: Doc[] }) {
  const router = useRouter()
  const [type, setType] = useState<DoctorDocType | null>(null)
  const [docId, setDocId] = useState<string | null>(null)
  const [data, setData] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [cameraFor, setCameraFor] = useState<DoctorDocType | null>(null)

  const schema = type ? doctorSchemaFor(type) : null
  const set = (k: string, v: unknown) => setData((s) => ({ ...s, [k]: v }))
  const toggle = (k: string, opt: string) => setData((s) => {
    const cur = Array.isArray(s[k]) ? (s[k] as string[]) : []
    return { ...s, [k]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] }
  })

  const sexAge = [patientSex, patientAge != null ? `${patientAge}` : null].filter(Boolean).join(' / ')
  function startNew(t: DoctorDocType) {
    setType(t); setDocId(null); setMsg(null)
    setData({ date, ...(patientSex ? { sex: patientSex } : {}), ...(t === 'PRESCRIPTION' && sexAge ? { sexAge } : {}) })
  }
  function editExisting(d: Doc) { if (d.source !== 'FORM') return; setType(d.type as DoctorDocType); setDocId(d.id); setData(d.data || {}); setMsg(null) }

  async function save(finalize: boolean) {
    if (!type) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/doctor/document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: docId, consultId, type, data, finalize }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setDocId(d.id); setMsg(finalize ? 'PDF generated & shared with the patient.' : 'Draft saved.')
      if (finalize) { setType(null); setDocId(null); setData({}) }
      router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }
  async function uploadDataUri(t: DoctorDocType, source: 'UPLOAD' | 'PHOTO', dataUri: string) {
    if (dataUri.length > 12_000_000) { setMsg('File too large (max ~9 MB).'); return }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/doctor/document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consultId, type: t, file: dataUri, source }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed')
      setMsg(source === 'PHOTO' ? 'Photo saved & shared.' : 'File uploaded & shared.'); router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <a href="/doctor" className="text-[12px] text-[color:var(--steel)] hover:underline">← Back to dashboard</a>
      <div className="card">
        <h1 className="text-[18px] font-semibold text-[color:var(--ink)]">Documentation</h1>
        <p className="mt-0.5 text-[13px] text-[color:var(--slate)]">{patientName}{patientAge != null ? ` · ${patientAge} yrs` : ''} · consult {date}</p>
        {msg && <div className="mt-2 rounded-lg bg-[color:var(--mist)] px-3 py-2 text-[13px] text-[color:var(--slate)]">{msg}</div>}
        {!hasSignature && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">Add your e-signature, PRC and PTR numbers in <a href="/doctor/settings" className="font-semibold underline">Settings</a> so they auto-fill your documents and prescription pad.</div>}
      </div>

      {!schema && (
        <div className="card">
          <div className="mb-2 text-[13px] font-semibold text-[color:var(--ink)]">Start a document</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <div key={t} className="rounded-xl border border-[color:var(--line)] p-3">
                <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">{DOCTOR_DOC_LABEL[t]}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
                  <button onClick={() => startNew(t)} className="btn-primary !px-3 !py-1.5 !text-[12.5px]">Fill form</button>
                  <label className="cursor-pointer rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 font-medium hover:bg-[color:var(--mist)]">Upload PDF<input type="file" accept="application/pdf,image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) uploadDataUri(t, 'UPLOAD', await readFile(f)) }} /></label>
                  <button type="button" onClick={() => setCameraFor(t)} className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 font-medium hover:bg-[color:var(--mist)]">Take photo</button>
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
                    <div key={f.key} className={f.full || f.type === 'textarea' || f.type === 'checkgroup' ? 'sm:col-span-2' : ''}>
                      <div className="label">{f.label}{f.key === 'sex' && patientSex ? <span className="ml-1 text-[10.5px] font-normal text-[color:var(--muted)]">· from patient profile</span> : null}</div>
                      {f.type === 'checkgroup'
                        ? <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-[color:var(--line)] p-2 sm:grid-cols-3">
                            {f.options?.map((o) => {
                              const on = Array.isArray(data[f.key]) && (data[f.key] as string[]).includes(o)
                              return <label key={o} className="flex items-center gap-1.5 text-[12px] text-[color:var(--slate)]"><input type="checkbox" checked={on} onChange={() => toggle(f.key, o)} className="accent-[color:var(--steel)]" />{o}</label>
                            })}
                          </div>
                        : f.key === 'sex' && patientSex
                        ? <input className="input bg-[color:var(--mist)] text-[color:var(--slate)]" value={String(data[f.key] ?? patientSex)} readOnly />
                        : f.type === 'textarea'
                        ? <textarea className="input min-h-[64px]" value={String(data[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
                        : f.type === 'select'
                          ? <select className="select" value={String(data[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)}><option value="">—</option>{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                          : <input className="input" type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} value={String(data[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-outline" disabled={busy} onClick={() => save(false)}>Save draft</button>
            <button className="btn-primary" disabled={busy} onClick={() => save(true)}>{busy ? 'Working…' : 'Generate PDF & share'}</button>
          </div>
        </div>
      )}

      <CameraCapture open={cameraFor !== null} onClose={() => setCameraFor(null)} onCapture={(uri) => { const t = cameraFor; setCameraFor(null); if (t) uploadDataUri(t, 'PHOTO', uri) }} />

      {docs.length > 0 && (
        <div className="card p-0">
          <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Documents for this consult</b></div>
          <div className="divide-y divide-[color:var(--line)]">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <div>
                  <b className="text-[color:var(--ink)]">{DOCTOR_DOC_LABEL[d.type as DoctorDocType] ?? d.type}</b>
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
