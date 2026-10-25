// Serving a file buffer over HTTP, Range requests included.
//
// Range matters more than it looks: Safari and iOS refuse to play audio or
// video at all unless the server answers a Range request with 206, and every
// browser needs it to seek. A route that only ever returns 200 looks fine on a
// desktop Chrome and is silently broken on a phone.

import { NextResponse } from 'next/server'

export function fileResponse(
  buf: Buffer,
  opts: { contentType: string; fileName?: string | null; range?: string | null; cacheControl?: string },
): NextResponse {
  const total = buf.length
  const cacheControl = opts.cacheControl ?? 'private, max-age=300'
  const headers: Record<string, string> = {
    'Content-Type': opts.contentType || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
  }
  if (opts.fileName) {
    headers['Content-Disposition'] = `inline; filename="${opts.fileName.replace(/"/g, '')}"`
  }

  const m = opts.range && /^bytes=(\d*)-(\d*)$/.exec(opts.range.trim())
  if (m && (m[1] !== '' || m[2] !== '')) {
    let start = m[1] === '' ? NaN : parseInt(m[1], 10)
    let end = m[2] === '' ? NaN : parseInt(m[2], 10)
    if (Number.isNaN(start)) { start = total - end; end = total - 1 }   // suffix range: bytes=-N
    else if (Number.isNaN(end)) { end = total - 1 }                     // open-ended: bytes=N-
    if (start > end || start < 0 || start >= total) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
      })
    }
    end = Math.min(end, total - 1)
    const chunk = buf.subarray(start, end + 1)
    return new NextResponse(chunk as unknown as BodyInit, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(chunk.length) },
    })
  }

  return new NextResponse(buf as unknown as BodyInit, {
    headers: { ...headers, 'Content-Length': String(total) },
  })
}
