import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { HR_COR_ROLES } from '@/lib/payroll/hr-cor'
import { syncCorFromHr } from '@/lib/payroll/hr-cor-server'

export const dynamic = 'force-dynamic'

// POST — fills consultants' CORs from the HR Hub. `reached: false` means the HR Hub
// couldn't be read and nothing changed, so the screen can say its list may be behind.
export async function POST() {
  const session = await auth()
  if (!session?.user || !HR_COR_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const result = await syncCorFromHr()
  return NextResponse.json(result ? { reached: true, ...result } : { reached: false, updated: 0, unmatched: [] })
}
