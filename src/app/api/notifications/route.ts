import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

// All registration form IDs (both SBEA and SBGH variants for each form type)
const ALL_FORM_IDS = [
  'GULaVBpI', 'VaCB1bkE',  // Registration Form
  'ChrSrsBF', 'tT8QASYo',  // Group Therapy Registration
  'SGWVxqcW', 'i8rFr7P6',  // ALAGA Program Registration
  'X2YDKTaH',              // Psych Registration Form (SBEA only)
]

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Look up when THIS user last dismissed notifications
  const state = await prisma.userNotificationState.findUnique({
    where: { userId: session.user.id },
  })
  // New users default to 24 h ago so they see today's activity on first login
  const since = state?.dismissedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)

  // ── New patient booking requests since this user's last dismiss ─────────────
  const bookings = await prisma.patientBooking.count({
    where: {
      createdAt: { gt: since },
      status: { in: ['PENDING', 'PAID'] },
    },
  })

  // ── New registration form responses since this user's last dismiss ───────────
  // Parallel fetch from HR Platform; gracefully returns 0 per form if unreachable.
  let forms = 0
  try {
    const counts = await Promise.all(
      ALL_FORM_IDS.map((id) =>
        fetch(`${HR_URL}/forms/external/${id}/responses`, {
          headers: { Authorization: `Bearer ${HR_KEY}` },
          cache: 'no-store',
        })
          .then((r) => r.json())
          .then((d) => {
            if (!d.ok || !Array.isArray(d.items)) return 0
            return (d.items as { submitted_at: string }[]).filter(
              (item) => new Date(item.submitted_at) > since
            ).length
          })
          .catch(() => 0)
      )
    )
    forms = counts.reduce((a, b) => a + b, 0)
  } catch {
    forms = 0
  }

  return NextResponse.json({ bookings, forms, dismissedAt: since.toISOString() })
}
