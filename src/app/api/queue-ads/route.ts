import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// Allow up to 2 minutes for large video uploads + transcoding
export const maxDuration = 120

// Transcode a QuickTime .mov file → browser-compatible .mp4 using ffmpeg.
// Returns the new file path and the new relative path, or null if ffmpeg fails.
async function transcodeMovToMp4(
  movPath: string,
  adsDir: string,
  baseName: string   // e.g. "ad-1234-foo"  (no extension)
): Promise<{ mp4Path: string; mp4RelPath: string } | null> {
  const mp4Name    = `${baseName}.mp4`
  const mp4Path    = path.join(adsDir, mp4Name)
  const mp4RelPath = `queue-ads/${mp4Name}`
  try {
    await execFileAsync('ffmpeg', [
      '-i', movPath,
      '-c:v', 'libx264',   // H.264 — universal browser support
      '-c:a', 'aac',        // AAC audio
      '-movflags', 'faststart', // put moov atom at front for streaming
      '-y', mp4Path,        // overwrite if exists
    ])
    await unlink(movPath)   // delete original .mov
    return { mp4Path, mp4RelPath }
  } catch {
    // ffmpeg not available or transcode failed — keep original file
    return null
  }
}

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads')
const ADS_DIR    = path.join(UPLOAD_DIR, 'queue-ads')

const ALLOWED_MIME = new Set([
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/octet-stream', // fallback when browser doesn't detect MIME
])
const ALLOWED_EXT = new Set(['mp4', 'webm', 'ogg', 'mov', 'jpg', 'jpeg', 'png', 'gif', 'webp'])
const EXT_MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
  mov: 'video/quicktime',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp',
}
const MAX_BYTES = 200 * 1024 * 1024 // 200 MB for video

// ── GET — list ads (public, used by TV display) ───────────────────────────────
// ?branch=SBEA → returns ads where branch='SBEA' OR branch='ALL'
// no branch param → returns all ads (for AdsManager)
export async function GET(req: NextRequest) {
  const branch = new URL(req.url).searchParams.get('branch')
  const where = branch
    ? { OR: [{ branch }, { branch: 'ALL' }] }
    : {}
  const ads = await prisma.queueAd.findMany({ where, orderBy: { order: 'asc' } })
  return NextResponse.json(ads)
}

// ── POST — upload a new ad (auth required) ────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() }
  catch { return NextResponse.json({ error: 'Failed to parse upload' }, { status: 400 }) }

  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'File required' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 200 MB)' }, { status: 413 })

  // Resolve MIME: prefer browser-reported type, fall back to extension
  const ext = (file.name.toLowerCase().split('.').pop()) ?? ''
  const resolvedMime = (file.type && file.type !== 'application/octet-stream')
    ? file.type
    : (EXT_MIME_MAP[ext] ?? file.type)

  if (!ALLOWED_MIME.has(resolvedMime) && !ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  await mkdir(ADS_DIR, { recursive: true })

  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const fileName  = `ad-${Date.now()}-${safeName}`
  const filePath  = path.join(ADS_DIR, fileName)
  const relPath   = `queue-ads/${fileName}`

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  // .mov files are not supported by Chrome/Chromium (used on most TV browsers).
  // Transcode to .mp4 automatically so the TV display can always play the video.
  let finalRelPath = relPath
  let finalMime    = resolvedMime
  let finalName    = file.name

  if (resolvedMime === 'video/quicktime' || ext === 'mov') {
    const baseName = fileName.replace(/\.mov$/i, '')
    const result   = await transcodeMovToMp4(filePath, ADS_DIR, baseName)
    if (result) {
      finalRelPath = result.mp4RelPath
      finalMime    = 'video/mp4'
      finalName    = file.name.replace(/\.mov$/i, '.mp4')
    }
  }

  // Append after existing ads
  const maxOrder = await prisma.queueAd.aggregate({ _max: { order: true } })
  const nextOrder = (maxOrder._max.order ?? -1) + 1

  const adBranch = (form.get('branch') as string | null) || 'ALL'

  const ad = await prisma.queueAd.create({
    data: { fileName: finalName, filePath: finalRelPath, mimeType: finalMime, branch: adBranch, order: nextOrder },
  })

  return NextResponse.json(ad, { status: 201 })
}
