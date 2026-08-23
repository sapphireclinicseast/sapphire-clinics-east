'use client'

import { useEffect, useState } from 'react'
import {
  getUsers, hydrateUsers,
  getAssignments, hydrateAssignments, saveAssignments,
  levelLabel, branchLabel, ALL_BRANCHES,
  type StoredUser, type EnrollmentLevel, type Branch, type TeacherAssignment,
} from '@/lib/session'

const ALL_LEVELS: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12']

function levelShort(l: EnrollmentLevel): string {
  if (l === 'NURSERY') return 'N'
  if (l === 'KINDER') return 'K'
  return l.replace('GRADE_', 'G')
}

interface Props {
  /** When set (BRANCH_ADMIN viewer), assignments are hidden / locked for
   *  the other branch — the table renders a single Branch row per
   *  teacher and excludes assignments to the other branch from the data. */
  viewerBranch?: Branch
}

export default function AssignmentsPanel({ viewerBranch }: Props = {}) {
  const [teachers, setTeachers] = useState<StoredUser[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>(getAssignments())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Branch admins only see assignments + branches inside their own scope.
  const visibleBranches: Branch[] = viewerBranch ? [viewerBranch] : ALL_BRANCHES

  useEffect(() => {
    hydrateUsers().then(us => setTeachers(us.filter(u => u.role === 'TEACHER'))).catch(() => { /* fall back to cached */ })
    hydrateAssignments().then(setAssignments).catch(() => { /* fall back to cached */ })
  }, [])

  function isOn(teacherId: string, branch: Branch, level: EnrollmentLevel): boolean {
    return assignments.some(a => a.teacherId === teacherId && a.branch === branch && a.level === level)
  }

  async function toggle(teacherId: string, branch: Branch, level: EnrollmentLevel) {
    setErr(null)
    const exists = isOn(teacherId, branch, level)
    const next: TeacherAssignment[] = exists
      ? assignments.filter(a => !(a.teacherId === teacherId && a.branch === branch && a.level === level))
      : [...assignments, { teacherId, branch, level }]
    setAssignments(next) // optimistic
    setBusy(true)
    try {
      const fresh = await saveAssignments(next)
      setAssignments(fresh)
    } catch (e) {
      setErr((e as Error).message)
      // revert by re-hydrating
      hydrateAssignments().then(setAssignments)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[18px] leading-tight">Teacher assignments</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
            Tick the grade levels each teacher handles, per branch. Teachers only see students enrolled in the branches and grades they&apos;re assigned to.
          </p>
        </div>
      </div>

      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}

      {teachers.length === 0 ? (
        <p className="text-sm text-[color:var(--mid-gray)] text-center py-8">No teacher accounts yet. Create one from the Users tab first.</p>
      ) : (
        <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--paper-2)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Teacher</th>
                <th className="py-2 px-3">Branch</th>
                {ALL_LEVELS.map(l => <th key={l} className="py-2 px-2 text-center" title={levelLabel(l)}>{levelShort(l)}</th>)}
              </tr>
            </thead>
            <tbody>
              {teachers.flatMap(t => (
                visibleBranches.map((b, bi) => (
                  <tr key={`${t.id}-${b}`} className="border-b" style={{ borderColor: 'var(--paper-3)' }}>
                    {bi === 0 && (
                      <td rowSpan={visibleBranches.length} className="py-2.5 px-3 align-top">
                        <div className="font-semibold text-[color:var(--narra)]">{[t.firstName, t.lastName].filter(Boolean).join(' ') || t.email}</div>
                        <div className="text-[11.5px] text-[color:var(--mid-gray)]">{t.email}</div>
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-[12.5px] font-semibold" style={{ color: b === 'EAST' ? 'var(--narra)' : 'var(--moss)' }}>
                      {branchLabel(b)}
                    </td>
                    {ALL_LEVELS.map(l => (
                      <td key={l} className="py-2.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={isOn(t.id, b, l)}
                          // Branch admins see assignments read-only — only
                          // main admin can edit (enforced server-side too).
                          disabled={busy || !!viewerBranch}
                          onChange={() => toggle(t.id, b, l)}
                          aria-label={`${t.email} ${branchLabel(b)} ${levelLabel(l)}`}
                          title={viewerBranch ? 'Only the main admin can edit teacher assignments.' : undefined}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
