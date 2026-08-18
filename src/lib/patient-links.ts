// Interbranch patients are often stored as DUPLICATE Patient records (one per
// branch). This resolves all record IDs that belong to the SAME person so the
// portal can combine their sessions and documents across branches.
//
// Linking key: same email AND same first + last name (case-insensitive). Email
// alone is unsafe because siblings share one email — the name disambiguates.
// Patients without an email can't be safely linked, so only their own id is
// returned.

import { prisma } from '@/lib/prisma'

export async function linkedPatientIds(patientId: string): Promise<string[]> {
  const p = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, email: true, firstName: true, lastName: true },
  })
  if (!p) return [patientId]
  if (!p.email || !p.email.trim()) return [p.id]

  const matches = await prisma.patient.findMany({
    where: {
      email: { equals: p.email, mode: 'insensitive' },
      firstName: { equals: p.firstName, mode: 'insensitive' },
      lastName: { equals: p.lastName, mode: 'insensitive' },
    },
    select: { id: true },
  })
  const ids = new Set<string>(matches.map((m) => m.id))
  ids.add(p.id)
  return [...ids]
}
