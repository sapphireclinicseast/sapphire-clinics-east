'use client'

import { useEffect, useState } from 'react'
import {
  getUsers, getGrades, saveGrade, putFile, getFile, deleteFile,
  teacherAssignedPairs,
  levelLabel, type GradeRecord, type StoredUser, type EnrollmentLevel, type Branch,
} from '@/lib/session'

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
    <div className="card-static">
      <h2 className="text-[18px] leading-tight mb-1">Quarterly grades</h2>
      <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-4">
        Click <span className="font-semibold">Edit</span> on a student row to type quarterly averages, then <span className="font-semibold">Save</span> to finalize. Proof documents (Excel / Word / PDF) can be uploaded any time.
      </p>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--paper-2)' }}>
            <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
              <th className="py-2 px-3">Student</th>
              <th className="py-2 px-3 text-center">Q1 Avg</th>
              <th className="py-2 px-3 text-center">Q2 Avg</th>
              <th className="py-2 px-3 text-center">Q3 Avg</th>
              <th className="py-2 px-3 text-center">Q4 Avg</th>
              <th className="py-2 px-3 text-center">Year Avg</th>
              <th className="py-2 px-3">Proof</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr><td colSpan={8} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">No students yet.</td></tr>
            )}
            {students.map(s => {
              const g = grades[s.id]
              const isEditing = editingId === s.id
              return (
                <tr key={s.id} className="border-b align-top" style={{ borderColor: 'var(--paper-3)' }}>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-[color:var(--narra)]">{s.firstName} {s.lastName}</div>
                    <div className="text-[11.5px] text-[color:var(--mid-gray)]">{s.level ? levelLabel(s.level) : '—'}</div>
                    {savedFlash === s.id && (
                      <div className="text-[11px] text-emerald-700 font-semibold mt-1">✓ Saved</div>
                    )}
                  </td>
                  <QuarterCell value={isEditing ? draft?.q1 : g?.q1} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, q1: v } : d)} />
                  <QuarterCell value={isEditing ? draft?.q2 : g?.q2} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, q2: v } : d)} />
                  <QuarterCell value={isEditing ? draft?.q3 : g?.q3} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, q3: v } : d)} />
                  <QuarterCell value={isEditing ? draft?.q4 : g?.q4} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, q4: v } : d)} />
                  <QuarterCell value={isEditing ? draft?.yearAvg : g?.yearAvg} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, yearAvg: v } : d)} highlight />
                  <td className="py-2.5 px-3">
                    {g?.proofFileId ? (
                      <div className="flex items-center gap-2">
                        <button className="btn-secondary text-xs" onClick={() => viewProof(g)} title={g.proofFileName ?? ''}>View proof</button>
                        <label className="text-xs px-2 py-1 rounded-md text-[color:var(--mid-gray)] hover:text-[color:var(--narra)] cursor-pointer underline-offset-2 hover:underline">
                          Replace
                          <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleProof(s, f); e.target.value = '' }} />
                        </label>
                      </div>
                    ) : (
                      <label className="btn-secondary text-xs cursor-pointer inline-flex">
                        Upload proof
                        <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleProof(s, f); e.target.value = '' }} />
                      </label>
                    )}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-1.5 justify-end">
                        <button className="btn-secondary text-xs" onClick={cancelEditing}>Cancel</button>
                        <button className="btn-primary text-xs" onClick={() => saveEditing(s)}>Save</button>
                      </div>
                    ) : (
                      <button className="btn-secondary text-xs" onClick={() => startEditing(s)}>Edit</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QuarterCell({ value, onChange, editing, highlight }: { value?: string; onChange: (v: string) => void; editing: boolean; highlight?: boolean }) {
  if (!editing) {
    return (
      <td className="py-2 px-2 text-center" style={{ background: highlight ? 'var(--sage-tint)' : undefined }}>
        <span className="font-mono font-semibold text-[color:var(--ink)]">{value || '—'}</span>
      </td>
    )
  }
  return (
    <td className="py-2 px-2 text-center" style={{ background: highlight ? 'var(--sage-tint)' : undefined }}>
      <input
        className="input"
        style={{ width: 64, padding: '6px 6px', textAlign: 'center', fontWeight: 600 }}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder="—"
      />
    </td>
  )
}
