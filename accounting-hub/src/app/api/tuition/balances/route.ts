// GET /api/tuition/balances?branch=SANDBOX_EAST
//
// POS → Tuition picker: each Class Hub student at the branch with what is due
// now (regular installments under Class Hub's plan rules, and promissory
// payments), what is paid this school year, and the payments recorded.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { enforceBranch } from '@/lib/branch-scope'
import { LEDGER_TO_CLASS_BRANCH } from '@/lib/tuition'
import { TUITION_BRANCHES, TUITION_COLLECT_ROLES, studentBalances } from '@/lib/tuition-server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string; branch?: string; branches?: string[] }
  if (!TUITION_COLLECT_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const branch = enforceBranch(user.branch, user.branches, sp.get('branch')) ?? (sp.get('branch') || '')
  if (!TUITION_BRANCHES.includes(branch)) return NextResponse.json({ schoolYear: null, students: [] })
  try {
    return NextResponse.json(await studentBalances({ classBranch: LEDGER_TO_CLASS_BRANCH[branch] }))
  } catch (e) {
    console.error('[tuition/balances] failed', e)
    return NextResponse.json({ error: 'Could not reach Class Hub. Try again in a minute.' }, { status: 502 })
  }
}
