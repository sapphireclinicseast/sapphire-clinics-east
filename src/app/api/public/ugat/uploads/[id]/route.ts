// GET /api/public/ugat/uploads/[id]     (owner scholar or any admin)
// Auth via Bearer header OR `?t=<token>` (so <img src> / links can load it).
// Returns the raw bytes with the stored content-type.

import { prisma } from '@/lib/prisma'
import { verifyToken, tokenFromRequest, canViewAdmin } from '@/lib/ugat-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const qt = url.searchParams.get('t')
  const tok = (await tokenFromRequest(req)) || (qt ? await verifyToken(qt) : null)
  if (!tok) return new Response('Unauthorized', { status: 401 })

  const up = await prisma.ugatUpload.findUnique({
    where: { id },
    select: { scholarId: true, mimeType: true, filename: true, data: true },
  })
  if (!up) return new Response('Not found', { status: 404 })

  // Owner scholar, or any admin-tier viewer.
  const owner = tok.role === 'SCHOLAR' && tok.scholarId === up.scholarId
  if (!owner && !canViewAdmin(tok.role)) return new Response('Forbidden', { status: 403 })

  const bytes = up.data as unknown as Buffer
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': up.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${up.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=60',
    },
  })
}
