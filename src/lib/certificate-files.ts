// Where discharge-certificate files live on disk, and why they live there.
//
// `uploads/` is mounted from /opt/sapphire/uploads, so it survives deploys —
// but /api/uploads/[filename] serves that directory's ROOT publicly, with no
// authentication, to anyone who can guess a filename (it exists so Meta can
// fetch post images). Certificates carry a patient's name and signatories'
// signatures and must never be reachable that way.
//
// Both folders below are therefore SUBDIRECTORIES. That route takes a single
// path segment and calls path.basename() on it, so it can neither match
// `/api/uploads/discharge-certificates/x.pdf` nor escape into a subfolder.
// Everything here is served instead through the authenticated routes under
// /api/patients/certificates.
//
// Keep that invariant if this moves: a certificate written to the uploads root
// is a public URL.

import fs from 'fs/promises'
import path from 'path'

const UPLOADS = path.join(process.cwd(), 'uploads')

export const CERT_DIR = path.join(UPLOADS, 'discharge-certificates')
export const SIG_DIR = path.join(UPLOADS, 'discharge-signatures')

export async function ensureCertDirs(): Promise<void> {
  await fs.mkdir(CERT_DIR, { recursive: true }).catch(() => {})
  await fs.mkdir(SIG_DIR, { recursive: true }).catch(() => {})
}

/** A bare filename only, so a stored value can never walk out of its folder. */
export function isSafeStoredName(name: string): boolean {
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(String(name || ''))
}

/**
 * Reads a stored file, or null when it is missing or the name is not one we
 * wrote. Returning null rather than throwing is deliberate: a signature that
 * has vanished from disk should cost its image, not the whole certificate.
 */
export async function readStored(dir: string, name: string | null | undefined): Promise<Buffer | null> {
  if (!name || !isSafeStoredName(name)) return null
  try {
    return await fs.readFile(path.join(dir, name))
  } catch {
    return null
  }
}
