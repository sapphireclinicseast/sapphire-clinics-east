// GET /api/tuition[?branch=SANDBOX_EAST][&sy=2026]
//
// AR → Tuition. Every enrolled Class Hub student with the school year's
// payments (each matched to the POS sale that collected it), the promissory
// notes uploaded in Class Hub, and the payment plans set here.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { enforceBranch } from '@/lib/branch-scope'
import { CLASS_TO_LEDGER_BRANCH, LEDGER_TO_CLASS_BRANCH, toYmd } from '@/lib/tuition'
import { TUITION_BRANCHES, TUITION_READ_ROLES, fetchClassHub, loadPlans, planViews, posSalesFor, studentBalances } from '@/lib/tuition-server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string; branch?: string; branches?: string[] }
  if (!TUITION_READ_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const branch = enforceBranch(user.branch, user.branches, sp.get('branch')) ?? (sp.get('branch') || '')
  if (branch && !TUITION_BRANCHES.includes(branch)) return NextResponse.json({ schoolYear: null, students: [] })
  const sy = parseInt(sp.get('sy') || '', 10)

  let hub
  try {
    hub = await fetchClassHub({ classBranch: branch ? LEDGER_TO_CLASS_BRANCH[branch] : null, schoolYear: Number.isFinite(sy) ? sy : undefined })
  } catch (e) {
    console.error('[tuition] Class Hub fetch failed', e)
    return NextResponse.json({ error: 'Could not reach Class Hub. Try again in a minute.' }, { status: 502 })
  }

  const confirmedAt = new Map(hub.payments.filter(p => p.status === 'CONVERTED' && p.convertedAt).map(p => [p.classPortalPaymentId, toYmd(p.convertedAt!)]))
  const [plans, sales, balances] = await Promise.all([
    loadPlans({ studentId: { in: hub.students.map(s => s.id) }, schoolYear: hub.schoolYear }).then(rows => planViews(rows, confirmedAt)),
    posSalesFor(hub.payments.map(p => p.classPortalPaymentId)),
    // What each student owes under Class Hub's plan rules — the same figures
    // the POS Tuition picker shows — so students who are behind with no
    // promissory note are listed too.
    studentBalances({ classBranch: null, hub }),
  ])
  const balanceOf = new Map(balances.students.map(b => [b.id, b]))

  const students = hub.students.map(s => {
    const payments = hub.payments.filter(p => p.studentId === s.id).map(p => {
      const sale = sales.get(p.classPortalPaymentId)
      // Where the money stands: a POS sale, still in the POS queue, confirmed in
      // Class Hub without a sale (before the POS was the one door), or voided.
      const where = p.status === 'VOIDED' ? 'VOIDED' : sale ? 'POS' : p.status === 'PENDING' ? 'WAITING' : 'CLASS_HUB_ONLY'
      return {
        classPortalPaymentId: p.classPortalPaymentId, plan: p.plan, period: p.period, amount: p.amountCentavos / 100,
        status: p.status, method: p.method, methodDetail: p.methodDetail, isPartialPayment: p.isPartialPayment,
        recordedOn: toYmd(p.createdAt), confirmedOn: p.convertedAt ? toYmd(p.convertedAt) : null,
        orderNumber: sale?.orderNumber ?? null, saleDate: sale?.date ?? null, where,
      }
    })
    return {
      id: s.id, name: s.name, email: s.email, level: s.level,
      branch: CLASS_TO_LEDGER_BRANCH[s.branch || ''] || s.branch, patientId: s.patientId,
      payments,
      notes: hub.notes.filter(n => n.studentId === s.id),
      plans: plans.filter(p => p.studentId === s.id),
      tuitionPlan: balanceOf.get(s.id)?.plan ?? null,
      rate: balanceOf.get(s.id)?.rate ?? null,
      yearTuition: balanceOf.get(s.id)?.yearTuition ?? null,
      installments: balanceOf.get(s.id)?.installments ?? null,
      runningBalance: balanceOf.get(s.id)?.runningBalance ?? null,
      // Regular installments overdue or due within 7 days (promissory ones are in plans).
      dues: (balanceOf.get(s.id)?.dues ?? []).filter(d => d.kind === 'REGULAR'),
    }
  })

  return NextResponse.json({ schoolYear: hub.schoolYear, students })
}
