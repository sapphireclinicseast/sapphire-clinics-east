import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchHrStaffForSync } from '@/lib/external-staff'
import { normName, stripDr } from '@/lib/referral-commission'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'PAYROLL_OFFICER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'MEDREP']

// Doctors in the HR Platform live in department "MD" (developmental pediatricians,
// psychiatrists, rehab medicine doctors) — either top-level or on any of their
// per-branch employment records.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isHrDoctor = (s: Record<string, any>): boolean => {
  if (String(s.department || '').toUpperCase() === 'MD') return true
  const be = s.branchEmployment
  if (be && typeof be === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Object.values(be as Record<string, any>).some(b => String(b?.department || '').toUpperCase() === 'MD')
  }
  return false
}

// Name matching (honorifics stripped) comes from the shared commission engine
// so the sync and payroll agree on who is who.

// POST — create a Referrer (type DOCTOR, in-house) for every HR doctor that
// doesn't have one yet (active or switched off); tag existing active doctor
// referrers that match by name.
// Idempotent, so the Referrers panel fires it on every visit.
export async function POST() {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const staff = await fetchHrStaffForSync()
    const doctors = staff.filter(isHrDoctor)
    if (!doctors.length) return NextResponse.json({ created: 0, tagged: 0, note: 'HR feed returned no doctors' })

    // Switched-off referrers count too: switching off an in-house doctor has to
    // stick, not bring back a fresh copy on the next visit (Dr. Tagalog was doubled
    // that way — Hannah, 2026-11-08). Inactive rows load first so an active row with
    // the same name wins the map.
    const referrers = await prisma.referrer.findMany({
      select: { id: true, name: true, type: true, isInhouse: true, isActive: true },
      orderBy: { isActive: 'asc' },
    })
    const byName = new Map(referrers.map(r => [normName(r.name), r]))

    const created: string[] = []
    const tagged: string[] = []
    for (const d of doctors) {
      const fullName = stripDr(`${String(d.firstName || '').trim()} ${String(d.lastName || '').trim()}`.trim()).trim()
      if (!fullName) continue
      const existing = byName.get(normName(fullName))
      if (existing) {
        // Only doctor rows get auto-tagged — a same-named law firm/school is left alone,
        // and so is a switched-off row (someone turned it off on purpose).
        if (existing.isActive && existing.type === 'DOCTOR' && !existing.isInhouse) {
          await prisma.referrer.update({ where: { id: existing.id }, data: { isInhouse: true } })
          tagged.push(existing.name)
        }
        continue
      }
      const displayName = `DR. ${fullName}`
      const row = await prisma.referrer.create({
        data: {
          name: displayName,
          type: 'DOCTOR',
          specialization: String(d.jobTitle || '').trim() || null,
          isInhouse: true,
          // branches left empty = visible at all branches, like hand-added doctors.
          createdById: session.user.id,
        },
      })
      byName.set(normName(displayName), { id: row.id, name: row.name, type: 'DOCTOR', isInhouse: true, isActive: true })
      created.push(displayName)
    }

    if (created.length || tagged.length) {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'SYNC',
          entity: 'referrer',
          details: { source: 'HR in-house doctors', created, tagged },
        },
      })
    }

    return NextResponse.json({ created: created.length, tagged: tagged.length })
  } catch (e) {
    console.error('In-house referrer sync error:', e)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
