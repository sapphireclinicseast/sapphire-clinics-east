'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getTemplates,
  hydrateTemplatesFromServer, uploadTemplate, deleteTemplateServer, fetchTemplateFileBlob,
  migrateLocalTemplatesToServer,
  type TemplateRecord, type CurriculumFile,
} from '@/lib/session'
import {
  Banner, DashCard, EmptyState, Icon, RowsSkeleton, Tag,
  BTN_DANGER_GHOST, BTN_PRIMARY, BTN_SM, CONTROL, CONTROL_STYLE, DANGER, FILE_FOCUS, FOCUS,
  LABEL, LABEL_STYLE, PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG,
} from '@/components/hub/ui'

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
  // False until the first server pull lands, so an empty cache shows a
  // skeleton instead of "No templates yet".
  const [synced, setSynced] = useState(false)

  async function refresh() {
    setItems(getTemplates())
    // One-shot migration: push any pre-server-sync uploads from this
    // browser's IndexedDB to the VPS so other devices can see them.
    await migrateLocalTemplatesToServer()
    const fresh = await hydrateTemplatesFromServer()
    setItems(fresh)
    setSynced(true)
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

  const kb = (n: number) => `${Math.max(1, Math.round(n / 1024)).toLocaleString()} KB`
  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="space-y-5">
      <DashCard
        title="Upload template"
        icon={<Icon name="upload" size={16} />}
        description="Reusable documents — lesson plans, IEPs, sample forms. Attach a PDF, a Word version, or both; they're linked under one template entry."
      >
        <div className="space-y-4">
          {err && <Banner tone="error">{err}</Banner>}
          <div>
            <label htmlFor="tpl-title" className={LABEL} style={LABEL_STYLE}>Title</label>
            <input id="tpl-title" className={`${CONTROL} w-full h-10`} style={CONTROL_STYLE}
              value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Quarterly IEP review template" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <FileSlot label="PDF version" format="PDF" accept={PDF_ACCEPT} file={pdfFile} onPick={setPdfFile} />
            <FileSlot label="Word version" format=".doc / .docx" accept={DOC_ACCEPT} file={docFile} onPick={setDocFile} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={BTN_PRIMARY} style={PRIMARY_STYLE} onClick={handleSave} disabled={busy || (!pdfFile && !docFile) || !title.trim()}>
              <Icon name="upload" size={14} /> {busy ? 'Uploading…' : 'Save template'}
            </button>
            {!busy && (!title.trim() || (!pdfFile && !docFile)) && (
              <span className="text-[12px]" style={{ color: 'var(--mid-gray)' }}>
                {!title.trim() ? 'Add a title' : 'Attach a file'} to save.
              </span>
            )}
          </div>
        </div>
      </DashCard>

      <DashCard
        title={<>All templates{items.length > 0 && <span className="ml-1.5 text-[12px] font-semibold tabular-nums" style={{ color: 'var(--mid-gray)' }}>{items.length}</span>}</>}
        icon={<Icon name="file" size={16} />}
        flush
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
              <input
                className={`${CONTROL} pl-8 w-[min(280px,70vw)]`}
                style={CONTROL_STYLE}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search title, file, uploader"
                aria-label="Search templates"
              />
            </div>
            <button
              type="button"
              className={BTN_SM}
              style={{ ...SECONDARY_STYLE, color: 'var(--mid-gray)' }}
              title="Wipe this browser's cached template list and pull a fresh copy from the server. Use after deleting a stale local-only entry."
              onClick={() => {
                if (typeof window === 'undefined') return
                localStorage.removeItem('scei_class_templates_v1')
                void refresh()
              }}
            >
              <Icon name="refresh" size={12} /> Reset &amp; resync
            </button>
          </div>
        }
      >
        {items.length === 0 ? (
          synced
            ? <EmptyState icon="file" title="No templates yet" hint="Upload a lesson plan, IEP or sample form above and it appears here for every teacher." />
            : <RowsSkeleton rows={3} label="Loading templates" />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="No templates match this search" hint="Try a different title, file name or uploader." />
        ) : (
          <ul>
            {filtered.map((t, i) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-3 transition-colors hover:bg-[#F8FAF2]"
                style={{ borderTop: i ? '1px solid var(--light-gray)' : undefined }}>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
                  <Icon name="file" size={16} />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <div className="text-sm font-semibold leading-tight break-words" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{t.title}</div>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1 text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
                    {t.pdf && <Tag tone="neutral">PDF · {kb(t.pdf.fileSize)}</Tag>}
                    {t.doc && <Tag tone="info">Word · {kb(t.doc.fileSize)}</Tag>}
                    <span className="break-all">by {t.uploadedBy}</span>
                    {fmtDate(t.uploadedAt) && <><span aria-hidden>·</span><span>{fmtDate(t.uploadedAt)}</span></>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 justify-end ml-auto">
                  {t.pdf && <FileChip label="PDF" file={t.pdf} onOpen={openBlob} onDownload={downloadBlob} />}
                  {t.doc && <FileChip label="Word" file={t.doc} onOpen={openBlob} onDownload={downloadBlob} />}
                  {(viewer.role === 'ADMIN' || t.uploadedBy === viewer.email) && (
                    <button type="button" className={BTN_DANGER_GHOST} style={{ color: DANGER }} onClick={() => handleDelete(t)}
                      aria-label={`Delete template ${t.title}`} title="Delete template">
                      <Icon name="trash" size={13} /> <span className="hidden sm:inline">Delete</span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </div>
  )
}

function FileSlot({ label, format, accept, file, onPick }: { label: string; format: string; accept: string; file: File | null; onPick: (f: File | null) => void }) {
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    onPick(f)
  }
  return (
    <div
      className="rounded-xl p-3.5 flex items-center gap-3 min-w-0 transition-colors"
      style={{ border: `1px ${file ? 'solid' : 'dashed'} ${file ? '#9FC08A' : 'var(--light-gray)'}`, background: file ? '#F6FAF2' : SUBTLE_BG }}
    >
      <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={file ? { background: '#EEF5E8', color: '#2F5A28' } : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}>
        <Icon name={file ? 'check' : 'file'} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: 'var(--mid-gray)' }}>
          {label} <span className="normal-case tracking-normal font-normal">({format})</span>
        </div>
        <div className="text-[13px] truncate mt-0.5" style={{ color: file ? 'var(--charcoal)' : 'var(--mid-gray)' }} title={file?.name}>
          {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'No file selected'}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <label className={`${BTN_SM} cursor-pointer ${FILE_FOCUS}`} style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}>
          {file ? 'Change' : 'Choose'}
          <input type="file" className="sr-only" accept={accept} onChange={pick} />
        </label>
        {file && (
          <button type="button" className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white ${FOCUS}`}
            style={{ color: 'var(--mid-gray)' }} onClick={() => onPick(null)} aria-label={`Remove ${label}`} title="Remove">
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function FileChip({ label, file, onOpen, onDownload }: { label: string; file: CurriculumFile; onOpen: (id: string) => void; onDownload: (id: string, name: string) => void }) {
  // Format tag + View and Download buttons. Labels carry the format so
  // screen readers hear "View PDF" / "Download Word".
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg text-[11px] h-8" style={{ border: '1px solid var(--light-gray)', background: '#fff' }}>
      <span className="px-2 flex items-center font-bold text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: 'var(--mid-gray)', background: SUBTLE_BG }}>{label}</span>
      <button
        type="button"
        title="View in a new tab"
        aria-label={`View ${label}`}
        className={`px-2 inline-flex items-center gap-1 font-semibold transition-colors hover:bg-[color:var(--paper)] ${FOCUS}`}
        style={{ borderLeft: '1px solid var(--light-gray)', color: 'var(--deep-teal)' }}
        onClick={() => onOpen(file.fileId)}
      ><Icon name="eye" size={12} /> View</button>
      <button
        type="button"
        title="Download"
        aria-label={`Download ${label}`}
        className={`w-8 inline-flex items-center justify-center text-white transition-opacity hover:opacity-90 ${FOCUS}`}
        style={{ background: 'var(--deep-teal)' }}
        onClick={() => onDownload(file.fileId, file.fileName)}
      ><Icon name="download" size={12} /></button>
    </div>
  )
}
