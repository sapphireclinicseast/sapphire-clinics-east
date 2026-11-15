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

/** PNG check: magic bytes + IHDR size. Uploads are re-encoded to PNG in the browser first. */
export function checkPng(buf: Buffer): { ok: true; width: number; height: number } | { ok: false; error: string } {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buf.length < 33 || magic.some((v, i) => buf[i] !== v) || buf.toString('ascii', 12, 16) !== 'IHDR') {
    return { ok: false, error: 'The signature must be a PNG image' }
  }
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) {
    return { ok: false, error: `The signature image must be at most ${MAX_SIDE}×${MAX_SIDE} pixels` }
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
