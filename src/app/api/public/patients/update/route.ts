// POST /api/public/patients/update — a signed-in patient updates their own
// account: profile photo, username, and/or password. Token-authed (same HMAC
// patient token as /me). Body: { token, username?, photo?, currentPassword?,
// newPassword? }. Each field is optional; only provided ones change.
//   200 → { ok: true, username, profilePhoto }
//   400 → validation error   401 → invalid token   409 → username taken / wrong password

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  normalizeUsername,
  validateUsername,
} from '@/lib/patient-password'
import { preflight, withCors } from '../../_cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

type Body = {
  token?: string
  username?: string
  photo?: string | null
  currentPassword?: string
  newPassword?: string
}

// A resized 256px avatar is ~20-40KB; cap generously to reject anything unresized.
const MAX_PHOTO_CHARS = 700_000

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as Body

  const session = verifyPatientToken(body.token ?? '')
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const patient = await prisma.patient.findUnique({
    where: { id: session.patientId },
    select: { id: true, username: true, passwordHash: true },
  })
  if (!patient) {
    return withCors(NextResponse.json({ error: 'Patient not found' }, { status: 404 }), origin)
  }

  const data: { username?: string; passwordHash?: string; profilePhoto?: string | null } = {}

  // ── Username ──
  if (typeof body.username === 'string' && body.username.trim() !== '') {
    const username = normalizeUsername(body.username)
    if (username !== patient.username) {
      const err = validateUsername(username)
      if (err) return withCors(NextResponse.json({ error: err }, { status: 400 }), origin)
      const taken = await prisma.patient.findFirst({
        where: { username, NOT: { id: patient.id } },
        select: { id: true },
      })
      if (taken) {
        return withCors(
          NextResponse.json({ error: 'That username is already taken.' }, { status: 409 }),
          origin,
        )
      }
      data.username = username
    }
  }

  // ── Password ──
  if (typeof body.newPassword === 'string' && body.newPassword !== '') {
    const pwErr = validatePassword(body.newPassword)
    if (pwErr) return withCors(NextResponse.json({ error: pwErr }, { status: 400 }), origin)
    // If they already have a password, the current one must match.
    if (patient.passwordHash) {
      const ok = await verifyPassword(body.currentPassword ?? '', patient.passwordHash)
      if (!ok) {
        return withCors(
          NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 409 }),
          origin,
        )
      }
    }
    data.passwordHash = await hashPassword(body.newPassword)
  }

  // ── Photo ── ('' clears it; a data URL sets it)
  if (typeof body.photo === 'string') {
    if (body.photo === '') {
      data.profilePhoto = null
    } else if (!/^data:image\/(png|jpe?g|webp);base64,/.test(body.photo)) {
      return withCors(
        NextResponse.json({ error: 'Photo must be a PNG, JPG, or WEBP image.' }, { status: 400 }),
        origin,
      )
    } else if (body.photo.length > MAX_PHOTO_CHARS) {
      return withCors(
        NextResponse.json({ error: 'Photo is too large.' }, { status: 400 }),
        origin,
      )
    } else {
      data.profilePhoto = body.photo
    }
  }

  if (Object.keys(data).length === 0) {
    return withCors(NextResponse.json({ error: 'Nothing to update' }, { status: 400 }), origin)
  }

  const updated = await prisma.patient.update({
    where: { id: patient.id },
    data,
    select: { username: true, profilePhoto: true },
  })

  return withCors(
    NextResponse.json({ ok: true, username: updated.username, profilePhoto: updated.profilePhoto }),
    origin,
  )
}
