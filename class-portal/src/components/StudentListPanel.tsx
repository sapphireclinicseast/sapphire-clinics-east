'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getUsers, getWaivers, saveWaiver,
  teacherAssignedPairs,
  paymentStatusFor,
  levelLabel,
  type StoredUser, type EnrollmentLevel, type Branch, type WaiverRecord,
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
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Lock body scroll while the modal is open so the page behind doesn't move.
  useEffect(() => {
    if (!selected) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [selected])

  function refresh() {
    let pool = getUsers().filter(u => u.role === 'STUDENT')
    if (viewer.role === 'TEACHER' && viewer.userId) {
      const pairs = teacherAssignedPairs(viewer.userId)
      if (pairs.length > 0) {
        const allowed = new Set(pairs.map(p => `${p.branch}|${p.level}`))
        pool = pool.filter(u =>
          !!u.level && !!u.branch && allowed.has(`${u.branch as Branch}|${u.level as EnrollmentLevel}`),
        )
      }
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
                <th className="py-2 px-3">Payment</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-6 px-3 text-center text-[color:var(--mid-gray)]">
                  {students.length === 0 ? 'No students yet.' : 'No students match this search.'}
                </td></tr>
              )}
              {filtered.map(s => {
                const ps = paymentStatusFor(s.id)
                return (
                  <tr key={s.id} className="border-b hover:bg-[color:var(--paper-2)] cursor-pointer" style={{ borderColor: 'var(--paper-3)' }} onClick={() => setSelected(s)}>
                    <td className="py-2.5 px-3 font-semibold text-[color:var(--narra)]">{[s.firstName, s.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{s.email}</td>
                    <td className="py-2.5 px-3 text-[12.5px]">{s.level ? levelLabel(s.level) : '—'}</td>
                    <td className="py-2.5 px-3 text-[12.5px] text-[color:var(--mid-gray)]">{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td className="py-2.5 px-3">
                      <PaymentStatusBadge status={ps} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="btn-secondary text-xs" style={{ pointerEvents: 'none' }}>View →</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail popup — portaled to body so animate-fade-up ancestors don't trap fixed positioning */}
      {selected && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 animate-fade-in"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[color:var(--paper)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between gap-3 px-5 py-3 border-b sticky top-0 z-10"
              style={{ background: 'var(--paper)', borderColor: 'var(--paper-3)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <button className="btn-secondary text-xs whitespace-nowrap" onClick={() => setSelected(null)}>← Back to list</button>
                <span className="text-[13px] text-[color:var(--mid-gray)] truncate hidden sm:inline">
                  {[selected.firstName, selected.lastName].filter(Boolean).join(' ') || selected.email}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {viewer.role === 'TEACHER' && waiver && !waiver.witnessSig && (
                  <button className="btn-cta text-xs whitespace-nowrap" onClick={() => setWitnessOpen(true)}>Sign as witness</button>
                )}
                {viewer.role === 'TEACHER' && waiver?.witnessSig && (
                  <span className="badge badge-paid whitespace-nowrap">Waiver witness signed</span>
                )}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setSelected(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[color:var(--mid-gray)] hover:bg-[color:var(--paper-2)] hover:text-[color:var(--narra)] text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
              <StudentDetail
                student={selected}
                viewerRole={viewer.role}
                onChange={() => {
                  refresh()
                  // Also re-pick the now-fresh student record so the popup shows the new data.
                  const fresh = getUsers().find(u => u.id === selected.id)
                  if (fresh) setSelected(fresh)
                }}
              />

              {witnessOpen && waiver && (
                <WitnessForm onCancel={() => setWitnessOpen(false)} onSign={handleWitness} defaultName={viewer.name} />
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function PaymentStatusBadge({ status }: { status: 'PAID' | 'PENDING' | 'NONE' }) {
  if (status === 'PAID')    return <span className="badge badge-paid">Paid</span>
  if (status === 'PENDING') return <span className="badge badge-pending">Pending</span>
  return <span className="badge badge-pending">No payment yet</span>
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
