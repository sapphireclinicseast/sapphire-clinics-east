import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function PatientsPage() {
  const p = await getSessionProvider()
  if (!p) return null

  // Patients are derived from THIS provider's own Nickel bookings (not the
  // Operations Hub). One row per patient, most recent booking first.
  const rows = await prisma.booking.findMany({
    where: { providerId: p.id },
    distinct: ['patientId'],
    orderBy: { createdAt: 'desc' },
    include: { patient: { select: { firstName: true, lastName: true, phone: true, city: true } } },
  })

  return (
    <section className="card">
      <h2 className="text-[16px] font-semibold">My patients</h2>
      <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Clients who have booked you through Nickel. You only see clients booked with you.</p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-[color:var(--slate)]">No patients yet — they&apos;ll appear here once clients book you.</p>
      ) : (
        <div className="divide-y divide-[color:var(--line)]">
          {rows.map((r) => (
            <div key={r.patientId} className="flex items-center gap-3 py-2.5 text-[13px]">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--mist-2)] text-[12px] font-semibold text-[color:var(--slate)]">
                {(r.patient.firstName[0] ?? '') + (r.patient.lastName[0] ?? '')}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-[color:var(--ink)]">{r.patient.firstName} {r.patient.lastName}</div>
                <div className="text-[12px] text-[color:var(--slate)]">{[r.patient.city, r.patient.phone].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
