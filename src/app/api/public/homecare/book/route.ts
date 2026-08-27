// POST /api/public/homecare/book — the one-shot homecare checkout.
// Creates/claims the patient portal account (username + password), REQUIRES a
// Doctor's Referral upload, reserves a seat on the chosen open travel day,
// computes the authoritative fare (session + distance transport + surge),
// creates a full-amount PayMongo link on the SERVING branch's account, and
// returns the checkout URL.
//
// Body:
// {
//   cityId, openDayId, branch: "SBEA"|"SBGH",
//   firstName, lastName, email, phone?, dob?, sex?, patientType,
//   address, city?, civilStatus?, religion?, nationality?, diagnosis?, pwdSeniorId?,
//   username, password,
//   referralFile: { name?, dataUrl }   // REQUIRED
//   pwdIdFile?:   { name?, dataUrl }
// }

import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { prisma } from '@/lib/prisma'
import { preflight, withCors } from '../../_cors'
import { issuePatientToken } from '@/lib/patient-session'
import {
  hashPassword,
  validatePassword,
  normalizeUsername,
  validateUsername,
} from '@/lib/patient-password'
import { createPaymongoLink } from '@/lib/paymongo'
import { computeHomecareFare } from '@/lib/homecare-fare'
import { loadClinic, loadFareSettings, isShortBranch, SHORT_TO_OPS, ymdToDate, ymdWeekday, manilaTodayYmd, nextOccurrences, OCCURRENCE_COUNT } from '@/lib/homecare'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

type UploadInput = { name?: string; dataUrl?: string }

const UPLOAD_ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
])
const UPLOAD_MAX_BYTES = 12 * 1024 * 1024

function extForMime(mime: string): string {
  return mime === 'application/pdf' ? '.pdf'
    : mime === 'image/png' ? '.png'
    : mime === 'image/webp' ? '.webp'
    : mime === 'image/heic' || mime === 'image/heif' ? '.heic'
    : '.jpg'
}

// Same convention as /api/public/patients/register: decode base64 data URL,
// write under ./uploads, return the public /api/uploads/<file> URL. Returns
// null when the payload is missing/invalid.
async function saveUpload(patientId: string, kind: 'referral' | 'pwdid', input: UploadInput | undefined): Promise<string | null> {
  const dataUrl = input?.dataUrl
  if (!dataUrl) return null
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) return null
  const mime = m[1].toLowerCase()
  if (!UPLOAD_ALLOWED_MIME.has(mime)) return null
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length === 0 || buf.length > UPLOAD_MAX_BYTES) return null
  const filename = `${kind}-${patientId}-${Date.now()}${extForMime(mime)}`
  const uploadDir = path.join(process.cwd(), 'uploads')
  await fs.mkdir(uploadDir, { recursive: true })
  await fs.writeFile(path.join(uploadDir, filename), buf)
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://operations.sapphireclinicseast.org'
  return `${baseUrl}/api/uploads/${filename}`
}

