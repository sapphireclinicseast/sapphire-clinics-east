import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK']

// POST { prefix, section } — open a phone-upload session; returns the token for the QR.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { prefix, section } = await req.json()
    const s = await prisma.uploadSession.create({
      data: {
        prefix: (String(prefix || 'upload')).slice(0, 80),
        section: String(section || 'general').slice(0, 40),
        createdById: session.user.id ?? null,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000), // 45 min
      },
    })
    return NextResponse.json({ token: s.id })
  } catch (e) {
    console.error('Upload session create error:', e)
    return NextResponse.json({ error: 'Failed to open session' }, { status: 500 })
  }
}

// GET ?token= — poll the uploaded URLs (desktop side).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = new URL(req.url).searchParams.get('token') || ''
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })
  const s = await prisma.uploadSession.findUnique({ where: { id: token }, select: { urls: true, prefix: true, expiresAt: true } })
  if (!s) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json({ urls: Array.isArray(s.urls) ? s.urls : [], prefix: s.prefix, expired: s.expiresAt < new Date() })
}
