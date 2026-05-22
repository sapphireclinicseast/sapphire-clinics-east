'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getTemplates,
  hydrateTemplatesFromServer, uploadTemplate, deleteTemplateServer, fetchTemplateFileBlob,
  type TemplateRecord, type CurriculumFile,
} from '@/lib/session'

const PDF_ACCEPT = '.pdf,application/pdf'
const DOC_ACCEPT = '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

interface Props {
  viewer: { role: 'TEACHER' | 'ADMIN'; email: string }
}

/**
 * Free-form template library. Admin + teacher can upload reusable
 * documents (lesson plan template, sample IEP, etc.) with optional PDF
 * and Word versions of the same file. Visible to both roles; either
 * can delete templates they uploaded (admin can delete anything).
 */
export default function TemplatesPanel({ viewer }: Props) {
  const [items, setItems] = useState<TemplateRecord[]>([])
  const [title, setTitle] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function refresh() {
    setItems(getTemplates())
    const fresh = await hydrateTemplatesFromServer()
    setItems(fresh)
  }
  useEffect(() => { void refresh() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let pool = [...items].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    if (q) {
      pool = pool.filter(t => {
        const hay = `${t.title} ${t.pdf?.fileName ?? ''} ${t.doc?.fileName ?? ''} ${t.uploadedBy}`.toLowerCase()
        return hay.includes(q)
      })
    }
    return pool
  }, [items, search])

  async function handleSave() {
    setErr(null)
    if (!title.trim()) { setErr('Please add a title.'); return }
    if (!pdfFile && !docFile) { setErr('Please attach a PDF and/or Word version.'); return }
    setBusy(true)
    try {
      const id = 'tpl_' + Math.random().toString(36).slice(2, 10)
      const ok = await uploadTemplate({
        id,
        title: title.trim(),
        pdf: pdfFile ?? undefined,
        doc: docFile ?? undefined,
      })
      if (!ok) {
        setErr('Could not upload — please retry.')
        return
      }
      setTitle(''); setPdfFile(null); setDocFile(null)
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(t: TemplateRecord) {
    if (!confirm(`Delete template "${t.title}"?`)) return
    const ok = await deleteTemplateServer(t.id)
    if (!ok) {
      setErr('Could not delete — please retry.')
      return
    }
    await refresh()
  }

  async function openBlob(fileId: string) {
    const blob = await fetchTemplateFileBlob(fileId)
    if (!blob) { alert('File not available.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  async function downloadBlob(fileId: string, fileName: string) {
    const blob = await fetchTemplateFileBlob(fileId)
    if (!blob) { alert('File not available.'); return }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5_000)
  }

  return (
    <div className="space-y-4">
      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-1">Upload template</h2>
        <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-4">
          Reusable documents — lesson plans, IEPs, sample forms. Attach a PDF, a Word version, or both. They&apos;ll be linked under one template entry.
        </p>
        {err && <div className="mb-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
        <label className="block mb-3">
          <span className="label">Title</span>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Quarterly IEP review template" />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <FileSlot label="PDF version" accept={PDF_ACCEPT} file={pdfFile} onPick={setPdfFile} />
          <FileSlot label="Word version (.doc / .docx)" accept={DOC_ACCEPT} file={docFile} onPick={setDocFile} />
        </div>
        <button type="button" className="btn-primary text-xs mt-4" onClick={handleSave} disabled={busy || (!pdfFile && !docFile) || !title.trim()}>
          {busy ? 'Uploading…' : 'Save template'}
        </button>
      </div>

      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-[18px] leading-tight">All templates</h2>
          <input
            className="input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, file name, or uploader"
            style={{ width: 280 }}
          />
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">No templates yet.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">No templates match this search.</p>
        ) : (
          <ul className="divide-y rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
            {filtered.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[color:var(--narra)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{t.title}</div>
                  <div className="text-[11.5px] text-[color:var(--mid-gray)] truncate">
                    {[
                      t.pdf ? `PDF ${(t.pdf.fileSize / 1024).toFixed(0)} KB` : null,
                      t.doc ? `Word ${(t.doc.fileSize / 1024).toFixed(0)} KB` : null,
                    ].filter(Boolean).join(' · ')} · uploaded by {t.uploadedBy} on {new Date(t.uploadedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0 justify-end">
                  {t.pdf && <FileChip label="PDF" file={t.pdf} onOpen={openBlob} onDownload={downloadBlob} />}
                  {t.doc && <FileChip label="Word" file={t.doc} onOpen={openBlob} onDownload={downloadBlob} />}
                  {(viewer.role === 'ADMIN' || t.uploadedBy === viewer.email) && (
                    <button className="text-xs px-2 py-1 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]" onClick={() => handleDelete(t)}>Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function FileSlot({ label, accept, file, onPick }: { label: string; accept: string; file: File | null; onPick: (f: File | null) => void }) {
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    onPick(f)
  }
  return (
    <div
      className="rounded-xl p-3 border flex items-start justify-between gap-3"
      style={{ borderColor: file ? 'var(--sage)' : 'var(--paper-3)', background: file ? 'var(--sage-tint)' : 'var(--paper-2)' }}
    >
      <div className="min-w-0">
        <div className="text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] font-semibold mb-1" style={{ fontFamily: 'var(--font-display)' }}>{label}</div>
        <div className="text-[13px] text-[color:var(--ink)] truncate">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'No file selected.'}</div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <label className="btn-secondary text-xs cursor-pointer" style={{ width: 'auto' }}>
          {file ? 'Change' : 'Choose'}
          <input type="file" className="sr-only" accept={accept} onChange={pick} />
        </label>
        {file && <button type="button" className="text-xs px-2 py-1 rounded-md text-[color:var(--mid-gray)] hover:text-[color:var(--clay)]" onClick={() => onPick(null)}>Remove</button>}
      </div>
    </div>
  )
}

function FileChip({ label, file, onOpen, onDownload }: { label: string; file: CurriculumFile; onOpen: (id: string) => void; onDownload: (id: string, name: string) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <span className="text-[10.5px] uppercase tracking-[0.08em] font-bold text-[color:var(--mid-gray)] mr-1" style={{ fontFamily: 'var(--font-display)' }}>{label}</span>
      <button className="btn-secondary text-xs" onClick={() => onOpen(file.fileId)}>View</button>
      <button className="btn-primary text-xs" onClick={() => onDownload(file.fileId, file.fileName)}>Download</button>
    </div>
  )
}
