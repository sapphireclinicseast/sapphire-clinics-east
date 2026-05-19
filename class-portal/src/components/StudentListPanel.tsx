'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getUsers, getWaivers, saveWaiver,
  teacherAssignedLevels,
  levelLabel,
  type StoredUser, type EnrollmentLevel, type WaiverRecord,
} from '@/lib/session'
import { downloadWaiverPdf } from '@/lib/waiver-pdf'
import StudentDetail from './StudentDetail'
import SignaturePad from './SignaturePad'

interface Props {
  viewer: { role: 'TEACHER' | 'ADMIN'; userId?: string; email: string; name?: string }
}

/**
 * Used by /admin > Students and /profile > Students (teacher). Lists students,
 * lets the viewer click into a detail drawer. Teachers can also sign waivers
 * as witness directly from the drawer; regenerating the PDF afterwards.
 */
export default function StudentListPanel({ viewer }: Props) {
  const [students, setStudents] = useState<StoredUser[]>([])
  const [selected, setSelected] = useState<StoredUser | null>(null)
  const [filter, setFilter] = useState('')
  const [witnessOpen, setWitnessOpen] = useState(false)
  const [waiver, setWaiver] = useState<WaiverRecord | null>(null)

  function refresh() {
    let pool = getUsers().filter(u => u.role === 'STUDENT')
    if (viewer.role === 'TEACHER' && viewer.userId) {
      const allowed = new Set(teacherAssignedLevels(viewer.userId))
      if (allowed.size > 0) pool = pool.filter(u => u.level && allowed.has(u.level as EnrollmentLevel))
    }
    setStudents(pool)
  }
  useEffect(refresh, [viewer.role, viewer.userId])

  // When a student is selected, find their waiver.
  useEffect(() => {
    if (!selected) { setWaiver(null); return }
    const w = getWaivers().find(x => x.studentEmail.toLowerCase() === selected.email.toLowerCase())
    setWaiver(w ?? null)
  }, [selected])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return students
    return students.filter(s => {
      const hay = `${s.firstName ?? ''} ${s.lastName ?? ''} ${s.email}`.toLowerCase()
      return hay.includes(q)
    })
  }, [students, filter])

  function handleWitness(printedName: string, sig: string) {
    if (!waiver || !viewer.userId) return
    if (!printedName.trim()) { alert("Please type the witness's printed name."); return }
    if (!sig) { alert('Please sign before submitting.'); return }
    const now = new Date().toISOString()
    const updated: WaiverRecord = {
      ...waiver,
      witnessSig: {
        printedName,
        signatureDataUrl: sig,
        signedAt: now,
        teacherId: viewer.userId,
        teacherEmail: viewer.email,
      },
      updatedAt: now,
    }
    saveWaiver(updated)
    setWaiver(updated)
    setWitnessOpen(false)
    try { downloadWaiverPdf(updated) } catch (e) { console.warn('PDF download failed', e) }
  }

  return (
    <>
      <div className="card-static">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-[18px] leading-tight">Students</h2>
            <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
              {viewer.role === 'TEACHER' ? 'Students assigned to your grade level(s).' : 'All enrolled students.'}
            </p>
          </div>
          <input
            className="input"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search by name or email"
            style={{ width: 240 }}
          />
        </div>

        <div className="overflow-auto rounded-xl border" style={{ maxHeight: 480, borderColor: 'var(--paper-3)' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--paper)' }}>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--mid-gray)] border-b" style={{ borderColor: 'var(--paper-3)', fontFamily: 'var(--font-display)' }}>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Email</th>
                <th className="py-2 px-3">Level</th>
                <th className="py-2 px-3">Enrolled</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">
                  {students.length === 0 ? 'No students yet.' : 'No students match this search.'}
                </td></tr>
              )}
              {filtered.map(s => (
                <tr key={s.id} className="border-b hover:bg-[color:var(--paper-2)] cursor-pointer" style={{ borderColor: 'var(--paper-3)' }} onClick={() => setSelected(s)}>
                  <td className="py-2.5 px-3 font-semibold text-[color:var(--narra)]">{[s.firstName, s.lastName].filter(Boolean).join(' ') || '—'}</td>
                  <td className="py-2.5 px-3 text-[12.5px]">{s.email}</td>
                  <td className="py-2.5 px-3 text-[12.5px]">{s.level ? levelLabel(s.level) : '—'}</td>
                  <td className="py-2.5 px-3 text-[12.5px] text-[color:var(--mid-gray)]">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="btn-secondary text-xs" style={{ pointerEvents: 'none' }}>View →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto p-4 animate-fade-in" onClick={() => setSelected(null)}>
          <div className="max-w-3xl mx-auto" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <button className="btn-secondary text-xs" onClick={() => setSelected(null)}>← Back to list</button>
              {viewer.role === 'TEACHER' && waiver && !waiver.witnessSig && (
                <button className="btn-cta text-xs" onClick={() => setWitnessOpen(true)}>Sign as witness</button>
              )}
              {viewer.role === 'TEACHER' && waiver?.witnessSig && (
                <span className="badge badge-paid">Waiver witness signed</span>
              )}
            </div>

            <StudentDetail student={selected} viewerRole={viewer.role} />

            {witnessOpen && waiver && (
              <WitnessForm onCancel={() => setWitnessOpen(false)} onSign={handleWitness} defaultName={viewer.name} />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function WitnessForm({ onCancel, onSign, defaultName }: { onCancel: () => void; onSign: (name: string, sig: string) => void; defaultName?: string }) {
  const [name, setName] = useState(defaultName ?? '')
  const [sig, setSig] = useState('')
  return (
    <div className="card-static mt-4">
      <h3 className="text-[16px] leading-tight mb-3">Witness signature (assigned SCEI teacher)</h3>
      <label className="block mb-3">
        <span className="label">Printed name</span>
        <input className="input" value={name} onChange={e => setName(e.target.value)} />
      </label>
      <div>
        <span className="label">Signature</span>
        <SignaturePad onChange={setSig} height={150} />
      </div>
      <div className="flex gap-2 justify-end mt-3">
        <button type="button" className="btn-secondary text-xs" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary text-xs" onClick={() => onSign(name, sig)}>Sign &amp; regenerate PDF</button>
      </div>
    </div>
  )
}
