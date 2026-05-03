import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createReadStream, statSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads')

// Public — no auth (TV display needs to load video without a session)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ad = await prisma.queueAd.findUnique({ where: { id } })
  if (!ad) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const filePath = path.join(UPLOAD_DIR, ad.filePath)

  let stat: ReturnType<typeof statSync>
  try { stat = statSync(filePath) }
  catch { return NextResponse.json({ error: 'File not found' }, { status: 404 }) }

  const total = stat.size
  const rangeHeader = req.headers.get('range')

  if (rangeHeader) {
    // Range request (required for <video> seek)
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-')
    const start = parseInt(startStr, 10)
    const end   = endStr ? parseInt(endStr, 10) : Math.min(start + 1024 * 1024 - 1, total - 1)
    const chunkSize = end - start + 1

    const stream = createReadStream(filePath, { start, end })
    // @ts-expect-error Node stream → Web ReadableStream
    const webStream = Readable.toWeb(stream) as ReadableStream

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Range':  `bytes ${start}-${end}/${total}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type':   ad.mimeType,
        'Cache-Control':  'public, max-age=3600',
      },
    })
  }

  // Full file
  const stream = createReadStream(filePath)
  // @ts-expect-error Node stream → Web ReadableStream
  const webStream = Readable.toWeb(stream) as ReadableStream

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Length': String(total),
      'Content-Type':   ad.mimeType,
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'public, max-age=3600',
    },
  })
}
