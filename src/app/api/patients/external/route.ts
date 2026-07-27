/**
 * External Patient API — Bearer token auth
 *
 * Used by HR Platform (full list) and Accounting Hub (search + id lookup).
 * Env: EXTERNAL_API_KEY — shared secret token
 *
 * ?search=xxx  -> text search (name/email)
 * ?id=xxx      -> direct lookup by patient ID
 *
 * POST { action: 'pwdCheck', email, phone, firstName, lastName }
 *              -> is this payer entitled to a PWD/Senior discount? (see below)
 *                 POST, not a query string, so payer contact details stay out of access logs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY

const PATIENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dob: true,
  patientType: true,
  branches: true,
  sex: true,
  diagnosis: true,
  address: true,
  city: true,
} as const

/** Last 10 digits — tolerates "0917 328 0078", "+63 917 328 0078", "09173280078". */
const digits = (v?: string | null) => (v || '').replace(/\D/g, '').slice(-10)
const lower = (v?: string | null) => (v || '').trim().toLowerCase()

/**
 * Is this payer entitled to a PWD/Senior discount?
 *
 * Entitlement means a Patient CRM record carrying BOTH a PWD/Senior ID number AND an
 * uploaded ID photo. The payer is matched on any of email, mobile number (last 10 digits)
 * or full name — a parent often pays with their own contact details for a PWD child, so
 * matching any one signal is deliberate.
 *
 * The response deliberately carries no ID number and no photo URL: the caller is a public
 * checkout page, and it only needs the verdict plus a name for the audit trail.
 */
async function pwdCheck(q: { email: string; phone: string; firstName: string; lastName: string }) {
  const email = lower(q.email), phone = digits(q.phone)
  const first = lower(q.firstName), last = lower(q.lastName)
  if (!email && !phone && !(first && last)) {
    return { verified: false, reason: 'MISSING_DETAILS' as const }
  }

  const isPayer = (p: { email: string | null; phone: string | null; firstName: string; lastName: string }) =>
    (!!email && lower(p.email) === email) ||
    (!!phone && digits(p.phone) === phone) ||
    (!!first && !!last && lower(p.firstName) === first && lower(p.lastName) === last)

  // Patients who have registered a PWD/Senior ID number — a small set, so match in JS
  // where phone formatting and casing can be normalised properly.
  const registered = await prisma.patient.findMany({
    where: { pwdSeniorId: { not: null } },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, pwdSeniorId: true, pwdIdUrl: true },
  })
  const mine = registered.filter(p => (p.pwdSeniorId || '').trim() && isPayer(p))

  const complete = mine.find(p => !!p.pwdIdUrl)
  if (complete) {
    return {
      verified: true,
      patient: { id: complete.id, name: `${complete.firstName} ${complete.lastName}`.trim() },
    }
  }
  // ID number on file but nobody uploaded the photo yet — a distinct, fixable situation.
  if (mine.length > 0) return { verified: false, reason: 'NO_PHOTO' as const }

  // Do we know this person at all? Drives a clearer message than a bare "not eligible".
  const known = await prisma.patient.findFirst({
    where: {
      OR: [
        ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ...(first && last ? [{
          AND: [
            { firstName: { equals: first, mode: 'insensitive' as const } },
            { lastName: { equals: last, mode: 'insensitive' as const } },
          ],
        }] : []),
      ],
    },
    select: { id: true },
  })
  return { verified: false, reason: known ? ('NO_PWD_ID' as const) : ('NO_RECORD' as const) }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id     = searchParams.get('id')?.trim()
  const search = searchParams.get('search')?.trim()

  try {
    if (id) {
      const patient = await prisma.patient.findUnique({
        where: { id },
        select: PATIENT_SELECT,
      })
      return NextResponse.json({ patient: patient ?? null })
    }

    const patients = await prisma.patient.findMany({
      where: search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: PATIENT_SELECT,
      orderBy: { lastName: 'asc' },
      take: search ? 20 : undefined,
    })

    return NextResponse.json({ patients })
  } catch (err) {
    console.error('[external-patients] Query failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!API_KEY || !authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    if (body?.action !== 'pwdCheck') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    return NextResponse.json(await pwdCheck({
      email: String(body.email || ''),
      phone: String(body.phone || ''),
      firstName: String(body.firstName || ''),
      lastName: String(body.lastName || ''),
    }))
  } catch (err) {
    console.error('[external-patients] PWD check failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
