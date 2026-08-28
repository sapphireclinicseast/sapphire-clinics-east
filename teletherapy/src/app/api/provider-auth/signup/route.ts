// POST /api/provider-auth/signup — server-to-server (patient-app proxy, guarded
// by PROVIDER_HANDOFF_SECRET). Creates a self-registered provider: a Staff row
// (source = SELF_SIGNUP) + a TherapistAccount (login), records the accepted
// Terms, and returns a one-time handoff token so the browser can be logged in.
// The new account gets NO patient data by default — access is per-patient via
// PatientAssignment, which only the clinic grants.

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { mintHandoffToken } from '@/lib/provider-handoff'

function guarded(req: NextRequest): boolean {
  const expected = process.env.PROVIDER_HANDOFF_SECRET
  return !!expected && req.headers.get('x-handoff-secret') === expected
}

const DEPARTMENTS = new Set(['OT', 'PT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK', 'ADMINISTRATION'])
const BRANCHES = new Set(['SBEA', 'SBGH'])

export async function POST(req: NextRequest) {
  if (!guarded(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const firstName = String(b.firstName ?? '').trim()
  const lastName = String(b.lastName ?? '').trim()
  const email = String(b.email ?? '').toLowerCase().trim()
  const password = String(b.password ?? '')
  const department = String(b.department ?? '').toUpperCase()
  const branch = String(b.branch ?? '').toUpperCase()
  const phone = String(b.phone ?? '').trim() || null
  const jobTitle = String(b.jobTitle ?? '').trim() || null
  const termsVersion = String(b.termsVersion ?? '').trim()

  if (!firstName || !lastName || !email) return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  if (!email.includes('@')) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  if (!DEPARTMENTS.has(department)) return NextResponse.json({ error: 'Please choose a valid profession/department' }, { status: 400 })
  if (!BRANCHES.has(branch)) return NextResponse.json({ error: 'Please choose a valid branch' }, { status: 400 })
  if (!termsVersion) return NextResponse.json({ error: 'You must accept the Terms of Agreement' }, { status: 400 })

  // Email must be free across both login accounts and staff records.
  const existingAccount = await prisma.therapistAccount.findFirst({
    where: { OR: [{ email }, { emailAliases: { has: email } }, { staff: { email } }] },
    select: { id: true },
  })
  if (existingAccount) {
    return NextResponse.json({ error: 'An account already exists for this email. Please sign in instead.' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    const account = await prisma.$transaction(async (tx) => {
      const staff = await tx.staff.create({
        data: {
          firstName: firstName.toUpperCase(),
          lastName: lastName.toUpperCase(),
          email,
          phone,
          department: department as never,
          branch,
          jobTitle,
          employmentType: 'consultant',
          source: 'SELF_SIGNUP',
        },
        select: { id: true },
      })
      return tx.therapistAccount.create({
        data: {
          staffId: staff.id,
          email,
          passwordHash,
          role: 'THERAPIST',
          accountType: 'CLINICIAN',
          isActive: true,
          selfRegistered: true,
          termsVersion,
          termsAcceptedAt: new Date(),
        },
        select: { id: true },
      })
    })
    return NextResponse.json({ token: mintHandoffToken(account.id) })
  } catch (e) {
    console.error('[provider signup] failed:', e)
    return NextResponse.json({ error: 'Could not create the account. Please try again.' }, { status: 500 })
  }
}
