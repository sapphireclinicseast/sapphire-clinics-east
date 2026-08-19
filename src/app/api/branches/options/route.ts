// GET /api/branches/options
//
// The branch list for patient pickers, sourced from the HrBranch registry that
// syncs hourly from HR Platform. The CRM fetches this instead of shipping a
// hardcoded array, so a branch created in HR Platform shows up as a patient
// option on its own.
//
// Auth: any signed-in user. This is a list of the clinic's own branches — the
// same names printed on the front door — not patient data.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getBranchOptions } from '@/lib/branch-options'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const branches = await getBranchOptions()
  return NextResponse.json({ branches })
}
