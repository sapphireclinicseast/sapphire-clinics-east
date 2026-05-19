'use client'

import { useEffect, useState } from 'react'
import {
  getCurriculum, saveCurriculum, deleteCurriculum, putFile, getFile, deleteFile,
  levelLabel, type CurriculumRecord, type EnrollmentLevel,
} from '@/lib/session'

const ALL_LEVELS: EnrollmentLevel[] = ['KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6']

interface Props {
  viewer: { role: 'STUDENT' | 'TEACHER' | 'ADMIN'; level?: EnrollmentLevel; email: string }
}

export default function CurriculumPanel({ viewer }: Props) {
  const [items, setItems] = useState<CurriculumRecord[]>([])
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pickedLevel, setPickedLevel] = useState<EnrollmentLevel>('KINDER')
  const [title, setTitle] = useState('')

  const canUpload = viewer.role === 'ADMIN' || viewer.role === 'TEACHER'
  // Students only see their own level. Admin/Teacher see everything.
  const filtered = viewer.role === 'STUDENT' && viewer.level
    ? items.filter(c => c.level === viewer.level)
    : items

  function refresh() { setItems(getCurriculum()) }
  useEffect(refresh, [])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(null)
    if (!title.trim()) { setErr('Please add a title first.'); return }
    setUploading(true)
    try {
      const fileId = 'curr_' + Math.random().toString(36).slice(2, 12)
      await putFile(fileId, f)
      saveCurriculum({
        id: 'curri_' + Math.random().toString(36).slice(2, 10),
        level: pickedLevel,
        title: title.trim(),
        fileId,
        fileName: f.name,
        fileType: f.type,
        fileSize: f.size,
        uploadedBy: viewer.email,
        uploadedAt: new Date().toISOString(),
      })
      setTitle('')
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDelete(c: CurriculumRecord) {
    if (!confirm(`Delete curriculum "${c.title}"?`)) return
    try { await deleteFile(c.fileId) } catch { /* ignore */ }
    deleteCurriculum(c.id)
    refresh()
  }

  async function handleOpen(c: CurriculumRecord) {
    const blob = await getFile(c.fileId)
    if (!blob) { alert('File not found in this browser.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  async function handleDownload(c: CurriculumRecord) {
    const blob = await getFile(c.fileId)
    if (!blob) { alert('File not found in this browser.'); return }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = c.fileName; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5_000)
  }

  return (
    <div className="space-y-4">
      {canUpload && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-3">Upload curriculum template</h2>
          {err && <div className="mb-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Title</span>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Term 1 Math sequence" />
            </label>
            <label className="block">
              <span className="label">Grade level</span>
              <select className="select" value={pickedLevel} onChange={e => setPickedLevel(e.target.value as EnrollmentLevel)}>
                {ALL_LEVELS.map(l => <option key={l} value={l}>{levelLabel(l)}</option>)}
              </select>
            </label>
          </div>
          <label className="btn-secondary cursor-pointer inline-flex items-center gap-2 mt-3" style={{ width: 'auto' }}>
            {uploading ? 'Uploading…' : 'Choose file'}
            <input type="file" className="sr-only" onChange={onFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" />
          </label>
        </div>
      )}

      <div className="card-static">
        <h2 className="text-[18px] leading-tight mb-3">{viewer.role === 'STUDENT' ? 'Your curriculum' : 'All curriculum templates'}</h2>
        {filtered.length === 0 ? (
          <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">No curriculum templates yet.</p>
        ) : (
          <CurriculumGrouped
            items={filtered}
            viewer={viewer}
            onOpen={handleOpen}
            onDownload={handleDownload}
            onDelete={handleDelete}
            singleLevel={viewer.role === 'STUDENT'}
          />
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
  onOpen: (c: CurriculumRecord) => void
  onDownload: (c: CurriculumRecord) => void
  onDelete: (c: CurriculumRecord) => void
  singleLevel: boolean
}) {
  // Group by level, preserving the ALL_LEVELS order
  const byLevel: Record<EnrollmentLevel, CurriculumRecord[]> = {
    KINDER: [], GRADE_1: [], GRADE_2: [], GRADE_3: [], GRADE_4: [], GRADE_5: [], GRADE_6: [],
  }
  for (const c of items) byLevel[c.level].push(c)

  return (
    <div className="space-y-2.5">
      {ALL_LEVELS.map(lvl => {
        const list = byLevel[lvl]
        if (list.length === 0) return null
        return (
          <details key={lvl} open className="rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
            <summary className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer select-none rounded-xl" style={{ background: 'var(--paper-2)' }}>
              <span className="font-semibold text-[color:var(--narra)] text-sm" style={{ fontFamily: 'var(--font-display)' }}>
                {levelLabel(lvl)}
              </span>
              <span className="text-[11.5px] text-[color:var(--mid-gray)]">{list.length} document{list.length === 1 ? '' : 's'}</span>
            </summary>
            <ul className="divide-y" style={{ borderColor: 'var(--paper-3)' }}>
              {list.map(c => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[color:var(--narra)] truncate" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</div>
                    <div className="text-[11.5px] text-[color:var(--mid-gray)] truncate">
                      {c.fileName} · {(c.fileSize / 1024).toFixed(0)} KB · uploaded by {c.uploadedBy} on {new Date(c.uploadedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button className="btn-secondary text-xs" onClick={() => onOpen(c)}>View</button>
                    <button className="btn-primary text-xs" onClick={() => onDownload(c)}>Download</button>
                    {(viewer.role === 'ADMIN' || c.uploadedBy === viewer.email) && (
                      <button className="text-xs px-2 py-1 rounded-md text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)]" onClick={() => onDelete(c)}>Delete</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )
      })}
      {singleLevel && Object.values(byLevel).flat().length === 0 && (
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">No curriculum for your level yet.</p>
      )}
    </div>
  )
}
