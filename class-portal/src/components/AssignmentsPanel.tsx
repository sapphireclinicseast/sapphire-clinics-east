'use client'

import { useEffect, useState } from 'react'
import {
  getUsers, hydrateUsers,
  getAssignments, hydrateAssignments, saveAssignments,
  levelLabel, branchLabel, ALL_BRANCHES,
  type StoredUser, type EnrollmentLevel, type Branch, type TeacherAssignment,
} from '@/lib/session'
import {
  DashCard, Banner, EmptyState, Tag, Icon,
  TH, TH_STYLE, TD, TR, TR_STYLE,
} from '@/components/hub/ui'

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
    <DashCard
      flush
      title="Teacher assignments"
      icon={<Icon name="teacher" size={15} />}
      description={<>Tick the grade levels each teacher handles, per branch. Teachers only see students enrolled in the branches and grades they&apos;re assigned to.</>}
      action={viewerBranch ? <Tag tone="neutral" title="Only the main admin can edit teacher assignments.">Read only</Tag> : busy ? <Tag tone="info">Saving…</Tag> : undefined}
      footer={<>N = Nursery · K = Kinder · G1–G12 = Grade 1 to Grade 12. Hover a column heading for the full name.</>}
    >
      {err && <div className="px-4 sm:px-5 pt-4"><Banner tone="error">{err}</Banner></div>}

      {teachers.length === 0 ? (
        <EmptyState icon="teacher" title="No teacher accounts yet." hint="Create one from the Users tab first." />
      ) : (
        <div className="overflow-auto" style={{ maxHeight: 560 }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 760 }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={TH} style={TH_STYLE}>Teacher</th>
                <th className={TH} style={TH_STYLE}>Branch</th>
                {ALL_LEVELS.map(l => (
                  <th key={l} className={`${TH} text-center px-1.5`} style={TH_STYLE} title={levelLabel(l)}>
                    <abbr title={levelLabel(l)} className="no-underline">{levelShort(l)}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teachers.flatMap(t => (
                visibleBranches.map((b, bi) => (
                  <tr key={`${t.id}-${b}`} className={TR} style={bi === 0 ? TR_STYLE : { borderTop: '1px dashed var(--light-gray)' }}>
                    {bi === 0 && (
                      <td rowSpan={visibleBranches.length} className={`${TD} align-top`} style={{ minWidth: 180 }}>
                        <div className="font-semibold" style={{ color: 'var(--charcoal)' }}>{[t.firstName, t.lastName].filter(Boolean).join(' ') || t.email}</div>
                        <div className="text-xs break-all" style={{ color: 'var(--mid-gray)' }}>{t.email}</div>
                      </td>
                    )}
                    <td className={`${TD} whitespace-nowrap`}>
                      <Tag tone={b === 'EAST' ? 'brand' : 'neutral'}>{branchLabel(b)}</Tag>
                    </td>
                    {ALL_LEVELS.map(l => (
                      <td key={l} className={`${TD} text-center px-1.5`}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-[color:var(--deep-teal)] disabled:cursor-not-allowed"
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
    </DashCard>
  )
}
