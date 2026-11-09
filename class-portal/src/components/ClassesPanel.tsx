'use client'

import { useEffect, useState } from 'react'
import {
  getLevelStatus, hydrateLevelStatus, saveLevelStatus,
  getUsers, hydrateUsers,
  levelLabel, type EnrollmentLevel, type LevelStatus, type StoredUser,
} from '@/lib/session'
import {
  DashCard, Banner, StatusPill, Icon,
  BTN_SM, PRIMARY_STYLE, SECONDARY_STYLE, SUBTLE_BG,
} from '@/components/hub/ui'

const ALL_LEVELS: EnrollmentLevel[] = ['NURSERY', 'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12']

export default function ClassesPanel() {
  const [rows, setRows] = useState<LevelStatus[]>(getLevelStatus())
  const [students, setStudents] = useState<StoredUser[]>([])
  const [busy, setBusy] = useState<EnrollmentLevel | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    hydrateLevelStatus().then(setRows).catch(() => { /* fall back to cache */ })
    hydrateUsers().then(us => setStudents(us.filter(u => u.role === 'STUDENT'))).catch(() => { /* ignore */ })
  }, [])

  function countEnrolled(level: EnrollmentLevel): number {
    return students.filter(s => s.level === level).length
  }

  async function toggle(level: EnrollmentLevel) {
    setErr(null)
    const cur = rows.find(r => r.level === level)
    const next: LevelStatus[] = rows.map(r => r.level === level ? { ...r, enabled: !(cur?.enabled ?? true) } : r)
    // Make sure every level is present in the payload — backend upserts each.
    for (const l of ALL_LEVELS) {
      if (!next.find(r => r.level === l)) next.push({ level: l, enabled: true, updatedAt: null, updatedBy: null })
    }
    setRows(next) // optimistic
    setBusy(level)
    try {
      const fresh = await saveLevelStatus(next)
      setRows(fresh)
    } catch (e) {
      setErr((e as Error).message)
      hydrateLevelStatus().then(setRows)
    } finally {
      setBusy(null)
    }
  }

  function statusFor(level: EnrollmentLevel): LevelStatus {
    return rows.find(r => r.level === level) ?? { level, enabled: true, updatedAt: null, updatedBy: null }
  }

  const openCount = ALL_LEVELS.filter(l => statusFor(l).enabled).length

  return (
    <DashCard
      flush
      title="Grade levels"
      icon={<Icon name="student" size={15} />}
      description={<>
        Turn each grade level on or off. <span className="font-semibold">Disabling</span> hides the tile on the enrollment landing page so parents can&apos;t register a new student at that level. <span className="font-semibold">Existing</span> students at the level stay enrolled and are unaffected.
      </>}
      action={<StatusPill tone="info">{openCount} of {ALL_LEVELS.length} open</StatusPill>}
    >
      {err && <div className="px-4 sm:px-5 pt-4"><Banner tone="error">{err}</Banner></div>}

      <ul className="grid grid-cols-1 sm:grid-cols-2">
        {ALL_LEVELS.map((l, i) => {
          const s = statusFor(l)
          const count = countEnrolled(l)
          return (
            <li
              key={l}
              className={`px-4 sm:px-5 py-3 flex items-center justify-between gap-3 min-w-0 ${i > 0 ? 'border-t' : ''} ${i === 1 ? 'sm:border-t-0' : ''} ${i % 2 === 0 ? 'sm:border-r' : ''}`}
              style={{
                borderColor: 'var(--light-gray)',
                background: s.enabled ? '#fff' : SUBTLE_BG,
              }}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{levelLabel(l)}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                  {s.enabled
                    ? <StatusPill tone="success">Open for enrollment</StatusPill>
                    : <StatusPill tone="neutral">Closed for new enrollees</StatusPill>}
                  <span className="text-xs tabular-nums" style={{ color: 'var(--mid-gray)' }}>{count} enrolled</span>
                </div>
              </div>
              <button
                type="button"
                className={BTN_SM}
                style={s.enabled ? SECONDARY_STYLE : { ...PRIMARY_STYLE, color: '#fff' }}
                onClick={() => toggle(l)}
                disabled={busy === l}
                aria-label={`${s.enabled ? 'Disable' : 'Enable'} ${levelLabel(l)}`}
              >
                {busy === l ? 'Saving…' : s.enabled ? 'Disable' : 'Enable'}
              </button>
            </li>
          )
        })}
      </ul>
    </DashCard>
  )
}
