import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'

// POST /api/seminars/[id]/register
// Registers the logged-in clinician for a seminar via the HR public
// /seminar-register endpoint. We never pass paymentMethod, so the HR
// handler enrols the user without charging — clinicians always attend
// free regardless of the seminar's fee.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: seminarId } = await params

  // Pull the clinician's profile (name, phone, department) so HR has
  // useful registrant info for attendance reports / certificates.
  const account = await prisma.therapistAccount.findUnique({
    where: { id: session.user.id },
    include: { staff: { select: { firstName: true, lastName: true, phone: true, department: true } } },
  })
  if (!account?.staff) {
    return NextResponse.json({ error: 'Clinician profile not found' }, { status: 404 })
  }

  const payload = {
    seminarId,
    firstName: account.staff.firstName,
    lastName: account.staff.lastName,
    mobile: account.staff.phone || 'N/A',
    email: session.user.email,
    profession: account.staff.department, // OT / PT / SLP / SPED / PSYCHOLOGY / MD
    // No paymentMethod → HR registers free regardless of fee.
  }

  let res: Response
  try {
    res = await fetch(`${HR_API_BASE}/seminar-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reach HR hub', detail: (err as Error).message },
      { status: 502 }
    )
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error ?? `Registration failed (${res.status})` },
      { status: res.status }
    )
  }
  return NextResponse.json({ success: true })
}
