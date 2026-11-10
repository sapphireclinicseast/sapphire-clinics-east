import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ACK_WRITE_ROLES, ackStaffName, type AckStaff } from '@/lib/form-ack'

// The "Delivered by" pick list on the signing page: active staff with their
// recorded job title, so picking a name fills in the title. Only name, title
// and branch leave the server; the rest of the employee record stays here.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ACK_WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const rows = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true, firstName: true, lastName: true, jobTitle: true, branch: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
  const staff: AckStaff[] = rows.map((r) => ({ id: r.id, name: ackStaffName(r), jobTitle: r.jobTitle?.trim() || null, branch: r.branch }))
  return NextResponse.json({ staff })
}
