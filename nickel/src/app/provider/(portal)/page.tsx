import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Default provider view: My patients. Tap a patient to open their chart.
export default async function ProviderHome() {
  const p = await getSessionProvider()
  if (!p) return null

  const rows = await prisma.booking.findMany({
    where: { providerId: p.id },
    distinct: ['patientId'],
    orderBy: { createdAt: 'desc' },
    include: { patient: { select: { firstName: true, lastName: true, phone: true, city: true, photo: true } } },
  })

  return (
    <section className="card">
      <h2 className="text-[16px] font-semibold">My patients</h2>
      <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Clients who have booked you through Nickel. Tap a patient to see their chart, sessions and notes.</p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-[color:var(--slate)]">No patients yet — they&apos;ll appear here once clients book you.</p>
      ) : (
        <div className="divide-y divide-[color:var(--line)]">
          {rows.map((r) => (
            <a key={r.patientId} href={`/provider/patients/${r.patientId}`} className="flex items-center gap-3 py-2.5 text-[13px] hover:bg-[color:var(--mist)]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--mist-2)] text-[12px] font-semibold text-[color:var(--slate)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.patient.photo ? <img src={r.patient.photo} alt="" className="h-full w-full object-cover" /> : (r.patient.firstName[0] ?? '') + (r.patient.lastName[0] ?? '')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-[color:var(--ink)]">{r.patient.firstName} {r.patient.lastName}</div>
                <div className="text-[12px] text-[color:var(--slate)]">{[r.patient.city, r.patient.phone].filter(Boolean).join(' · ')}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[color:var(--muted)]"><path d="M9 6l6 6-6 6" /></svg>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
