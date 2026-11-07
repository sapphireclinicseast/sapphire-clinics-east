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

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [signatories, staff] = await Promise.all([
    prisma.certificateSignatory.findMany({ orderBy: { name: 'asc' } }),
    prisma.staff.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true, jobTitle: true, department: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ])

  return NextResponse.json({
    // hasSignature rather than the stored filename: the browser never needs a
    // path, and the image is fetched through its own authenticated route.
    signatories: signatories.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      staffId: s.staffId ?? '',
      hasSignature: !!s.signaturePath,
      updatedAt: s.updatedAt,
    })),
    services: SERVICES,
    staff: staff.map((s) => ({
      id: s.id,
      name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.replace(/\s+/g, ' ').trim(),
      jobTitle: s.jobTitle ?? '',
      department: s.department ?? '',
    })).filter((s) => s.name),
  })
}

interface IncomingSignatory {
  id?: string
  name?: string
  role?: string
  staffId?: string
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
    const id = typeof raw.id === 'string' && byId.has(raw.id) ? raw.id : null

    if (id) {
      kept.add(id)
      // signaturePath is deliberately untouched: the browser never sends it,
      // and renaming somebody must not drop their signature.
      await prisma.certificateSignatory.update({
        where: { id }, data: { name, role, staffId },
      })
    } else {
      const created = await prisma.certificateSignatory.create({
        data: { name, role, staffId },
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
