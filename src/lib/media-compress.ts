// Server-side compression for Home Progress uploads (photos / video / voice).
// Keeps stored files small so patient uploads don't balloon disk usage. Uses
// sharp for images and ffmpeg for audio/video (both present in the app image).
// Every path falls back to the ORIGINAL bytes if the tool is missing, errors,
// or the "compressed" output isn't actually smaller — so an upload never fails
// because of compression.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import sharp from 'sharp'

const execFileP = promisify(execFile)
const FFMPEG_TIMEOUT_MS = 90_000

export interface CompressResult {
  buffer: Buffer
  mime: string
  ext: string
}

// "Balanced" profile — near-invisible quality loss, large space savings.
const IMG_MAX = 1600 // px, longest side
const IMG_QUALITY = 80
const VIDEO_SCALE = '1280:720' // fit within 720p, aspect preserved
const VIDEO_MAXRATE = '1400k'
const VIDEO_AUDIO_KBPS = '96k'
const AUDIO_KBPS = '64k'

async function compressImage(input: Buffer): Promise<CompressResult | null> {
  try {
    const out = await sharp(input)
      .rotate() // apply EXIF orientation, then drop the metadata
      .resize(IMG_MAX, IMG_MAX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: IMG_QUALITY, mozjpeg: true })
      .toBuffer()
    return { buffer: out, mime: 'image/jpeg', ext: '.jpg' }
  } catch {
    return null
  }
}

async function ffmpegTranscode(
  input: Buffer,
  srcExt: string,
  args: (inPath: string, outPath: string) => string[],
  outExt: string,
  outMime: string,
): Promise<CompressResult | null> {
  const base = path.join(os.tmpdir(), `hp-${Date.now()}-${randomBytes(4).toString('hex')}`)
  const inPath = `${base}.in${srcExt || ''}`
  const outPath = `${base}.out${outExt}`
  try {
    await fs.writeFile(inPath, input)
    await execFileP('ffmpeg', args(inPath, outPath), { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 1 << 20 })
    const out = await fs.readFile(outPath)
    if (!out.length) return null
    return { buffer: out, mime: outMime, ext: outExt }
  } catch {
    return null
  } finally {
    await fs.unlink(inPath).catch(() => {})
    await fs.unlink(outPath).catch(() => {})
  }
}

function compressVideo(input: Buffer, srcExt: string): Promise<CompressResult | null> {
  return ffmpegTranscode(
    input,
    srcExt,
    (i, o) => [
      '-y', '-i', i,
      '-vf', `scale=${VIDEO_SCALE}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25',
      '-maxrate', VIDEO_MAXRATE, '-bufsize', '2800k',
      '-pix_fmt', 'yuv420p', '-threads', '2',
      '-c:a', 'aac', '-b:a', VIDEO_AUDIO_KBPS, '-ac', '2',
      '-movflags', '+faststart',
      o,
    ],
    '.mp4',
    'video/mp4',
  )
}

function compressAudio(input: Buffer, srcExt: string): Promise<CompressResult | null> {
  return ffmpegTranscode(
    input,
    srcExt,
    (i, o) => [
      '-y', '-i', i,
      '-vn', '-c:a', 'aac', '-b:a', AUDIO_KBPS, '-ac', '1',
      '-movflags', '+faststart',
      o,
    ],
    '.m4a',
    'audio/mp4',
  )
}

// Compress `input` for the given kind. Returns the smaller of compressed vs.
// original (with the correct mime/ext for whichever is returned).
export async function compressMedia(
  input: Buffer,
  kind: string,
  originalMime: string,
  originalExt: string,
): Promise<CompressResult> {
  const original: CompressResult = { buffer: input, mime: originalMime, ext: originalExt }
  let result: CompressResult | null = null
  if (kind === 'PHOTO') result = await compressImage(input)
  else if (kind === 'VIDEO') result = await compressVideo(input, originalExt)
  else if (kind === 'AUDIO') result = await compressAudio(input, originalExt)

  // Only keep the compressed output if it actually saved space.
  if (result && result.buffer.length > 0 && result.buffer.length < input.length) return result
  return original
}
