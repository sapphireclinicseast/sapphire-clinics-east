// Intern portal-access lifecycle: an intern's account is auto-disabled once
// their clinical rotation has lapsed by more than ROTATION_GRACE_DAYS.
import { prisma } from '@/lib/prisma'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_KEY = process.env.HR_API_KEY ?? ''

export const ROTATION_GRACE_DAYS = 15

// The date on/after which access should be cut, given a rotation end.
export function accessCutoff(contractExpiry?: string | null): Date | null {
  if (!contractExpiry) return null
  const end = new Date(contractExpiry)
  if (isNaN(end.getTime())) return null
  return new Date(end.getTime() + ROTATION_GRACE_DAYS * 24 * 60 * 60 * 1000)
}

export function isRotationLapsed(contractExpiry?: string | null, now: number = Date.now()): boolean {
  const cutoff = accessCutoff(contractExpiry)
  return cutoff ? now > cutoff.getTime() : false
}

// hrPlatformId -> contractExpiry (the intern's rotation End month), from HR.
export async function fetchHrRotationMap(): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (!HR_KEY) return map
  try {
    const res = await fetch(`${HR_API_BASE}/staff/external`, {
      headers: { Authorization: 'Bearer ' + HR_KEY }, cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      for (const s of (data.staff ?? [])) map.set(s.hrId, s.contractExpiry ?? null)
    }
  } catch { /* HR unavailable */ }
  return map
}

// Disable active intern accounts whose rotation has lapsed by > grace days,
// unless a human kept them on (internAccessOverride). Returns the count.
export async function sweepExpiredInterns(): Promise<number> {
  const rotationMap = await fetchHrRotationMap()
  if (rotationMap.size === 0) return 0 // HR unavailable — do nothing
  const accounts = await prisma.therapistAccount.findMany({
    where: {
      isActive: true,
      internAccessOverride: false,
      OR: [{ accountType: 'INTERN' }, { staff: { employmentType: 'intern' } }],
    },
    select: { id: true, staff: { select: { hrPlatformId: true } } },
  })
  const now = Date.now()
  const ids = accounts
    .filter((a) => { const h = a.staff?.hrPlatformId; return !!h && rotationMap.has(h) && isRotationLapsed(rotationMap.get(h), now) })
    .map((a) => a.id)
  if (ids.length > 0) {
    await prisma.therapistAccount.updateMany({ where: { id: { in: ids } }, data: { isActive: false } })
  }
  return ids.length
}

// Fire-and-forget throttle so a normal page load can drive the sweep without a
// cron: runs at most once every SWEEP_MIN_INTERVAL_MS across the process.
let lastSweepAt = 0
const SWEEP_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000
export function maybeSweepExpiredInterns(): void {
  if (Date.now() - lastSweepAt < SWEEP_MIN_INTERVAL_MS) return
  lastSweepAt = Date.now()
  sweepExpiredInterns().catch(() => { /* best-effort */ })
}
