// GET /api/tuition/reminders[?branch=][&patientId=][&patientName=]
//
// Unpaid promissory payments due within 7 days or overdue. Feeds the top-bar
// bell (no patient) and the POS, which passes the patient being rung up so the
// front desk can ask the parent to pay.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { effectiveBranches } from '@/lib/branch-scope'
import { normName } from '@/lib/tuition'
import { TUITION_READ_ROLES, dueReminders } from '@/lib/tuition-server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string; branch?: string; branches?: string[] }
  if (!TUITION_READ_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const allowed = effectiveBranches(user.branch, user.branches)
  const requested = sp.get('branch') || ''
  const branches = requested
    ? (allowed.length && !allowed.includes(requested) ? [] : [requested])
    : (allowed.length ? allowed : null)
  if (branches && !branches.length) return NextResponse.json({ reminders: [] })

  let reminders = await dueReminders(branches)
  const patientId = sp.get('patientId') || ''
  const patientName = normName(sp.get('patientName'))
  if (patientId || patientName) {
    reminders = reminders.filter(r => (patientId && r.patientId === patientId) || (patientName.length >= 6 && normName(r.studentName) === patientName))
  }
  return NextResponse.json({ reminders })
}
