// An attachment on one of the signed-in patient's conversations.
//
// Why this exists rather than linking straight at the stored file: the hub
// writes attachments as `/api/uploads/<name>`, a hub-relative path. The client
// portal is a different host, so that path resolved against the portal and the
// image simply broke.
//
// The fix could have been an absolute hub URL, but /api/uploads is public and
// unauthenticated — it has to be, because Meta's crawlers fetch from it. These
// files are referral letters and photographs of children, so this route serves
// them through the patient's own session instead: the token must be valid, the
// conversation must belong to that patient, and the file must actually be
// attached to a message on it. Anything else is a 404, never a 403, so no one
// can probe for which files exist.

import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { linkedPatientIds } from '@/lib/patient-links'
import { fileResponse } from '@/lib/serve-file'
import { preflight, withCors } from '../../../../../_cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  const origin = req.headers.get('origin')
  const notFound = () => withCors(NextResponse.json({ error: 'Not found' }, { status: 404 }), origin)

  const { id, name } = await params
  const session = verifyPatientToken(req.nextUrl.searchParams.get('token') ?? '')
  if (!session) return notFound()

  const ids = await linkedPatientIds(session.patientId).catch(() => [session.patientId])
  const inquiry = await prisma.inquiry.findUnique({ where: { id }, select: { patientId: true } })
  if (!inquiry?.patientId || !ids.includes(inquiry.patientId)) return notFound()

  // The message row is what authorises this read, and it is also where the mime
  // type comes from — guessing it back from the extension would let a stored
  // name decide how the browser treats the bytes.
  const safe = path.basename(name)
  const message = await prisma.inquiryMessage.findFirst({
    where: { inquiryId: id, fileUrl: `/api/uploads/${safe}` },
    select: { fileName: true, fileMime: true },
  })
  if (!message) return notFound()

  let buf: Buffer
  try {
    buf = await fs.readFile(path.join(process.cwd(), 'uploads', safe))
  } catch {
    return notFound()
  }

  return withCors(
    fileResponse(buf, {
      contentType: message.fileMime || 'application/octet-stream',
      fileName: message.fileName,
      range: req.headers.get('range'),
    }),
    origin,
  )
}
