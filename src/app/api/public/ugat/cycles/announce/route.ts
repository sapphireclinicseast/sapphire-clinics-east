// POST /api/public/ugat/cycles/announce   (full admin)
// Emails all (non-disabled) account holders that applications for the
// currently-open cycle are now open, so they can sign in and apply.
// Sent via the scholarship@ Gmail mailbox (Bcc, chunked).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest, isAdminRole } from '@/lib/ugat-auth'
import { getWindow } from '@/lib/ugat-cycle'
import { sendUgatCycleOpenEmail } from '@/lib/ugat-email'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.UGAT_APP_URL || 'https://fellowship.sapphireclinicseast.org'

export async function POST(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || !isAdminRole(tok.role)) return NextResponse.json({ error: 'Admin authorization required.' }, { status: 401 })

  const win = await getWindow()
  if (!win.open || !win.academicYear) {
    return NextResponse.json({ error: 'No cycle is currently open. Open a cycle first, then send the announcement.' }, { status: 400 })
  }

  const scholars = await prisma.ugatScholar.findMany({
    where: { disabledAt: null },
    select: { personalEmail: true, professionalEmail: true },
  })
  const recipients = [...new Set(scholars.flatMap((s) => [s.personalEmail, s.professionalEmail]).filter(Boolean))]
  if (recipients.length === 0) return NextResponse.json({ ok: true, sent: 0, accounts: 0, message: 'No account holders to notify yet.' })

  try {
    const { sent } = await sendUgatCycleOpenEmail({
      recipients,
      academicYear: win.academicYear,
      closesAt: win.closesAt,
      applyUrl: APP_URL,
    })
    return NextResponse.json({ ok: true, sent, accounts: scholars.length, academicYear: win.academicYear })
  } catch (e) {
    console.error('[ugat] cycle announce email failed:', e)
    return NextResponse.json({ error: 'Could not send the emails. Make sure the scholarship@ Gmail account is connected (Settings ▸ Accounts).' }, { status: 500 })
  }
}
