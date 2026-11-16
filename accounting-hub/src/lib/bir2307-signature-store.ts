/**
 * BIR 2307 payor e-signature storage (server only).
 *
 * One PNG per branch at <uploads>/bir2307/signature-<BRANCH>.png. The folder
 * is a sub-directory of the uploads volume, so /api/files (which serves only
 * bare file names from the uploads root) can never hand it out — the image is
 * served solely through the role-checked /api/payroll/bir-2307/signature route.
 * Until a branch has its own upload, the e-signature carried over from the HR
 * hub (server-assets/bir2307-signature.png) is used. A replaced or removed
 * image is moved to bir2307/history/ rather than deleted.
 */
import { promises as fs } from 'fs'
import path from 'path'
import { inflateSync } from 'zlib'

export const SIGNATURE_BRANCHES = ['SBEA', 'SBGH', 'VERDANA'] as const
export type SignatureBranch = (typeof SIGNATURE_BRANCHES)[number]
export const isSignatureBranch = (b: unknown): b is SignatureBranch =>
  typeof b === 'string' && (SIGNATURE_BRANCHES as readonly string[]).includes(b)

export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024
const MAX_SIDE = 4000

const uploadsDir = () => process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads')
const sigDir = () => path.join(uploadsDir(), 'bir2307')
const historyDir = () => path.join(sigDir(), 'history')
const sigPath = (b: SignatureBranch) => path.join(sigDir(), `signature-${b}.png`)
const defaultPath = () => path.join(process.cwd(), 'server-assets', 'bir2307-signature.png')

export interface SignatureStatus { source: 'uploaded' | 'default' | 'none'; updatedAt: string | null }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf: Buffer, start: number, end: number) => {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const SAMPLES: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/**
 * PNG check — the whole file, not just its first bytes: every chunk present
 * with a matching CRC, IHDR first, IEND last, and the image data inflating to
 * exactly the size the header promises. A cut-off or damaged upload is refused
 * instead of being stored and then silently missing from every 2307.
 * (Uploads from the app are re-encoded to PNG in the browser first.)
 */
export function checkPng(buf: Buffer): { ok: true; width: number; height: number } | { ok: false; error: string } {
  const bad = { ok: false as const, error: 'The signature file is not a complete PNG image — upload it again' }
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buf.length < 57 || magic.some((v, i) => buf[i] !== v) || buf.toString('ascii', 12, 16) !== 'IHDR') {
    return { ok: false, error: 'The signature must be a PNG image' }
  }
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const bitDepth = buf[24], colorType = buf[25], interlace = buf[28]
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) {
    return { ok: false, error: `The signature image must be at most ${MAX_SIDE}×${MAX_SIDE} pixels` }
  }
  if (!SAMPLES[colorType] || ![1, 2, 4, 8, 16].includes(bitDepth)) return bad

  const idat: Buffer[] = []
  let pos = 8, sawEnd = false
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const dataEnd = pos + 8 + len
    if (dataEnd + 4 > buf.length) return bad
    if (crc32(buf, pos + 4, dataEnd) !== buf.readUInt32BE(dataEnd)) return bad
    if (type === 'IDAT') idat.push(buf.subarray(pos + 8, dataEnd))
    pos = dataEnd + 4
    if (type === 'IEND') { sawEnd = true; break }
  }
  if (!sawEnd || !idat.length) return bad

  // The pixel data must inflate in full. For a plain (non-interlaced) image the
  // size is exact: one filter byte plus the packed samples per row.
  const rowBytes = 1 + Math.ceil((width * SAMPLES[colorType] * bitDepth) / 8)
  const expected = rowBytes * height
  try {
    const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected + 2 * height + 1024 })
    if (interlace === 0 && raw.length !== expected) return bad
  } catch {
    return bad
  }
  return { ok: true, width, height }
}

async function statOrNull(p: string) {
  try { return await fs.stat(p) } catch { return null }
}

export async function signatureStatus(): Promise<Record<SignatureBranch, SignatureStatus>> {
  const hasDefault = !!(await statOrNull(defaultPath()))
  const entries = await Promise.all(SIGNATURE_BRANCHES.map(async b => {
    const st = await statOrNull(sigPath(b))
    const status: SignatureStatus = st
      ? { source: 'uploaded', updatedAt: st.mtime.toISOString() }
      : { source: hasDefault ? 'default' : 'none', updatedAt: null }
    return [b, status] as const
  }))
  return Object.fromEntries(entries) as Record<SignatureBranch, SignatureStatus>
}

/** The branch's uploaded signature, else the carried-over default; null when neither exists. */
export async function readSignature(branch: SignatureBranch): Promise<{ bytes: Buffer; source: 'uploaded' | 'default'; updatedAt: string | null } | null> {
  try {
    const p = sigPath(branch)
    const [bytes, st] = await Promise.all([fs.readFile(p), fs.stat(p)])
    return { bytes, source: 'uploaded', updatedAt: st.mtime.toISOString() }
  } catch { /* no upload for this branch */ }
  try {
    return { bytes: await fs.readFile(defaultPath()), source: 'default', updatedAt: null }
  } catch { return null }
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')

async function archive(branch: SignatureBranch, why: 'replaced' | 'removed') {
  if (!(await statOrNull(sigPath(branch)))) return
  await fs.mkdir(historyDir(), { recursive: true })
  await fs.rename(sigPath(branch), path.join(historyDir(), `signature-${branch}-${why}-${stamp()}.png`))
}

/** Store one PNG for each branch given (written to a temp file, then renamed into place). */
export async function saveSignature(branches: SignatureBranch[], png: Buffer) {
  await fs.mkdir(sigDir(), { recursive: true })
  for (const b of branches) {
    const tmp = path.join(sigDir(), `.signature-${b}-${process.pid}-${Date.now()}.tmp`)
    await fs.writeFile(tmp, png)
    await archive(b, 'replaced')
    await fs.rename(tmp, sigPath(b))
  }
}

/** Remove the branches' uploads — the generator falls back to the carried-over default. */
export async function removeSignature(branches: SignatureBranch[]) {
  for (const b of branches) await archive(b, 'removed')
}
