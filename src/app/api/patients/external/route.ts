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

/**
 * Mirror a verdanarehab.com store customer into the Patient CRM.
 *
 * Intent (from the store team): store buyers should be reachable in Operations-hub
 * email campaigns, but kept SEPARATE from clinical patients. We do that with the
 * existing VERDANA_STORE branch — the CRM already offers a "Verdana Store" branch
 * filter and campaigns already accept a branch audience, so no new model is needed.
 *
 * Dedup rule: if the buyer's email (or, failing that, mobile) already belongs to a
 * patient, they're already in the CRM — we do NOTHING and never touch that clinical
 * record. Only a buyer who matches nobody is created, as a standalone VERDANA_STORE
 * contact. This mirrors the request precisely: "separated from the Patient CRM if
 * their email does not match anyone."
 */
async function upsertVerdanaCustomer(q: {
  firstName: string; lastName: string; email: string; phone: string; address: string; city: string
}) {
  const email = lower(q.email), phone = digits(q.phone)
  if (!email && !phone) return { ok: false, reason: 'MISSING_CONTACT' as const }

  // Strongest signal first: exact email (case-insensitive).
  let existing = email
    ? await prisma.patient.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      })
    : null

  // Fall back to mobile — stored in varied formats, so match last-10-digits in JS.
  if (!existing && phone) {
    const candidates = await prisma.patient.findMany({
      where: { phone: { not: null } },
      select: { id: true, phone: true },
    })
    const hit = candidates.find((c) => digits(c.phone) === phone)
    if (hit) existing = { id: hit.id }
  }

  // Already known to the clinic — leave the clinical record completely untouched.
  if (existing) return { ok: true, matched: true, id: existing.id }

  const uc = (v: string) => (v || '').trim().toUpperCase() || null
  const created = await prisma.patient.create({
    data: {
      firstName: uc(q.firstName) ?? 'VERDANA',
      lastName: uc(q.lastName) ?? 'CUSTOMER',
      email: q.email?.trim() || null,
      phone: q.phone?.trim() || null,
      patientType: 'ADULT' as any,
      branch: 'VERDANA_STORE' as any,
      branches: ['VERDANA_STORE'] as any,
      address: uc(q.address),
      city: uc(q.city),
      notes: 'Auto-created from verdanarehab.com store checkout (Verdana customer).',
    },
    select: { id: true },
  })
  return { ok: true, matched: false, id: created.id }
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

    if (body?.action === 'pwdCheck') {
      return NextResponse.json(await pwdCheck({
        email: String(body.email || ''),
        phone: String(body.phone || ''),
        firstName: String(body.firstName || ''),
        lastName: String(body.lastName || ''),
      }))
    }

    if (body?.action === 'upsertVerdanaCustomer') {
      return NextResponse.json(await upsertVerdanaCustomer({
        firstName: String(body.firstName || ''),
        lastName: String(body.lastName || ''),
        email: String(body.email || ''),
        phone: String(body.phone || ''),
        address: String(body.address || ''),
        city: String(body.city || ''),
      }))
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[external-patients] POST failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