function uc(v: string | undefined): string | null {
  if (v == null) return null
  const s = v.trim()
  return s.length > 0 ? s.toUpperCase() : null
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const bad = (msg: string, status = 400) => withCors(NextResponse.json({ error: msg }, { status }), origin)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  // ── Validate identity / account fields ──────────────────────────────────
  const firstName = String(body.firstName ?? '').trim()
  const lastName = String(body.lastName ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const address = String(body.address ?? '').trim()
  const branch = body.branch
  const patientType = body.patientType
  const username = normalizeUsername(body.username)
  const password = typeof body.password === 'string' ? body.password : ''

  if (!firstName || !lastName || !email) return bad('firstName, lastName, email are required')
  if (!email.includes('@')) return bad('a valid email is required')
  if (!address) return bad('home address is required for homecare')
  if (!isShortBranch(branch)) return bad('valid branch (SBEA|SBGH) is required')
  if (patientType !== 'PEDIATRIC' && patientType !== 'ADULT') return bad('invalid patientType')

  const unErr = validateUsername(username)
  if (unErr) return bad(unErr)
  const pwErr = validatePassword(password)
  if (pwErr) return bad(pwErr)

  // ── Doctor's Referral is REQUIRED for homecare ──────────────────────────
  const referralInput = body.referralFile as UploadInput | undefined
  if (!referralInput?.dataUrl) return bad("A Doctor's Referral upload is required for homecare booking")

  // ── Validate the chosen open day (exists, enabled, city/branch match) ────
  const cityId = String(body.cityId ?? '')
  const openDayId = String(body.openDayId ?? '')
  const dateISO = String(body.date ?? '')
  if (!cityId || !openDayId) return bad('cityId and openDayId are required')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return bad('a valid travel date is required')
  const day = await prisma.homecareOpenDay.findUnique({ where: { id: openDayId } })
  if (!day || day.disabled || day.cityId !== cityId || day.branch !== branch) {
    return bad('That schedule is no longer available. Please pick another date.', 409)
  }
  // The chosen date must fall on this weekly rule's weekday and be one of the
  // upcoming offered occurrences (not past, not beyond the horizon).
  if (ymdWeekday(dateISO) !== day.dayOfWeek || dateISO < manilaTodayYmd() ||
      !nextOccurrences(day.dayOfWeek, OCCURRENCE_COUNT).includes(dateISO)) {
    return bad('That travel date is not available. Please pick from the offered dates.', 409)
  }
  const bookedDate = ymdToDate(dateISO)

  const clinic = await loadClinic(branch)
  if (!clinic) return bad('This branch has no homecare origin location set yet. Please contact the clinic.', 409)

  // ── Compute the authoritative fare ──────────────────────────────────────
  const settings = await loadFareSettings()
  const when = new Date(`${dateISO}T${day.startTime}:00+08:00`)
  const fare = await computeHomecareFare({
    originLat: clinic.latitude,
    originLng: clinic.longitude,
    address,
    when,
    settings,
  })
  if (!fare.ok) return withCors(NextResponse.json({ error: fare.notes, fare }, { status: 422 }), origin)
  if (fare.total <= 0) return bad('Could not compute a valid amount. Please contact the clinic.', 422)

  // ── Create or claim the patient + portal account ────────────────────────
  // Username must be globally unique across patients.
  const unameTaken = await prisma.patient.findFirst({ where: { username }, select: { id: true } })

  const existing = await prisma.patient.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, passwordHash: true, username: true },
  })

  let patientId: string
  let patientFirstName: string
  const opsBranch = SHORT_TO_OPS[branch]

  if (existing && existing.lastName.toLowerCase() === lastName.toLowerCase()) {
    // Returning CRM record — claim it if it has no login yet.
    if (existing.passwordHash) {
      return bad('An account already exists for this email. Please sign in first, then book.', 409)
    }
    if (unameTaken && unameTaken.id !== existing.id) return bad('That username is already taken', 409)
    await prisma.patient.update({
      where: { id: existing.id },
      data: {
        username,
        passwordHash: await hashPassword(password),
        patientType: patientType as 'PEDIATRIC' | 'ADULT',
        phone: (String(body.phone ?? '').trim()) || undefined,
        address: uc(String(body.address)) ?? undefined,
        city: uc(body.city as string | undefined) ?? undefined,
        // ensure they carry the serving branch
        branch: opsBranch,
        branches: { set: [opsBranch] },
      },
    })
    patientId = existing.id
    patientFirstName = existing.firstName
  } else if (existing) {
    // Same email, different last name → ambiguous; don't silently merge.
    return bad('That email is already on file under a different name. Please contact the clinic.', 409)
  } else {
    if (unameTaken) return bad('That username is already taken', 409)
    const dob = String(body.dob ?? '').trim()
    const created = await prisma.patient.create({
      data: {
        firstName: firstName.toUpperCase(),
        lastName: lastName.toUpperCase(),
        email,
        phone: (String(body.phone ?? '').trim()) || null,
        dob: dob ? new Date(`${dob}T00:00:00.000Z`) : null,
        sex: uc(body.sex as string | undefined),
        address: uc(body.address as string | undefined),
        city: uc(body.city as string | undefined),
        civilStatus: uc(body.civilStatus as string | undefined),
        religion: uc(body.religion as string | undefined),
        nationality: uc(body.nationality as string | undefined),
        diagnosis: uc(body.diagnosis as string | undefined),
        pwdSeniorId: uc(body.pwdSeniorId as string | undefined),
        username,
        passwordHash: await hashPassword(password),
        branch: opsBranch,
        branches: [opsBranch],
        patientType: patientType as 'PEDIATRIC' | 'ADULT',
      },
      select: { id: true, firstName: true },
    })
    patientId = created.id
    patientFirstName = created.firstName
  }

  // Save required referral (+ optional PWD ID). Referral must succeed.
  const referralUrl = await saveUpload(patientId, 'referral', referralInput)
  if (!referralUrl) return bad("The Doctor's Referral file could not be read. Please upload a clear JPG, PNG, or PDF (≤12MB).", 422)
  const pwdIdUrl = await saveUpload(patientId, 'pwdid', body.pwdIdFile as UploadInput | undefined)
  await prisma.patient.update({
    where: { id: patientId },
    data: { referralUrl, ...(pwdIdUrl ? { pwdIdUrl } : {}) },
  })

  // ── Reserve a seat + create the booking (transactional capacity guard) ──
  let booking: { id: string }
  try {
    booking = await prisma.$transaction(async (tx) => {
      const used = await tx.patientBooking.count({
        where: { homecareOpenDayId: day.id, date: bookedDate, status: { notIn: ['CANCELLED', 'REJECTED'] } },
      })
      if (used >= day.capacity) throw new Error('FULL')
      return tx.patientBooking.create({
        data: {
          patientId,
          branch, // short code "SBEA"/"SBGH"
          department: 'PT',
          date: bookedDate,
          startTime: day.startTime,
          endTime: day.endTime,
          status: 'PENDING',
          source: 'HOMECARE',
          downpayment: fare.total,
          notes: `Homecare PT — ${address}`,
          homecareCityId: cityId,
          homecareOpenDayId: day.id,
          serviceAddress: address,
          serviceLat: fare.destLat,
          serviceLng: fare.destLng,
          distanceKm: fare.distanceKm,
          transportFee: fare.transportFee,
          surgeMultiplier: fare.surgeMultiplier,
        },
        select: { id: true },
      })
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'FULL') {
      return bad('That travel date just filled up. Please pick another date.', 409)
    }
    throw e
  }

  // ── Full-amount PayMongo link on the serving branch's account ───────────
  try {
    const link = await createPaymongoLink({
      amountPhp: fare.total,
      description: `Homecare PT session — ${patientFirstName} (${dateISO})`,
      remarks: `Session ₱${fare.sessionFee} + transport ₱${fare.transportFee}`,
      branch, // per-branch key selection (branchShort now accepts SBEA/SBGH)
    })
    await prisma.patientPayment.create({
      data: {
        bookingId: booking.id,
        amount: fare.total,
        paymongoLinkId: link.id,
        paymongoRef: link.referenceNumber,
        checkoutUrl: link.checkoutUrl,
        status: 'pending',
      },
    })
    const token = issuePatientToken(patientId)
    return withCors(
      NextResponse.json({
        bookingId: booking.id,
        patientId,
        firstName: patientFirstName,
        checkoutUrl: link.checkoutUrl,
        token,
        fare,
      }),
      origin,
    )
  } catch (e) {
    // Roll back the reserved seat so a failed payment link doesn't hold it.
    await prisma.patientBooking.delete({ where: { id: booking.id } }).catch(() => {})
    console.error('[homecare] PayMongo link failed:', e)
    return bad('We could not start the payment. Please try again in a moment.', 502)
  }
}
