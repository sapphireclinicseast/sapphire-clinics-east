'use client'

import { useEffect, useState } from 'react'
import {
  getUsers, getGrades, saveGrade, putFile, getFile, deleteFile,
  teacherAssignedLevels,
  levelLabel, type GradeRecord, type StoredUser, type EnrollmentLevel,
} from '@/lib/session'

interface Props {
  viewer: { role: 'TEACHER' | 'ADMIN'; userId?: string }
}

export default function GradesPanel({ viewer }: Props) {
  const [students, setStudents] = useState<StoredUser[]>([])
  const [grades, setGrades] = useState<Record<string, GradeRecord>>({})

  function refresh() {
    let pool = getUsers().filter(u => u.role === 'STUDENT')
    if (viewer.role === 'TEACHER' && viewer.userId) {
      const allowed = new Set(teacherAssignedLevels(viewer.userId))
      // Teachers without explicit assignments still see every student so the
      // page isn't empty before the admin assigns levels — they can flip to
      // assignment-only filtering later.
      if (allowed.size > 0) pool = pool.filter(u => u.level && allowed.has(u.level as EnrollmentLevel))
    }
    setStudents(pool)
    setGrades(getGrades())
  }
  useEffect(refresh, [viewer.role, viewer.userId])

  async function handleUpdate(student: StoredUser, patch: Partial<GradeRecord>) {
    const existing = grades[student.id] ?? { studentId: student.id, updatedAt: '' }
    const next: GradeRecord = { ...existing, ...patch, studentId: student.id, updatedAt: new Date().toISOString(), teacherEmail: existing.teacherEmail }
    saveGrade(next)
    setGrades(g => ({ ...g, [student.id]: next }))
  }

  async function handleProof(student: StoredUser, file: File) {
    const existing = grades[student.id]
    if (existing?.proofFileId) {
      try { await deleteFile(existing.proofFileId) } catch { /* ignore */ }
    }
    const fileId = 'grade_' + Math.random().toString(36).slice(2, 12)
    await putFile(fileId, file)
    await handleUpdate(student, { proofFileId: fileId, proofFileName: file.name, proofFileType: file.type, proofFileSize: file.size })
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
      <h2 className="text-[18px] leading-tight mb-3">Quarterly grades</h2>
      <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-4">
        Type the average per quarter and attach a proof document (Excel / Word / PDF).
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
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr><td colSpan={7} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">No students yet.</td></tr>
            )}
            {students.map(s => {
              const g = grades[s.id]
              return (
                <tr key={s.id} className="border-b align-top" style={{ borderColor: 'var(--paper-3)' }}>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-[color:var(--narra)]">{s.firstName} {s.lastName}</div>
                    <div className="text-[11.5px] text-[color:var(--mid-gray)]">{s.level ? levelLabel(s.level) : '—'}</div>
                  </td>
                  <QuarterCell value={g?.q1} onChange={v => handleUpdate(s, { q1: v })} />
                  <QuarterCell value={g?.q2} onChange={v => handleUpdate(s, { q2: v })} />
                  <QuarterCell value={g?.q3} onChange={v => handleUpdate(s, { q3: v })} />
                  <QuarterCell value={g?.q4} onChange={v => handleUpdate(s, { q4: v })} />
                  <QuarterCell value={g?.yearAvg} onChange={v => handleUpdate(s, { yearAvg: v })} highlight />
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QuarterCell({ value, onChange, highlight }: { value?: string; onChange: (v: string) => void; highlight?: boolean }) {
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
