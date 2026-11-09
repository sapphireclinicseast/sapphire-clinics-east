'use client'

import { useEffect, useState } from 'react'
import {
  getUsers, getGrades, saveGrade, putFile, getFile, deleteFile,
  teacherAssignedPairs,
  levelLabel, type GradeRecord, type StoredUser, type EnrollmentLevel, type Branch,
} from '@/lib/session'
import {
  DashCard, EmptyState, StatusPill, Tag, Icon,
  TH, TH_STYLE, TD, TR, TR_STYLE, SUBTLE_BG, CONTROL_SM, CONTROL_STYLE, FILE_FOCUS,
  BTN_SM, PRIMARY_STYLE, SECONDARY_STYLE,
} from '@/components/hub/ui'

interface Props {
  viewer: { role: 'TEACHER' | 'ADMIN'; userId?: string }
}

type DraftRow = { q1: string; q2: string; q3: string; q4: string; yearAvg: string }

export default function GradesPanel({ viewer }: Props) {
  const [students, setStudents] = useState<StoredUser[]>([])
  const [grades, setGrades] = useState<Record<string, GradeRecord>>({})
  /** Per-student edit-mode flag. When a row is being edited, the inputs are
   *  live; otherwise the saved values are read-only text. */
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Pending draft values while editing — only committed on Save. */
  const [draft, setDraft] = useState<DraftRow | null>(null)
  /** Brief "Saved" flash so the teacher sees confirmation after Save. */
  const [savedFlash, setSavedFlash] = useState<string | null>(null)

  function refresh() {
    let pool = getUsers().filter(u => u.role === 'STUDENT')
    if (viewer.role === 'TEACHER' && viewer.userId) {
      const pairs = teacherAssignedPairs(viewer.userId)
      // Teachers without explicit assignments still see every student so the
      // page isn't empty before the admin assigns branches + levels.
      if (pairs.length > 0) {
        const allowed = new Set(pairs.map(p => `${p.branch}|${p.level}`))
        pool = pool.filter(u =>
          !!u.level && !!u.branch && allowed.has(`${u.branch as Branch}|${u.level as EnrollmentLevel}`),
        )
      }
    }
    setStudents(pool)
    setGrades(getGrades())
  }
  useEffect(refresh, [viewer.role, viewer.userId])

  function startEditing(student: StoredUser) {
    const g = grades[student.id]
    setEditingId(student.id)
    setDraft({
      q1: g?.q1 ?? '',
      q2: g?.q2 ?? '',
      q3: g?.q3 ?? '',
      q4: g?.q4 ?? '',
      yearAvg: g?.yearAvg ?? '',
    })
    setSavedFlash(null)
  }

  function cancelEditing() {
    setEditingId(null)
    setDraft(null)
  }

  function saveEditing(student: StoredUser) {
    if (!draft) return
    const existing = grades[student.id] ?? { studentId: student.id, updatedAt: '' }
    const next: GradeRecord = {
      ...existing,
      studentId: student.id,
      q1: draft.q1.trim() || undefined,
      q2: draft.q2.trim() || undefined,
      q3: draft.q3.trim() || undefined,
      q4: draft.q4.trim() || undefined,
      yearAvg: draft.yearAvg.trim() || undefined,
      updatedAt: new Date().toISOString(),
    }
    saveGrade(next)
    setGrades(g => ({ ...g, [student.id]: next }))
    setEditingId(null)
    setDraft(null)
    setSavedFlash(student.id)
    window.setTimeout(() => setSavedFlash(id => (id === student.id ? null : id)), 2500)
  }

  async function handleProof(student: StoredUser, file: File) {
    const existing = grades[student.id]
    if (existing?.proofFileId) {
      try { await deleteFile(existing.proofFileId) } catch { /* ignore */ }
    }
    const fileId = 'grade_' + Math.random().toString(36).slice(2, 12)
    await putFile(fileId, file)
    const next: GradeRecord = {
      ...(existing ?? { studentId: student.id, updatedAt: '' }),
      studentId: student.id,
      proofFileId: fileId, proofFileName: file.name, proofFileType: file.type, proofFileSize: file.size,
      updatedAt: new Date().toISOString(),
    }
    saveGrade(next)
    setGrades(g => ({ ...g, [student.id]: next }))
  }

  async function viewProof(g: GradeRecord) {
    if (!g.proofFileId) return
    const blob = await getFile(g.proofFileId)
    if (!blob) { alert('Proof file not found in this browser.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <DashCard
      flush
      title="Quarterly grades"
      icon={<Icon name="award" size={15} />}
      description={<>Click <span className="font-semibold">Edit</span> on a student row to type quarterly averages, then <span className="font-semibold">Save</span> to finalize. Proof documents (Excel / Word / PDF) can be uploaded any time.</>}
      action={<Tag tone="neutral">{students.length} student{students.length === 1 ? '' : 's'}</Tag>}
    >
      <div className="overflow-auto" style={{ maxHeight: 640 }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 820 }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${TH} sticky left-0 z-10`} style={TH_STYLE}>Student</th>
              <th className={`${TH} text-center`} style={TH_STYLE}>Q1 Avg</th>
              <th className={`${TH} text-center`} style={TH_STYLE}>Q2 Avg</th>
              <th className={`${TH} text-center`} style={TH_STYLE}>Q3 Avg</th>
              <th className={`${TH} text-center`} style={TH_STYLE}>Q4 Avg</th>
              <th className={`${TH} text-center`} style={{ ...TH_STYLE, color: 'var(--deep-teal)' }}>Year Avg</th>
              <th className={TH} style={TH_STYLE}>Proof</th>
              <th className={TH} style={TH_STYLE}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr><td colSpan={8}><EmptyState icon="student" title="No students yet." hint="Students appear here once they are enrolled in a branch and grade you're assigned to." /></td></tr>
            )}
            {students.map(s => {
              const g = grades[s.id]
              const isEditing = editingId === s.id
              const name = `${s.firstName} ${s.lastName}`
              return (
                <tr key={s.id} className={isEditing ? '' : TR} style={{ ...TR_STYLE, background: isEditing ? SUBTLE_BG : undefined }}>
                  <td className={`${TD} sticky left-0`} style={{ background: isEditing ? SUBTLE_BG : '#fff', minWidth: 170 }}>
                    <div className="font-semibold" style={{ color: 'var(--charcoal)' }}>{s.firstName} {s.lastName}</div>
                    <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>{s.level ? levelLabel(s.level) : '—'}</div>
                    {isEditing && <div className="mt-1"><Tag tone="info">Editing</Tag></div>}
                    {savedFlash === s.id && (
                      <div className="mt-1"><StatusPill tone="success">Saved</StatusPill></div>
                    )}
                  </td>
                  <QuarterCell label={`Q1 average for ${name}`} value={isEditing ? draft?.q1 : g?.q1} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, q1: v } : d)} />
                  <QuarterCell label={`Q2 average for ${name}`} value={isEditing ? draft?.q2 : g?.q2} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, q2: v } : d)} />
                  <QuarterCell label={`Q3 average for ${name}`} value={isEditing ? draft?.q3 : g?.q3} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, q3: v } : d)} />
                  <QuarterCell label={`Q4 average for ${name}`} value={isEditing ? draft?.q4 : g?.q4} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, q4: v } : d)} />
                  <QuarterCell label={`Year average for ${name}`} value={isEditing ? draft?.yearAvg : g?.yearAvg} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, yearAvg: v } : d)} highlight />
                  <td className={TD}>
                    {g?.proofFileId ? (
                      <div className="flex items-center gap-1.5">
                        <button type="button" className={BTN_SM} style={SECONDARY_STYLE} onClick={() => viewProof(g)} title={g.proofFileName ?? ''} aria-label={`View proof for ${name}`}><Icon name="eye" size={12} /> View proof</button>
                        <label className={`${BTN_SM} ${FILE_FOCUS}`} style={{ color: 'var(--mid-gray)' }}>
                          Replace
                          <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleProof(s, f); e.target.value = '' }} />
                        </label>
                      </div>
                    ) : (
                      <label className={`${BTN_SM} ${FILE_FOCUS}`} style={SECONDARY_STYLE}>
                        <Icon name="upload" size={12} />
                        Upload proof
                        <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleProof(s, f); e.target.value = '' }} />
                      </label>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {isEditing ? (
                      <div className="flex gap-1.5 justify-end">
                        <button type="button" className={BTN_SM} style={SECONDARY_STYLE} onClick={cancelEditing}>Cancel</button>
                        <button type="button" className={`${BTN_SM} text-white`} style={{ ...PRIMARY_STYLE, color: '#fff' }} onClick={() => saveEditing(s)}>Save</button>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <button type="button" className={BTN_SM} style={SECONDARY_STYLE} onClick={() => startEditing(s)} aria-label={`Edit grades for ${name}`}><Icon name="edit" size={12} /> Edit</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </DashCard>
  )
}

function QuarterCell({ value, onChange, editing, highlight, label }: { value?: string; onChange: (v: string) => void; editing: boolean; highlight?: boolean; label: string }) {
  if (!editing) {
    return (
      <td className={`${TD} text-center`} style={{ background: highlight ? 'var(--sage-tint)' : undefined }}>
        <span className={`tabular-nums text-[15px] ${highlight ? 'font-bold' : 'font-semibold'}`} style={{ color: value ? 'var(--charcoal)' : 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
          {value || <><span aria-hidden>—</span><span className="sr-only">Not entered</span></>}
        </span>
      </td>
    )
  }
  return (
    <td className={`${TD} text-center`} style={{ background: highlight ? 'var(--sage-tint)' : undefined }}>
      <input
        className={`${CONTROL_SM} w-16 text-center font-semibold tabular-nums`}
        style={CONTROL_STYLE}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder="—"
        aria-label={label}
      />
    </td>
  )
}
