import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ── Public patient self-registration endpoint ─────────────────────────────────
// No auth required. Called by the public form at /patient-register.
// Creates a Patient record with the provided fields. Front desk can review later.

function uc(v: string | null | undefined): string | null {
  if (!v) return null
  return v.trim().toUpperCase()
}

function getAge(dob: Date): number {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

function computePatientType(dob: Date): 'PEDIATRIC' | 'ADULT' {
  return getAge(dob) <= 17 ? 'PEDIATRIC' : 'ADULT'
}

const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      firstName, lastName, email, phone, dob,
      sex, civilStatus, religion, nationality,
      address, city, diagnosis, pwdSeniorId, branches,
    } = body

    // ── Basic validation ──
    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 })
    }
    if (!dob) {
      return NextResponse.json({ error: 'Date of birth is required' }, { status: 400 })
    }

    const dobDate = new Date(dob)
    if (isNaN(dobDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 })
    }

    // ── Branch ──
    const validBranches: string[] = Array.isArray(branches)
      ? branches.filter((b: string) => VALID_BRANCHES.includes(b))
      : []
    if (validBranches.length === 0) {
      return NextResponse.json({ error: 'Please select at least one branch' }, { status: 400 })
    }

    const patientType = computePatientType(dobDate)

    // ── Simple duplicate check: same first+last+dob ──
    const duplicate = await prisma.patient.findFirst({
      where: {
        firstName: uc(firstName) ?? '',
        lastName:  uc(lastName)  ?? '',
        dob:       dobDate,
      },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json({
        error: 'A patient record with the same name and birthdate already exists. Please visit the front desk for assistance.',
      }, { status: 409 })
    }

    const patient = await prisma.patient.create({
      data: {
        firstName:   uc(firstName) ?? '',
        lastName:    uc(lastName)  ?? '',
        email:       email       || null,
        phone:       uc(phone)    || null,
        dob:         dobDate,
        patientType: patientType as 'PEDIATRIC' | 'ADULT',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        branch:      (validBranches[0] as any) || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        branches:    validBranches as any,
        sex:         uc(sex)         || null,
        civilStatus: uc(civilStatus) || null,
        religion:    uc(religion)    || null,
        nationality: uc(nationality) || null,
        address:     uc(address)     || null,
        city:        uc(city)        || null,
        diagnosis:   uc(diagnosis)   || null,
        pwdSeniorId: uc(pwdSeniorId) || null,
        notes:       'Self-registered via QR code',
      },
    })

    return NextResponse.json({ ok: true, id: patient.id })
  } catch (err) {
    console.error('[patient-register] Failed:', err)
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }
}
