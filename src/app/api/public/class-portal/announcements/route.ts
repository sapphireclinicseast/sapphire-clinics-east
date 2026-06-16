// GET  /api/public/class-portal/announcements
//   Returns announcements visible to the caller. Students see entries
//   whose `levels` is empty OR includes their grade level. Teachers see
//   entries with includeTeachers=true OR that they authored. Admins see
//   everything. Poster bytes are NEVER included here — the list endpoint
//   returns a `hasPoster` flag and clients fetch the image on demand via
//   /announcements/[id]/poster.
//
// POST /api/public/class-portal/announcements
//   Admin or teacher creates an announcement. multipart/form-data:
//     title, body, levels (JSON array), includeTeachers ('true'|'false'),
//     authorName, poster (optional File)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/class-portal-auth'
import { withCors, corsHeaders } from '../../_cors'

const MAX_POSTER_BYTES = 8 * 1024 * 1024 // 8 MB cap for posters

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).classPortalAnnouncement.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        body: true,
        levels: true,
        includeTeachers: true,
        authorRole: true,
        authorEmail: true,
        authorName: true,
        posterFileName: true,
        posterFileType: true,
        posterFileSize: true,
        emailedAt: true,
        emailedBy: true,
        emailedCount: true,
        createdAt: true,
      },
    })

    // Filter at the API layer. We could push this into the where clause
    // but the table is small and per-viewer filters are cheap in JS.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let visible: any[] = rows
    if (auth.role === 'STUDENT') {
      // Student-side: targeted at their level (or all levels). Look up
      // their level lazily from the user row.
      const me = await prisma.classPortalUser.findUnique({
        where: { id: auth.userId },
        select: { level: true },
      })
      const myLevel = me?.level ?? null
      visible = rows.filter((r: { levels: string[] }) => r.levels.length === 0 || (myLevel && r.levels.includes(myLevel)))
    } else if (auth.role === 'TEACHER') {
      visible = rows.filter((r: { includeTeachers: boolean; authorEmail: string }) =>
        r.includeTeachers || r.authorEmail === auth.email)
    }
    // ADMIN + BRANCH_ADMIN + FRONTDESK see all.

    return withCors(NextResponse.json({
      announcements: visible.map(r => ({
        id: r.id,
        title: r.title,
        body: r.body,
        levels: r.levels,
        includeTeachers: r.includeTeachers,
        authorRole: r.authorRole,
        authorEmail: r.authorEmail,
        authorName: r.authorName,
        hasPoster: !!r.posterFileType,
        posterFileName: r.posterFileName,
        posterFileType: r.posterFileType,
        posterFileSize: r.posterFileSize,
        emailedAt: r.emailedAt ? (r.emailedAt instanceof Date ? r.emailedAt.toISOString() : String(r.emailedAt)) : null,
        emailedBy: r.emailedBy ?? null,
        emailedCount: r.emailedCount ?? null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[announcements GET]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const auth = await requireAuth(req)
    if (auth.role !== 'ADMIN' && auth.role !== 'TEACHER') {
      return withCors(NextResponse.json({ error: 'Only admin or teacher can create announcements.' }, { status: 403 }), origin)
    }
    const form = await req.formData()
    const title = String(form.get('title') ?? '').trim()
    const body  = String(form.get('body')  ?? '').trim()
    const authorName = String(form.get('authorName') ?? auth.email).trim() || auth.email
    let levels: string[] = []
    try {
      const raw = form.get('levels')
      if (typeof raw === 'string' && raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) levels = parsed.filter(x => typeof x === 'string')
      }
    } catch { /* tolerate */ }
    const includeTeachers = String(form.get('includeTeachers') ?? '').toLowerCase() === 'true'
    if (!title) return withCors(NextResponse.json({ error: 'Title is required.' }, { status: 400 }), origin)
    if (!body)  return withCors(NextResponse.json({ error: 'Body is required.'  }, { status: 400 }), origin)

    const poster = form.get('poster')
    let posterFileName: string | null = null
    let posterFileType: string | null = null
    let posterFileSize: number | null = null
    let posterFileData: Buffer | null = null
    if (poster && poster instanceof File && poster.size > 0) {
      if (poster.size > MAX_POSTER_BYTES) {
        return withCors(NextResponse.json({ error: `Poster too large (${(poster.size / 1024 / 1024).toFixed(1)}MB > 8MB).` }, { status: 413 }), origin)
      }
      // We don't gate on poster.type because Safari sometimes hands
      // empty mime types for HEIC etc.; clients accept any image and
      // browsers will refuse to render non-images at display time.
      posterFileName = poster.name
      posterFileType = poster.type || 'application/octet-stream'
      posterFileSize = poster.size
      posterFileData = Buffer.from(await poster.arrayBuffer())
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (prisma as any).classPortalAnnouncement.create({
      data: {
        title,
        body,
        // Teacher-authored announcements always reach other teachers,
        // mirroring the localStorage helper's old behaviour.
        levels,
        includeTeachers: auth.role === 'TEACHER' ? true : includeTeachers,
        authorRole: auth.role === 'ADMIN' ? 'ADMIN' : 'TEACHER',
        authorEmail: auth.email,
        authorName,
        posterFileName,
        posterFileType,
        posterFileSize,
        posterFileData,
      },
      select: {
        id: true, title: true, body: true, levels: true, includeTeachers: true,
        authorRole: true, authorEmail: true, authorName: true,
        posterFileName: true, posterFileType: true, posterFileSize: true,
        createdAt: true,
      },
    })

    return withCors(NextResponse.json({
      announcement: {
        id: created.id,
        title: created.title,
        body: created.body,
        levels: created.levels,
        includeTeachers: created.includeTeachers,
        authorRole: created.authorRole,
        authorEmail: created.authorEmail,
        authorName: created.authorName,
        hasPoster: !!created.posterFileType,
        posterFileName: created.posterFileName,
        posterFileType: created.posterFileType,
        posterFileSize: created.posterFileSize,
        createdAt: created.createdAt.toISOString(),
      },
    }), origin)
  } catch (e) {
    if (e instanceof Response) {
      const headers = new Headers(e.headers)
      for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v)
      return new NextResponse(e.body, { status: e.status, headers })
    }
    console.error('[announcements POST]', e)
    return withCors(NextResponse.json({ error: 'Server error.' }, { status: 500 }), origin)
  }
}
