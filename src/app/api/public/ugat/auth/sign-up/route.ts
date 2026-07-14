// POST /api/public/ugat/auth/sign-up
// Self-service scholar registration. Creates an UNVERIFIED account and emails
// a one-time verification link from scholarship@ to BOTH the professional and
// personal email. The scholar signs in by username, and can't sign in until
// they verify. Body = the full enrollment form.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, randomToken } from '@/lib/ugat-auth'
import { sendUgatVerificationEmail } from '@/lib/ugat-email'

export const dynamic = 'force-dynamic'

// Origin of the UGAT hub for API links. Derived from UGAT_APP_URL so it moves
// with the app to fellowship.* at cutover; default preserves scholarship.*.
const ORIGIN = new URL(process.env.UGAT_APP_URL || 'https://fellowship.sapphireclinicseast.org').origin

interface Body {
  username?: string
  track?: string
  professionalEmail?: string
  personalEmail?: string
  password?: string
  firstName?: string
  middleName?: string
  lastName?: string
  studentNumber?: string
  expectedGraduationYear?: number | string
  birthdate?: string
  school?: string
  program?: string
  preferredField?: string
  permAddress1?: string
  permAddress2?: string
  permCity?: string
  permRegion?: string
  permZip?: string
  presSameAsPerm?: boolean
  presAddress1?: string
  presAddress2?: string
  presCity?: string
  presRegion?: string
  presZip?: string
  privacyConsent?: boolean
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export async function POST(req: Request) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const username = str(body.username).toLowerCase()
  const professionalEmail = str(body.professionalEmail).toLowerCase()
  const personalEmail = str(body.personalEmail).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''

  if (!body.privacyConsent) {
    return NextResponse.json({ error: 'You must agree to the Data Privacy Notice to register.' }, { status: 400 })
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    return NextResponse.json({ error: 'Username must be 3–30 characters (letters, numbers, and . _ - only).' }, { status: 400 })
  }
  if (!isEmail(professionalEmail)) {
    return NextResponse.json({ error: 'Please enter a valid professional email.' }, { status: 400 })
  }
  if (!isEmail(personalEmail)) {
    return NextResponse.json({ error: 'Please enter a valid personal email.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  // Present address mirrors permanent when the checkbox is ticked.
  const sameAsPerm = !!body.presSameAsPerm
  const presAddress1 = sameAsPerm ? str(body.permAddress1) : str(body.presAddress1)
  const presAddress2 = sameAsPerm ? str(body.permAddress2) : str(body.presAddress2)
  const presCity = sameAsPerm ? str(body.permCity) : str(body.presCity)
  const presRegion = sameAsPerm ? str(body.permRegion) : str(body.presRegion)
  const presZip = sameAsPerm ? str(body.permZip) : str(body.presZip)

  // Required fields.
  const required: Record<string, string> = {
    'First name': str(body.firstName),
    'Last name': str(body.lastName),
    'Student number': str(body.studentNumber),
    'School': str(body.school),
    'Program': str(body.program),
    'Preferred field of practice': str(body.preferredField),
    'Permanent address line 1': str(body.permAddress1),
    'Permanent municipality/city': str(body.permCity),
    'Permanent region': str(body.permRegion),
    'Permanent zip code': str(body.permZip),
    'Present address line 1': presAddress1,
    'Present municipality/city': presCity,
    'Present region': presRegion,
    'Present zip code': presZip,
  }
  for (const [label, val] of Object.entries(required)) {
    if (!val) return NextResponse.json({ error: `${label} is required.` }, { status: 400 })
  }

  const gradYear = Number(body.expectedGraduationYear)
  if (!Number.isInteger(gradYear) || gradYear < 2000 || gradYear > 2100) {
    return NextResponse.json({ error: 'Please enter a valid expected year of graduation.' }, { status: 400 })
  }

  const birthdate = body.birthdate ? new Date(String(body.birthdate)) : null
  if (!birthdate || Number.isNaN(birthdate.getTime())) {
    return NextResponse.json({ error: 'Please enter a valid birthdate.' }, { status: 400 })
  }

  // Reject duplicate username early (also guarded by the unique index).
  const existing = await prisma.ugatScholar.findUnique({ where: { username }, select: { id: true } })
  if (existing) {
    return NextResponse.json(
      { error: 'That username is already taken. Please choose another, or sign in.' },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(password)

  let scholar
  try {
    scholar = await prisma.ugatScholar.create({
      data: {
        username,
        track: body.track === 'TINDIG' ? 'TINDIG' : 'ARAL',
        professionalEmail,
        personalEmail,
        passwordHash,
        passwordPlain: password,
        firstName: str(body.firstName),
        middleName: str(body.middleName) || null,
        lastName: str(body.lastName),
        studentNumber: str(body.studentNumber),
        expectedGraduationYear: gradYear,
        birthdate,
        school: str(body.school),
        program: str(body.program),
        preferredField: str(body.preferredField),
        permAddress1: str(body.permAddress1),
        permAddress2: str(body.permAddress2) || null,
        permCity: str(body.permCity),
        permRegion: str(body.permRegion),
        permZip: str(body.permZip),
        presSameAsPerm: sameAsPerm,
        presAddress1,
        presAddress2: presAddress2 || null,
        presCity,
        presRegion,
        presZip,
      },
      select: { id: true, firstName: true, professionalEmail: true, personalEmail: true },
    })
  } catch {
    return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 })
  }

  // One-time verification token, valid 48h.
  const token = randomToken()
  await prisma.ugatVerificationToken.create({
    data: {
      scholarId: scholar.id,
      token,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  })

  // Send to both addresses (dedupe if they entered the same one twice).
  const recipients = [...new Set([scholar.professionalEmail, scholar.personalEmail])]
  const verifyUrl = `${ORIGIN}/api/public/ugat/auth/verify?token=${encodeURIComponent(token)}`
  try {
    await sendUgatVerificationEmail({ to: recipients, firstName: scholar.firstName, verifyUrl })
  } catch (e) {
    console.error('[ugat] verification email failed:', e)
    return NextResponse.json(
      { ok: true, emailSent: false, message: 'Account created, but we could not send the verification email. Use "Resend link" on the sign-in tab.' },
    )
  }

  return NextResponse.json({ ok: true, emailSent: true })
}
