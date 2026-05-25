'use client'

import { useEffect, useState } from 'react'
import {
  getLevelStatus, hydrateLevelStatus, saveLevelStatus,
  getUsers, hydrateUsers,
  levelLabel, type EnrollmentLevel, type LevelStatus, type StoredUser,
} from '@/lib/session'

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

  return (
    <div className="card-static">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[18px] leading-tight">Classes</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1 max-w-2xl">
            Turn each grade level on or off. <span className="font-semibold">Disabling</span> hides the tile on the enrollment landing page so parents can&apos;t register a new student at that level. <span className="font-semibold">Existing</span> students at the level stay enrolled and are unaffected.
          </p>
        </div>
      </div>

      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100 text-sm text-rose-800">{err}</div>}

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {ALL_LEVELS.map(l => {
          const s = statusFor(l)
          const count = countEnrolled(l)
          return (
            <li
              key={l}
              className="rounded-xl p-3 border flex items-center justify-between gap-3"
              style={{
                borderColor: 'var(--paper-3)',
                background: s.enabled ? '#fff' : 'var(--paper-2)',
                opacity: s.enabled ? 1 : 0.85,
              }}
            >
              <div className="min-w-0">
                <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>{levelLabel(l)}</div>
                <div className="text-[11.5px] text-[color:var(--mid-gray)] mt-0.5">
                  {count} enrolled · {s.enabled ? <span className="text-emerald-700 font-semibold">Open for enrollment</span> : <span className="text-rose-700 font-semibold">Closed for new enrollees</span>}
                </div>
              </div>
              <button
                type="button"
                className={s.enabled ? 'btn-secondary text-xs' : 'btn-primary text-xs'}
                onClick={() => toggle(l)}
                disabled={busy === l}
              >
                {busy === l ? 'Saving…' : s.enabled ? 'Disable' : 'Enable'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
