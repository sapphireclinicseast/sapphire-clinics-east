// Certificate settings — who may sign, plus the lists the issue dialog needs.
//
//   GET /api/patients/certificates/settings   signatories + services + staff
//   PUT /api/patients/certificates/settings   replace the signatory list

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SIG_DIR, isSafeStoredName } from '@/lib/certificate-files'

export const dynamic = 'force-dynamic'

/* Clinical departments only. Nobody is discharged from Administration or Front
   Desk, and leaving them in invites a certificate that reads "discharged from
   Administration". Worded the way the rest of the dashboard words them. */
const SERVICES = [
  'Occupational Therapy',
  'Physical Therapy',
  'Speech-Language Pathology',
  'Special Education',
  'Psychology',
  'Medicine',
] as const

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // With a patient, the dialog also gets that patient's OWN clinicians and the
  // branch they are seen at. Without one, this is just the settings screen.
  const patientId = (new URL(req.url).searchParams.get('patientId') ?? '').trim()

  const [signatories, staff] = await Promise.all([
    prisma.certificateSignatory.findMany({ orderBy: { name: 'asc' } }),
    prisma.staff.findMany({
      where: { active: true },
      select: {
        id: true, firstName: true, lastName: true, jobTitle: true, department: true,
        branch: true, extraBranches: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ])

  // Who has actually treated this patient, most recently seen first.
  //
  // This is the fix for "his therapist's name does not come out": the dropdown
  // only ever offered the curated signatory list, and the person who ran the
  // sessions is usually not on it. They are the single most likely answer to
  // "attending therapist", so they are offered first and by name.
  let clinicians: { id: string; name: string; jobTitle: string; department: string; sessions: number; lastSeen: string }[] = []
  let patientBranch = ''
  if (patientId) {
    const pt = await prisma.patient.findUnique({ where: { id: patientId }, select: { branches: true } })
    // Patient.branches uses SANDBOX_EAST / SANDBOX_GREENHILLS; Staff.branch uses
    // SBEA / SBGH. They are the same two clinics under two spellings.
    const first = (pt?.branches ?? [])[0] ?? ''
    patientBranch = String(first).includes('GREENHILLS') ? 'SBGH' : String(first) ? 'SBEA' : ''

    const sessions = await prisma.schedule.findMany({
      where: { patientId },
      select: { staffId: true, date: true },
      orderBy: { date: 'desc' },
      take: 500,
    })
    const seen = new Map<string, { n: number; last: Date }>()
    for (const s of sessions) {
      const prev = seen.get(s.staffId)
      seen.set(s.staffId, { n: (prev?.n ?? 0) + 1, last: prev?.last ?? s.date })
    }
    const byId = new Map(staff.map(s => [s.id, s]))
    clinicians = [...seen.entries()]
      .map(([id, v]) => {
        const st = byId.get(id)
        return st ? {
          id,
          name: `${st.firstName ?? ''} ${st.lastName ?? ''}`.replace(/\s+/g, ' ').trim(),
          jobTitle: st.jobTitle ?? '', department: st.department ?? '',
          sessions: v.n, lastSeen: v.last.toISOString().slice(0, 10),
        } : null
      })
      .filter((x): x is NonNullable<typeof x> => !!x && !!x.name)
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || b.sessions - a.sessions)
  }

  return NextResponse.json({
    // hasSignature rather than the stored filename: the browser never needs a
    // path, and the image is fetched through its own authenticated route.
    signatories: signatories.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      staffId: s.staffId ?? '',
      branch: s.branch ?? 'ALL',
      hasSignature: !!s.signaturePath,
      updatedAt: s.updatedAt,
    })),
    services: SERVICES,
    staff: staff.map((s) => ({
      id: s.id,
      name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.replace(/\s+/g, ' ').trim(),
      jobTitle: s.jobTitle ?? '',
      department: s.department ?? '',
      // Interbranch staff work at both, so the branch filter has to read the
      // extras too or half the roster disappears from one clinic's list.
      branches: [s.branch, ...(s.extraBranches ?? [])].filter(Boolean),
    })).filter((s) => s.name),
    clinicians,
    patientBranch,
  })
}

interface IncomingSignatory {
  id?: string
  name?: string
  role?: string
  staffId?: string
  branch?: string
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const incoming: IncomingSignatory[] | null = Array.isArray(body.signatories) ? body.signatories : null
  if (!incoming) {
    return NextResponse.json({ error: 'signatories must be an array' }, { status: 400 })
  }

  const existing = await prisma.certificateSignatory.findMany()
  const byId = new Map(existing.map((s) => [s.id, s]))
  const kept = new Set<string>()

  for (const raw of incoming) {
    const name = String(raw.name ?? '').trim()
    if (!name) continue                                   // a nameless signatory prints nothing
    const role = raw.role === 'manager' ? 'manager' : 'therapist'
    const staffId = String(raw.staffId ?? '').trim() || null
    const branch = ['SBEA', 'SBGH'].includes(String(raw.branch)) ? String(raw.branch) : 'ALL'
    const id = typeof raw.id === 'string' && byId.has(raw.id) ? raw.id : null

    if (id) {
      kept.add(id)
      // signaturePath is deliberately untouched: the browser never sends it,
      // and renaming somebody must not drop their signature.
      await prisma.certificateSignatory.update({
        where: { id }, data: { name, role, staffId, branch },
      })
    } else {
      const created = await prisma.certificateSignatory.create({
        data: { name, role, staffId, branch },
      })
      kept.add(created.id)
    }
  }

  // Remove the ones dropped from the list, and their images with them, so a
  // deleted person's signature does not sit on disk indefinitely.
  for (const s of existing) {
    if (kept.has(s.id)) continue
    await prisma.certificateSignatory.delete({ where: { id: s.id } }).catch(() => {})
    if (s.signaturePath && isSafeStoredName(s.signaturePath)) {
      await fs.unlink(path.join(SIG_DIR, s.signaturePath)).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, signatories: kept.size })
}
