'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getCurriculum,
  hydrateCurriculumFromServer, uploadCurriculum, deleteCurriculumServer, fetchCurriculumFileBlob,
  migrateLocalCurriculumToServer,
  levelLabel, type CurriculumRecord, type CurriculumFile, type EnrollmentLevel,
} from '@/lib/session'
import {
  DashCard, Banner, EmptyState, Tag, Icon,
  CONTROL, CONTROL_STYLE, LABEL, LABEL_STYLE, FILE_FOCUS, FOCUS, DANGER, SUBTLE_BG,
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST, PRIMARY_STYLE, SECONDARY_STYLE,
} from '@/components/hub/ui'

const ALL_LEVELS: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12']

const PDF_ACCEPT = '.pdf,application/pdf'
const DOC_ACCEPT = '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLS_ACCEPT = '.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'

interface Props {
  viewer: { role: 'STUDENT' | 'TEACHER' | 'ADMIN'; level?: EnrollmentLevel; email: string }
}

/**
 * Curriculum templates list + upload. Each curriculum entry can carry a
 * PDF version AND a Word (.doc / .docx) version of the same document.
 * Either or both can be uploaded — at least one is required to save.
 * Legacy single-file records (uploaded before the split) still render
 * with their existing download button via the back-compat fileId field.
 */
