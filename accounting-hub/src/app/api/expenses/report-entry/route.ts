import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT']

// PATCH { id, date?, accountTitle?, description?, grossAmount? }
// Edit an entry from a report view, bypassing the paid/RFP lock.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if ('date' in body) data.date = body.date ? new Date(body.date) : null
    if ('accountTitle' in body) data.accountTitle = body.accountTitle || null
    if ('description' in body) data.description = body.description || null
    if ('grossAmount' in body) data.grossAmount = Number(body.grossAmount) || 0
    await prisma.pettyCashEntry.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Report entry edit error:', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

// DELETE ?id=...  — delete an entry from a report (drops it from any RFP it was in).
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    await prisma.pettyCashEntry.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Report entry delete error:', e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
