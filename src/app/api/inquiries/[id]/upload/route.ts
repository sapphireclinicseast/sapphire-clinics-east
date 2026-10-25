// Front desk attaching a file to an enquiry.
//
// Same role gate and the same branch check as replying — loading by id alone
// would let a branch account post into the other branch's thread.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'
import { canUseInquiries } from '@/lib/inquiry-access'
import { storeInquiryFile, isProblem } from '@/lib/inquiry-upload'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as { role?: string; name?: string | null; email?: string | null }
  if (!canUseInquiries(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const inquiry = await prisma.inquiry.findUnique({ where: { id } })
  if (!inquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const forced = branchForRole(user.role ?? '')
  if (forced && inquiry.branch !== forced) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Could not read the upload.' }, { status: 400 })
  }
  const file = form.get('file') as File | null
  const caption = String(form.get('caption') ?? '').trim().slice(0, 5000)
  if (!file) return NextResponse.json({ error: 'No file received.' }, { status: 400 })

  const stored = await storeInquiryFile(file)
  if (isProblem(stored)) return NextResponse.json({ error: stored.error }, { status: stored.status })

  const author = user.name || user.email || 'Front Desk'
  await prisma.$transaction([
    prisma.inquiryMessage.create({
      data: { inquiryId: id, fromStaff: true, authorName: author, body: caption, ...stored },
    }),
    prisma.inquiry.update({
      where: { id },
      data: { status: 'ANSWERED', readAt: new Date(), lastMessageAt: new Date() },
    }),
  ])

  return NextResponse.json({ ok: true })
}
