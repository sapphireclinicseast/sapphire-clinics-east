// Nickel auth — self-contained signed-cookie sessions for BOTH providers and
// patients. Cookie = base64url(payload).hmac, payload = { id, typ, exp }. The
// `typ` marker + separate cookie names keep the two session kinds from ever
// being used interchangeably.

import crypto from 'crypto'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const SESSION_COOKIE = 'nickel_session' // provider
export const PATIENT_COOKIE = 'nickel_patient'
export const DOCTOR_COOKIE = 'nickel_doctor'
export const CLINIC_COOKIE = 'nickel_clinic'
export const ADMIN_COOKIE = 'nickel_admin'
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
type Typ = 'provider' | 'patient' | 'doctor' | 'clinic' | 'admin'

function secret(): string {
  return process.env.NEXTAUTH_SECRET || 'dev-insecure-secret-change-me'
}
function b64url(b: Buffer) { return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function fromB64url(s: string) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64') }

export async function hashPassword(pw: string): Promise<string> { return bcrypt.hash(pw, 12) }
export async function verifyPassword(pw: string, hash: string): Promise<boolean> { return bcrypt.compare(pw, hash) }

function sign(id: string, typ: Typ): string {
  const body = b64url(Buffer.from(JSON.stringify({ id, typ, exp: Date.now() + TTL_MS })))
  const sig = b64url(crypto.createHmac('sha256', secret()).update(body).digest())
  return `${body}.${sig}`
}
function verify(token: string | undefined, typ: Typ): string | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = b64url(crypto.createHmac('sha256', secret()).update(body).digest())
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null } catch { return null }
  try {
    const p = JSON.parse(fromB64url(body).toString('utf8')) as { id: string; typ: Typ; exp: number }
    if (!p.id || p.typ !== typ || typeof p.exp !== 'number' || p.exp < Date.now()) return null
    return p.id
  } catch { return null }
}

// Provider session (kept the name signSession for existing routes).
export function signSession(providerId: string): string { return sign(providerId, 'provider') }
export function signPatientSession(patientId: string): string { return sign(patientId, 'patient') }
export function signDoctorSession(doctorId: string): string { return sign(doctorId, 'doctor') }
export function signClinicSession(clinicId: string): string { return sign(clinicId, 'clinic') }

export async function getSessionProviderId(): Promise<string | null> {
  return verify((await cookies()).get(SESSION_COOKIE)?.value, 'provider')
}
export async function getSessionPatientId(): Promise<string | null> {
  return verify((await cookies()).get(PATIENT_COOKIE)?.value, 'patient')
}
export async function getSessionProvider() {
  const id = await getSessionProviderId()
  return id ? prisma.provider.findUnique({ where: { id } }) : null
}
export async function getSessionPatient() {
  const id = await getSessionPatientId()
  return id ? prisma.patient.findUnique({ where: { id } }) : null
}
export async function getSessionDoctorId(): Promise<string | null> {
  return verify((await cookies()).get(DOCTOR_COOKIE)?.value, 'doctor')
}
export async function getSessionDoctor() {
  const id = await getSessionDoctorId()
  return id ? prisma.doctor.findUnique({ where: { id } }) : null
}
export async function getSessionClinicId(): Promise<string | null> {
  return verify((await cookies()).get(CLINIC_COOKIE)?.value, 'clinic')
}
export async function getSessionClinic() {
  const id = await getSessionClinicId()
  return id ? prisma.clinic.findUnique({ where: { id } }) : null
}

// ── Admin (SCEI operations) — single shared credential from env ──
export function adminPassword(): string { return process.env.NICKEL_ADMIN_PASSWORD || '' }
export function adminEmail(): string { return (process.env.NICKEL_ADMIN_EMAIL || 'main@sapphireclinicseast.org').toLowerCase() }
export function signAdminSession(): string { return sign('admin', 'admin') }
export async function isAdmin(): Promise<boolean> {
  return verify((await cookies()).get(ADMIN_COOKIE)?.value, 'admin') === 'admin'
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: Math.floor(TTL_MS / 1000),
}
