// Mirror a class-portal student account into the marketing Patient CRM.
//
// Called from /api/public/class-portal/users (POST + PATCH) so every student
// who registers or has their enrollment updated shows up as a PEDIATRIC
// Patient in the CRM with the same firstName / lastName / dob / sex / etc.
// The dedupe key is the student's portal email — re-saves of the same
// student update the existing Patient instead of creating a new one.

import { prisma } from '@/lib/prisma'

interface EnrollmentDraft {
  firstName?: string
  lastName?: string
  middleName?: string
  dob?: string
  sex?: 'MALE' | 'FEMALE'
  motherTongue?: string
  religion?: string
  nationality?: string
  diagnosis?: string
  pwdIdNumber?: string
  houseStreet?: string
  barangay?: string
  cityProvinceCountry?: string
  zipCode?: string
  cellphone?: string
  telephone?: string
  email?: string
}

interface SyncInput {
  email: string
  firstName?: string | null
  lastName?: string | null
  branch?: 'EAST' | 'GREENHILLS' | null
  enrollment?: EnrollmentDraft | null
}

function branchToMarketing(b: SyncInput['branch']): 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' | null {
  if (b === 'EAST') return 'SANDBOX_EAST'
  if (b === 'GREENHILLS') return 'SANDBOX_GREENHILLS'
  return null
}

function uc(s: string | undefined | null): string | null {
  if (!s) return null
  const t = s.trim()
  return t ? t.toUpperCase() : null
}

function deriveCity(addr: string | undefined): string | null {
  if (!addr) return null
  // EnrollmentDraft.cityProvinceCountry is "CITY, PROVINCE, COUNTRY" — take
  // the first segment so the patient CRM's per-city map gets the right point.
  const first = addr.split(',')[0]?.trim()
  return first ? first.toUpperCase() : null
}

function combineAddress(d: EnrollmentDraft): string | null {
  const parts = [d.houseStreet, d.barangay].filter(Boolean) as string[]
  if (parts.length === 0) return null
  return parts.join(', ').toUpperCase()
}

/**
 * Upsert a Patient row from a class-portal user + enrollment draft. Returns
 * the patient id on success; throws on DB error (caller swallows to keep the
 * user-creation flow non-blocking).
 */
export async function syncStudentToPatientCrm(input: SyncInput): Promise<string | null> {
  const e: EnrollmentDraft = input.enrollment ?? {}
  // Always prefer the enrollment-form first/last names (more authoritative
  // for the full DepEd-style record), fall back to the user account fields.
  const firstName = uc(e.firstName ?? input.firstName) ?? ''
  const lastName  = uc(e.lastName  ?? input.lastName)  ?? ''
  if (!firstName && !lastName) return null

  const branches: ('SANDBOX_EAST' | 'SANDBOX_GREENHILLS')[] = []
  const mappedBranch = branchToMarketing(input.branch)
  if (mappedBranch) branches.push(mappedBranch)

  const data = {
    firstName,
    lastName,
    email: input.email.trim().toLowerCase() || null,
    phone: uc(e.cellphone ?? e.telephone),
    dob: e.dob ? new Date(e.dob) : null,
    patientType: 'PEDIATRIC' as const,
    branch: branches[0] ?? null,
    branches,
    sex: uc(e.sex),
    civilStatus: 'SINGLE',
    religion: uc(e.religion),
    nationality: uc(e.nationality) ?? 'FILIPINO',
    address: combineAddress(e),
    city: deriveCity(e.cityProvinceCountry),
    diagnosis: uc(e.diagnosis),
    pwdSeniorId: uc(e.pwdIdNumber),
  }

  // Dedupe by email — every class-portal user has a unique email, and the
  // Patient table allows null email so we won't accidentally match the wrong
  // adult patient when an email isn't set on the row yet.
  const existing = data.email
    ? await prisma.patient.findFirst({ where: { email: data.email } })
    : null

  if (existing) {
    const updated = await prisma.patient.update({
      where: { id: existing.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
    })
    return updated.id
  }
  const created = await prisma.patient.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
  })
  return created.id
}
