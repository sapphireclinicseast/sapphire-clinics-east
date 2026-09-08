import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DOC_TYPE_LABEL, type DocType } from '@/lib/forms/schemas'
import ViewDocButton from '@/components/ViewDocButton'

export const dynamic = 'force-dynamic'

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`
const fmtDate = (d: Date) => d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}` }
const STATUS: Record<string, [string, string]> = {
  PENDING: ['Awaiting payment', 'bg-amber-100 text-amber-800'], PAID: ['Paid · to confirm', 'bg-sky-100 text-sky-800'],
  CONFIRMED: ['Confirmed', 'bg-emerald-50 text-emerald-700'], COMPLETED: ['Completed', 'bg-emerald-50 text-emerald-700'], CANCELLED: ['Cancelled', 'bg-red-50 text-red-700'],
}

export default async function PatientDetailPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params
  const provider = await getSessionProvider()
  if (!provider) return null

  // Authorization: only a therapist who has actually had this patient book them
  // can view their chart.
  const link = await prisma.booking.findFirst({ where: { providerId: provider.id, patientId }, select: { id: true } })
  if (!link) return <div className="card text-[13px] text-[color:var(--slate)]">Patient not found. <a href="/provider" className="text-[color:var(--steel)] hover:underline">Back to patients</a></div>

  const [patient, bookings, docs] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true, email: true, phone: true, address: true, city: true, dob: true, sex: true, photo: true } }),
    prisma.booking.findMany({ where: { providerId: provider.id, patientId }, orderBy: [{ date: 'desc' }, { startTime: 'desc' }], select: { id: true, date: true, startTime: true, city: true, status: true, amount: true } }),
    prisma.sessionDocument.findMany({ where: { providerId: provider.id, patientId }, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, status: true, source: true, bookingId: true, createdAt: true } }),
  ])
  if (!patient) return <div className="card text-[13px] text-[color:var(--slate)]">Patient not found.</div>

  const age = patient.dob ? Math.floor((Date.now() - patient.dob.getTime()) / (365.25 * 864e5)) : null
  const initials = (patient.firstName[0] ?? '') + (patient.lastName[0] ?? '')
  const Field = ({ label, value }: { label: string; value?: string | null }) => (
    <div><div className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">{label}</div><div className="text-[13.5px] text-[color:var(--ink)]">{value || '—'}</div></div>
  )

  return (
    <div className="space-y-4">
      <a href="/provider" className="text-[12px] text-[color:var(--steel)] hover:underline">← All patients</a>

      {/* Demographics + photo */}
      <section className="card">
        <div className="flex items-start gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[color:var(--mist-2)] text-[22px] font-semibold text-[color:var(--slate)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {patient.photo ? <img src={patient.photo} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-semibold text-[color:var(--ink)]">{patient.firstName} {patient.lastName}</h1>
            <div className="text-[13px] text-[color:var(--slate)]">{[age != null ? `${age} yrs` : null, patient.sex].filter(Boolean).join(' · ') || '—'}</div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 border-t border-[color:var(--line)] pt-4 sm:grid-cols-2">
          <Field label="Date of birth" value={patient.dob ? patient.dob.toISOString().slice(0, 10) : null} />
          <Field label="Sex" value={patient.sex} />
          <Field label="Phone" value={patient.phone} />
          <Field label="Email" value={patient.email} />
          <Field label="City" value={patient.city} />
          <Field label="Address" value={patient.address} />
        </div>
      </section>

      {/* Session history */}
      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Session history</b><span className="text-[12px] text-[color:var(--muted)]">{bookings.length} visit{bookings.length === 1 ? '' : 's'}</span></div>
        {bookings.length === 0 ? <p className="px-5 py-6 text-center text-[13px] text-[color:var(--slate)]">No sessions yet.</p> : (
          <div className="divide-y divide-[color:var(--line)]">
            {bookings.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px]">
                <span className="font-medium text-[color:var(--ink)]">{fmtDate(b.date)} · {fmtTime(b.startTime)}</span>
                <span className="text-[color:var(--slate)]">· {b.city}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${(STATUS[b.status] ?? ['', ''])[1]}`}>{(STATUS[b.status] ?? [b.status])[0]}</span>
                <span className="ml-auto tabular-nums text-[color:var(--slate)]">{peso(Number(b.amount))}</span>
                {b.status !== 'CANCELLED' && <a href={`/provider/notes/${b.id}`} className="text-[12px] font-semibold text-[color:var(--steel)] hover:underline">Notes / documents →</a>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* All notes & documents */}
      <section className="card p-0">
        <div className="border-b border-[color:var(--line)] px-5 py-3.5"><b className="text-[color:var(--ink)]">Notes &amp; documents</b></div>
        {docs.length === 0 ? <p className="px-5 py-6 text-center text-[13px] text-[color:var(--slate)]">No documents yet. Create them from a session’s Notes / documents.</p> : (
          <div className="divide-y divide-[color:var(--line)]">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <div>
                  <b className="text-[color:var(--ink)]">{DOC_TYPE_LABEL[d.type as DocType] ?? d.type}</b>
                  <div className="text-[12px] text-[color:var(--slate)]">{d.status === 'COMPLETED' ? (d.source === 'FORM' ? 'Generated PDF' : d.source === 'PHOTO' ? 'Photo' : 'Uploaded') : 'Draft'} · {d.createdAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                </div>
                <div className="flex gap-2">
                  {d.status === 'COMPLETED' && <ViewDocButton docId={d.id} className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[color:var(--mist)]">View</ViewDocButton>}
                  {d.bookingId && <a href={`/provider/notes/${d.bookingId}`} className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[12.5px] font-medium hover:bg-[color:var(--mist)]">Open</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
