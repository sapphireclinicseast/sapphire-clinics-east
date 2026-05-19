'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth, getUsers, findPendingWaivers, saveWaiver, levelLabel, type StoredUser, type WaiverRecord } from '@/lib/session'
import { downloadWaiverPdf } from '@/lib/waiver-pdf'
import SignaturePad from '@/components/SignaturePad'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<StoredUser | null>(null)
  const [ready, setReady] = useState(false)
  const [pendingWaivers, setPendingWaivers] = useState<WaiverRecord[]>([])

  useEffect(() => {
    const auth = getAuth()
    if (!auth) { router.replace('/sign-in'); return }
    if (auth.role === 'ADMIN') { router.replace('/admin'); return }
    if (!auth.userId) { router.replace('/sign-in'); return }
    const u = getUsers().find(x => x.id === auth.userId)
    if (!u) { router.replace('/sign-in'); return }
    setUser(u)
    if (u.role === 'TEACHER') setPendingWaivers(findPendingWaivers())
    setReady(true)
  }, [router])

  function refreshPending() { setPendingWaivers(findPendingWaivers()) }

  function handleWitness(record: WaiverRecord, printedName: string, signatureDataUrl: string) {
    if (!user) return
    if (!printedName.trim()) { alert("Please type the witness's printed name."); return }
    if (!signatureDataUrl) { alert('Please sign before submitting.'); return }
    const now = new Date().toISOString()
    const updated: WaiverRecord = {
      ...record,
      witnessSig: {
        printedName,
        signatureDataUrl,
        signedAt: now,
        teacherId: user.id,
        teacherEmail: user.email,
      },
      updatedAt: now,
    }
    saveWaiver(updated)
    refreshPending()
    try { downloadWaiverPdf(updated) } catch (e) { console.warn('PDF download failed', e) }
  }

  if (!ready || !user) return null

  const isStudent = user.role === 'STUDENT'
  const e = user.enrollment ?? {}

  return (
    <div className="max-w-3xl mx-auto animate-fade-up space-y-6">
      <div className="card-static">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              {user.role === 'STUDENT' ? 'Student account' : 'Teacher account'}
            </div>
            <h1 className="text-[28px] leading-tight text-[color:var(--deep-teal)]">
              {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
            </h1>
            <p className="text-sm text-[color:var(--mid-gray)] mt-1">{user.email}</p>
            {isStudent && user.level && (
              <p className="text-sm text-[color:var(--mid-gray)] mt-0.5">Enrolled in <span className="font-semibold text-[color:var(--narra)]">{levelLabel(user.level)}</span></p>
            )}
          </div>
          {isStudent && (
            <a href="/pay" className="btn-cta whitespace-nowrap">Pay tuition fee →</a>
          )}
        </div>
      </div>

      {!isStudent && (
        <div className="card-static">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <div>
              <h2 className="text-[18px] leading-tight">Waivers awaiting witness</h2>
              <p className="text-[12.5px] text-[color:var(--mid-gray)] mt-1">
                Parents have signed these waivers. As the assigned SCEI SPED teacher, please counter-sign below — the PDF is regenerated and downloaded for the school&apos;s records.
              </p>
            </div>
            <span className="badge badge-approved">{pendingWaivers.length} pending</span>
          </div>

          {pendingWaivers.length === 0 ? (
            <p className="text-sm text-[color:var(--mid-gray)] mt-6 text-center py-8">
              No waivers are currently awaiting a witness signature.
            </p>
          ) : (
            <div className="space-y-4 mt-4">
              {pendingWaivers.map(w => (
                <WitnessCard key={w.id} record={w} onWitness={handleWitness} />
              ))}
            </div>
          )}
        </div>
      )}

      {isStudent && (
        <div className="card-static">
          <h2 className="text-[18px] leading-tight mb-4">Learner profile</h2>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            <Row label="School year" value={e.schoolYearFrom && e.schoolYearTo ? `${e.schoolYearFrom} to ${e.schoolYearTo}` : '—'} />
            <Row label="LRN status" value={e.lrnStatus ?? '—'} />
            {e.lrn && <Row label="LRN" value={e.lrn} />}
            <Row label="PSA Birth Cert. No." value={e.psaBirthCertNo ?? '—'} />
            <Row label="Date of birth" value={e.dob ?? '—'} />
            <Row label="Sex" value={e.sex ?? '—'} />
            <Row label="Mother tongue" value={e.motherTongue ?? '—'} />
            <Row label="Religion" value={e.religion ?? '—'} />
            {e.diagnosis && <Row label="Diagnosis" value={e.diagnosis} />}
            <Row label="Address" value={[e.houseStreet, e.barangay, e.cityProvinceCountry, e.zipCode].filter(Boolean).join(', ') || '—'} />
            <Row label="Father" value={nameOf(e.father)} />
            {e.fatherOccupation && <Row label="Father's occupation" value={e.fatherOccupation} />}
            <Row label="Mother" value={nameOf(e.mother)} />
            {e.motherOccupation && <Row label="Mother's occupation" value={e.motherOccupation} />}
            {e.guardianOfRecord === 'OTHER' && <Row label="Guardian" value={nameOf(e.guardian)} />}
            <Row label="Telephone" value={e.telephone ?? '—'} />
            <Row label="Cellphone" value={e.cellphone ?? '—'} />
          </dl>

          {e.isReturningOrTransferee === 'YES' && (
            <>
              <h3 className="text-[13.5px] font-bold uppercase tracking-[0.12em] text-[color:var(--bright-teal)] mt-6 mb-3" style={{ fontFamily: 'var(--font-display)' }}>Previous school</h3>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                <Row label="Last grade completed" value={e.lastGradeCompleted ?? '—'} />
                <Row label="Last school year" value={e.lastSchoolYearCompleted ?? '—'} />
                <Row label="School name" value={e.previousSchoolName ?? '—'} />
                {e.previousSchoolId && <Row label="School ID" value={e.previousSchoolId} />}
                <Row label="School address" value={e.previousSchoolAddress ?? '—'} />
              </dl>
            </>
          )}

          {e.documents && Object.keys(e.documents).length > 0 && (
            <>
              <h3 className="text-[13.5px] font-bold uppercase tracking-[0.12em] text-[color:var(--bright-teal)] mt-6 mb-3" style={{ fontFamily: 'var(--font-display)' }}>Submitted documents</h3>
              <ul className="space-y-1.5 text-sm text-[color:var(--ink)]">
                {Object.entries(e.documents).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between gap-3">
                    <span>{docTitle(k)}</span>
                    <span className="text-[color:var(--mid-gray)] text-xs">{v.name} · {(v.size / 1024).toFixed(0)} KB</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[color:var(--mid-gray)] uppercase tracking-[0.06em] text-[11.5px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{label}</dt>
      <dd className="text-[color:var(--ink)] mb-1">{value || '—'}</dd>
    </>
  )
}

function nameOf(n?: { lastName: string; firstName: string; middleName: string }) {
  if (!n) return '—'
  return [n.firstName, n.middleName, n.lastName].filter(Boolean).join(' ').trim() || '—'
}

function docTitle(key: string) {
  const map: Record<string, string> = {
    psa_birth_cert: 'PSA Birth Certificate',
    medical_reports: 'Medical / developmental / therapy reports',
    report_card_sf9: 'Report Card / SF9 (Form 138)',
    good_moral: 'Certificate of Good Moral Character',
    form_137_sf10: 'Form 137 / SF10',
  }
  return map[key] ?? key
}

function WitnessCard({ record, onWitness }: { record: WaiverRecord; onWitness: (r: WaiverRecord, printedName: string, sig: string) => void }) {
  const [open, setOpen] = useState(false)
  const [printedName, setPrintedName] = useState('')
  const [sig, setSig] = useState('')

  return (
    <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--paper-3)', background: '#fff' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
            {record.studentFirstName} {record.studentLastName}
          </div>
          <div className="text-[12px] text-[color:var(--mid-gray)] mt-0.5">
            {levelLabel(record.level)} · parent signed {new Date(record.parentSig.signedAt).toLocaleDateString()} ·{' '}
            <span className="font-semibold">{record.parentSig.printedName}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={() => downloadWaiverPdf(record)}>Preview PDF</button>
          {!open && <button type="button" className="btn-cta text-xs" onClick={() => setOpen(true)}>Sign as witness</button>}
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--paper-3)' }}>
          <label className="block mb-3">
            <span className="label">Witness — printed name</span>
            <input className="input" value={printedName} onChange={e => setPrintedName(e.target.value)} placeholder="Teacher full name" />
          </label>
          <div>
            <span className="label">Witness signature</span>
            <SignaturePad onChange={setSig} height={150} />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" className="btn-secondary text-xs" onClick={() => { setOpen(false); setPrintedName(''); setSig('') }}>Cancel</button>
            <button type="button" className="btn-primary text-xs" onClick={() => onWitness(record, printedName, sig)}>Sign &amp; download PDF</button>
          </div>
        </div>
      )}
    </div>
  )
}
