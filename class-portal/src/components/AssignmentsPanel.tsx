'use client'

import { useEffect, useState } from 'react'
import {
  getUsers, getAssignments, setAssignmentsForLevel,
  levelLabel, type StoredUser, type EnrollmentLevel,
} from '@/lib/session'

const ALL_LEVELS: EnrollmentLevel[] = ['KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6']

export default function AssignmentsPanel() {
  const [teachers, setTeachers] = useState<StoredUser[]>([])
  const [assigns, setAssigns] = useState(getAssignments())

  function refresh() {
    setTeachers(getUsers().filter(u => u.role === 'TEACHER'))
    setAssigns(getAssignments())
  }
  useEffect(refresh, [])

  function toggle(level: EnrollmentLevel, teacherId: string) {
    const cur = assigns[level] ?? []
    const next = cur.includes(teacherId) ? cur.filter(x => x !== teacherId) : [...cur, teacherId]
    setAssignmentsForLevel(level, next)
    refresh()
  }

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[18px] leading-tight">Teacher assignments</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
            Tick the grade levels each teacher handles. A grade can have multiple teachers; a teacher can handle multiple grades.
          </p>
        </div>
      </div>

      {teachers.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">No teacher accounts yet. Create one from the Users tab first.</p>
      ) : (
        <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--paper-2)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Teacher</th>
                {ALL_LEVELS.map(l => <th key={l} className="py-2 px-2 text-center">{l === 'KINDER' ? 'K' : l.replace('GRADE_', 'G')}</th>)}
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => (
                <tr key={t.id} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-[color:var(--narra)]">{[t.firstName, t.lastName].filter(Boolean).join(' ') || t.email}</div>
                    <div className="text-[11.5px] text-[color:var(--mid-gray)]">{t.email}</div>
                  </td>
                  {ALL_LEVELS.map(l => {
                    const on = (assigns[l] ?? []).includes(t.id)
                    return (
                      <td key={l} className="py-2.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(l, t.id)}
                          aria-label={`${t.email} ${levelLabel(l)}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
