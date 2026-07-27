// GET /api/notifications — recent activity feed for the hub notification bell.
// Returns patient registrations, appointment bookings, and HR form responses
// from the last 48 hours (form responses fetched live from HR Platform).
// Branch-filtered: admin sees all, branch-scoped roles see only their branch.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function bookingBranchesForRole(role: string): string[] | null {
  if (role.startsWith('SBEA_') || role.startsWith('AHEA_')) return ['SBEA']
  if (role.startsWith('SBGH_') || role.startsWith('AHGH_')) return ['SBGH']
  return null // null = all branches
}

const BRANCH_ENUM_TO_SHORT: Record<string, string> = {
  SANDBOX_EAST: 'SBEA',
  SANDBOX_GREENHILLS: 'SBGH',
}

// Mirror of FORM_TYPES in RegistrationFormsClient — keep in sync if forms change.
const FORM_TYPES = [
  { key: 'registration',  title: 'Registration Form',          sbea: 'GULaVBpI', sbgh: 'VaCB1bkE' },
  { key: 'group-therapy', title: 'Group Therapy Registration', sbea: 'ChrSrsBF', sbgh: 'tT8QASYo' },
  { key: 'sip',           title: 'ALAGA Program Registration', sbea: 'SGWVxqcW', sbgh: 'i8rFr7P6' },
  { key: 'psych',         title: 'Psych Registration Form',    sbea: 'X2YDKTaH', sbgh: null },
] as const

interface FormNotif {
  id: string
  type: 'FORM_RESPONSE'
  name: string
  branch: string
  formKey: string
  createdAt: string
  href: string
}

async function fetchFormResponseNotifs(since: Date, branches: string[] | null): Promise<FormNotif[]> {
  const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
  const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''
  if (!HR_KEY) return []

  // Build the list of (formKey, formTitle, formId, branch) tuples to fetch
  const targets: { key: string; title: string; formId: string; branch: string }[] = []
  for (const f of FORM_TYPES) {
    if (!branches || branches.includes('SBEA')) {
      targets.push({ key: f.key, title: f.title, formId: f.sbea, branch: 'SBEA' })
    }
    if (f.sbgh && (!branches || branches.includes('SBGH'))) {
      targets.push({ key: f.key, title: f.title, formId: f.sbgh, branch: 'SBGH' })
    }
  }

  const results = await Promise.allSettled(
    targets.map(async ({ key, title, formId, branch }) => {
      const res = await fetch(`${HR_URL}/forms/external/${formId}/responses`, {
        headers: { Authorization: `Bearer ${HR_KEY}` },
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      })
      if (!res.ok) return [] as FormNotif[]
      const data = await res.json()
      const items = (data.items ?? []) as { landing_id: string; submitted_at: string }[]
      return items
        .filter((item) => item.submitted_at && new Date(item.submitted_at) >= since)
        .map((item): FormNotif => ({
          id: `form_${formId}_${item.landing_id}`,
          type: 'FORM_RESPONSE',
          name: title,
          branch,
          formKey: key,
          createdAt: item.submitted_at,
          href: `/registration-forms?form=${key}&branch=${branch}&tab=results`,
        }))
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<FormNotif[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value)
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string })?.role ?? ''
  const bookingBranches = bookingBranchesForRole(role)

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const [patients, bookings, formResponses] = await Promise.all([
    // Patient registrations (hub DB)
    prisma.patient.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, firstName: true, lastName: true, branches: true, branch: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    // Client-portal bookings (hub DB) — only unprocessed ones (addedToDeck=false).
    // Use OR so a booking created earlier but paid recently still surfaces.
    prisma.patientBooking.findMany({
      where: {
        OR: [{ createdAt: { gte: since } }, { paidAt: { gte: since } }],
        status: { in: ['PENDING', 'PAID'] },
        addedToDeck: false,
        ...(bookingBranches ? { branch: { in: bookingBranches } } : {}),
      },
      select: {
        id: true, branch: true, status: true, createdAt: true, paidAt: true,
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    // Form responses (HR Platform — gracefully skipped if HR is down)
    fetchFormResponseNotifs(since, bookingBranches).catch(() => []),
  ])

  const items = [
    ...patients.map((p) => ({
      id: `reg_${p.id}`,
      type: 'REGISTRATION' as const,
      name: `${p.firstName} ${p.lastName}`.trim(),
      branch: BRANCH_ENUM_TO_SHORT[p.branches[0] ?? ''] ?? (p.branch ? String(p.branch) : ''),
      createdAt: p.createdAt.toISOString(),
      href: '/patients',
    })),
    ...bookings.map((b) => ({
      id: `bkg_${b.id}`,
      type: 'BOOKING' as const,
      name: `${b.patient.firstName} ${b.patient.lastName}`.trim(),
      branch: b.branch,
      status: b.status,
      // Use paidAt when available so a recently-paid booking sorts to the top
      createdAt: (b.paidAt ?? b.createdAt).toISOString(),
      href: '/decking',
    })),
    ...formResponses,
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return NextResponse.json({ items })
}