export default function CurriculumPanel({ viewer }: Props) {
  const [items, setItems] = useState<CurriculumRecord[]>([])
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pickedLevel, setPickedLevel] = useState<EnrollmentLevel>('KINDER')
  const [title, setTitle] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [xlsFile, setXlsFile] = useState<File | null>(null)
  const [search, setSearch] = useState('')

  const canUpload = viewer.role === 'ADMIN' || viewer.role === 'TEACHER'

  // Students only see their own level. Admin/Teacher see everything.
  // Then filter by search query (title, file name, uploader) and sort
  // alphabetically by title so admins/teachers scan a stable order.
  const filtered = useMemo(() => {
    let pool = viewer.role === 'STUDENT' && viewer.level
      ? items.filter(c => c.level === viewer.level)
      : items
    const q = search.trim().toLowerCase()
    if (q) {
      pool = pool.filter(c => {
        const hay = `${c.title} ${c.pdf?.fileName ?? ''} ${c.doc?.fileName ?? ''} ${c.xls?.fileName ?? ''} ${c.fileName ?? ''} ${c.uploadedBy} ${levelLabel(c.level)}`.toLowerCase()
        return hay.includes(q)
      })
    }
    return [...pool].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  }, [items, viewer.role, viewer.level, search])

  async function refresh() {
    // Start with whatever localStorage cached so the panel renders instantly.
    setItems(getCurriculum())
    // One-shot: push any pre-server-sync uploads (still living in this
    // browser's IndexedDB) up to the VPS so other devices can see them.
    // Safe to call on every mount — already-migrated rows skip.
    await migrateLocalCurriculumToServer()
    // Pull the authoritative server list (which now includes anything we
    // just migrated) and replace the local cache.
    const fresh = await hydrateCurriculumFromServer()
    setItems(fresh)
  }
  useEffect(() => { void refresh() }, [])

  async function handleSave() {
    setErr(null)
    if (!title.trim()) { setErr('Please add a title.'); return }
    if (!pdfFile && !docFile && !xlsFile) { setErr('Please attach a PDF, Word, and/or Excel version.'); return }
    setUploading(true)
    try {
      const id = 'curri_' + Math.random().toString(36).slice(2, 10)
      const ok = await uploadCurriculum({
        id,
        level: pickedLevel,
        title: title.trim(),
        pdf: pdfFile ?? undefined,
        doc: docFile ?? undefined,
        xls: xlsFile ?? undefined,
      })
      if (!ok) {
        setErr('Could not upload — please retry.')
        return
      }
      setTitle(''); setPdfFile(null); setDocFile(null); setXlsFile(null)
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(c: CurriculumRecord) {
    if (!confirm(`Delete curriculum "${c.title}"?`)) return
    const ok = await deleteCurriculumServer(c.id)
    if (!ok) {
      setErr('Could not delete — please retry.')
      return
    }
    await refresh()
  }

  async function openFileBlob(fileId: string, fileName: string) {
    const blob = await fetchCurriculumFileBlob(fileId)
    if (!blob) { alert('File not available.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    void fileName
  }

  async function downloadFileBlob(fileId: string, fileName: string) {
    const blob = await fetchCurriculumFileBlob(fileId)
    if (!blob) { alert('File not available.'); return }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5_000)
  }

  return (
    <div className="space-y-5">
      {canUpload && (
        <DashCard
          title="Upload curriculum template"
          icon={<Icon name="upload" size={15} />}
          description={<>Attach a PDF, Word (.doc / .docx), and/or Excel (.xls / .xlsx / .csv) version. They&apos;ll be linked together under one curriculum entry — pick whichever formats apply.</>}
        >
          {err && <div className="mb-4"><Banner tone="error">{err}</Banner></div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL} style={LABEL_STYLE}>Title</span>
              <input className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Term 1 Math sequence" />
            </label>
            <label className="block">
              <span className={LABEL} style={LABEL_STYLE}>Grade level</span>
              <select className={`${CONTROL} w-full`} style={CONTROL_STYLE} value={pickedLevel} onChange={e => setPickedLevel(e.target.value as EnrollmentLevel)}>
                {ALL_LEVELS.map(l => <option key={l} value={l}>{levelLabel(l)}</option>)}
              </select>
            </label>
          </div>

          <div className="grid md:grid-cols-3 gap-3 mt-3">
            <FileSlot
              label="PDF version"
              accept={PDF_ACCEPT}
              file={pdfFile}
              onPick={setPdfFile}
            />
            <FileSlot
              label="Word version (.doc / .docx)"
              accept={DOC_ACCEPT}
              file={docFile}
              onPick={setDocFile}
            />
            <FileSlot
              label="Excel version (.xls / .xlsx / .csv)"
              accept={XLS_ACCEPT}
              file={xlsFile}
              onPick={setXlsFile}
            />
          </div>

          <button type="button" className={`${BTN_PRIMARY} mt-4`} style={PRIMARY_STYLE} onClick={handleSave} disabled={uploading || (!pdfFile && !docFile && !xlsFile) || !title.trim()}>
            {uploading ? 'Uploading…' : 'Save curriculum'}
          </button>
        </DashCard>
      )}

      <DashCard
        flush
        title={viewer.role === 'STUDENT' ? 'Your curriculum' : 'All curriculum templates'}
        icon={<Icon name="book" size={15} />}
        description={viewer.role !== 'STUDENT' && items.length > 0 ? `${filtered.length} of ${items.length} document${items.length === 1 ? '' : 's'}${search.trim() ? ' match this search' : ''}` : undefined}
        action={viewer.role !== 'STUDENT' && (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="relative block w-full sm:w-72">
              <span className="sr-only">Search curriculum</span>
              <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
              <input
                className={`${CONTROL} w-full pl-8`}
                style={CONTROL_STYLE}
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by title, file name, uploader, or grade"
              />
            </label>
            <button
              type="button"
              className={BTN_SECONDARY}
              style={SECONDARY_STYLE}
              title="Wipe this browser's cached curriculum list and pull a fresh copy from the server. Use after deleting a stale local-only entry."
              onClick={() => {
                if (typeof window === 'undefined') return
                localStorage.removeItem('scei_class_curriculum_v1')
                void refresh()
              }}
            >
              <Icon name="refresh" size={14} /> Reset &amp; resync
            </button>
          </div>
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon="book" title="No curriculum templates yet." />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="No curriculum templates match this search." hint="Try a shorter word, a file name, or a grade such as “Kinder”." />
        ) : (
          <div className="p-3 sm:p-4">
            <CurriculumGrouped
              items={filtered}
              viewer={viewer}
              onOpen={openFileBlob}
              onDownload={downloadFileBlob}
              onDelete={handleDelete}
              singleLevel={viewer.role === 'STUDENT'}
            />
          </div>
        )}
      </DashCard>
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
      className="rounded-xl p-3 flex flex-col gap-2.5 min-w-0"
      style={{
        border: `1px ${file ? 'solid' : 'dashed'} ${file ? 'var(--sage)' : 'var(--light-gray)'}`,
        background: file ? 'var(--sage-tint)' : SUBTLE_BG,
      }}
    >
      <div className="min-w-0">
        <div className={`${LABEL} mb-1`} style={LABEL_STYLE}>{label}</div>
        <div className="flex items-center gap-1.5 text-[13px] min-w-0" style={{ color: file ? 'var(--charcoal)' : 'var(--mid-gray)' }}>
          {file && <Icon name="check" size={14} style={{ color: '#2F5A28' }} />}
          <span className="truncate">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'No file selected.'}</span>
        </div>
      </div>
      <div className="flex gap-1.5">
        <label className={`${BTN_SM} ${FILE_FOCUS}`} style={SECONDARY_STYLE}>
          <Icon name="upload" size={12} />
          {file ? 'Change' : 'Choose'}
          <input type="file" className="sr-only" accept={accept} onChange={pick} />
        </label>
        {file && (
          <button type="button" className={BTN_SM} style={{ color: 'var(--mid-gray)' }} onClick={() => onPick(null)}>Remove</button>
        )}
      </div>
    </div>
  )
}

/**
 * Renders the curriculum list grouped per grade level so admins/teachers
 * can scan compactly. Each level is a collapsible section; defaults to
 * open. Empty levels are hidden.
 */
function CurriculumGrouped({ items, viewer, onOpen, onDownload, onDelete, singleLevel }: {
  items: CurriculumRecord[]
  viewer: { role: 'STUDENT' | 'TEACHER' | 'ADMIN'; email: string }
  onOpen: (fileId: string, fileName: string) => void
  onDownload: (fileId: string, fileName: string) => void
  onDelete: (c: CurriculumRecord) => void
  singleLevel: boolean
}) {
  // Group by level, preserving the ALL_LEVELS order
  const byLevel: Record<EnrollmentLevel, CurriculumRecord[]> = {
    NURSERY:  [], KINDER:   [], GRADE_1:  [], GRADE_2:  [], GRADE_3:  [], GRADE_4:  [],
    GRADE_5:  [], GRADE_6:  [], GRADE_7:  [], GRADE_8:  [], GRADE_9:  [], GRADE_10: [],
    GRADE_11: [], GRADE_12: [],
  }
  for (const c of items) byLevel[c.level].push(c)

  function metaLine(c: CurriculumRecord): string {
    const sizes: string[] = []
    if (c.pdf) sizes.push(`PDF ${(c.pdf.fileSize / 1024).toFixed(0)} KB`)
    if (c.doc) sizes.push(`Word ${(c.doc.fileSize / 1024).toFixed(0)} KB`)
    if (c.xls) sizes.push(`Excel ${(c.xls.fileSize / 1024).toFixed(0)} KB`)
    if (!c.pdf && !c.doc && !c.xls && c.fileSize) sizes.push(`${(c.fileSize / 1024).toFixed(0)} KB`)
    return `${sizes.join(' · ')}${sizes.length ? ' · ' : ''}uploaded by ${c.uploadedBy} on ${new Date(c.uploadedAt).toLocaleDateString()}`
  }

  function legacy(c: CurriculumRecord): CurriculumFile | null {
    if (c.pdf || c.doc || c.xls) return null
    if (!c.fileId || !c.fileName) return null
    return { fileId: c.fileId, fileName: c.fileName, fileType: c.fileType ?? '', fileSize: c.fileSize ?? 0 }
  }

  return (
    <div className="space-y-2.5">
      {ALL_LEVELS.map(lvl => {
        const list = byLevel[lvl]
        if (list.length === 0) return null
        return (
          <details key={lvl} open className="group rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
            <summary className={`flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden ${FOCUS}`} style={{ background: SUBTLE_BG }}>
              <span className="flex items-center gap-2 text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                <Icon name="chevronRight" size={14} className="transition-transform group-open:rotate-90" style={{ color: 'var(--mid-gray)' }} />
                {levelLabel(lvl)}
              </span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>{list.length} document{list.length === 1 ? '' : 's'}</span>
            </summary>
            <ul>
              {list.map(c => {
                const legacyFile = legacy(c)
                return (
                  <li key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-4 py-3 text-sm" style={{ borderTop: '1px solid var(--light-gray)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold break-words" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{c.title}</div>
                      <div className="text-xs mt-0.5 break-words" style={{ color: 'var(--mid-gray)' }}>{metaLine(c)}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 shrink-0 sm:justify-end">
                      {c.pdf && (
                        <FileButtons label="PDF" file={c.pdf} onOpen={onOpen} onDownload={onDownload} />
                      )}
                      {c.doc && (
                        <FileButtons label="Word" file={c.doc} onOpen={onOpen} onDownload={onDownload} />
                      )}
                      {c.xls && (
                        <FileButtons label="Excel" file={c.xls} onOpen={onOpen} onDownload={onDownload} />
                      )}
                      {legacyFile && (
                        <FileButtons label="File" file={legacyFile} onOpen={onOpen} onDownload={onDownload} />
                      )}
                      {(viewer.role === 'ADMIN' || c.uploadedBy === viewer.email) && (
                        <button type="button" className={BTN_DANGER_GHOST} style={{ color: DANGER }} onClick={() => onDelete(c)} aria-label={`Delete ${c.title}`}><Icon name="trash" size={12} /> Delete</button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </details>
        )
      })}
      {singleLevel && Object.values(byLevel).flat().length === 0 && (
        <EmptyState icon="book" title="No curriculum for your level yet." />
      )}
    </div>
  )
}

function FileButtons({ label, file, onOpen, onDownload }: { label: string; file: CurriculumFile; onOpen: (id: string, name: string) => void; onDownload: (id: string, name: string) => void }) {
  // Compact "chip" — format tag + two icon-only buttons. View opens in a
  // new tab (↗); Download saves the file (↓). Tooltips carry the full word
  // for accessibility.
  return (
    <div
      className="inline-flex items-stretch overflow-hidden rounded-lg h-8"
      style={{ border: '1px solid var(--light-gray)', background: '#fff' }}
    >
      <span className="px-2 flex items-center"><Tag>{label}</Tag></span>
      <button
        type="button"
        title="View in a new tab"
        aria-label={`View ${label}`}
        className={`px-2 inline-flex items-center hover:bg-[color:var(--paper)] ${FOCUS}`}
        style={{ borderLeft: '1px solid var(--light-gray)', color: 'var(--deep-teal)' }}
        onClick={() => onOpen(file.fileId, file.fileName)}
      ><Icon name="external" size={14} /></button>
      <button
        type="button"
        title="Download"
        aria-label={`Download ${label}`}
        className={`px-2 inline-flex items-center text-white hover:opacity-90 ${FOCUS}`}
        style={{ background: 'var(--deep-teal)' }}
        onClick={() => onDownload(file.fileId, file.fileName)}
      ><Icon name="download" size={14} /></button>
    </div>
  )
}
